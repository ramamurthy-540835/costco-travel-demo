import type { APIRequestContext } from '@playwright/test';
import getStripe from '@/lib/payment/stripe';
import { searchInventory } from '@/lib/graph/queries';

export const FROM_OFFSET_DAYS = 14;
export const NIGHTS = 3;

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function pickPricedInventory() {
  const results = await searchInventory();
  const match = results.find(
    (r) => r.negotiatedTerm && typeof r.inventory.daily_rate === 'number' && r.inventory.daily_rate > 0,
  );
  if (!match) {
    throw new Error('No inventory with a negotiated term and daily_rate found for regression fixtures');
  }
  return match;
}

// The server's rate-integrity check (app/api/bookings/route.ts) retrieves the
// PaymentIntent from Stripe's real API and compares its `amount` to a
// server-recomputed total — a Next.js-server-to-Stripe call Playwright's
// browser-level `page.route` cannot intercept or influence. So instead of
// mocking the network, we create a REAL Stripe test-mode PaymentIntent
// (confirmed synchronously via the `pm_card_visa` test payment method,
// bypassing the Elements iframe — that real-iframe path is payment-smoke's
// job, not this file's) for whatever amount each spec needs, then submit it
// to /api/bookings exactly as checkout-form.tsx does.
export async function createConfirmedPaymentIntent(amountDollars: number, receiptEmail: string) {
  const stripeAPI = getStripe();
  return stripeAPI.paymentIntents.create({
    amount: Math.round(amountDollars * 100),
    currency: 'usd',
    receipt_email: receiptEmail,
    payment_method: 'pm_card_visa',
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  });
}

// Shared, API-level booking-creation helper for regression spec files that
// need a real, confirmed booking to act on but don't want to duplicate the
// search→PaymentIntent→POST /api/bookings flow inline. Bypasses the
// checkout page's UI entirely — callers that need to distinguish a specific
// vendor/inventory pair should filter `pickPricedInventory`'s candidates
// themselves and pass `inventoryId`/`vendorId` explicitly.
export async function createTestBooking(
  request: APIRequestContext,
  opts?: { inventoryId?: string; vendorId?: string; from?: Date; to?: Date; nights?: number },
) {
  const nights = opts?.nights ?? NIGHTS;
  let inventoryId = opts?.inventoryId;
  let vendorId = opts?.vendorId;
  let dailyRate: number;

  if (inventoryId && vendorId) {
    const results = await searchInventory();
    const match = results.find(
      (r) => r.inventory.rental_id === inventoryId && r.vendor.provider === vendorId,
    );
    if (!match || typeof match.inventory.daily_rate !== 'number') {
      throw new Error(`No priced match for inventoryId=${inventoryId} vendorId=${vendorId}`);
    }
    dailyRate = match.inventory.daily_rate;
  } else {
    const match = await pickPricedInventory();
    inventoryId = match.inventory.rental_id as string;
    vendorId = match.vendor.provider;
    dailyRate = match.inventory.daily_rate as number;
  }

  const from = opts?.from ?? addDays(new Date(), FROM_OFFSET_DAYS);
  const to = opts?.to ?? addDays(from, nights);
  const totalPrice = dailyRate * nights;

  const receiptEmail = process.env.E2E_CLERK_TEST_EMAIL!;
  const paymentIntent = await createConfirmedPaymentIntent(totalPrice, receiptEmail);
  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Expected PaymentIntent to succeed, got status=${paymentIntent.status}`);
  }

  const bookingRes = await request.post('/api/bookings', {
    data: {
      inventoryId,
      vendorId,
      from: from.toISOString(),
      to: to.toISOString(),
      paymentIntentId: paymentIntent.id,
    },
  });
  if (bookingRes.status() !== 201) {
    throw new Error(`Expected 201 creating test booking, got ${bookingRes.status()}: ${await bookingRes.text()}`);
  }
  const { bookingId } = await bookingRes.json();

  return { bookingId, inventoryId, vendorId, dailyRate, from, to, totalPrice, nights };
}
