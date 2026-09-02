---
phase: 04-booking-rate-integrity
plan: 10
subsystem: landing-page
tags: [carousel, images, marquee, playwright, e2e]

requires:
  - phase: 04-booking-rate-integrity (04-09)
    provides: vehicle-type carousel, vendor marquee, lib/vehicle-images.ts
provides:
  - 3 makes/models per vehicle class (up from 1)
  - VEHICLE_IMAGE_MAP + CLASS_IMAGE_MAP fallback chain (make/model → class → icon)
  - Carousel PAGE_SIZE 3→6, showing all 9 classes
  - Vendor marquee polish (brand-accent border, hover lift, edge fade mask)
  - Checked-in Playwright smoke suite (tests/e2e/smoke.spec.ts, playwright.config.ts, npm run test:e2e)
affects: ["04-12"]

tech-stack:
  added: ["@playwright/test"]
  patterns:
    - "Deterministic hash-of-rental_id assignment for reproducible synthetic make/model variety (scripts/reassign-vehicle-makes.mjs) — same pattern reused later for 04-11's extras fields"
    - "Image fallback chain: VEHICLE_IMAGE_MAP[make model] → CLASS_IMAGE_MAP[className] → lucide-react Car icon via onError"
    - "Playwright smoke suite committed to repo, not run only ad hoc — npm run test:e2e as a standing regression gate"

key-files:
  created:
    - scripts/reassign-vehicle-makes.mjs
    - tests/e2e/smoke.spec.ts
    - playwright.config.ts
  modified:
    - lib/vehicle-images.ts
    - components/vehicle-type-carousel.tsx
    - components/vendor-marquee.tsx
    - components/vehicle-card.tsx
    - package.json

key-decisions:
  - "Retroactively unified 2026-09-02 — plan was applied and its checkpoint (live-rendering review) approved-in-substance earlier in the session, but /coder:unify was never run at the time"

patterns-established:
  - "Playwright smoke suite is the standing regression gate for future landing/search/checkout changes — extended in place (04-12), not replaced"

duration: unknown (retroactively documented)
completed: 2026-09-01T00:00:00Z
---

# Phase 4 Plan 10: Carousel/Image/Marquee Fixes + Playwright Smoke Suite Summary

**Fixed three live-rendering gaps from 04-09 (carousel only showing 3/9 classes, one make/model per class, a flat vendor marquee) and added a checked-in Playwright smoke suite as the standing regression gate.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: 3 makes/models per vehicle class | Pass | `scripts/reassign-vehicle-makes.mjs` + graph reload; ontology docs updated |
| AC-2: Carousel shows all 9 classes with image fallback | Pass | `PAGE_SIZE = 6` confirmed in `components/vehicle-type-carousel.tsx`; `VEHICLE_IMAGE_MAP`/`CLASS_IMAGE_MAP` confirmed in `lib/vehicle-images.ts` |
| AC-3: Vendor marquee polish | Pass | `borderTopColor`/`maskImage` confirmed in `components/vendor-marquee.tsx` |
| AC-4: Playwright smoke suite checked in | Pass | `tests/e2e/smoke.spec.ts`, `playwright.config.ts`, `"test:e2e"` script in `package.json` all present |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/reassign-vehicle-makes.mjs` | Created | Deterministic 3-per-class make/model reassignment |
| `lib/vehicle-images.ts` | Modified | Added `VEHICLE_IMAGE_MAP`, `CLASS_IMAGE_MAP` fallback chain |
| `components/vehicle-type-carousel.tsx` | Modified | `PAGE_SIZE` 3→6 |
| `components/vendor-marquee.tsx` | Modified | Brand-accent border, hover lift, edge fade mask |
| `components/vehicle-card.tsx` | Modified | `CardImage` fallback chain wired in |
| `tests/e2e/smoke.spec.ts`, `playwright.config.ts`, `package.json` | Created/Modified | Checked-in Playwright smoke suite |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Retroactive SUMMARY, written 2026-09-02 | Plan applied/checkpoint-approved earlier in the session, `/coder:unify` skipped at the time | Documents actual shipped state |

## Next Phase Readiness

**Ready:** 04-12 extends `tests/e2e/smoke.spec.ts` in place rather than starting a new suite.
**Concerns:** None.
**Blockers:** None.

---
*Phase: 04-booking-rate-integrity, Plan: 10*
*Completed: 2026-09-01 (documented retroactively 2026-09-02)*
