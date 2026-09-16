import type { Page } from '@playwright/test';

/**
 * Intercepts the client-secret creation call (`POST /api/payments/intent`)
 * with a synthetic success response, shaped to match that route's real
 * return value ({ paymentIntentId, customerId, clientSecret }).
 *
 * This does NOT stub Stripe.js's own confirmCardPayment/Elements internals —
 * regression specs must additionally short-circuit at the app level (e.g.
 * treating a mocked client secret as already-confirmed in a test-only
 * branch). That app-level design question is deferred to 06-02, which owns
 * the actual checkout-form code this must integrate with.
 */
export async function mockStripePayment(page: Page) {
  await page.route('**/api/payments/intent', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        paymentIntentId: 'pi_mock_e2e',
        customerId: 'cus_mock_e2e',
        clientSecret: 'pi_mock_e2e_secret_mock',
      }),
    });
  });
}
