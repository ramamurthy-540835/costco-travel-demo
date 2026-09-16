---
phase: 04-booking-rate-integrity
plan: 11
subsystem: discovery
tags: [apache-age, cypher, nextjs, vehicle-card, search-filters, ontology]

requires:
  - phase: 04-booking-rate-integrity (04-10)
    provides: vehicle-make/model variety, VEHICLE_IMAGE_MAP/CLASS_IMAGE_MAP fallback chain, Playwright smoke suite
provides:
  - Inventory.fuel_policy / Inventory.deposit_amount / AddOn.fee_per_day (new synthetic ontology fields)
  - getVendorPolicy() / getAddOnsCatalog() / getWaivedAddOnIds() query layer (surfaces VendorPolicy/AddOn for the first time)
  - Vehicle card chip row (powertrain, fuel policy, mileage, cancellation window, deposit) + supplier brand-accent border
  - Supplier/partner checkbox filter on /search, URL-param driven (providers=)
affects: [04-12-checkout-enrichment (depends on getVendorPolicy/getAddOnsCatalog/getWaivedAddOnIds and the new fee_per_day/fuel_policy/deposit_amount fields)]

tech-stack:
  added: []
  patterns:
    - "AGE Cypher multi-column RETURN aliases must be lowercase/snake_case — Postgres folds unquoted identifiers, so RETURN a.addon_id AS addonId silently breaks the columns-array lookup in runCypher() (row['addonId'] undefined, row['addonid'] holds the value)"
    - "One-off deterministic seed-mutation scripts (scripts/*.mjs) follow a fixed shape: hashString() helper, hash(natural_key) % N bucket selection, mutate JSON in place, write back with a console distribution summary"

key-files:
  created:
    - scripts/add-vehicle-extras-fields.mjs
  modified:
    - data/reference/mock-data/rental_inventory.json
    - data/synthetic/addon_catalog.json
    - lib/graph/queries.ts
    - components/vehicle-card.tsx
    - components/search-filters.tsx
    - "app/(discovery)/search/page.tsx"
    - .coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md
    - .coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md

key-decisions:
  - "fuel_policy assigned via hash(rental_id) % 3 over ['Free Tank','Full to Full','Like for Like'], deposit_amount via a fixed per-VehicleClass tier map (150/250/400) — both deterministic, no randomness, re-running the script is idempotent"
  - "fee_per_day added to exactly 5 of 8 AddOn catalog entries (additional_driver 12, collision_damage_waiver 15, roadside_assistance 6, gps_navigation 8, child_seat 10); young_driver_fee/underage_driver_fee/fuel_prepay deliberately left without it, out of scope"
  - "getVendorPolicy/getAddOnsCatalog/getWaivedAddOnIds fetch separately from searchInventory() rather than joining into every search row, keeping /search's list query cheap (single vendor / single perk-set lookups belong to checkout, not the list)"
  - "Supplier filter is submit-driven (checkbox + Search button), matching the existing vehicleClass filter's UX, not live/debounced"

patterns-established:
  - "graph_schema.sql needs zero changes for a new Inventory/AddOn property — AGE nodes are property bags (agtype); only seed JSON + a full reload via load_seed_data.py is required"

duration: ~1hr
started: 2026-08-31T00:00:00Z
completed: 2026-08-31T01:00:00Z
---

# Phase 4 Plan 11: Vehicle-Card Enrichment + Supplier Filter Summary

**Card and filters now surface fuel policy, mileage, cancellation window, deposit, and a supplier brand accent; `/search` gains a supplier checkbox filter; `VendorPolicy`/`AddOn` are queried by the app for the first time since Phase 1.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1hr |
| Tasks | 3 completed, no checkpoint (autonomous: true) |
| Files modified | 8 (1 created) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: New ontology fields loaded and queryable | Pass | Cypher spot-check: 1000/1000 `Inventory` rows have non-null `fuel_policy`+`deposit_amount`; `AddOn{addon_id:'additional_driver'}.fee_per_day` returns `12`; all 5 fee-bearing AddOns confirmed, other 3 correctly have none |
| AC-2: Vehicle card shows the newly surfaced fields | Pass | Verified live against a running dev server (curl of rendered HTML): fuel/powertrain, fuel policy, "Free cancel up to 24h before pickup", "$150.00 deposit", `border-l-4` accent all present |
| AC-3: Supplier filter narrows results | Pass | `/search` unfiltered returns 1000 results; `/search?providers=Hertz` returns exactly 100 (1/10 of 1000, matching Hertz's even share) |

## Accomplishments

- Closed a real ontology gap: `VendorPolicy` and `AddOn` were loaded into the graph since Phase 1 but never queried by the app until this plan's `getVendorPolicy`/`getAddOnsCatalog`/`getWaivedAddOnIds`
- Added two new deterministic synthetic fields (`fuel_policy`, `deposit_amount`) plus per-addon `fee_per_day`, all via a one-off idempotent script + manual catalog edit, with zero `graph_schema.sql` changes
- Vehicle card and `/search` now visually reflect data that was previously fetched-and-dropped (mileage, cancellation window) or never fetched at all (fuel policy, deposit, supplier accent)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/add-vehicle-extras-fields.mjs` | Created | One-off deterministic script: assigns `fuel_policy`/`deposit_amount` to all 1000 `Inventory` rows |
| `data/reference/mock-data/rental_inventory.json` | Modified | `fuel_policy`/`deposit_amount` backfilled via the script |
| `data/synthetic/addon_catalog.json` | Modified | `fee_per_day` added to 5 of 8 addons (manual edit) |
| `lib/graph/queries.ts` | Modified | Added `VendorPolicy`/`AddOn` interfaces + `getVendorPolicy`, `getAddOnsCatalog`, `getWaivedAddOnIds` |
| `components/vehicle-card.tsx` | Modified | New chip row (powertrain, fuel policy, mileage, cancellation window, deposit) + `border-l-4` brand-accent |
| `components/search-filters.tsx` | Modified | New submit-driven "Suppliers" checkbox filter, `providers` URL param |
| `app/(discovery)/search/page.tsx` | Modified | Derives distinct providers, applies `providers` filter alongside the existing `vehicleClass` filter |
| `.coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md` | Modified | Documented the 3 new properties |
| `.coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md` | Modified | Documented the 3 new properties + noted `VendorPolicy`/`AddOn` are now queried, not just loaded |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Deterministic hash-based assignment for `fuel_policy`, tier-map for `deposit_amount` | Matches the existing `scripts/reassign-vehicle-makes.mjs` pattern; idempotent, no randomness | Re-running the script reproduces the same distribution |
| `getWaivedAddOnIds` short-circuits to an empty `Set` for an empty `perkIds` array | Plain optimization, skips a query guaranteed to return nothing | No behavioral difference, avoids an unnecessary round-trip |
| Fixed a pre-existing case-folding bug pattern before it shipped | AGE/Postgres folds unquoted camelCase column aliases to lowercase, so `RETURN a.addon_id AS addonId` + `columns: ['addonId']` silently returns `undefined` for every row | Used a lowercase alias (`addon_id`) instead — caught during Task 2's live verification, not left as a shipped bug |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential fix, no scope creep |
| Scope additions | 0 | None |
| Deferred | 0 | None |

**Total impact:** One essential fix found during live verification (not the adversarial plan review); no scope creep.

### Auto-fixed Issues

**1. [Implementation bug] `getWaivedAddOnIds`'s multi-column RETURN alias broke on Postgres identifier case-folding**
- **Found during:** Task 2's live verification (direct function call against the running graph)
- **Issue:** `RETURN a.addon_id AS addonId` combined with `columns: ['addonId']` caused `runCypher`'s per-row lookup (`row['addonId']`) to read `undefined`, because Postgres folds the unquoted `addonId` SQL alias to `addonid`, and `parseAgtype(undefined)` then threw `Cannot read properties of undefined (reading 'replace')`
- **Fix:** Changed the Cypher `RETURN` and the `columns` array to the lowercase `addon_id`, matching the existing multi-column usage elsewhere in the file (all of which already used snake_case/lowercase aliases)
- **Files:** `lib/graph/queries.ts`
- **Verification:** Re-ran the live verification script; `getWaivedAddOnIds(['free_additional_driver'])` correctly returned `Set(1) { 'additional_driver' }`

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `getWaivedAddOnIds` threw on first live call (see Auto-fixed above) | Fixed the column-alias casing, re-verified live |

## Next Phase Readiness

**Ready:**
- 04-12 (checkout enrichment + extras toggles + rate-integrity extension) can proceed — it directly depends on `getVendorPolicy`/`getAddOnsCatalog`/`getWaivedAddOnIds` and the new `fuel_policy`/`deposit_amount`/`fee_per_day` fields, all confirmed live and correct
- `npm run build` clean, `npm run test:e2e` (7/7) passing, no regressions to 04-10's existing suite

**Concerns:**
None.

**Blockers:**
None.

---
*Phase: 04-booking-rate-integrity, Plan: 11*
*Completed: 2026-08-31*
