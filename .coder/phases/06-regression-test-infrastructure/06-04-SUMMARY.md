# 06-04 SUMMARY — Cancellation/UC3 + Concurrency Race Guards

Plan: `06-04-PLAN.md`
Applied: 2026-09-04

## What was built

**`tests/e2e/regression/cancel.spec.ts`** (1 spec): creates a reserved booking, computes the expected refund independently via `quoteCancellation({ vendorId, hoursUntilStart })` (not a hardcoded percentage or a reimplementation of `getVendorPolicy()`'s raw fields), asserts the route's `dryRun: true` preview matches that live computation, confirms the cancellation, and asserts both the HTTP response and the Mongo-persisted `cancellation.refundAmountCents`/`refundPercent` match.

**`tests/e2e/regression/concurrency.spec.ts`** (2 specs, both bypass the UI via `request.post` directly — documented inline as a deliberate exception, since reproducing a true race through UI clicks is unreliable):
1. Double-cancel: fires two concurrent `POST /cancel` requests against the same reserved booking, asserts exactly one 200 (with a refund) and one 400 ("Only reserved bookings can be cancelled"), and confirms the final Mongo state is `status: 'cancelled'` (never reverted to `'reserved'`) with exactly one refund recorded.
2. Concurrent-modify: fires two concurrent `POST /modify` requests targeting two *different* cross-vendor inventory candidates, both selected to share the original booking's exact `dailyRate` (so `deltaCents === 0` for both — no payment requirement can interfere with the race), asserts exactly one 200 and one 409, and confirms the final Mongo document reflects exactly one winning change (`modificationHistory.length === 1`, `inventoryId`/`vendorId` matching only the winner) — never a merge of both.

## Deviations from plan

- **Concurrent-modify candidates constrained to matching `dailyRate`, not just "different inventory."** The plan's Task 2 instructions require targeting different inventory (correct — otherwise identical `totalPrice` from two dates-only changes could both satisfy the CAS precondition) but didn't account for a second real hazard: `modify/route.ts` requires a `paymentIntentId` whenever `deltaCents > 0` (checked *before* the CAS write), and an arbitrary cross-vendor candidate can easily be pricier than the original booking. Two racing requests that both need payment they don't have would both 400, never reaching the CAS write at all — proving nothing about the race guard. **Fix**: added `findTwoSamePricedCrossVendorCandidates()`, which filters `searchInventory()` results to candidates whose `inventory.daily_rate` exactly equals the original booking's `dailyRate`, guaranteeing `deltaCents === 0` for both requests so both reach the CAS write unconditionally — isolating the assertion to the optimistic-lock guard itself, exactly as the plan's AC-3 intends ("exactly one succeeds ... other receives 409").
- **Cancel spec's expected refund amount derived from `booking.totalPrice`, not a separately-fetched PaymentIntent amount.** Since `createTestBooking` always charges exactly `dailyRate * nights` (the negotiated rate, verified by 06-01/06-02's own rate-integrity specs), `booking.totalPrice * refundPercent / 100` is equivalent to `paymentIntent.amount * refundPercent / 100` without an extra live Stripe round-trip in the assertion setup — no behavioral difference, just avoids a redundant fetch.

## Acceptance criteria

| AC | Result |
|---|---|
| AC-1: Cancellation shows a correct refund preview and issues the refund on confirm | **Pass** — preview and confirm both matched the live `quoteCancellation()` computation; `cancellation.refundAmountCents`/`refundPercent` recorded correctly in Mongo. |
| AC-2: Concurrent cancel requests do not corrupt booking status | **Pass** — exactly one 200 + one 400 across 3+ consecutive runs; final status always `'cancelled'`, never reverted. |
| AC-3: Concurrent modification requests do not corrupt booking state (CAS race guard) | **Pass** — exactly one 200 + one 409 across 3+ consecutive runs; exactly one `modificationHistory` entry, no merged/corrupted state. |

## Verification

- `npx tsc --noEmit`: clean, whole project.
- `cancel.spec.ts` alone: 1/1 passing.
- `concurrency.spec.ts` alone: 3 consecutive runs, 3/3 passing each run (6/6 total across runs).
- `npm run test:e2e:regression` (setup + checkout + cancel + concurrency + modify + payment-smoke, 12 specs total): 12/12 passing in the same combined run — no cross-spec Playwright import conflicts, no flakiness observed.
- No leftover seeded documents: every spec cleans up its created booking(s) in a `finally` block.
- `git status`: only the two intended new files plus the already-tracked 06-01/06-02/06-03 files; no stray scratch files.

## Files changed

`tests/e2e/regression/cancel.spec.ts` (new), `tests/e2e/regression/concurrency.spec.ts` (new). No source files touched (`cancel/route.ts`, `modify/route.ts` unchanged, per plan boundary).

## Next

Run `/coder:unify` to close the loop for 06-04. 06-05 (add-ons/UC6 + My Bookings, `depends_on: ["06-01"]`) remains planned and unapplied.
