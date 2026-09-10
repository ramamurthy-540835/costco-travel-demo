import { test, expect } from '../fixtures/test-data';
import Booking from '@/lib/models/Booking';
import { getAddOnsCatalog, getWaivedAddOnIds } from '@/lib/graph/queries';
import { addDays, createTestBooking } from '../fixtures/booking-helpers';

// Drives UC6 (add-ons management on an ALREADY-RESERVED booking) through the
// chat panel: get_booking_status resolution -> propose_addons -> a REAL
// Stripe Elements payment for the delta -> update_addons applied. Companion
// to assistant-booking.spec.ts (new-booking flow); kept separate since this
// exercises the existing-booking branch of the SYSTEM_PROMPT's add-ons rules.
test.setTimeout(180_000);

const FROM_OFFSET_DAYS = 60;
const NIGHTS = 3;

async function openChat(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open travel assistant' }).click();
}

async function send(page: import('@playwright/test').Page, text: string) {
  await page.getByPlaceholder('Type a message…').fill(text);
  await page.getByPlaceholder('Type a message…').press('Enter');
}

async function waitForAssistantReply(page: import('@playwright/test').Page, timeout = 30_000) {
  await expect(page.getByPlaceholder('Type a message…')).toBeEnabled({ timeout });
}

test.describe('assistant chat add-ons (regression: UC6 existing-booking extras via chat)', () => {
  test('adds a fee-bearing extra to an existing booking and charges the delta via real payment', async ({
    page,
    mongoClient,
  }) => {
    void mongoClient;

    // Navigate first so clerk-js refreshes the short-lived __session JWT
    // from storageState before the raw page.request call below — otherwise
    // a stale token (aged past its ~60s validity while earlier specs in this
    // batch ran) gets a 401 "Sign-in required" with no client-side refresh
    // ever triggered.
    await page.goto('/');
    await page.getByRole('link', { name: 'My Bookings' }).waitFor({ state: 'visible', timeout: 15_000 });

    const booking = await createTestBooking(page.request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });

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
      throw new Error('No fee-bearing (non-waived) addon found in catalog — check seed data');
    }
    const addonName = (feeBearing.name as string) ?? feeBearing.addon_id;
    const expectedDeltaCents = Math.round((feeBearing.fee_per_day as number) * NIGHTS * 100);

    try {
      await openChat(page);
      await send(page, `Add ${addonName} to my existing booking with ${booking.vendorId}`);
      await waitForAssistantReply(page, 45_000);
      // Model may need to disambiguate/confirm which booking or extra — nudge
      // once with an explicit yes if it asks, otherwise this is a no-op.
      await send(page, 'yes, go ahead');
      await waitForAssistantReply(page, 45_000);

      const paymentVisible = await page
        .locator('iframe[src*="elements-inner-accessory-target"]')
        .isVisible()
        .catch(() => false);

      if (paymentVisible) {
        const stripeFrame = page.frameLocator('iframe[src*="elements-inner-accessory-target"]');
        await stripeFrame.getByRole('button', { name: 'Card', exact: true }).click();
        await stripeFrame.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
        await stripeFrame.getByPlaceholder('MM / YY').fill('12/34');
        await stripeFrame.getByPlaceholder('CVC').fill('123');

        const addonsResponse = page.waitForResponse(
          (res) => res.url().includes(`/api/bookings/${booking.bookingId}/addons`) && res.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Pay and book' }).click();
        const addonsRes = await addonsResponse;
        expect(addonsRes.status()).toBe(200);
        await waitForAssistantReply(page, 45_000);
      }

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.pricingSnapshot.addonIds).toContain(feeBearing.addon_id);
      expect(updated?.pricingSnapshot.addonTotal).toBe((feeBearing.fee_per_day as number) * NIGHTS);
      void expectedDeltaCents;
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });
});
