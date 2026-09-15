# Research: mastech-agentic-travel's authenticated flows — regression scope inventory

**Agent:** Explore | **Date:** 2026-09-04

**Auth gate:** all routes call `auth()` from `@clerk/nextjs/server`; unauthenticated → 401 `{error:'Sign-in required'}` (APIs) or Clerk redirect (pages). Complete list of files calling `auth()`: `app/(account)/bookings/page.tsx`, `app/prototype/bookings/page.tsx`, `app/api/bookings/route.ts`, `app/api/bookings/[id]/addons/route.ts`, `app/api/bookings/[id]/cancel/route.ts`, `app/api/bookings/[id]/modify/route.ts`.

## 1. Booking Creation (Checkout)
**Files:** `app/page.tsx` (search) → `components/vehicle-card.tsx` → `app/(checkout)/checkout/page.tsx` + `checkout-form.tsx` → `app/api/bookings/route.ts` (POST, `auth()`, re-derives price via `searchInventory()`, `lib/graph/mutations.ts::recordReservation()`, `lib/models/member-sync.ts::getOrCreateMember()`) → `app/api/payments/intent/route.ts` (Stripe) → `app/(checkout)/confirmation/[bookingId]/page.tsx`

**Happy path:** search → pick class/vendor → checkout (sign-in gate) → Stripe Elements payment → `POST /api/bookings` → confirmation shows `reserved` status, vendor/class via join.

**Edge cases:** not signed in (gated before payment); unavailable/stale vehicle at submit; **tampered Stripe amount → server rejects on price mismatch**; empty/invalid email → Stripe `email_invalid` (previously-fixed bug, worth regression-locking); duplicate reservation calls idempotent (MERGE-based).

## 2. Booking Modification
**Files:** `components/booking-modify-form.tsx`, `booking-modify-dialog.tsx` → `app/api/bookings/[id]/modify/route.ts`

**Scenarios:** (a) dates-only ↑price → delta payment; (b) dates-only ↓price → auto-refund; (c) location/vehicle-type/vendor change → cross-vendor candidate re-match; (d) unavailable candidate → 409; (e) modification-cutoff passed → 400; (f) booking not `reserved` → 400; (g) inventory/negotiated rate not found → 400; (h) concurrent modify race → 409 (CAS/optimistic lock).

**Status codes:** 401 (no auth), 404 (not found), 400 (wrong status/cutoff/no rate), 409 (availability conflict/lost-update race), 200 (success), 500 (apply failure).

## 3. Cancellation & Refund
**Files:** `components/booking-cancel-dialog.tsx` → `app/api/bookings/[id]/cancel/route.ts`

**Scenarios:** refund quote/preview (dry-run) → confirm → refund issued; late/no-show window folds into standard inside-window rate (no distinct no-show field in seed data); race protection via atomic claim-then-update (must target the already-`cancelled` doc, not the stale in-memory object — previously-fixed bug, worth regression test).

## 4. Add-on/Extras Management
**Files:** `components/booking-addons-dialog.tsx` / `booking-addons-form.tsx` → `app/api/bookings/[id]/addons/route.ts`

**Scenarios:** add fee-bearing addon (`fee_per_day` charged); addon already waived by member's perk → UI shows "Included with your perks — $0", locked/non-toggleable; server-side dedupes waived vs. catalog via `getWaivedAddOnIds(booking.pricingSnapshot.perkIds)`.

## 5. My Bookings Account Page
**Files:** `app/(account)/bookings/page.tsx`

**Scenarios:** list member's bookings; per-row entry points to Modify/Cancel/Addons dialogs. **No explicit status/date filter UI confirmed on this specific page in this pass** — verify against latest build before scoping filter tests (may not exist, or exists only via URL params).

## Seed/Test Data
- No dedicated `scripts/seed*.mjs` — only data-fix utilities (`reassign-vehicle-makes.mjs`, `add-vehicle-extras-fields.mjs`), not fixtures.
- One known real verified booking from STATE.md: `6a918a636e134d1cdc979024` (status `reserved`, correct pricingSnapshot, 1 Member + 1 RESERVED graph edge). Otherwise treat the Mongo booking collection as effectively empty/unseeded for Playwright planning — **tests should create their own bookings via the checkout flow**, not assume pre-seeded data.
- Graph (Postgres+AGE) inventory is seeded (1000 rows unfiltered per 04-04 verification) — usable directly for search/checkout fixtures.
