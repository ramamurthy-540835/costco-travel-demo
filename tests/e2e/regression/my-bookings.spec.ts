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

  test('GET /api/bookings?bookingId scopes to exactly one booking and never leaks the full list on a miss', async ({
    page,
    mongoClient,
  }) => {
    void mongoClient;
    const bookingA = await createTestBooking(page.request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS),
      nights: NIGHTS,
    });
    const bookingB = await createTestBooking(page.request, {
      from: addDays(new Date(), FROM_OFFSET_DAYS + 10),
      nights: NIGHTS,
    });

    try {
      const byId = await page.request.get(`/api/bookings?bookingId=${bookingA.bookingId}`);
      expect(byId.status()).toBe(200);
      const byIdBody = await byId.json();
      expect(byIdBody).toHaveLength(1);
      expect(byIdBody[0]._id).toBe(bookingA.bookingId);

      // A well-formed but non-existent id must return an empty list, never
      // the member's full history (AC-2's "no result" contract) — a bogus
      // ObjectId that doesn't belong to any booking exercises the same
      // ownership-scoped-miss path a cross-member id would.
      const bogusId = bookingA.bookingId.replace(/.$/, bookingA.bookingId.endsWith('0') ? '1' : '0');
      const byBogusId = await page.request.get(`/api/bookings?bookingId=${bogusId}`);
      expect(byBogusId.status()).toBe(200);
      expect(await byBogusId.json()).toEqual([]);

      // Malformed id (not a valid ObjectId at all) — must not throw or 500,
      // and must not fall back to the unfiltered list.
      const byMalformedId = await page.request.get('/api/bookings?bookingId=not-a-real-id');
      expect(byMalformedId.status()).toBe(200);
      expect(await byMalformedId.json()).toEqual([]);
    } finally {
      await Booking.deleteOne({ _id: bookingA.bookingId });
      await Booking.deleteOne({ _id: bookingB.bookingId });
    }
  });
});
