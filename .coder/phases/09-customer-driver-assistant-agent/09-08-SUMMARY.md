---
phase: 09-customer-driver-assistant-agent
plan: 08
subsystem: agent-tools
tags: [mongodb, graph, booking-status, sort-fix, query-params, idor-guard]

requires:
  - phase: 09 (09-01)
    provides: get_booking_status tool and its vendorId client-side-filter precedent
provides:
  - Correct "latest bookings" semantics (createdAt-desc, not pickup-date-desc)
  - Server-side, indexable filters on GET /api/bookings: bookingId, pickupDate, city, vendorId
  - getInventoryIdsByCity() graph lookup (Inventory -[:LOCATED_AT]-> Location{city})
  - Ownership-safe bookingId lookup pattern (merged into buildOwnBookingsFilter's own object, never a bare findById)
affects: any future get_booking_status filter addition, or any other member-scoped list route needing a similar id/date/location filter pattern

tech-stack:
  added: []
  patterns:
    - "A member-scoped id lookup must be merged into the SAME filter object as the member clause, never a separate findById/findOne({_id}) call — the only way to guarantee ownership scoping can't be bypassed by a crafted id param"
    - "A single-day convenience filter (pickupDate) must fully replace, not merge with, an existing range filter (from/to) on the same field — merging risks producing a corrupted over-constrained range"
    - "runCypher's third `columns` arg is required whenever the caller expects named-field row objects rather than raw scalars"

key-files:
  created: []
  modified: [app/api/bookings/route.ts, lib/graph/queries.ts, agent-service/customer-assistant/tools.ts, tests/e2e/regression/my-bookings.spec.ts]

key-decisions:
  - "All new get_booking_status filters (bookingId, pickupDate, city, vendorId) implemented as server-side query params on /api/bookings, not client-side filtering in tools.ts — ending the vendorId precedent that fetched the member's entire history on every call"
  - "city resolves via the graph inside the Next app's route handler (getInventoryIdsByCity), not inside the separate agent-service process — keeps graph access where it already lives"
  - "vendorId's zero-match 'return full list + note' fallback is kept ONLY for vendorId (a named vendor with no exact hit is a plausible near-miss worth showing alternatives for); bookingId/city/pickupDate misses return an empty list + note instead — dumping the full history on a specific-id/location miss would leak unrelated bookings and violate AC-2's ownership contract"
  - "vendorId filtering stays case-insensitive (regex, escaped) even though it moved server-side, to preserve the case-insensitive UX the old client-side .toLowerCase() comparison had"
  - "get_booking_status's city param is pickup-city only — confirmed no dropoffCity is ever persisted on Booking or filterable in the graph; drop-off city is a one-way-rental quote detail (get_quote), not a booking attribute, so there is nothing else to filter"

duration: ~45m
started: 2026-09-15T14:00:00
completed: 2026-09-15T14:45:00
---

# Phase 9 Plan 08: get_booking_status sort fix + real filter coverage Summary

**Fixed "latest bookings" sorting by rental pickup date instead of creation date; added real, server-side, ownership-safe filters (bookingId, pickupDate, city, vendorId) to the conversational get_booking_status tool, replacing the flagged-as-a-workaround client-side vendorId filter.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: latest N sorted by creation, not pickup date | Pass | `.sort({ createdAt: -1 })`; verified via direct filter-builder script |
| AC-2: bookingId scopes to exactly one booking; no leak on miss | Pass | Verified via new automated Playwright test (`my-bookings.spec.ts`) + direct filter-builder script (invalid id → `_id: null`, valid id merged into member-scoped filter) |
| AC-3: pickupDate filters to that calendar day | Pass | Verified via direct filter-builder script; day-boundary math confirmed correct in UTC |
| AC-4: city filters via graph join; unknown city → empty list | Pass | `getInventoryIdsByCity` added; route short-circuits to `[]` before querying Mongo when zero matches |
| AC-5: vendorId filtering happens server-side | Pass | Case-insensitive regex query param on the route; `tools.ts`'s client-side filter block deleted entirely |
| AC-6: `npx tsc --noEmit` clean | Pass | Clean throughout |

## Accomplishments

- Fixed the actual bug: "get me my latest 2 bookings" now returns the two most recently *created*, not whichever two happen to have the latest pickup dates.
- Added `bookingId`, `pickupDate`, `city` as real, indexable server-side filters — none existed before.
- Removed `tools.ts`'s self-flagged vendorId workaround (full-history fetch + client filter) entirely; vendorId is now a real query param.
- Added a new graph query, `getInventoryIdsByCity`, correctly wired with `runCypher`'s required `columns` argument (a mistake flagged during adversarial review before it was written).
- Added an automated regression test (`my-bookings.spec.ts`) asserting the ownership boundary: a valid `bookingId` returns exactly one booking; a well-formed-but-nonexistent id and a malformed id both return `[]`, never the unfiltered history.
- Clarified via user question mid-implementation that `city` is pickup-city only — there is no persisted or filterable drop-off city anywhere in the system (drop-off is a one-way quote detail, not a booking attribute) — documented inline in the tool schema so this isn't re-litigated later.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/api/bookings/route.ts` | Modified | Sort fix (`createdAt: -1`); `buildOwnBookingsFilter` extended with `bookingId`/`pickupDate`/`vendorId`/`inventoryIds`; GET handler resolves `city` → `inventoryIds` via the graph before querying |
| `lib/graph/queries.ts` | Modified | Added `getInventoryIdsByCity(city)` |
| `agent-service/customer-assistant/tools.ts` | Modified | `get_booking_status` tool schema extended (`bookingId`/`pickupDate`/`city`); handler rewritten to pass all filters as query params; vendorId-only-fallback scoping; description updated |
| `tests/e2e/regression/my-bookings.spec.ts` | Modified | New test: `bookingId` scoping + zero-match/malformed-id safety |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Server-side query params over client-side filtering | vendorId's existing pattern was explicitly self-flagged as a workaround; fetching full history to filter one booking or one city is strictly worse than a scoped Mongo query | Establishes the pattern for any future `get_booking_status` filter |
| city resolved in the Next app, not agent-service | Graph access already lives in the Next app; avoids duplicating a DB dependency into the separate agent-service process | Consistent with the existing architectural boundary |
| Fallback-to-full-list kept only for vendorId | bookingId/city/pickupDate misses must return empty (AC-2's ownership contract); vendor near-misses are a different, UX-motivated case | Prevents a real privacy/UX regression that the original plan draft would have introduced |
| vendorId stays case-insensitive after moving server-side | Preserves prior UX; an exact-match regression would have silently broken existing "show my Alamo bookings" phrasing that doesn't match stored casing | No user-visible behavior change from before |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Adversarial-review fixes folded into plan before APPLY | 3 (blocker + 2 should-fix) | Applied as written in the plan; no additional deviation during APPLY itself |
| Scope clarification (user question mid-APPLY) | 1 | Confirmed `city` = pickup-city only; no code change needed, doc comment added |
| Deferred | 1 | Full Playwright regression run blocked by a pre-existing, unrelated environment gap |

### Deferred Items

- **Playwright regression suite could not be run end-to-end in this session.** `playwright.config.ts`'s `baseURL` is `http://localhost:3000`, but the app has run under the `/agentic-travels` basePath since Plan 09-07 (2026-09-15) — `/sign-in` 500s without the prefix, `/agentic-travels/sign-in` returns 200. This pre-dates this plan and is unrelated to its changes; not fixed here as it's outside this plan's scope. Verification was instead done via a direct script invoking `buildOwnBookingsFilter` with representative inputs (all filter combinations checked and confirmed correct — see script output in session). The new automated test (`my-bookings.spec.ts`) is written and type-checks cleanly but has not been executed against a live browser session in this environment. **Recommend fixing the Playwright baseURL/basePath mismatch as its own small follow-up before the next regression run**, then running `npm run test:e2e:regression` to execute the new test for real.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Adversarial plan review (2 parallel reviewers, round 1) found 1 blocker + 4 should-fix items before APPLY | All folded into the plan and implemented: fallback scoping restricted to vendorId only, pickupDate-replaces-range semantics made explicit, `runCypher` columns arg specified, "My Bookings" page checked (confirmed unaffected — it calls `buildOwnBookingsFilter` directly with its own separate `.sort({ from: -1 })`, not through the route, so the sort fix doesn't touch it), automated ownership test added |
| User asked whether `city` should also cover drop-off location | Verified via full-codebase grep: no `dropoffCity` field is ever persisted on `Booking` or filterable in the graph; it's a `get_quote`-only display detail. No code change; added a clarifying comment in the tool schema |
| Playwright regression run blocked by baseURL/basePath mismatch | Verified filter logic via a direct script instead; flagged as a follow-up, not fixed in this plan |

## Next Phase Readiness

**Ready:**
- Sort bug fixed and filter coverage complete for all 5 scenarios in the original request (latest N, by booking id, by date, by location, by vendor).
- Ownership-safety pattern (id lookup merged into the member-scoped filter object) established for any future similar route.

**Concerns:**
- Playwright `baseURL` vs. `/agentic-travels` basePath mismatch (pre-existing, from Plan 09-07) blocks running the full e2e/regression suite in this environment — recommend a small follow-up fix before relying on `npm run test:e2e:regression` again.

**Blockers:**
- None for this plan's own scope.

---
*Phase: 09-customer-driver-assistant-agent, Plan: 08*
*Completed: 2026-09-15*
