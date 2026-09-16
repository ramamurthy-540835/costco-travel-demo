---
phase: 04-booking-rate-integrity
plan: 09
subsystem: landing-page
tags: [landing, header, clerk, carousel, marquee, search]

requires:
  - phase: 04-booking-rate-integrity (04-06)
    provides: real-data app/page.tsx, app/landing-hero.tsx
provides:
  - Full multi-field hero search form
  - Global Header with Clerk SignedIn/SignedOut/UserButton
  - Vehicle-type image carousel (prev/next pagination)
  - Vendor marquee with brand-color wordmarks
  - /search sidebar filter parity via components/search-filters.tsx
  - Vehicle images on search-result cards
affects: ["04-10", "04-12"]

tech-stack:
  added: []
  patterns:
    - "Global Header rendered once in app/layout.tsx, Clerk SignedIn/SignedOut/UserButton gate auth UI"
    - "Vendor brand-color wordmarks (lib/vendor-brand-colors.ts) used instead of real vendor logo assets — explicit user choice, no trademark risk"
    - "Carousel converted from free-scroll to strict prev/next pagination for predictable UX"

key-files:
  created:
    - components/header.tsx
    - lib/vehicle-images.ts
    - components/vehicle-type-carousel.tsx
    - components/vendor-marquee.tsx
    - lib/vendor-brand-colors.ts
    - components/search-filters.tsx
  modified:
    - app/landing-hero.tsx
    - app/page.tsx
    - app/layout.tsx
    - components/vehicle-card.tsx

key-decisions:
  - "Vendor marquee uses BRAND_COLORS text/color wordmarks over real logo image assets — standing constraint carried into 04-10/04-12"
  - "Carousel changed from free-scroll (Task pass 1) to strict prev/next pagination (Task 6) per live checkpoint feedback"
  - "1-round adversarial review caught 3 issues before APPLY, all resolved pre-checkpoint"
  - "Retroactively unified 2026-09-02 — plan was applied and checkpoint approved-in-substance earlier in the session but /coder:unify was never run at the time"

patterns-established:
  - "Any new vendor-facing UI uses BRAND_COLORS wordmarks, never real logo assets"
  - "Header/auth UI lives in a single global components/header.tsx, not duplicated per route"

duration: unknown (retroactively documented)
completed: 2026-08-31T00:00:00Z
---

# Phase 4 Plan 09: Header, Full Search Form, Carousel + Marquee Summary

**Added a global Header with Clerk auth state, a full multi-field hero search form, a paginated vehicle-type image carousel, and a brand-color vendor marquee — plus sidebar filter parity on `/search` and vehicle images on result cards.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Global header with Clerk auth state | Pass | `components/header.tsx` renders `SignedIn`/`SignedOut`/`UserButton`; mounted once in `app/layout.tsx` |
| AC-2: Full hero search form | Pass | `app/landing-hero.tsx` + `app/page.tsx` carry pickup/drop-off/date/vehicle-class fields |
| AC-3: Vehicle-type carousel with real images | Pass | `lib/vehicle-images.ts` + `components/vehicle-type-carousel.tsx`, strict prev/next pagination |
| AC-4: Vendor marquee with brand accents | Pass | `components/vendor-marquee.tsx` + `lib/vendor-brand-colors.ts` |
| AC-5: /search sidebar filter parity | Pass | `components/search-filters.tsx` added |
| AC-6: Vehicle images on search-result cards | Pass | `components/vehicle-card.tsx`'s `CardImage` |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `components/header.tsx` | Created | Global header, Clerk auth state |
| `lib/vehicle-images.ts` | Created | Make/model → image map (later extended in 04-10) |
| `components/vehicle-type-carousel.tsx` | Created | Vehicle-type browse carousel |
| `components/vendor-marquee.tsx`, `lib/vendor-brand-colors.ts` | Created | Vendor marquee, brand-color wordmarks |
| `components/search-filters.tsx` | Created | `/search` sidebar filters |
| `app/landing-hero.tsx`, `app/page.tsx`, `app/layout.tsx`, `components/vehicle-card.tsx` | Modified | Wired new sections/header/images into production pages |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Retroactive SUMMARY, written 2026-09-02 | Plan applied/checkpoint-approved earlier in the session, `/coder:unify` skipped at the time | Documents actual shipped state |
| Brand-color wordmarks over real logos | Avoids trademark/licensing risk | Carried forward as standing pattern into 04-10/04-12 |

## Next Phase Readiness

**Ready:** 04-10 builds directly on `lib/vehicle-images.ts`, the carousel, and the marquee (expanding all three); 04-12 builds on the search-filters/hero form.
**Concerns:** None.
**Blockers:** None.

---
*Phase: 04-booking-rate-integrity, Plan: 09*
*Completed: 2026-08-31 (documented retroactively 2026-09-02)*
