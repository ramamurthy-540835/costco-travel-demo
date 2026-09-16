---
phase: 04-booking-rate-integrity
plan: 02
subsystem: ui
tags: [images, wikimedia, clerk-auth, landing-page, location-autocomplete, ontology-reuse]

# Dependency graph
requires:
  - phase: 04-01
    provides: MUI-blue re-themed :root tokens
provides:
  - Real Wikimedia Commons vehicle photos per class (VehicleImage component)
  - Auth-gated /prototype/bookings screen (Clerk auth(), inline-unauthorized pattern)
  - Reworked landing page (embedded search form, vendor list, hero photo, new copy)
  - LocationAutocomplete component reusing the graph ontology's 10 real Location nodes
affects: ["04-03 (search-results redesign consumes mockVehicleClasses/mockLocations/LocationAutocomplete built here)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wikimedia Commons Special:FilePath verified-URL pattern for placeholder photos (WebFetch real filename, curl-verify 200, then hardcode)"
    - "Clerk auth() inline-gate (no redirect) mirroring BookCars' <Layout strict> → <Unauthorized /> pattern"
    - "Client-side typeahead over a static list as the local equivalent of BookCars' server-backed LocationSelectList"

key-files:
  created:
    - app/prototype/landing/landing-search-form.tsx
    - app/prototype/location-autocomplete.tsx
  modified:
    - app/prototype/vehicle-image.tsx
    - app/prototype/mock-data.ts
    - app/prototype/bookings/page.tsx
    - app/prototype/landing/page.tsx
    - app/prototype/search/page.tsx
    - app/prototype/vehicle/[id]/page.tsx
    - app/globals.css

key-decisions:
  - "Reused the existing rental ontology's 10 real Location nodes (city/airport_code from data/reference/mock-data/rental_inventory.json) for mockLocations instead of inventing a new location set — verified via direct read of the ontology/graph/Mongo layers per explicit user instruction"
  - "Bookings gating is inline (no redirect) via async server component + Clerk auth(), matching BookCars' strict-Layout/Unauthorized precedent rather than a middleware-level redirect"
  - "No real vendor/rental-brand logos anywhere — text-only wordmarks (trademark risk)"
  - "--secondary token fixed from a magenta oklch hue to a neutral near-black — the reported 'purple' was this token, not --primary"

patterns-established:
  - "Landing search form embeds directly in the hero section and routes to /prototype/search via query params, rather than a plain CTA button"

# Metrics
duration: ~2.5hr (across several ad-hoc plan-mode sessions, not tracked via /coder:apply)
started: 2026-08-28T00:00:00Z
completed: 2026-08-28T00:00:00Z
---

# Phase 4 Plan 02: Real Images, My Bookings, Landing Rework Summary

**Scope grew substantially beyond the original 04-02-PLAN.md during execution — this SUMMARY documents what was actually built, retroactively, since the work was done through Claude Code plan-mode sessions rather than `/coder:apply`.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~2.5hr across 3 ad-hoc plan-mode sessions |
| Tasks | Original 2 tasks + 2 unplanned scope extensions (landing rework, search enhancements) |
| Files modified | 8 modified, 2 created |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Vehicle images are real, class-relevant photos | Pass | Wikimedia Commons `Special:FilePath` map, 5 classes, all curl-verified 200 |
| AC-2: My Bookings screen exists and is navigable | Pass, revised | Built as an auth-gated screen (Clerk `auth()`, inline sign-in prompt) — original plan didn't specify auth gating; added per user request mid-session ("My booking should be coming only after signing in") |
| AC-3: Checkout confirmation routes to bookings | Pass | Unchanged from original plan intent |
| AC-4: Build stays clean, no live calls | Pass | `npm run build` clean at each checkpoint; no file under `lib/graph`, `lib/models`, `lib/payment`, or `middleware.ts` modified |

## Accomplishments

- `VehicleImage` (`app/prototype/vehicle-image.tsx`): `CLASS_IMAGE_MAP` of 5 verified Wikimedia Commons photos keyed by `class_name`, with graceful fallback to the original gradient+icon on load error
- `/prototype/bookings`: converted to an async server component; unauthenticated visitors see an inline "Sign in to see your bookings" card (Clerk `auth()`, no redirect) instead of the booking list
- Landing page reworked: `--secondary` CSS token fixed (was a magenta hue, now neutral near-black), "Popular Vehicle Classes" renamed to "Browse by vehicle type", vendor list section added (`mockVendors`, text-only), search form embedded directly in a new photographic hero section with rewritten copy
- Location autocomplete (`app/prototype/location-autocomplete.tsx`) built as a client-side typeahead over `mockLocations` — the 10 real city/airport-code pairs already seeded in the rental ontology's `Location` node data, reused verbatim rather than invented
- `LandingSearchForm` routes to `/prototype/search` with query params (`location`, `pickupDate`, `returnDate`, `vehicleType`); `/prototype/search` prefills from the same params via `useSearchParams` inside a `Suspense` boundary (required for static prerendering)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/prototype/vehicle-image.tsx` | Modified | Real per-class Wikimedia photos, `vehicleClass` prop (renamed from `seed`) |
| `app/prototype/mock-data.ts` | Modified | Added `MockBooking`/`mockBookings`, `MockVendor`/`mockVendors`, `mockLocations` |
| `app/prototype/bookings/page.tsx` | Modified | Async server component, Clerk `auth()` inline gate |
| `app/prototype/landing/page.tsx` | Modified | Hero photo + embedded search, vendor section, renamed heading |
| `app/prototype/landing/landing-search-form.tsx` | Created | Client search form embedded in the landing hero |
| `app/prototype/location-autocomplete.tsx` | Created | Reusable location typeahead over `mockLocations` |
| `app/prototype/search/page.tsx` | Modified | Prefill from query params via `Suspense`-wrapped `useSearchParams` |
| `app/prototype/vehicle/[id]/page.tsx` | Modified | `VehicleImage` call site updated to `vehicleClass` prop |
| `app/globals.css` | Modified | `--secondary` token fixed (magenta → neutral) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Bookings gated inline via Clerk `auth()`, not middleware redirect | Mirrors BookCars' `<Layout strict>` → `<Unauthorized />` precedent; `middleware.ts` stays untouched | No route protection added elsewhere — only `/prototype/bookings` gates |
| Location list reused from existing ontology, not invented | Explicit user instruction to check the graph/Mongo layers first | `mockLocations` matches real seeded `Location` node data exactly |
| Hero background is a real photo, not a CSS gradient | User explicitly chose "Real photo" over the gradient recommendation via AskUserQuestion | Adds one external Wikimedia Commons image dependency to the landing page |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Original AC-1's picsum.photos approach replaced with real class-matched photos (already captured in 04-02-PLAN.md's AC-1 revision note) |
| Scope additions | 2 | Landing page rework (color fix, vendor section, embedded search, hero photo/copy) and search enhancements (location autocomplete, auth gating) were not in the original 04-02-PLAN.md — added via user request mid-session and executed through Claude Code plan-mode rather than a new PLAN.md |
| Deferred | 0 | None |

**Total impact:** Original plan's 2 tasks were completed as revised, but the actual delivered scope for this "increment" is substantially larger — landing page and search page both reworked beyond the original plan's file list. This SUMMARY exists specifically to bring STATE.md/ROADMAP.md back in sync with what was actually built, since none of this went through `/coder:apply`.

### Deferred Items

None.

## Issues Encountered

- Prop-naming collision in an early `VehicleImage` rewrite (duplicate `className` semantics) — fixed by renaming the vehicle-class-identifying prop to `vehicleClass`.
- `useSearchParams()` in `/prototype/search` broke static prerendering — fixed with a `Suspense` boundary around the search-params consumer.

## Next Phase Readiness

**Ready:**
- `mockVehicleClasses`, `mockLocations`, and `LocationAutocomplete` are in place for 04-03 (search-results BookCars-style redesign) to build directly on, without re-deriving location or vendor data.

**Concerns:**
- This SUMMARY is retroactive — written after the fact from conversation history rather than from a live `/coder:apply` run. Treat file-level details as accurate (verified against the current repo state) but treat "duration"/timestamps as approximate.

**Blockers:**
- None.

---
*Phase: 04-booking-rate-integrity, Plan: 02*
*Completed: 2026-08-28 (documented retroactively)*
