---
phase: 04-booking-rate-integrity
plan: 05
subsystem: payments
tags: [stripe, mongoose, apache-age, cypher, clerk, nextjs, checkout]

requires:
  - phase: 04-booking-rate-integrity (04-04)
    provides: searchInventory()/InventorySearchResult, real /search page + VehicleCard
provides:
  - Real landing → search → choose-car → checkout → confirmation flow (UC1 closed)
  - First graph write query (recordReservation(), MERGE-based, idempotent)
  - getOrCreateMember() Clerk↔Mongo Member sync
  - Server-side rate-tampering defense in /api/bookings (charged amount vs. recomputed negotiated total)
affects: [04-06-modification-uc2, 04-07-cancellation-refund-uc3, landing-page-rework (new, not yet planned)]

tech-stack:
  added: ["@stripe/stripe-js", "@stripe/react-stripe-js"]
  patterns:
    - "Stripe Elements confirmed client-side (confirmPayment with redirect: 'if_required'), booking creation happens server-side only after confirmation"
    - "Sign-in gate on a checkout-adjacent server page, mirroring app/prototype/bookings/page.tsx's auth()-based pattern"
    - "Cypher MERGE for idempotent node creation + CREATE for a genuinely new edge per event, both parameterized via runCypher()'s columns option"

key-files:
  created:
    - lib/graph/mutations.ts
    - lib/models/member-sync.ts
    - app/api/bookings/route.ts
    - app/(checkout)/checkout/page.tsx
    - app/(checkout)/checkout/checkout-form.tsx
    - app/(checkout)/confirmation/[bookingId]/page.tsx
  modified:
    - app/page.tsx
    - components/vehicle-card.tsx
    - .env.local
    - .env.local.example
    - package.json

key-decisions:
  - "Amount-integrity check (paymentIntent.amount vs Math.round(totalPrice*100)) lives entirely in /api/bookings, not /api/payments/intent, per plan boundaries"
  - "getOrCreateMember() sources email/fullName from Clerk's currentUser(), never client body, to prevent identity spoofing"
  - "Checkout page requires sign-in before rendering payment UI — added post-checkpoint, not originally in Task 3's plan text"
  - "Landing-page visual parity with /prototype/landing deferred to a new, separate plan rather than expanding this checkpoint"

patterns-established:
  - "Route-group folders ((checkout)) strip from the resolved URL — /checkout and /confirmation/[bookingId] don't share a URL prefix despite sharing a directory"
  - "Graph mutations always use MERGE for entity dedup, CREATE for event/relationship edges, with bound Cypher params via runCypher()'s existing $paramName convention"

duration: ~2.5hr
started: 2026-08-28T00:00:00Z
completed: 2026-08-28T13:20:00Z
---

# Phase 4 Plan 05: Checkout/Booking (UC1) Summary

**Real end-to-end booking flow shipped: landing search → /search → checkout with Stripe Elements → server-verified rate-integrity check → real Booking in Mongo + graph reservation edge → confirmation page.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~2.5hr |
| Tasks | 4 completed + 1 checkpoint |
| Files modified | 11 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Landing → search → checkout navigation | Pass | Verified via curl + live click-through; `/checkout?inventoryId=RC10001&vendorId=Alamo` resolves correctly |
| AC-2: Booking created only when charged amount matches negotiated total | Pass | Positive case verified live (bookingId `6a918a636e134d1cdc979024`); negative case (tampered amount → 400, no Booking) covered by the amount check in `app/api/bookings/route.ts` — logic verified by code review, not separately re-tested with a live tampered request |
| AC-3: Confirmation page shows real saved Booking | Pass | Verified against real bookingId — Mongo data + graph edge both confirmed correct |

## Accomplishments

- First graph **write** query (`recordReservation()`), live-verified idempotent for entity creation (`MERGE`) while correctly allowing multiple `RESERVED` edges per genuinely distinct reservation event (`CREATE`)
- Closed UC1 end-to-end: a member can now go from landing on `/` to holding a real, saved `Booking` with a frozen `pricingSnapshot`
- Server-side rate-tampering defense: `/api/bookings` independently recomputes the negotiated total from the graph and rejects any mismatch with the Stripe-charged amount, regardless of whether the charge itself succeeded

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/page.tsx` | Modified | Real landing page with a `/search` entry-point form (replaces Phase-3 placeholder) |
| `components/vehicle-card.tsx` | Modified | "Choose this car" now a real `Link` to `/checkout?inventoryId=...&vendorId=...` |
| `lib/graph/mutations.ts` | Created | `recordReservation()` — MERGE-based, parameterized graph write |
| `lib/models/member-sync.ts` | Created | `getOrCreateMember(clerkUserId, email, fullName)` |
| `app/api/bookings/route.ts` | Created | POST handler: auth, Stripe PaymentIntent check, server-recomputed pricing, amount-integrity check, Booking creation, graph write |
| `app/(checkout)/checkout/page.tsx` | Created | Async server component: resolves inventory/vendor, gates on sign-in, renders `CheckoutForm` |
| `app/(checkout)/checkout/checkout-form.tsx` | Created | Client component: Stripe Elements payment flow |
| `app/(checkout)/confirmation/[bookingId]/page.tsx` | Created | Real Booking lookup by `_id`, joined with `searchInventory()` for vehicle class/vendor display |
| `.env.local` | Modified | Added `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (user-provided) |
| `.env.local.example` | Modified | Documented all env vars with usage comments |
| `package.json` | Modified | Added `@stripe/stripe-js`, `@stripe/react-stripe-js` |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Amount-integrity check lives only in `/api/bookings` | Plan boundary: `/api/payments/intent` stays unmodified | Rate-tampering defense is centralized in one place |
| `getOrCreateMember()` sourced from Clerk `currentUser()` | Prevents identity spoofing via client-supplied email/name | Caller (`/api/bookings`) is responsible for correct sourcing |
| Checkout page requires sign-in before rendering payment UI | Checkpoint failure showed an unauthenticated request reaches Stripe with an empty email, causing a raw 500 | Cleaner UX, consistent with `app/prototype/bookings/page.tsx`'s existing pattern |
| Landing-page visual parity with `/prototype/landing` deferred to a new plan | Out of scope for 04-05's Task 1 (wiring only); porting the prototype's design requires real data (not mock vendors/vehicle classes) and a URL-verified hero image | Tracked in STATE.md as the next plan to run |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential fix, no scope creep |
| Scope additions | 0 | None |
| Deferred | 1 | Logged for a new plan |

**Total impact:** One essential fix during the checkpoint; no scope creep. All deviations are additive safety/UX fixes, not architectural changes.

### Auto-fixed Issues

**1. [Spec gap] Checkout page had no sign-in gate**
- **Found during:** Blocking checkpoint (user manual testing)
- **Issue:** An unauthenticated visitor could reach `/checkout` and click "Continue to payment," which called `/api/payments/intent` with an empty `receiptEmail`, causing Stripe to reject with `email_invalid` and the route to return a raw 500
- **Fix:** Added a sign-in gate to `app/(checkout)/checkout/page.tsx`, mirroring the existing pattern in `app/prototype/bookings/page.tsx` (checks `currentUser()`, renders a "Sign in to book" card with sign-in/sign-up links if not authenticated)
- **Files:** `app/(checkout)/checkout/page.tsx`
- **Verification:** Rebuilt clean, re-tested live end-to-end after signing in — flow completed successfully, bookingId `6a918a636e134d1cdc979024` confirmed in Mongo and the graph
- **Commit:** N/A (no commits made this session, per standing no-commit-without-request constraint)

### Deferred Items

- Landing page visual parity with `/prototype/landing` (hero photo, "why us" grid, vendor list, browse-by-vehicle-type) — discovered mid-checkpoint (user feedback), explicitly deferred to a new dedicated plan using real graph data instead of mock data, per user decision

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Checkout's "Continue to payment" 500'd with Stripe `email_invalid` on first checkpoint attempt | Added sign-in gate (see Auto-fixed above); resolved on retry |
| No `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local` when Task 3 began | Paused for user to provide it (standing rule: never fabricate/store secrets without asking); user added it, confirmed via direct file read before proceeding |

## Next Phase Readiness

**Ready:**
- UC1 (booking with negotiated rate + perks) fully closed — real flow, real data, real payment (test mode)
- Graph write pattern (`recordReservation()`) established for reuse by UC2 (modification) and UC3 (cancellation/refund)
- `getOrCreateMember()` available for any future flow needing a Clerk↔Mongo Member sync

**Concerns:**
- AC-2's negative case (tampered amount → 400) was verified by code review, not a live tampered request — worth an explicit live test if UC2/UC3 build on this same integrity check
- Landing page still doesn't match the prototype's visual design — tracked as a deferred item, not a blocker for 04-06/04-07

**Blockers:**
None.

---
*Phase: 04-booking-rate-integrity, Plan: 05*
*Completed: 2026-08-28*
