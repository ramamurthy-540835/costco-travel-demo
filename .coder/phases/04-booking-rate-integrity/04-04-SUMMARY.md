---
phase: 04-booking-rate-integrity
plan: 04
subsystem: ui
tags: [nextjs, apache-age, postgres, cypher, react-server-components, shadcn]

# Dependency graph
requires:
  - phase: 03-02
    provides: Postgres+AGE graph query layer (runCypher, VehicleClass/NegotiatedTerm/Perk queries)
  - phase: 04-03
    provides: BookCars-style sidebar + horizontal-card prototype layout, mock-data field shapes
provides:
  - searchInventory(locationLabel?) graph query — real vehicle-class/vendor/rate listing, one row per Inventory item
  - runCypher() multi-column RETURN support (columns param)
  - components/vehicle-card.tsx — real presentational card
  - app/(discovery)/search/page.tsx — real, working Discovery/Search UI at /search
affects: [04-05-checkout, 04-06-modification, 04-07-cancellation]

# Tech tracking
tech-stack:
  added: []
  patterns: [AGE multi-column cypher RETURN via explicit columns param, vendor-lowest-rank-MembershipTier term resolution for anonymous search]

key-files:
  created: [components/vehicle-card.tsx, "app/(discovery)/search/page.tsx"]
  modified: [lib/graph/queries.ts, lib/graph/client.ts]

key-decisions:
  - "runCypher() extended with additive columns param to support multi-column Cypher RETURN (AGE column-arity requirement)"
  - "Landing→/search entry point deferred to 04-05, not added here (app/page.tsx stays Phase-3 placeholder)"

patterns-established:
  - "Anonymous/pre-membership search resolves NegotiatedTerm via each vendor's lowest-rank MembershipTier, not a direct Vendor->NegotiatedTerm join (which fans out per MembershipTier)"

# Metrics
duration: ~90min
started: 2026-08-28T00:00:00Z
completed: 2026-08-28T00:00:00Z
---

# Phase 4 Plan 04: Real Discovery/Search UI Summary

**Real, graph-backed vehicle search at `/search`: `searchInventory()` resolves each vendor's lowest-tier negotiated rate + perks per Inventory item, rendered via a filterable sidebar + vehicle-card list.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~90min (APPLY + bug-fix pass) |
| Tasks | 2 completed |
| Files modified | 2 |
| Files created | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: `searchInventory()` returns correct joined data | Pass | Verified live: 1000 unfiltered rows, 100 for a Las Vegas location filter, 0 rows missing a resolvable negotiatedTerm |
| AC-2: `/search` renders real data, filters by location/vehicle class | Pass | Curl-verified 200s; `?vehicleClass=SUV`→111 rows, `?vehicleClass=Economy`→116 rows, `?location=Las Vegas`→100 rows, all confirmed after the submit-button fix |
| AC-3: No regression to existing routes/build | Pass | `npm run build` clean; `/prototype/search` unchanged, still 200 |

## Accomplishments

- Real Discovery/Search UI now live at `/search`, backed by the seeded Postgres+AGE graph — first real (non-prototype) screen in Phase 4.
- Correctly resolved the NegotiatedTerm fan-out risk (Vendor × MembershipTier keying) caught in pre-APPLY adversarial review — anonymous search shows each vendor's lowest-tier rate as the public "starting rate."
- Extended the shared `runCypher()` wrapper to support multi-column Cypher `RETURN` clauses, unblocking this and future multi-node-join queries without touching the 3 existing single-column callers.
- Found and fixed a real interactive-UI bug (missing form submit button) via user manual testing that neither `npm run build` nor curl verification could have caught — documented as a standing lesson on the limits of the qualify step's own verification methods.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `lib/graph/queries.ts` | Modified | Added `searchInventory()` + `getLowestRankTermsByVendor()` + supporting interfaces |
| `lib/graph/client.ts` | Modified | Added optional `columns` param to `runCypher()` for multi-column AGE `RETURN` |
| `components/vehicle-card.tsx` | Created | Presentational vehicle result card (class, specs, perks, price, vendor+rating, CTA) |
| `app/(discovery)/search/page.tsx` | Created | Real async server-component search page; GET form filters by location/vehicle class |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Resolve NegotiatedTerm via vendor's lowest-rank MembershipTier | Anonymous search has no member/tier context; avoids a 3x-per-vendor row fan-out from a naive Vendor→NegotiatedTerm join | Establishes the pattern for any future anonymous-context rate display |
| Extend `runCypher()` with additive `columns` param rather than a new function | Multi-column `RETURN i, vc, v, l` needs an explicit AGE column list; backward-compatible with the 3 existing single-column callers | Unblocks future multi-node-join queries |
| Defer landing→`/search` entry point to 04-05 | `app/page.tsx` was explicitly out of scope (DO NOT CHANGE) for 04-04; user chose to wire the full discovery→checkout flow at once rather than connect landing before checkout exists to receive it | `app/page.tsx` stays the Phase-3 placeholder until 04-05 |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Essential fixes, no scope creep |
| Scope additions | 0 | — |
| Deferred | 1 | Logged above (landing entry point → 04-05) |

**Total impact:** Essential fixes only — no scope creep beyond what was needed to make the plan's own tasks executable and interactively usable.

### Auto-fixed Issues

**1. [Infra gap] `runCypher()` couldn't express multi-column Cypher `RETURN`**
- **Found during:** Task 1 (searchInventory implementation)
- **Issue:** `runCypher()` was hardcoded to `AS (result agtype)`; AGE requires the SQL column list to match the Cypher `RETURN` clause's arity exactly. `searchInventory()`'s `RETURN i, vc, v, l` (and the vendor-term lookup's `RETURN provider, rank, t, p`) failed with Postgres error 42804. Not caught by either round of pre-APPLY adversarial review — both assumed the plan's claim that `runCypher` could be reused "exactly as the existing three functions do."
- **Fix:** Added optional `columns?: string[]` param to `runCypher()`, building the AGE column list dynamically and returning a keyed object per row when columns are supplied. Backward-compatible — the 3 pre-existing single-column callers pass no `columns` arg.
- **Files:** `lib/graph/client.ts`
- **Verification:** Temp verify script (`scripts/_tmp-verify-search.ts`, deleted after use) confirmed 1000 unfiltered rows, 100 for a location filter, 0 rows missing `negotiatedTerm`.

**2. [UI bug] Sidebar filter form had no submit button**
- **Found during:** Post-APPLY, user manual testing
- **Issue:** The `<form method="get">` in `app/(discovery)/search/page.tsx` had no `<button type="submit">` — the vehicle-class `<Select>` has no mechanism to submit a form on its own, so there was no way to trigger the GET filter in a browser. Server-side filtering logic itself was already correct.
- **Fix:** Added `<Button type="submit">Search</Button>` inside the form.
- **Files:** `app/(discovery)/search/page.tsx`
- **Verification:** `npm run build` clean; curl re-confirmed `?vehicleClass=SUV`→111 rows with the submit button present in rendered HTML.

### Deferred Items

- Landing→`/search` entry point: `app/page.tsx` stays the Phase-3 placeholder; wiring a real landing→search link deferred to 04-05 per user decision (2026-08-28), so discovery→checkout is wired end-to-end at once.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Killed a pre-existing dev server on port 3002 while restarting for verification (`pkill -f "next dev"` was too broad) | Restarted dev server (port 3000), re-verified `/search` and `/prototype/search` both 200; no further action needed |

## Next Phase Readiness

**Ready:**
- Real, working Discovery/Search UI at `/search` for 04-05 (checkout) to link from and read selections against.
- `searchInventory()` and the extended `runCypher()` are stable, reusable query-layer primitives.

**Concerns:**
- "Choose this car" button on `VehicleCard` is currently a no-op — checkout wiring is explicit 04-05 scope.
- No landing-page entry point into `/search` yet — deferred to 04-05 by design, not an oversight.

**Blockers:**
None.

---
*Phase: 04-booking-rate-integrity, Plan: 04*
*Completed: 2026-08-28*
