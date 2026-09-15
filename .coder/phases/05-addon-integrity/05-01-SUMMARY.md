---
phase: 05-addon-integrity
plan: 01
subsystem: api
tags: [stripe, mongoose, addons, rate-integrity, nextjs, optimistic-lock]

# Dependency graph
requires:
  - phase: 04-05
    provides: real Booking model, pricingSnapshot shape, checkout/payment-intent flow
  - phase: 04-07
    provides: BookingModifyDialog/Form pattern, dry-run debounce, Elements payment-step pattern, decrease-refund pattern
provides:
  - POST /api/bookings/[id]/addons — add/remove extras on a reserved booking without touching dates/vendor/inventory
  - "Manage extras" dialog on confirmation page and My Bookings list
affects: [phase-06-vendor-fulfillment (addon change should eventually notify vendor integration layer)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optimistic-lock write via findOneAndUpdate({status, pricingSnapshot.totalPrice: expected}) instead of plain .save() — closes lost-update race between concurrent modify/addons/cancel requests on the same booking"
    - "Addon-only endpoint reads perkIds/dailyRate straight off the immutable pricingSnapshot, never re-derives via a fresh graph/quote lookup — a later vendor/term change can't retroactively affect an addon-only request"

key-files:
  created:
    - app/api/bookings/[id]/addons/route.ts
    - components/booking-addons-form.tsx
    - components/booking-addons-dialog.tsx
  modified:
    - app/(checkout)/confirmation/[bookingId]/page.tsx
    - app/(account)/bookings/page.tsx

key-decisions:
  - "Dropped quoteModification() re-derivation (per plan) — addon-only changes never touch inventory/vendor/dates, so the snapshot is the correct source of truth"
  - "Optimistic lock added to the addons route (new, not present in modify/cancel at the time) to close a lost-update race with concurrent requests on the same booking"

patterns-established:
  - "Dedup getWaivedAddOnIds() calls on list pages by distinct perkIds combination, not once per row"

# Metrics
duration: ~1 session (implementation + live verification)
completed: 2026-09-03T00:00:00Z
---

# Phase 5 Plan 01: Add-On Integrity (Manage Extras) Summary

**New `POST /api/bookings/[id]/addons` endpoint plus a "Manage extras" dialog on confirmation and My Bookings, letting a member add/remove extras on a reserved booking with the same perk-waiver and price-integrity checks already enforced at checkout and date-modification time.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Already-included addon cannot be added as a paid extra | Pass | `getWaivedAddOnIds(booking.pricingSnapshot.perkIds)` filters the requested set before pricing; waived addons render forced-checked/disabled/$0 in the UI |
| AC-2: Increasing the addon set requires a matching paid PaymentIntent | Pass | `deltaCents > 0` branch requires `paymentIntentId`, checks `status === 'succeeded'` and amount within 1¢ tolerance, else 400 with no write |
| AC-3: Decreasing the addon set auto-refunds the difference | Pass | Reuses 04-08/04-07's `expand: ['latest_charge']` + idempotency-keyed `refunds.create()` pattern |
| AC-4: Ownership and status are enforced | Pass | 404 on missing/mismatched-owner booking, 400 if `status !== 'reserved'`, before any Stripe call |
| AC-5: UI entry point matches existing conventions | Pass | `BookingAddonsDialog`/`BookingAddonsForm` mirror `BookingModifyDialog`/`Form`'s dialog + debounced dry-run + Elements-payment-step shape; wired into both confirmation page and My Bookings |

## Verification Results

- `npx tsc --noEmit` — clean (checked after Task 1 and again after Task 2)
- `npm run build` — clean; `/api/bookings/[id]/addons` present in the route list
- `npm run test:e2e` — 10/10 passing, no regressions
- Manual live verification: dev server run against a real reserved booking (`6a918a636e134d1cdc979024`) via browser; checkpoint approved by user

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/api/bookings/[id]/addons/route.ts` | Created | Dry-run + apply endpoint with optimistic-lock write, Stripe charge/refund handling |
| `components/booking-addons-form.tsx` | Created | Client form: toggleable addon list, debounced dry-run quote, Elements payment step |
| `components/booking-addons-dialog.tsx` | Created | Thin Dialog wrapper, "Manage extras" trigger |
| `app/(checkout)/confirmation/[bookingId]/page.tsx` | Modified | Added Extras card wired to the new dialog (reuses catalog/waived-set already fetched on this page) |
| `app/(account)/bookings/page.tsx` | Modified | Added `getAddOnsCatalog()` fetch, per-distinct-perkIds dedup of `getWaivedAddOnIds()`, per-row "Manage extras" trigger |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| No `quoteModification()` call in the new route | Addon-only changes never touch inventory/vendor/dates; the snapshot is already correct and a fresh lookup only adds a spurious failure mode | Simpler, more robust route; consistent with plan's explicit instruction |
| Optimistic-lock `findOneAndUpdate` instead of `.save()` | Closes a lost-update race between this route and concurrent modify/cancel requests on the same booking | New pattern not yet backported to modify/cancel routes — flagged below as a latent gap, not blocking |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 1 | Logged below |

**Total impact:** None — plan executed as specified (post its own 1-round adversarial review), no code-level surprises during APPLY.

### Deferred Items

- `tests/e2e/smoke.spec.ts` was listed in the plan's `files_modified` frontmatter but no task in `<tasks>` specified adding a new addons-specific assertion, and none was added. The existing smoke suite (10/10) covers no regression; a dedicated addons-toggle smoke assertion is a nice-to-have, not required by any AC. Not logged as a formal issue-tracker item — no issue tracker configured for this project.

## Issues Encountered

None — no defects found during implementation or the four verification passes (tsc, build, e2e, live checkpoint).

## Next Phase Readiness

**Ready:**
- Full addon lifecycle (checkout-time waiver, date-modification re-filter, standalone add/remove) now uses one consistent integrity pattern across three entry points.
- The optimistic-lock pattern introduced here is a reusable template if `modify/route.ts` and `cancel/route.ts` are ever revisited for the same race condition.

**Concerns:**
- `app/api/bookings/[id]/modify/route.ts` and `cancel/route.ts` still use `.save()` on a stale in-memory object rather than this plan's optimistic-lock `findOneAndUpdate` pattern — a genuine (if narrow) concurrent-write race remains between those two routes and this one. Worth a follow-up plan if concurrent booking-management sessions become a real usage pattern.
- Phase 5 (Add-On Integrity/UC6) is now complete with this single plan — no further Phase 5 plans are scoped.

**Blockers:** None.

---
*Phase: 05-addon-integrity, Plan: 01*
*Completed: 2026-09-03*
