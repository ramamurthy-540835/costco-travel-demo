import { test, expect } from '../fixtures/test-data';
import Booking from '@/lib/models/Booking';
import {
  FROM_OFFSET_DAYS,
  NIGHTS,
  addDays,
  pickPricedInventory,
  createConfirmedPaymentIntent,
} from '../fixtures/booking-helpers';

test.describe('checkout / booking creation (regression: rate-integrity)', () => {
  test('completes a happy-path booking with a correctly-priced PaymentIntent', async ({
    page,
    request,
    mongoClient,
  }) => {
    const match = await pickPricedInventory();
    const inventoryId = match.inventory.rental_id as string;
    const vendorId = match.vendor.provider;
    const from = addDays(new Date(), FROM_OFFSET_DAYS);
    const to = addDays(from, NIGHTS);
    const dailyRate = match.inventory.daily_rate as number;
    const totalPrice = dailyRate * NIGHTS;

    await page.goto(
      `/checkout?inventoryId=${inventoryId}&vendorId=${vendorId}&from=${from.toISOString()}&to=${to.toISOString()}`,
    );
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await expect(page.getByText(`Total: $${totalPrice.toFixed(2)}`)).toBeVisible();

    const receiptEmail = process.env.E2E_CLERK_TEST_EMAIL!;
    const paymentIntent = await createConfirmedPaymentIntent(totalPrice, receiptEmail);
    expect(paymentIntent.status).toBe('succeeded');

    const bookingRes = await request.post('/api/bookings', {
      data: {
        inventoryId,
        vendorId,
        from: from.toISOString(),
        to: to.toISOString(),
        paymentIntentId: paymentIntent.id,
      },
    });
    expect(bookingRes.status(), await bookingRes.text()).toBe(201);
    const { bookingId } = await bookingRes.json();

    try {
      await page.goto(`/confirmation/${bookingId}`);
      await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
      await expect(page.getByText(vendorId, { exact: true })).toBeVisible();
      await expect(page.getByText(`$${totalPrice.toFixed(2)}`, { exact: true })).toBeVisible();

      const booking = await Booking.findById(bookingId).lean();
      expect(booking?.status).toBe('reserved');
      expect(booking?.pricingSnapshot.totalPrice).toBe(totalPrice);
    } finally {
      await Booking.deleteOne({ _id: bookingId });
    }
    void mongoClient;
  });

  test('rejects a PaymentIntent charged below the negotiated rate (regression: rate-integrity)', async ({
    request,
    mongoClient,
  }) => {
    const match = await pickPricedInventory();
    const inventoryId = match.inventory.rental_id as string;
    const vendorId = match.vendor.provider;
    const from = addDays(new Date(), FROM_OFFSET_DAYS);
    const to = addDays(from, NIGHTS);
    const dailyRate = match.inventory.daily_rate as number;
    const totalPrice = dailyRate * NIGHTS;
    const underchargedAmount = Math.max(1, totalPrice - 10);

    const receiptEmail = process.env.E2E_CLERK_TEST_EMAIL!;
    const paymentIntent = await createConfirmedPaymentIntent(underchargedAmount, receiptEmail);
    expect(paymentIntent.status).toBe('succeeded');

    const bookingRes = await request.post('/api/bookings', {
      data: {
        inventoryId,
        vendorId,
        from: from.toISOString(),
        to: to.toISOString(),
        paymentIntentId: paymentIntent.id,
      },
    });
    expect(bookingRes.status()).toBe(400);
    const body = await bookingRes.json();
    expect(body.error).toBe('Charged amount does not match the negotiated rate');

    const leftover = await Booking.findOne({ paymentIntentId: paymentIntent.id }).lean();
    expect(leftover).toBeNull();
    void mongoClient;
  });
});
