---
phase: 04-booking-rate-integrity
plan: 07
status: complete
---

# 04-07 Summary: Booking Modification (UC2)

## What was built
- `lib/vendor-integration/policy.ts` — new Phase-6 seam module; `quoteModification()` wraps `searchInventory()`'s match lookup, returning `null` if no inventory/negotiated-term match.
- `lib/models/Booking.ts` — `modificationHistory` subdocument array (`from`, `to`, `inventoryId`, `vendorId`, `pricingSnapshot`, `modifiedAt`).
- `POST /api/bookings/[id]/modify` — ownership-checked (404 on mismatch, no leak), `dryRun: true` is a strict, unconditional first-branch no-op, re-filters addon selection against the new quote's waived set, ±1 cent tolerance on delta-payment comparison, appends to `modificationHistory` on real apply.
- `components/booking-modify-form.tsx` — client card on the confirmation page: debounced live dry-run quote on date change (no click-away required), Stripe Elements step for a price increase, immediate apply for a decrease, a `successMessage` banner on completion.
- `GET /api/bookings` + `buildOwnBookingsFilter()` helper — own-bookings listing with `status`/`from`/`to` filters.
- `app/(account)/bookings/page.tsx` — new real "My Bookings" list page, status/date filters, per-row Modify dialog reusing `BookingModifyForm`.
- `components/header.tsx` — "My Bookings" nav link when signed in.
- `app/(checkout)/confirmation/[bookingId]/page.tsx` — "Modify your booking" card; back-navigation standardized to a top-left `← Back to my bookings` link (`/bookings`), replacing the bottom "Back to search" button.

## Acceptance criteria
- AC-1 (date-only re-price) — Pass
- AC-2 (under-paid/missing delta payment rejected) — Pass
- AC-3 (full UI flow: dry-run → Stripe delta payment → applied → page reflects it) — Pass
- AC-4 (cross-member modify returns 404) — Pass
- AC-5 (only `quoteModification()` calls the rate lookup; route never calls `searchInventory()` directly) — Pass, confirmed via grep
- AC-6 (My Bookings lists/filters, Modify reachable from there) — Pass

## Deviations from plan (found during live checkpoint testing, fixed before approval)
1. **No success confirmation after a modification applied** — both the immediate-apply and Stripe-delta paths only called `router.refresh()` silently. Fixed by adding a `successMessage` banner state, set from both paths (the Stripe path via a new `onSuccess` callback into `ModifyPaymentStep`).
2. **Live quote required clicking away from the date input** — the plan specified "debounced or on-blur"; `onBlur` was implemented first and the user flagged it as unacceptable UX. Replaced with a debounced (400ms) `useEffect` on the date fields, guarded against firing during an active payment step or when dates match the original booking.
3. **Decrease-path copy read as unfriendly** — "decreasing modifications are applied immediately" was replaced with "Your new total is lower — no additional payment is needed," plus a disclosure that refunds for the difference aren't automatic yet (superseded once 04-08's Task 7 ships — see below).
4. **Confirmation page back-navigation was inconsistent with the rest of the app** — a bottom-of-page "Back to search" button, unlike checkout's top-left `← Back to results`. Standardized to a top-left `← Back to my bookings` link routing to `/bookings` (this page is reached from My Bookings, not from a fresh search), and removed the now-redundant bottom button. Raised by the user as a general nav-consistency issue while testing this plan's confirmation-page changes, not a new feature — scoped into this plan rather than spun out separately since it touches a file this plan already owns.

## Follow-on work spawned (not part of this plan)
- **04-08 amended (2026-09-03):** the "refunds aren't automatic" disclosure in fix #3 above surfaced a real, previously-unplanned gap. Per user decision, the fix was folded into `04-08-PLAN.md` as a new Task 7/AC-8 (automatic Stripe refund for a decreasing modification, reusing 04-08's cancellation-refund machinery) rather than left permanent or given its own plan. This is why `04-08`'s `depends_on` now includes `04-07` and its `wave` moved 8→9 — see `04-08-PLAN.md` and `.coder/STATE.md`.
- **04-13 (TBD, roadmap-only):** modifying location/vehicle-type (not just dates) was raised during this checkpoint and added to `ROADMAP.md` as a future, unscoped plan — needs an availability-check signal that doesn't exist in the ontology yet.

## Verification
- `npm run build` clean; `npx tsc --noEmit` clean (checked after every live fix).
- `npm run test:e2e` 10/10, no regressions.
- All 6 ACs live-verified end-to-end, not just code review.
- `modificationHistory` entries confirmed correct in Mongo after real modifications.

## Files touched
`lib/vendor-integration/policy.ts`, `lib/models/Booking.ts`, `app/api/bookings/[id]/modify/route.ts`, `app/api/bookings/route.ts`, `components/booking-modify-form.tsx`, `app/(checkout)/confirmation/[bookingId]/page.tsx`, `app/(account)/bookings/page.tsx`, `components/header.tsx`.
