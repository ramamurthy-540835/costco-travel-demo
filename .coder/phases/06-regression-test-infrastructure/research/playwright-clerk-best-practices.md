# Research: Playwright + Clerk + Stripe E2E best practices (2026)

**Agent:** general-purpose (web) | **Date:** 2026-09-04

## 1. Clerk + Playwright auth — use `@clerk/testing`, not a hand-rolled JWT
Clerk's docs (clerk.com/docs/testing/playwright) prescribe the official `@clerk/testing` package:
- `clerkSetup()` runs once in a **project-based** global setup (not function-based `globalSetup` — env vars it sets don't propagate to workers otherwise). Fetches a Testing Token at suite start.
- `setupClerkTestingToken()` called per-test/page to inject that token — bypasses Clerk's bot-detection (CAPTCHA/device checks), not authentication itself; you still drive the real sign-in UI.
- Needs `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` (test-instance keys). Testing Token generated automatically.
- Still need a real Clerk test-mode user (`+clerk_test` email alias, static OTP).

**Recommendation:** `@clerk/testing` + a dedicated Clerk test-instance user for full-journey regression tests (exercises real auth UI). For a faster smoke tier where auth itself isn't under test, seed a session via Clerk's backend API and inject the cookie directly — faster, but doesn't validate the sign-in UI, so keep it out of any tier that must validate login itself.

## 2. Test isolation & data seeding against a real MongoDB
Playwright's `test.extend` fixture model fits directly:
- Worker-scoped fixture for a Mongo client connection (expensive to create).
- Test-scoped fixture (`testMember`, `testBooking`) inserts documents tagged with a unique run ID (e.g. `email: e2e-${testInfo.testId}@test.local`) before `use()`, deletes by that tag after.
- Dedicated test-only DB or `e2e_`-prefixed/tagged data, never the dev DB — a failed teardown can then be swept by a scheduled cleanup matching the tag, not corrupt real data.
- Avoid `test.describe.serial` for isolation — it enforces *order*, not isolation; prefer independent, self-seeding tests so one failure doesn't cascade.

## 3. Smoke vs. regression tiering — folder + tag, not separate configs
- Folder convention: `e2e/smoke/*.spec.ts` (unauthenticated, structural) vs. `e2e/regression/*.spec.ts` (authenticated, full journeys).
- Tag tests (`@smoke`/`@regression` in the title or test-details object), filter with `--grep @smoke` on every push, full `@regression` nightly/pre-merge.
- `test.describe.serial` reserved for genuinely order-dependent steps within one journey (create → modify → cancel sharing one booking ID) — not for suite-tiering.

## 4. Stripe in E2E — mock the client-secret/network layer for regression; one narrow real-Stripe smoke test
- Stripe test cards work with real Elements (`4242...` success, `4000000000000002` decline, `4000000000003220` 3DS).
- **Known friction:** Stripe Elements/Checkout render in cross-origin iframes — Playwright's `frameLocator` can drive them, but it's brittle (timing, dynamic attributes, bot mitigations).
- **Recommendation:** don't drive the real iframe in the main regression suite — stub PaymentIntent/client-secret creation via `page.route` and short-circuit confirm-payment to a synthetic success/decline, so booking-modification delta-payment and refund logic is tested at the app layer. Keep **one** narrow, tagged `@payment-smoke` test exercising the real Stripe Elements iframe end-to-end, run less frequently.
- For server-side refund/webhook tests, use Stripe PaymentMethod tokens (`pm_card_visa`) and the Stripe CLI (`stripe trigger`) to simulate webhook events rather than driving the UI.

## 5. CI wiring — standard pattern
- `npx playwright install --with-deps` before running tests.
- `webServer` block starts the app (`npm run build && npm start`, or `next dev`), waits on a health URL; CI just runs `npx playwright test`.
- Upload `playwright-report/` and `test-results/` via `actions/upload-artifact@v4` with `if: ${{ !cancelled() }}`.
- Treat uploaded traces/reports as sensitive (can capture auth tokens/test keys) — restrict artifact retention/access.

## Sources
- [Clerk: Testing with Playwright](https://clerk.com/docs/testing/playwright/overview)
- [Playwright: CI Introduction](https://playwright.dev/docs/ci-intro)
- [Playwright: Annotations & Tagging](https://playwright.dev/docs/test-annotations)
- [Playwright: Fixtures](https://playwright.dev/docs/test-fixtures)
- [Stripe: Testing](https://docs.stripe.com/testing)
