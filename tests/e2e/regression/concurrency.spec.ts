import { test, expect } from '../fixtures/test-data';
import { searchInventory } from '@/lib/graph/queries';
import Booking from '@/lib/models/Booking';
import { addDays, createTestBooking } from '../fixtures/booking-helpers';

// These specs bypass the UI and hit the API routes directly via Playwright's
// `request` fixture (shares the "regression" project's storageState cookies
// automatically — no manual cookie parsing needed). Reproducing a true race
// through UI clicks is unreliable, so this is a deliberate exception to
// "drive it like a user": the goal is to prove the server-side atomicity
// guard (cancel/route.ts's atomic claim, modify/route.ts's optimistic-lock
// CAS), not the UI's own double-click prevention.

const FROM_OFFSET_DAYS = 30;
const NIGHTS = 3;

// Two distinct cross-vendor candidates priced identically to the original
// booking's dailyRate: this keeps deltaCents at exactly 0 for both racing
// requests, so neither hits the route's "requires paymentIntentId" branch
// before ever reaching the CAS write — the race is isolated to the
// optimistic-lock guard itself, not conflated with payment requirements.
async function findTwoSamePricedCrossVendorCandidates(
  currentInventoryId: string,
  currentVendorId: string,
  dailyRate: number,
) {
  const results = await searchInventory();
  const candidates = results.filter(
    (r) =>
      r.negotiatedTerm &&
      r.inventory.daily_rate === dailyRate &&
      r.inventory.rental_id !== currentInventoryId &&
      r.vendor.provider !== currentVendorId,
  );
  if (candidates.length < 2) {
    throw new Error(
      `Need 2 distinct same-priced (${dailyRate}) cross-vendor candidates for regression fixtures, found ${candidates.length}`,
    );
  }
  return [candidates[0], candidates[1]] as const;
}

test.describe('booking concurrency race guards (regression)', () => {
  test('double-cancel: exactly one request succeeds, status never reverts to reserved', async ({
    request,
    mongoClient,
  }) => {
    void mongoClient;
    const booking = await createTestBooking(request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });

    try {
      const [res1, res2] = await Promise.all([
        request.post(`/api/bookings/${booking.bookingId}/cancel`, { data: {} }),
        request.post(`/api/bookings/${booking.bookingId}/cancel`, { data: {} }),
      ]);
      const statuses = [res1.status(), res2.status()].sort();
      expect(statuses).toEqual([200, 400]);

      const winner = res1.status() === 200 ? res1 : res2;
      const winnerBody = await winner.json();
      expect(winnerBody.refundAmountCents).toBeGreaterThanOrEqual(0);

      const loser = res1.status() === 200 ? res2 : res1;
      const loserBody = await loser.json();
      expect(loserBody.error).toBe('Only reserved bookings can be cancelled');

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.status).toBe('cancelled');
      expect(typeof updated?.cancellation?.refundAmountCents).toBe('number');
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });

  test('concurrent-modify to different inventory: exactly one succeeds, other gets 409, no merged state', async ({
    request,
    mongoClient,
  }) => {
    void mongoClient;
    const booking = await createTestBooking(request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });
    const [candidateA, candidateB] = await findTwoSamePricedCrossVendorCandidates(
      booking.inventoryId,
      booking.vendorId,
      booking.dailyRate,
    );

    try {
      const [res1, res2] = await Promise.all([
        request.post(`/api/bookings/${booking.bookingId}/modify`, {
          data: {
            from: booking.from.toISOString(),
            to: booking.to.toISOString(),
            inventoryId: candidateA.inventory.rental_id as string,
            vendorId: candidateA.vendor.provider,
          },
        }),
        request.post(`/api/bookings/${booking.bookingId}/modify`, {
          data: {
            from: booking.from.toISOString(),
            to: booking.to.toISOString(),
            inventoryId: candidateB.inventory.rental_id as string,
            vendorId: candidateB.vendor.provider,
          },
        }),
      ]);
      const statuses = [res1.status(), res2.status()].sort();
      expect(statuses).toEqual([200, 409]);

      const winnerIsA = res1.status() === 200;
      const winnerCandidate = winnerIsA ? candidateA : candidateB;

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.inventoryId).toBe(winnerCandidate.inventory.rental_id as string);
      expect(updated?.vendorId).toBe(winnerCandidate.vendor.provider);
      expect(updated?.modificationHistory?.length).toBe(1);
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });
});
