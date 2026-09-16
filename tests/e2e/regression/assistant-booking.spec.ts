import { test, expect } from '../fixtures/test-data';
import Booking from '@/lib/models/Booking';

// Drives the full UC1 chat flow end to end: slot-filling -> vendor
// disambiguation (grounded against a real multi-vendor model, see
// 09-05-PLAN.md) -> add-ons question -> itemized BookingSummaryCard ->
// a REAL Stripe Elements payment inside the chat panel -> booking created.
// Slower/flakier than a mocked-network spec by nature of driving both an
// LLM turn loop and a real third-party iframe, so kept in its own file
// alongside payment-smoke.spec.ts's real-iframe precedent.
test.setTimeout(180_000);

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

test.describe('assistant chat booking (regression: UC1 slot-fill -> vendor disambig -> add-ons -> real payment)', () => {
  test('books the Toyota Corolla from a chosen vendor and completes a real Stripe payment', async ({
    page,
    mongoClient,
  }) => {
    void mongoClient;

    await openChat(page);
    await send(page, 'I need a car');
    await waitForAssistantReply(page);

    await send(page, 'Las Vegas');
    await waitForAssistantReply(page);
    await send(page, 'same city');
    await waitForAssistantReply(page);
    await send(page, 'March 10 to March 15 2027');
    await waitForAssistantReply(page);
    await send(page, 'open to any vendor');
    await waitForAssistantReply(page, 45_000);

    await send(page, 'book the Toyota Corolla');
    await waitForAssistantReply(page, 45_000);
    // Vendor disambiguation must be grounded in a real, just-fetched
    // search_inventory result, not a hallucinated vendor list (regression
    // for the 09-05 vendor-hallucination bug). Phrasing varies turn to turn
    // (e.g. "book it from Avis, Alamo, National...?"), so assert on the
    // real vendor names actually present rather than a literal "which vendor".
    await expect(page.getByText(/Avis|Alamo|National|Enterprise|Budget|Thrifty|Payless/).last()).toBeVisible();

    await send(page, 'Alamo');
    await waitForAssistantReply(page, 45_000);
    await expect(page.getByText(/extras|insurance|gps/i).last()).toBeVisible();

    await send(page, 'no extras thanks');
    await waitForAssistantReply(page, 45_000);

    // The distinct itemized billing card (not the plain-text one-liner used
    // for modify/cancel) must render with a real total.
    await expect(page.getByText('Base rate')).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();
    await expect(page.getByText(/Pickup: Las Vegas/)).toBeVisible();

    const stripeFrame = page.frameLocator('iframe[src*="elements-inner-accessory-target"]');
    await stripeFrame.getByRole('button', { name: 'Card', exact: true }).click();
    await stripeFrame.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
    await stripeFrame.getByPlaceholder('MM / YY').fill('12/34');
    await stripeFrame.getByPlaceholder('CVC').fill('123');

    const bookingResponse = page.waitForResponse(
      (res) => res.url().includes('/api/bookings') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Pay and book' }).click();
    const bookingRes = await bookingResponse;
    expect(bookingRes.status()).toBe(201);
    const { bookingId } = await bookingRes.json();

    await waitForAssistantReply(page, 45_000);
    await expect(page.getByText(/confirmed/i).last()).toBeVisible({ timeout: 20_000 });

    const booking = await Booking.findById(bookingId).lean();
    expect(booking).not.toBeNull();
    expect(booking?.status).toBe('reserved');
    expect(booking?.vendorId).toBe('Alamo');

    await Booking.deleteOne({ _id: bookingId });
  });
});
