import { test, expect } from '../fixtures/test-data';
import Booking from '@/lib/models/Booking';
import { addDays, createTestBooking } from '../fixtures/booking-helpers';

// Regression for the booking-history-as-first-class-intent rule (09-05-PLAN.md):
// "show my previous bookings" must resolve to get_booking_status and render
// the BookingListCard, never a plain-text dump of every field.
test.setTimeout(120_000);

const FROM_OFFSET_DAYS = 90;
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

test.describe('assistant chat booking history (regression: history-as-intent phrasing)', () => {
  test('shows an upcoming reservation as a list card, not a text dump', async ({ page, mongoClient }) => {
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

    try {
      await openChat(page);
      await send(page, 'show my upcoming bookings');
      await waitForAssistantReply(page, 45_000);

      await expect(page.getByText(booking.vendorId).first()).toBeVisible();
      await expect(page.getByText(`$${booking.totalPrice.toFixed(2)}`).first()).toBeVisible();
      // The one-line framing must not restate rates/specs already on the card.
      await expect(page.getByText(`$${booking.totalPrice.toFixed(2)}`)).toHaveCount(1);
    } finally {
      await Booking.deleteOne({ _id: booking.bookingId });
    }
  });
});
