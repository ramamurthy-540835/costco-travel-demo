import { test, expect } from '../fixtures/test-data';
import { searchInventory } from '@/lib/graph/queries';
import Booking from '@/lib/models/Booking';

const FROM_OFFSET_DAYS = 20;
const NIGHTS = 2;

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Slower and inherently more flaky than the mocked-network specs in
// checkout.spec.ts, by nature of driving a real third-party (Stripe) iframe —
// intentionally isolated to its own file and @payment-smoke tag so it can be
// excluded from fast runs (CI wiring itself is out of scope for this plan).
test('completes real Stripe Elements payment @payment-smoke', async ({ page, mongoClient }) => {
  void mongoClient;
  const results = await searchInventory();
  const match = results.find(
    (r) => r.negotiatedTerm && typeof r.inventory.daily_rate === 'number' && r.inventory.daily_rate > 0,
  );
  if (!match) {
    throw new Error('No inventory with a negotiated term and daily_rate found for regression fixtures');
  }
  const inventoryId = match.inventory.rental_id as string;
  const vendorId = match.vendor.provider;
  const from = addDays(new Date(), FROM_OFFSET_DAYS);
  const to = addDays(from, NIGHTS);

  await page.goto(
    `/checkout?inventoryId=${inventoryId}&vendorId=${vendorId}&from=${from.toISOString()}&to=${to.toISOString()}`,
  );
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  // Despite the name, live inspection (via the accessibility snapshot and a
  // per-frame role query) showed the PaymentElement's tab picker (Card / Bank /
  // Klarna) AND the resulting card-number/expiry/CVC fields both render inside
  // the "elements-inner-accessory-target" iframe, not "elements-inner-easel" —
  // the two are visually stacked but only accessory-target is populated here.
  const stripeFrame = page.frameLocator('iframe[src*="elements-inner-accessory-target"]');

  // The PaymentElement first renders a tab-style picker (Card / Bank / Klarna);
  // selecting "Card" expands the actual card-number/expiry/CVC fields in the
  // same frame.
  await stripeFrame.getByRole('button', { name: 'Card', exact: true }).click();
  await stripeFrame.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
  await stripeFrame.getByPlaceholder('MM / YY').fill('12/34');
  await stripeFrame.getByPlaceholder('CVC').fill('123');

  await page.getByRole('button', { name: 'Pay and book' }).click();

  await page.waitForURL(/\/confirmation\/.+/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

  const bookingId = page.url().split('/confirmation/')[1];
  const booking = await Booking.findById(bookingId).lean();
  expect(booking?.status).toBe('reserved');

  await Booking.deleteOne({ _id: bookingId });
});
