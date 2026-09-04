# 06-01 SUMMARY — Regression Test Infrastructure: Fixture Foundation

Plan: `06-01-PLAN.md`
Applied: 2026-09-04

## What was built

**Task 1 — Playwright config restructuring**
- `@clerk/testing` installed as a devDependency.
- `tests/e2e/smoke.spec.ts` → `tests/e2e/smoke/smoke.spec.ts` via `git mv` (content unchanged, history preserved).
- `playwright.config.ts` rewritten into three projects: `setup` (runs `auth.setup.ts`), `smoke` (unauthenticated, independent), `regression` (depends on `setup`, reuses `storageState`). Loads both `.env.local` and `.env.test` via `dotenv`.
- `package.json` scripts added: `test:e2e:smoke`, `test:e2e:regression`.
- `.gitignore` gained `tests/e2e/.auth/` (session storageState, must never be committed). `.env.test` already covered by the existing `.env.*` pattern.
- `.env.test.example` added documenting the required Clerk test-instance credentials.

**Task 2 — Fixtures**
- `tests/e2e/fixtures/auth.setup.ts`: drives the real `/sign-in` UI (`@clerk/testing`'s `clerkSetup()`/`setupClerkTestingToken()` for bot-detection bypass only, not authentication), waits for the `attempt_first_factor` response then `networkidle` before navigating home, confirms a genuine session via the "My Bookings" link (only rendered inside `<Show when="signed-in">` in `components/header.tsx`), and persists `storageState` to `tests/e2e/.auth/user.json`.
- `tests/e2e/fixtures/test-data.ts`: worker-scoped `mongoClient` fixture + test-scoped `testMember`/`testBooking` fixtures (self-cleaning, tagged by `testInfo.testId`), built with real `Member`/`Booking` Mongoose models.
- `tests/e2e/fixtures/stripe-mock.ts`: `mockStripePayment()` intercepts `POST /api/payments/intent`, shaped to match the real route's response.

## Deviations from plan

- **`auth.setup.ts` password locator**: real Clerk UI has both a password `<input>` and a "Show password" toggle button matching `getByLabel('Password')` — a strict-mode violation not anticipated in the plan. Fixed with `{ exact: true }`.
- **`auth.setup.ts` timing**: the plan's flow (fill → click → `page.goto('/')`) raced Clerk-JS's own session-cookie write, so `storageState` was captured signed-out. Fixed by waiting for the `attempt_first_factor` response and `networkidle` before navigating.
- **Clerk dashboard change (user-performed, not code)**: the test-instance had a "device/client-trust verification" setting enabled that caused `attempt_first_factor` to return `status: "needs_client_trust"` with `created_session_id: null` — password correctly verified, but no session created. This is a Clerk account-level "new device" gate, unrelated to `@clerk/testing`'s bot-detection bypass. User disabled it in the Clerk dashboard for this test instance; not a code fix.
- **`test-data.ts` fixture typing**: Playwright's `base.extend<TestFixtures, WorkerFixtures>()` single-call form left `use`/`testInfo` as implicit `any` in the `testMember` callback under this TS/Playwright version combo. Fixed by splitting into two chained `.extend()` calls (`withMongo = base.extend<{}, WorkerFixtures>(...)` then `test = withMongo.extend<TestFixtures>(...)`) plus explicit parameter type annotations on the `testMember` callback.

## Acceptance criteria

| AC | Result |
|---|---|
| AC-1: Clerk auth via real UI, `storageState` reused by `regression` project | **Pass** — live-verified: real `__session` cookies captured, `regression` project runs `setup` as a dependency automatically. |
| AC-2: smoke/regression tiering via projects | **Pass** — `npm run test:e2e:smoke` (10/10) and `npm run test:e2e:regression` (setup-only, no regression specs exist yet — correct, none are in scope for this plan) both run cleanly. |
| AC-3: `testMember`/`testBooking` insert + cleanup against real Mongo | **Pass** — verified with a throwaway spec against the real dev DB; insert and cleanup both confirmed. |
| AC-4: Stripe mock shaped to match `/api/payments/intent`'s real response | **Pass** — `stripe-mock.ts` grounded directly in `app/api/payments/intent/route.ts`'s actual response shape; typechecks clean. |

## Verification

- `npx tsc --noEmit`: clean, whole project.
- `npm run test:e2e:smoke`: 10/10 passing (both before and after this plan's changes — no regressions).
- `npx playwright test --project=setup`: passing, real Clerk session captured in `tests/e2e/.auth/user.json`.
- `npm run test:e2e:regression`: passing (setup + regression projects; 0 regression specs found, expected — 06-02 through 06-05 add those).

## Checkpoint

Blocking `checkpoint:human-verify` cleared. User created `.env.test` with a real Clerk test-instance user (`playwright1+clerk_test@example.com`) themselves, then approved after the Clerk dashboard device-trust setting was disabled and the timing fix above was applied.

## Files changed

`playwright.config.ts`, `package.json`, `package-lock.json`, `.gitignore`, `.env.test.example` (new), `.env.local.example`, `tests/e2e/smoke.spec.ts` → `tests/e2e/smoke/smoke.spec.ts` (moved), `tests/e2e/fixtures/auth.setup.ts` (new), `tests/e2e/fixtures/test-data.ts` (new), `tests/e2e/fixtures/stripe-mock.ts` (new).

## Next

06-02 through 06-05 (all `depends_on: ["06-01"]`) can now proceed to `/coder:apply` — the fixtures they consume (`auth.setup.ts`'s storageState, `testMember`/`testBooking`, `mockStripePayment`) are built and verified.
