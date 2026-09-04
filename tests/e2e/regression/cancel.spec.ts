import { test, expect } from '../fixtures/test-data';
import Booking from '@/lib/models/Booking';
import { quoteCancellation } from '@/lib/vendor-integration/policy';
import { addDays, createTestBooking } from '../fixtures/booking-helpers';

const FROM_OFFSET_DAYS = 30; // safely inside any reasonable cancellation window, avoids a timing-boundary flake
const NIGHTS = 3;

test.describe('booking cancellation (regression: refund preview + confirm)', () => {
  test('previews a live-computed refund and applies it on confirm', async ({
    request,
    mongoClient,
  }) => {
    void mongoClient;
    const booking = await createTestBooking(request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });

    try {
      const hoursUntilStart = (booking.from.getTime() - Date.now()) / (1000 * 60 * 60);
      const expectedQuote = await quoteCancellation({
        vendorId: booking.vendorId,
        hoursUntilStart,
      });
      expect(expectedQuote).not.toBeNull();

      const dryRun = await request.post(`/api/bookings/${booking.bookingId}/cancel`, {
        data: { dryRun: true },
      });
      expect(dryRun.status(), await dryRun.text()).toBe(200);
      const preview = await dryRun.json();
      expect(preview.refundPercent).toBe(expectedQuote!.refundPercent);
      const expectedRefundAmountCents = Math.round(
        (booking.totalPrice * 100 * expectedQuote!.refundPercent) / 100,
      );
      expect(preview.refundAmountCents).toBe(expectedRefundAmountCents);

      const confirmRes = await request.post(`/api/bookings/${booking.bookingId}/cancel`, {
        data: {},
      });
      expect(confirmRes.status(), await confirmRes.text()).toBe(200);
      const confirmBody = await confirmRes.json();
      expect(confirmBody.refundAmountCents).toBe(expectedRefundAmountCents);

      const updated = await Booking.findById(booking.bookingId).lean();
      expect(updated?.status).toBe('cancelled');
      expect(updated?.cancellation?.refundAmountCents).toBe(expectedRefundAmountCents);
      expect(updated?.cancellation?.refundPercent).toBe(expectedQuote!.refundPercent);
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });
});
