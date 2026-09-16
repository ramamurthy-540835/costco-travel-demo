import { test, expect } from '../fixtures/test-data';
import { searchInventory, getVendorPolicy } from '@/lib/graph/queries';
import { checkAvailability } from '@/lib/vendor-integration/policy';
import Booking from '@/lib/models/Booking';
import { addDays, createTestBooking, createConfirmedPaymentIntent } from '../fixtures/booking-helpers';

const FROM_OFFSET_DAYS = 30;
const NIGHTS = 3;

async function findCrossVendorCandidate(currentInventoryId: string, currentVendorId: string) {
  const results = await searchInventory();
  const match = results.find(
    (r) =>
      r.negotiatedTerm &&
      typeof r.inventory.daily_rate === 'number' &&
      r.inventory.daily_rate > 0 &&
      r.inventory.rental_id !== currentInventoryId &&
      r.vendor.provider !== currentVendorId,
  );
  if (!match) {
    throw new Error('No cross-vendor priced candidate found for regression fixtures');
  }
  return match;
}

test.describe('booking modification (regression: dates + vendor-change)', () => {
  test('increases dates and charges the delta via a real PaymentIntent', async ({
    request,
    mongoClient,
  }) => {
    void mongoClient;
    const booking = await createTestBooking(request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });
    const newTo = addDays(booking.to, 2); // +2 nights

    try {
      const dryRun = await request.post(`/api/bookings/${booking.bookingId}/modify`, {
        data: { from: booking.from.toISOString(), to: newTo.toISOString(), dryRun: true },
      });
      expect(dryRun.status(), await dryRun.text()).toBe(200);
      const quote = await dryRun.json();
      expect(quote.deltaCents).toBeGreaterThan(0);

      const receiptEmail = process.env.E2E_CLERK_TEST_EMAIL!;
      const paymentIntent = await createConfirmedPaymentIntent(quote.deltaCents / 100, receiptEmail);
      expect(paymentIntent.status).toBe('succeeded');

      const modifyRes = await request.post(`/api/bookings/${booking.bookingId}/modify`, {
        data: {
          from: booking.from.toISOString(),
          to: newTo.toISOString(),
          paymentIntentId: paymentIntent.id,
        },
      });
      expect(modifyRes.status(), await modifyRes.text()).toBe(200);

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.to?.toISOString()).toBe(newTo.toISOString());
      expect(updated?.pricingSnapshot?.totalPrice).toBe(quote.newTotalPrice);
      expect(updated?.modificationHistory?.length).toBeGreaterThan(0);
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });

  test('decreases dates and auto-refunds the delta', async ({ request, mongoClient }) => {
    void mongoClient;
    const booking = await createTestBooking(request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });
    const newTo = addDays(booking.from, NIGHTS - 1); // -1 night

    try {
      const dryRun = await request.post(`/api/bookings/${booking.bookingId}/modify`, {
        data: { from: booking.from.toISOString(), to: newTo.toISOString(), dryRun: true },
      });
      expect(dryRun.status(), await dryRun.text()).toBe(200);
      const quote = await dryRun.json();
      expect(quote.deltaCents).toBeLessThan(0);

      const modifyRes = await request.post(`/api/bookings/${booking.bookingId}/modify`, {
        data: { from: booking.from.toISOString(), to: newTo.toISOString() },
      });
      expect(modifyRes.status(), await modifyRes.text()).toBe(200);
      const body = await modifyRes.json();
      expect(body.refundAmountCents).toBe(Math.abs(quote.deltaCents));

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.to?.toISOString()).toBe(newTo.toISOString());
      expect(updated?.modificationHistory?.[0]?.refundAmountCents).toBe(Math.abs(quote.deltaCents));
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });

  test('changes vendor/inventory successfully and updates the snapshot', async ({
    request,
    mongoClient,
  }) => {
    void mongoClient;
    const booking = await createTestBooking(request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });
    const candidate = await findCrossVendorCandidate(booking.inventoryId, booking.vendorId);
    const newInventoryId = candidate.inventory.rental_id as string;
    const newVendorId = candidate.vendor.provider;

    try {
      const dryRun = await request.post(`/api/bookings/${booking.bookingId}/modify`, {
        data: {
          from: booking.from.toISOString(),
          to: booking.to.toISOString(),
          inventoryId: newInventoryId,
          vendorId: newVendorId,
          dryRun: true,
        },
      });
      expect(dryRun.status(), await dryRun.text()).toBe(200);
      const quote = await dryRun.json();

      // A cross-vendor switch may land on a higher- or lower-priced vendor —
      // cover the delta with a real PaymentIntent when it increases, exactly
      // as the dates-increase spec above does.
      let paymentIntentId: string | undefined;
      if (quote.deltaCents > 0) {
        const receiptEmail = process.env.E2E_CLERK_TEST_EMAIL!;
        const paymentIntent = await createConfirmedPaymentIntent(quote.deltaCents / 100, receiptEmail);
        expect(paymentIntent.status).toBe('succeeded');
        paymentIntentId = paymentIntent.id;
      }

      const modifyRes = await request.post(`/api/bookings/${booking.bookingId}/modify`, {
        data: {
          from: booking.from.toISOString(),
          to: booking.to.toISOString(),
          inventoryId: newInventoryId,
          vendorId: newVendorId,
          ...(paymentIntentId ? { paymentIntentId } : {}),
        },
      });
      expect(modifyRes.status(), await modifyRes.text()).toBe(200);

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.inventoryId).toBe(newInventoryId);
      expect(updated?.vendorId).toBe(newVendorId);
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });

  test('rejects a cross-vendor change to an unavailable inventory unit (409)', async ({
    request,
    mongoClient,
  }) => {
    void mongoClient;
    const booking = await createTestBooking(request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });
    const candidate = await findCrossVendorCandidate(booking.inventoryId, booking.vendorId);
    const targetInventoryId = candidate.inventory.rental_id as string;
    const targetVendorId = candidate.vendor.provider;

    // Confirm this candidate is genuinely available before seeding a conflict,
    // so the 409 we assert is caused by our seeded conflict and not a
    // pre-existing seed-data collision.
    const availableBefore = await checkAvailability({
      inventoryId: targetInventoryId,
      from: booking.from,
      to: booking.to,
    });
    expect(availableBefore).toBe(true);

    const conflict = await Booking.create({
      member: booking.bookingId, // arbitrary but valid ObjectId — not used by checkAvailability
      inventoryId: targetInventoryId,
      vendorId: targetVendorId,
      from: booking.from,
      to: booking.to,
      status: 'reserved',
      pricingSnapshot: {
        negotiatedTermId: 'regression-conflict-fixture',
        dailyRate: candidate.inventory.daily_rate as number,
        currency: 'usd',
        totalPrice: candidate.inventory.daily_rate as number,
      },
    });

    try {
      const modifyRes = await request.post(`/api/bookings/${booking.bookingId}/modify`, {
        data: {
          from: booking.from.toISOString(),
          to: booking.to.toISOString(),
          inventoryId: targetInventoryId,
          vendorId: targetVendorId,
        },
      });
      expect(modifyRes.status(), await modifyRes.text()).toBe(409);

      const unchanged = await Booking.findById(booking.bookingId).lean();
      expect(unchanged?.inventoryId).toBe(booking.inventoryId);
    } finally {
      await Booking.deleteOne({ _id: conflict._id });
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });

  test('rejects a cross-vendor change within the target vendor modification cutoff (400)', async ({
    request,
    mongoClient,
  }) => {
    void mongoClient;
    // checkModificationCutoff() is only invoked on the isInventoryOrVendorChange
    // branch (app/api/bookings/[id]/modify/route.ts) — a dates-only change never
    // reaches it, so this spec must exercise a genuine cross-vendor/inventory
    // change, not a dates-only one. The candidate's pick-up must also stay
    // genuinely available (checkAvailability runs first in that same branch),
    // or a 409 would fire before the cutoff check ever runs.
    const results = await searchInventory();
    const priced = results.filter(
      (r) => r.negotiatedTerm && typeof r.inventory.daily_rate === 'number' && r.inventory.daily_rate > 0,
    );
    let target: (typeof priced)[number] | undefined;
    let cutoffHours: number | undefined;
    for (const candidate of priced) {
      const policy = await getVendorPolicy(candidate.vendor.provider);
      const hours = policy?.modification_cutoff_hours as number | undefined;
      if (hours) {
        target = candidate;
        cutoffHours = hours;
        break;
      }
    }
    if (!target || !cutoffHours) {
      test.skip(true, 'No vendor with modification_cutoff_hours configured found for regression fixtures');
      return;
    }
    const targetInventoryId = target.inventory.rental_id as string;
    const targetVendorId = target.vendor.provider;

    // Seed the original booking on a *different* vendor/inventory so switching
    // to the target below is a genuine cross-vendor change.
    const originalCandidate = results.find(
      (r) =>
        r.negotiatedTerm &&
        typeof r.inventory.daily_rate === 'number' &&
        r.inventory.daily_rate > 0 &&
        r.inventory.rental_id !== targetInventoryId &&
        r.vendor.provider !== targetVendorId,
    );
    if (!originalCandidate) {
      test.skip(true, 'No distinct original vendor/inventory candidate found for regression fixtures');
      return;
    }

    const from = new Date(Date.now() + (cutoffHours / 2) * 3_600_000); // well inside cutoff
    const to = addDays(from, NIGHTS);

    const availableCheck = await checkAvailability({ inventoryId: targetInventoryId, from, to });
    if (!availableCheck) {
      test.skip(true, `Target inventory ${targetInventoryId} is not available for the chosen window`);
      return;
    }

    const booking = await createTestBooking(request, {
      inventoryId: originalCandidate.inventory.rental_id as string,
      vendorId: originalCandidate.vendor.provider,
      from,
      to,
      nights: NIGHTS,
    });

    try {
      const modifyRes = await request.post(`/api/bookings/${booking.bookingId}/modify`, {
        data: {
          from: from.toISOString(),
          to: to.toISOString(),
          inventoryId: targetInventoryId,
          vendorId: targetVendorId,
        },
      });
      expect(modifyRes.status(), await modifyRes.text()).toBe(400);

      const unchanged = await Booking.findById(booking.bookingId).lean();
      expect(unchanged?.inventoryId).toBe(booking.inventoryId);
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });
});
