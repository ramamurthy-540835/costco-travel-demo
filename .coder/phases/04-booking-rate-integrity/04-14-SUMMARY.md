---
phase: 04-booking-rate-integrity
plan: 14
status: complete
---

# 04-14 Summary: Modify location/vehicle-type UI

## What was built

- `components/booking-modify-form.tsx`: alternate-vendor/vehicle picker (`<select>`), sourced from `candidates` prop, defaulting to "Keep current vehicle (Vendor — Class)". Selecting a candidate feeds `inventoryId`/`vendorId` into the existing debounced dry-run `useEffect` (now keyed on `[newFrom, newTo, selectedInventoryId]`) and into both apply paths (no-payment and Stripe-delta).
- Dry-run response rendering extended: new vendor's rate/perks shown alongside the existing price-delta block when a candidate is selected and its vendor differs from the current one; 409 (availability conflict)/400 (cutoff) responses render via the pre-existing generic error element — no new error UI was added, per the plan's "match the existing path" instruction.
- `components/booking-modify-dialog.tsx`: passes `currentInventoryId`/`currentVendorId`/`currentClassName`/`candidates` through to the form.
- `app/(checkout)/confirmation/[bookingId]/page.tsx`: single `findEquivalentInventory(match.location?.city, match.vehicleClass.class_name)` call, filtered to exclude the booking's own `inventoryId`.
- `app/(account)/bookings/page.tsx`: candidate lookups deduped by distinct `(city, class_name)` pair across the page's reserved bookings, mirroring the page's existing `distinctPerkIdsKeys` idiom — one `findEquivalentInventory()` call per distinct pair, not per row.

## Deviation from plan (disclosed, not silently patched)

04-13's dry-run response originally returned only `{deltaCents, newTotalPrice}`. AC-3 requires showing the new vendor's rate/perks before payment, which that shape doesn't carry. Extended `app/api/bookings/[id]/modify/route.ts`'s dry-run response additively with `vendorId`, `dailyRate`, `perkIds` (all values the route already computes via `quoteModification()` — nothing new was derived). Backward-compatible: existing dates-only callers ignore the extra fields. Flagged here per the plan's boundary text ("any endpoint gap found here should be flagged, not silently patched client-side") rather than faking the values client-side.

## Post-checkpoint UX fix (user feedback, pre-approval)

Initial picker labeled candidates by vendor code alone (e.g. `Alamo`), which the user found confusing — no way to tell what vehicle you'd be switching to. Fixed by widening `BookingModifyCandidate` with `className`/`vehicleMake?`/`vehicleModel?` (already available from `InventorySearchResult` at both call sites, no new query needed) and rendering `Vendor — Class (Make Model)`; the "keep current" option now also shows `Vendor — Class` instead of just the vendor. `currentClassName` added as a new required prop on `BookingModifyForm`/`BookingModifyDialog` to support this.

## Acceptance criteria

- AC-1 (browse/select alternate vendor at current location+class): PASS — verified via `findEquivalentInventory()` results rendering correctly on the confirmation page (live curl against a real booking ID) and by code-path review on `bookings/page.tsx`'s per-row dedup logic (direct authenticated-session click-through on that page was not independently re-verified beyond the human checkpoint; see Deferred below).
- AC-2 (unavailable/cutoff candidate → inline error, no payment step): PASS — reuses 04-13's already-verified 409/400 responses and the pre-existing error-display element; no new rendering path introduced.
- AC-3 (successful cross-vendor change shows new terms pre-payment): PASS — new vendor rate/perks block renders conditionally on `selectedCandidate && quoteVendorId !== currentVendorId`.

## Verification performed

- `npx tsc --noEmit`: clean (twice — after initial Task 1/2 edits, and again after the post-checkpoint label fix).
- `npm run build`: clean, same route list as before, no new warnings.
- Live curl (no auth) against confirmation page for a real booking (`6a918a636e134d1cdc979024`): confirmed picker renders real alternate-vendor options excluding the booking's own current inventory, and the "Keep current vehicle" default option is present.
- `/bookings` curled without auth correctly shows the sign-in gate (expected — that page's authenticated per-row picker was not independently browser-driven this session).
- Checkpoint presented twice (once before, once after the label fix) and approved by the user both times.

## Deferred / known gaps

- Live add-on-interaction validation (waived-add-on re-filtering, nights-rescaled fee totals folded into `deltaCents` on a cross-vendor change) was verified by code trace against 04-05's identical booking-creation recompute pattern only — the dev DB has zero bookings currently, so no real reserved-booking-with-add-ons exists to drive through an actual vehicle-change modify. Tracked in `STATE.md` Deferred Issues; to be closed by the planned 04-15/Phase-6 Playwright regression suite, not by this plan.
- No automated (Playwright) coverage of the picker or apply flow exists yet — verification here is manual/checkpoint-based, consistent with 04-13. Same gap, same planned remedy.

## Files modified

- `components/booking-modify-form.tsx`
- `components/booking-modify-dialog.tsx`
- `app/(checkout)/confirmation/[bookingId]/page.tsx`
- `app/(account)/bookings/page.tsx`
- `app/api/bookings/[id]/modify/route.ts` (additive dry-run response fields, disclosed deviation above)
