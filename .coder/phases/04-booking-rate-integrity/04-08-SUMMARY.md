---
phase: 04-booking-rate-integrity
plan: 08
status: complete
---

# 04-08 Summary: Cancellation & Refund (UC3) + Decreasing-Modification Refund

## What was built
- `data/synthetic/vendor_policies.json` + `lib/graph/queries.ts` — added a real, per-vendor `no_show_fee_percent` (0/15/25/40/50, deterministic by provider) to all 10 seeded `VendorPolicy` nodes; widened the `VendorPolicy` interface. Reloaded via `graph/scripts/load_seed_data.py`; confirmed via Cypher.
- `lib/vendor-integration/policy.ts` — added `quoteCancellation({ vendorId, hoursUntilStart })` alongside 04-07's `quoteModification()`: 100% refund outside the vendor's `standard_cancellation_window_hours`, `100 - no_show_fee_percent` inside it (including a past-`from` no-show, folded into the same inside-window rate — no separate no-show rule, per the plan's documented simplification).
- `lib/models/Booking.ts` — removed the dead `cancelRequest` field; added a `cancellation` subfield (`cancelledAt`, `refundId`, `refundAmountCents`, `refundPercent`); widened `modificationHistory` entries with optional `refundId`/`refundAmountCents`.
- `POST /api/bookings/[id]/cancel` — ownership-checked (404 on mismatch), 400 on non-`reserved` status or an unpaid/already-refunded PaymentIntent, `dryRun: true` preview, and an atomic `findOneAndUpdate({status:'reserved'}, {status:'cancelled'})` claim before calling Stripe — the losing side of a concurrent double-cancel never reaches `refunds.create`. The `cancellation` field is written in a follow-up update against the already-`cancelled` document, never via `.save()` on the stale pre-claim object.
- `components/booking-cancel-dialog.tsx` — new client dialog (shadcn `Dialog`), loads the dry-run refund preview on open, "Confirm cancellation" / "Never mind" actions, `router.refresh()` on success.
- `app/(checkout)/confirmation/[bookingId]/page.tsx` — "Cancel booking" card (only for `reserved`) mounting `BookingCancelDialog`; a "This booking was cancelled" notice (with refund %/amount) for `cancelled`.
- `app/(account)/bookings/page.tsx` — added a per-row "Cancel" action (same `BookingCancelDialog`) alongside 04-07's "Modify" action, plus a refund-amount line under a `cancelled` row.
- `app/api/bookings/[id]/modify/route.ts` (04-07's route) — on a real apply where `deltaCents < 0`, retrieves the original PaymentIntent, issues a Stripe refund of `-deltaCents` (idempotency-keyed on `modify-refund-{bookingId}-{historyLength}`), records `refundId`/`refundAmountCents` on the new `modificationHistory` entry, and returns them in the response. A failed refund attempt returns 500 without saving — the modification never appears applied if its promised refund didn't go through.
- `components/booking-modify-form.tsx` — decrease-path copy now says the difference will be refunded, and the success banner names the refunded dollar amount once the apply call returns a positive `refundAmountCents`.

## Acceptance criteria
- AC-1 (outside-window cancellation refunds 100%) — Pass
- AC-2 (inside-window cancellation refunds per vendor's real `no_show_fee_percent`, verified varying by vendor) — Pass
- AC-3 (only a `reserved`, owned booking can be cancelled) — Pass
- AC-4 (no refund call against an unpaid/unsucceeded PaymentIntent) — Pass
- AC-5 (`getVendorPolicy()` only called from the boundary module, never the route) — Pass, confirmed via grep
- AC-6 (dialog preview matches the actual refund applied on confirm) — Pass
- AC-7 (My Bookings' Cancel entry point matches the confirmation-page dialog) — Pass
- AC-8 (decreasing modification auto-refunds the exact difference, UI confirms the amount) — Pass

## Deviations from plan
- None structural. `paymentIntent.amount_refunded` doesn't exist directly on a Stripe `PaymentIntent` object (it lives on the `Charge`) — both the cancel route and the modify route's refund branch retrieve the PaymentIntent with `expand: ['latest_charge']` and read `amount_refunded` off the expanded charge instead. Not called out in the plan's Stripe-call sketch; a straightforward correction, not a scope change.

## Verification
- `npm run build` clean; `npx tsc --noEmit` clean.
- `grep -n "getVendorPolicy" "app/api/bookings/[id]/cancel/route.ts"` returns nothing (AC-5).
- `npm run test:e2e` 10/10, no regressions.
- Live checkpoint approved by user.

## Files touched
`data/synthetic/vendor_policies.json`, `lib/graph/queries.ts`, `lib/vendor-integration/policy.ts`, `lib/models/Booking.ts`, `app/api/bookings/[id]/cancel/route.ts` (new), `app/api/bookings/[id]/modify/route.ts`, `components/booking-cancel-dialog.tsx` (new), `components/booking-modify-form.tsx`, `app/(checkout)/confirmation/[bookingId]/page.tsx`, `app/(account)/bookings/page.tsx`.
