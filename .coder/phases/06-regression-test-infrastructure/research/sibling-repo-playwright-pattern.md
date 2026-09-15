# Research: mastech-agentic-commerce's Playwright/Clerk pattern

**Agent:** Explore | **Date:** 2026-09-04

## 1. `playwright.config.ts`
- `testDir: './tests/e2e'`, `baseURL` from `PLAYWRIGHT_BASE_URL` env or `localhost:3000`.
- `webServer`: runs `npm run dev`, waits on `localhost:3000`, `reuseExistingServer: !process.env.CI` (60s timeout).
- `retries: 0`, `workers: 1` (fully serial — no parallelism).
- Three **projects**, chained via `dependencies`:
  1. `setup` — matches `*.setup.ts`, runs first.
  2. `chromium` — depends on `setup`, uses `storageState: 'tests/e2e/.auth/user.json'`, `testIgnore`s `cart-sign-out.spec.ts`.
  3. `chromium-signout` — depends on `chromium`, matches only `cart-sign-out.spec.ts`, forced last because Clerk's dev-browser session revocation on sign-out invalidates the shared storageState for the rest of the run.
- No function-based `globalSetup`/teardown — the "setup" project (`tests/e2e/fixtures/auth.setup.ts`) plays that role via project dependencies.

## 2. Smoke test — `golden-path.spec.ts`
One single linear happy-path test: home → category → product → Add To Cart → cart sheet → Checkout → assert redirect to `checkout.stripe.com`. "Smoke" = one critical-path test, not exhaustive coverage. Inline selectors, no page objects.

## 3. Regression specs
Each regression spec is a narrow, single-assertion guard for one previously-fixed bug, not a full journey:
- **stripe-cancel-copy.spec.ts** — asserts cancel-page copy says "Checkout cancelled"/"No charge was made", NOT the old alarming text. Copy-regression guard.
- **cart-sign-out.spec.ts** — `test.use({ storageState: undefined })`, signs in as a **second dedicated** Clerk test user (`E2E_CLERK_TEST_EMAIL_2`), adds to cart, signs out, asserts cart badge resets. Guards stale-cart-after-sign-out.
- **image-integrity.spec.ts** — loops categories, asserts no uncaught `pageerror`, every `img[alt="Product image"]` has `complete === true`/non-empty `src`/`naturalWidth > 0`. Treats zero-products-found as not-a-failure (ambient data dependency).

## 4. Clerk authentication (critical finding)
Uses the official **`@clerk/testing`** package (v2.2.24), NOT a hand-rolled JWT/cookie hack:
- `tests/e2e/fixtures/auth.setup.ts` (the "setup" project): `clerkSetup()` (needs `CLERK_SECRET_KEY`) → `setupClerkTestingToken({ page })` after `page.goto('/')` → real UI sign-in (email → Continue → password → Continue → OTP `424242` for `+clerk_test@` emails) → `page.context().storageState({ path: 'tests/e2e/.auth/user.json' })`.
- All specs except sign-out reuse that storageState (one login per run, not per-spec).
- Test creds from gitignored `.env.test` (`E2E_CLERK_TEST_EMAIL/PASSWORD`, `_2` variants, `PLAYWRIGHT_BASE_URL`).

## 5. CI wiring
**None.** `.github/workflows/deploy.yml` has zero e2e/playwright references. `npm run test:e2e` exists but is local-only today.

## 6. Test data/seeding
No dedicated seeding scripts — specs depend on whatever product/category data already exists in the dev environment (ambient, uncontrolled). `image-integrity.spec.ts`'s "zero products = not a failure" is an explicit escape hatch acknowledging this weakness.

## Patterns worth replicating
- Project-dependency chaining for auth setup + storageState reuse (one login per run — fast).
- Explicit comments documenting *why* ordering/isolation matters (session revocation on sign-out).
- Narrow, single-assertion regression specs named after the bug they guard.
- Dedicated second test user to avoid session cross-contamination.

## Gaps/weaknesses (do not replicate)
- Not wired into CI — regressions only caught locally.
- `workers: 1`/`retries: 0` — serial, no flake safety net.
- No data-seeding/fixtures — tests coupled to ambient data, weak reproducibility.
- No page-object abstraction (acceptable at their scale; would need to be added if this suite grows past a handful of specs).
