---
phase: 04-booking-rate-integrity
plan: 13
status: complete
---

## What was built
- `lib/graph/queries.ts`: `findEquivalentInventory(locationLabel?, vehicleClassName?)` — candidate-only graph read reusing `searchInventory()`'s join shape, filtered on `l.city` and `vc.class_name`. No HTTP-reachable caller in this plan (04-14 wraps it).
- `lib/vendor-integration/policy.ts`: `checkAvailability({inventoryId, from, to, excludeBookingId?})` (Mongo-backed overlap check against `reserved`/`checked_in` bookings) and `checkModificationCutoff(vendorId, from)` (uses `getVendorPolicy()`'s `modification_cutoff_hours`).
- `app/api/bookings/[id]/modify/route.ts`: extended to accept a target `inventoryId`/`vendorId` change — sequences availability check (409) → cutoff gate (400, inventory/vendor changes only) → cross-vendor `quoteModification()` re-quote (vendor written from the request's own validated `vendorId`, never read off the quote) → `getWaivedAddOnIds()` re-run against the new perk set → optimistic-lock `findOneAndUpdate` CAS write (guarded on `_id`, `status`, `inventoryId`, `pricingSnapshot.totalPrice`), applied to both the dates-only and inventory/vendor-change paths, replacing the prior plain `.save()`.

## Deviations from plan
- Plan text said to filter on `l.location_label`; confirmed via grep against seed data and schema that no such property exists anywhere — the real property (already used by `searchInventory()`) is `Location.city`. Filtered on `l.city` instead. This was flagged as an open risk during planning/review and resolved by direct verification before writing the Cypher, per the same discipline that caught the earlier `vehicleClassId` hallucination.
- Confirmed `modification_cutoff_hours` is a real seeded `VendorPolicy` property (`data/synthetic/vendor_policies.json`) before relying on it in `checkModificationCutoff()`.

## Acceptance criteria
- AC-1 (availability check blocks conflicting target inventory): PASS — verified both via a scratch script against real seeded overlapping bookings and via the checkpoint.
- AC-2 (cross-vendor re-match applies new vendor's own rate/perks): PASS — vendor written from the request's validated `targetVendorId`; `getWaivedAddOnIds()` re-run against the new quote's `perkIds`.
- AC-3 (modification-cutoff gate for location/vehicle-type changes only): PASS — verified live against a seeded vendor with `modification_cutoff_hours: 24`; dates-only changes remain ungated (disclosed non-goal, per Boundaries).
- AC-4 (optimistic-lock CAS write): PASS — CAS filter guards on `inventoryId` in addition to `totalPrice`, applied to both modification paths.

## Verification performed
- `npx tsc --noEmit` clean (twice — after Task 1 and after Task 2).
- `npm run build` clean.
- Scratch script (`checkAvailability`/`checkModificationCutoff` called directly against seeded Mongo data, deleted after use): confirmed a real overlapping-booking conflict is detected and correctly survives `excludeBookingId`-exclusion of one of two genuinely overlapping bookings on the same inventory; confirmed a far-future date range is reported available; confirmed the cutoff check returns `allowed:false` for an imminent pickup and `allowed:true` a year out, against a real vendor with `cutoffHours: 24`.
- Checkpoint: user approved after this session's own live-test pass (dev server run at `localhost:3000`).

## Deferred / known gaps
- `findEquivalentInventory()` has no HTTP-reachable caller yet — by design, 04-14 adds the wrapper route for its picker UI.
- `/api/payments/intent`'s pre-existing lack of server-side amount recompute remains an unfixed, disclosed gap (consistent with 04-08/04-12) — not addressed here.

## Files modified
- `lib/graph/queries.ts`
- `lib/vendor-integration/policy.ts`
- `app/api/bookings/[id]/modify/route.ts`
