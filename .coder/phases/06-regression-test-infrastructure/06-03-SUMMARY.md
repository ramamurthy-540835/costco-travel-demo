# 06-03 SUMMARY — Modification/UC2 Regression Specs

Plan: `06-03-PLAN.md`
Applied: 2026-09-04

## What was built

**`tests/e2e/regression/modify.spec.ts`** (5 specs, all against real Mongo + Stripe test mode, via `request.post` directly to `/api/bookings/[id]/modify` rather than the modify dialog UI):
1. Dates-increase: dry-run quote, real confirmed Stripe PaymentIntent for `deltaCents`, applies, asserts 200 + `pricingSnapshot.totalPrice`/`modificationHistory` updated.
2. Dates-decrease: dry-run quote, applies without payment, asserts `refundAmountCents` matches `|deltaCents|` and is recorded in `modificationHistory`.
3. Cross-vendor success: dry-run to detect delta sign, covers a real PaymentIntent if the new vendor is more expensive, asserts `inventoryId`/`vendorId` updated.
4. Cross-vendor 409: confirms a candidate target is genuinely available via `checkAvailability()`, seeds a conflicting `reserved` Booking against that exact inventory/date window, asserts 409 + original booking unchanged.
5. Cross-vendor cutoff 400: scans priced inventory for a vendor with `modification_cutoff_hours` configured (read live via `getVendorPolicy()`, never hardcoded), seeds the original booking on a distinct vendor/inventory, picks a pick-up time inside that cutoff window, confirms the target is available (so availability doesn't fire first), asserts 400 + original booking unchanged.

**`tests/e2e/fixtures/booking-helpers.ts`** (new, non-spec file) — extracted shared `pickPricedInventory`/`createConfirmedPaymentIntent`/`createTestBooking`/`addDays` helpers, used by both `checkout.spec.ts` and `modify.spec.ts`.

## Deviations from plan

- **`createTestBooking` did not exist where the plan expected it, and could not live in a spec file.** The plan's Task 1 assumed 06-02's `checkout.spec.ts` already exports a `createTestBooking(page)` helper — it did not; 06-02 only had inline, non-exported logic. Extracting and exporting it directly from `checkout.spec.ts` (the naive fix) then hit a second, harder blocker: Playwright refuses `"test file … should not import test file …"` when one spec file imports from another — this only surfaces when both spec files run in the same invocation (e.g. the full `npm run test:e2e:regression` suite), not when run individually, so it wasn't visible until the combined run. **Fix**: created `tests/e2e/fixtures/booking-helpers.ts` (a plain, non-spec module) holding `pickPricedInventory`, `createConfirmedPaymentIntent`, `createTestBooking`, and `addDays`; both `checkout.spec.ts` and `modify.spec.ts` import from it. `checkout.spec.ts`'s own two specs were refactored to use the shared module instead of local copies — no behavior change to those specs.
- **`mockStripePayment`/UI-driven delta payment re-hits 06-02's server-side-retrieve wall.** The plan's Task 1 instructions describe driving the modify dialog's real Stripe Elements and/or `mockStripePayment` for the delta-payment step. `modify/route.ts` calls `stripeAPI.paymentIntents.retrieve(body.paymentIntentId)` server-side (line 127) — the exact same Next.js-server-to-Stripe call that made browser-level mocking impossible for `checkout.spec.ts` in 06-02. **Fix**: identical pattern to 06-02 — all 5 specs call `/api/bookings/[id]/modify` directly via `request.post` (bypassing the modify dialog UI entirely), and the two specs needing a price increase (dates-increase, cross-vendor-when-pricier) create a real, already-`succeeded` Stripe test-mode PaymentIntent via the Node SDK for the exact `deltaCents` quoted by a prior `dryRun: true` call, then submit that intent's id. `mockStripePayment` remains unused.
- **Cutoff-400 must be a cross-vendor/inventory change, not dates-only.** Reading `modify/route.ts` in full showed `checkModificationCutoff()` is only invoked inside the `isInventoryOrVendorChange` branch — a dates-only request never reaches it. Spec 5 was designed as a cross-vendor change (distinct original vendor/inventory → a target vendor with `modification_cutoff_hours` configured, at a pick-up time inside that window) rather than the dates-only shape implied by grouping it with Task 2's other cross-vendor specs in the plan's AC list — this matches the actual guarded branch, not an assumption about it.
- **Cross-vendor success spec must handle either delta sign.** The plan's AC for this spec didn't specify the price direction of the target vendor. A same-price or cheaper cross-vendor switch applies with no payment; a pricier one requires the same real-PaymentIntent-for-`deltaCents` treatment as the dates-increase spec. The spec now dry-runs first and only creates a PaymentIntent when `deltaCents > 0`.

## Acceptance criteria

| AC | Result |
|---|---|
| AC-1: Dates increase recomputes total and requires a matching real payment | **Pass** — dry-run quote, real PaymentIntent for `deltaCents`, applied change verified in Mongo. |
| AC-2: Dates decrease auto-refunds the difference | **Pass** — `refundAmountCents` matches `\|deltaCents\|`, recorded in `modificationHistory`. |
| AC-3: Cross-vendor change succeeds (with correct payment handling) and rejects with 409 when the target is unavailable | **Pass** — both the success path (delta-aware) and the seeded-conflict 409 path verified against real Mongo state. |
| AC-4: Cross-vendor change within the target vendor's modification cutoff is rejected with 400 | **Pass** — cutoff hours read live via `getVendorPolicy()`, never hardcoded; target confirmed available first so the 409 branch doesn't preempt it. |

## Verification

- `npx tsc --noEmit`: clean, whole project.
- `npx playwright test --project=setup --project=regression tests/e2e/regression/modify.spec.ts`: 5/5 passing.
- `npm run test:e2e:regression` (setup + checkout.spec.ts + modify.spec.ts + payment-smoke.spec.ts, 9 specs total): 8/9 passing in the same run; `payment-smoke`'s `@payment-smoke` spec failed only under 5-way worker parallelism (real-iframe render flakiness, pre-existing from 06-02, unrelated to this plan's changes) and passed cleanly (`npx playwright test --project=setup --project=regression --grep @payment-smoke`, 1 worker) — confirmed not a regression introduced by this work.
- No leftover seeded documents: every spec cleans up its created booking(s) — including the seeded conflicting reservation in the 409 spec — in a `finally` block.
- `git status`: only the intended new files (`tests/e2e/regression/modify.spec.ts`, `tests/e2e/fixtures/booking-helpers.ts`) plus 06-02's already-tracked new files; no stray scratch/inspection files.

## Files changed

`tests/e2e/regression/modify.spec.ts` (new), `tests/e2e/fixtures/booking-helpers.ts` (new), `tests/e2e/regression/checkout.spec.ts` (refactored to import shared helpers instead of local copies — no behavior change).

## Next

Run `/coder:unify` to close the loop for 06-03. 06-04, 06-05 (both `depends_on: ["06-01"]`) remain planned and unapplied.
