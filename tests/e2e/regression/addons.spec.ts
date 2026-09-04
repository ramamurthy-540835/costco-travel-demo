import { test, expect } from '../fixtures/test-data';
import Booking from '@/lib/models/Booking';
import { getAddOnsCatalog, getWaivedAddOnIds } from '@/lib/graph/queries';
import { addDays, createTestBooking, createConfirmedPaymentIntent } from '../fixtures/booking-helpers';

const FROM_OFFSET_DAYS = 30;
const NIGHTS = 3;

// Anonymous/public searchInventory() always resolves each vendor's LOWEST
// membership-tier rank ("Gold Star") per getLowestRankTermsByVendor() — and
// per the seed data, no Gold Star term includes a perk that WAIVES any addon
// (only the higher Executive/Business tiers do). So no real booking created
// through the actual search+checkout path can ever land in the AC-2 scenario
// ("a booking whose member perks waive a specific addon") — there is no
// member-tier-aware search in this app today. To exercise AC-2 without
// modifying the boundary-protected route/page files, this test creates a
// normal booking, then directly overwrites its persisted
// pricingSnapshot.perkIds with a known waiving perk (read live from the seed
// data's Perk-[:WAIVES]->AddOn edges, not hardcoded) — the confirmation page
// and the addons route both recompute getWaivedAddOnIds() from whatever
// perkIds the booking actually has, so this exercises real production logic
// against a perk set a real booking flow just can't currently produce.
async function findAnyWaivingPerkId(): Promise<string> {
  // Probe candidate perk IDs known to exist in the seed vocabulary
  // (perks.json / addon_catalog.json's typically_covered_by_perk) rather than
  // guessing which one currently has a WAIVES edge.
  const candidatePerkIds = [
    'free_additional_driver',
    'no_young_driver_fee',
    'waived_underage_fee',
    'damage_waiver_included',
  ];
  for (const perkId of candidatePerkIds) {
    const waived = await getWaivedAddOnIds([perkId]);
    if (waived.size > 0) return perkId;
  }
  throw new Error('No seed perk waives any addon — check Perk-[:WAIVES]->AddOn edges for AC-2 coverage');
}

test.describe('booking add-ons (regression: UC6 fee-bearing + perk-waived)', () => {
  test('adding a fee-bearing addon charges fee_per_day * nights', async ({ request, mongoClient }) => {
    void mongoClient;
    const booking = await createTestBooking(request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });

    try {
      const persisted = await Booking.findById(booking.bookingId).lean();
      const perkIds = persisted?.pricingSnapshot.perkIds ?? [];

      const [catalog, waivedAddOnIds] = await Promise.all([
        getAddOnsCatalog(),
        getWaivedAddOnIds(perkIds),
      ]);
      const feeBearing = catalog.find(
        (a) => !waivedAddOnIds.has(a.addon_id) && typeof a.fee_per_day === 'number' && a.fee_per_day > 0,
      );
      if (!feeBearing) {
        throw new Error('No fee-bearing (non-waived) addon found in catalog for this booking — check seed data');
      }

      const dryRun = await request.post(`/api/bookings/${booking.bookingId}/addons`, {
        data: { addonIds: [feeBearing.addon_id], dryRun: true },
      });
      expect(dryRun.status(), await dryRun.text()).toBe(200);
      const { deltaCents } = await dryRun.json();
      expect(deltaCents).toBe(Math.round((feeBearing.fee_per_day as number) * NIGHTS * 100));

      const receiptEmail = process.env.E2E_CLERK_TEST_EMAIL!;
      const paymentIntent = await createConfirmedPaymentIntent(deltaCents / 100, receiptEmail);
      expect(paymentIntent.status).toBe('succeeded');

      const confirmRes = await request.post(`/api/bookings/${booking.bookingId}/addons`, {
        data: { addonIds: [feeBearing.addon_id], paymentIntentId: paymentIntent.id },
      });
      expect(confirmRes.status(), await confirmRes.text()).toBe(200);

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.pricingSnapshot.addonTotal).toBe((feeBearing.fee_per_day as number) * NIGHTS);
      expect(updated?.pricingSnapshot.addonIds).toContain(feeBearing.addon_id);
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });

  test('a perk-waived addon renders locked at $0 and cannot be double-charged', async ({
    page,
    mongoClient,
  }) => {
    void mongoClient;
    const booking = await createTestBooking(page.request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });

    try {
      const waivingPerkId = await findAnyWaivingPerkId();
      await Booking.findByIdAndUpdate(booking.bookingId, {
        $set: { 'pricingSnapshot.perkIds': [waivingPerkId] },
      });

      const [catalog, waivedAddOnIds] = await Promise.all([
        getAddOnsCatalog(),
        getWaivedAddOnIds([waivingPerkId]),
      ]);
      const [waivedAddonId] = Array.from(waivedAddOnIds);
      const waivedAddon = catalog.find((a) => a.addon_id === waivedAddonId);
      if (!waivedAddon) throw new Error(`Waived addon ${waivedAddonId} missing from catalog`);

      await page.goto(`/confirmation/${booking.bookingId}`);
      await page.getByRole('button', { name: 'Manage extras' }).click();
      const row = page.getByText(waivedAddon.name ?? waivedAddon.addon_id, { exact: false }).locator('..');
      await expect(row.getByText('Included with your perks — $0')).toBeVisible();
      const checkbox = row.locator('input[type="checkbox"]');
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toBeDisabled();

      const attempt = await page.request.post(`/api/bookings/${booking.bookingId}/addons`, {
        data: { addonIds: [waivedAddonId] },
      });
      expect(attempt.status(), await attempt.text()).toBe(200);
      const body = await attempt.json();
      expect(body.chargedAddonIds).not.toContain(waivedAddonId);

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.pricingSnapshot.addonIds ?? []).not.toContain(waivedAddonId);
      expect(updated?.pricingSnapshot.addonTotal ?? 0).toBe(0);
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });
});
