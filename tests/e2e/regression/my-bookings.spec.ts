import { test, expect } from '../fixtures/test-data';
import Booking from '@/lib/models/Booking';
import { addDays, createTestBooking } from '../fixtures/booking-helpers';

const FROM_OFFSET_DAYS = 45;
const NIGHTS = 3;

test.describe('my bookings (regression: listing + entry-point wiring)', () => {
  test('lists a booking with working Modify/Cancel/Addons entry points', async ({ page, mongoClient }) => {
    void mongoClient;
    const booking = await createTestBooking(page.request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });

    try {
      await page.goto('/bookings');
      const card = page
        .locator('[data-slot="card"]', { hasText: booking.vendorId })
        .first();
      await expect(card).toBeVisible();

      await card.getByRole('button', { name: 'Modify' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');

      await card.getByRole('button', { name: 'Cancel booking' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');

      await card.getByRole('button', { name: 'Manage extras' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });

  test('status filter narrows results and clearing it restores them', async ({ page, mongoClient }) => {
    void mongoClient;
    const booking = await createTestBooking(page.request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });

    try {
      await page.goto('/bookings');
      await expect(page.locator('[data-slot="card"]', { hasText: booking.vendorId }).first()).toBeVisible();

      await page.goto('/bookings?status=cancelled');
      await expect(page.locator('[data-slot="card"]', { hasText: booking.vendorId })).toHaveCount(0);

      await page.goto('/bookings?status=');
      await expect(page.locator('[data-slot="card"]', { hasText: booking.vendorId }).first()).toBeVisible();
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });
});
