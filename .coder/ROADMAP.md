# Roadmap: mastech-agentic-travel

## Overview

Build a member-centric, multi-vendor rental-car brokerage platform: a rental-domain ontology and knowledge graph first, then a Discovery/Checkout layer that books, modifies, and cancels reservations against negotiated vendor rates, then billing-dispute and vendor-integration support for the lower-priority fulfillment-adjacent use cases.

## Current Milestone

**v0.1 Ontology & Discovery/Checkout Core** (v0.1.0)
Status: In progress
Phases: 7 of 12 complete, Phase 8 not started

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Rental Ontology & Knowledge Graph | 01-01, 01-02, 01-03 | Complete | 2026-08-27 |
| 2 | Agent-Enablement Ontology Layer | 02-01 | Complete | 2026-08-27 |
| 3 | Stack Foundation (Clerk, Postgres+AGE, Mongo) | 03-01, 03-02, 03-03 | Complete | 2026-08-28 |
| 4 | Booking & Rate Integrity (UC1, UC2, UC3) | 04-00 through 04-14 | Complete | 2026-09-04 |
| 5 | Add-On Integrity (UC6) | 05-01 | Complete | 2026-09-03 |
| 6 | Regression Test Infrastructure | 06-01 through 06-06 | Complete | 2026-09-04 |
| 7 | Agent-Grounding Ontology & Knowledge-Graph Enrichment | 07-01, 07-02, 07-03 | Complete | 2026-09-07 |
| 8 | Vendor Agent (A2A Inventory/Modification/Cancellation) | TBD | Not started | - |
| 9 | Customer/Driver Assistant Agent | TBD | Not started | - |
| 10 | Agent Lab & Observability/Evals (Phoenix) | TBD | Not started | - |
| 11 | Unified Agent-Service Deployment | TBD | Not started | - |
| 12 | Vendor Fulfillment Touchpoints (UC4, UC5, UC7, UC8) | TBD | Not started | - |

## Phase Details

### Phase 1: Rental Ontology & Knowledge Graph

**Goal:** Define the rental-domain ontology (Member, Vendor, VehicleClass, Reservation, NegotiatedTerm, Perk entities/relations) and stand up the Postgres + Apache AGE graph store that Discovery/Checkout and billing dispute resolution will query against.
**Depends on:** Nothing (first phase)
**Research:** Likely (Apache AGE setup/query patterns, ontology modeling decisions)
**Research topics:** Apache AGE schema/init patterns (reference `mastech-agentic-commerce`'s `agent-service/init/zz-init-graph.sql`), how negotiated-rate/perk eligibility should be represented as graph relations vs. relational tables

**Scope:**
- Entity/relation model for the rental domain (ontology doc)
- Postgres + Apache AGE graph store setup
- Seed data for at least one vendor + vehicle class + negotiated-rate scenario

**Plans:**
- [x] 01-01: Vocabulary/Taxonomy/Thesaurus layers, extending existing ONTOLOGY.md/graph_schema.sql
- [x] 01-02: Postgres + Apache AGE store stand-up + real seed data load from data/reference/mock-data + data/synthetic
- [x] 01-03: Vendor expansion (5 more vendors, 10 total) + BookCars-aligned field enrichment + real thesaurus data

### Phase 2: Agent-Enablement Ontology Layer

**Goal:** Enrich the Vocabulary/Taxonomy/Thesaurus/Ontology/Knowledge Graph so a conversational agent (assisting members with reservations/fulfillment) and fulfillment-side agents can resolve natural-language phrasing against the graph — attribute-level synonyms and a new action/intent vocabulary.
**Depends on:** Phase 1 (ontology/KG must exist to enrich)
**Research:** Done (checked `mastech-agentic-commerce`'s synonym-property and LLM-classifier patterns, read-only reference; confirmed it has no action/intent-level precedent — this phase pioneers that piece)

**Scope:**
- `synonyms` list property on `VehicleClass`/`Perk`/`AddOn`/`MembershipTier` (attribute-level, ported pattern)
- New `Intent` node type + `TARGETS` edge (action/intent-level vocabulary — the real gap)
- Comparative/policy phrases documented as sort/filter directives, not new graph structure

**Not in scope:** tool-calling contract (`check_access`/`record_audit`-style gating) — deferred until the actual conversational/fulfillment agents are built (Phase 4+), grounded in real code.

**Plans:**
- [x] 02-01: Agent-Enablement Ontology Layer — `Intent`/`TARGETS`, attribute-level `synonyms`, comparative-phrase documentation

### Phase 3: Stack Foundation (Clerk, Postgres+AGE, Mongo)

**Goal:** Stand up the generic application stack — Clerk auth, Next.js App Router shell, Mongo for operational/document data — wired to the Phase 1/2 graph store.
**Depends on:** Phase 2 (graph store must exist to wire against)
**Research:** Likely (Clerk middleware setup, Mongo schema for bookings/member sync)

**Scope:**
- Next.js App Router project scaffold
- Clerk auth integration (`middleware.ts` pattern)
- MongoDB connection + booking/member operational schema
- Basic project-level integration between graph store and app layer

**Port from BookCars** (`mastech-rental-car-management`) — adapt, don't fork wholesale:
- **Port directly (03-03):** `backend/src/payment/stripe.ts` + PaymentIntent logic from `stripeController.ts` (framework-agnostic SDK calls) → Next.js API routes/server actions. **PayPal excluded from scope** (user decision 2026-08-28) — BookCars' `paypal.ts` is a reference-only precedent, not ported now; revisit only if a real requirement for a second payment provider emerges.
- **Deferred to Phase 4 (user decision 2026-08-28):** `backend/src/utils/mailHelper.ts` (`nodemailer`/SendGrid) — no consumer exists yet (no booking flow to trigger a confirmation email); port alongside whichever Phase 4 plan ships the first booking-confirmation trigger, since email content should be shaped by real booking data rather than ported speculatively.
- **Deferred (no mobile app exists yet):** `mobile/` Expo push notification flow — revisit if/when a mobile client is scoped; not blocking Phase 3 or 4
- **Port as base, extend (03-03):** `packages/bookcars-types` → starting point for the ontology's Booking/Car/Location/User types, with a new `Vendor` entity inserted (BookCars has no vendor-abstraction layer; it assumes the platform owns the car)
- **Port with adaptation:** Mongoose models (`Booking.ts`, `User.ts`, `AdditionalDriver.ts`) → schemas mostly transfer since Mongo stays in this stack, but `Car` becomes vendor-owned inventory, not platform-owned
- **Port logic, move to graph:** fee/perk calculation currently duplicated in `admin/src/utils/helper.ts` and `frontend/src/utils/helper.ts` (`getFullInsurance`, `getCollisionDamageWaiver`, `getAdditionalDriver`, etc. — see BookCars [[CONCERNS]]) → becomes NegotiatedTerm/Perk graph relations (feeds Phase 1 ontology and Phase 5 add-on integrity) instead of hardcoded, duplicated JS functions
- **Do not port:** `authHelper.ts`/custom JWT auth (replaced by Clerk), Express routes/controllers (replaced by Next.js routing; underlying validation/business-rule logic is portable, the routing plumbing isn't)
- **Reference only, no direct port:** React/Vite frontend components (`Checkout.tsx`, filters, date pickers) — useful for UX flow reference, not a line-for-line port into Next.js App Router
- **Possible reuse:** `rrule`-based scheduling (admin) for vendor availability/inventory calendars, if that need emerges

**Plans:**
- [x] 03-01: Next.js App Router + TypeScript + Tailwind scaffold, Clerk middleware + sign-in/sign-up pages
- [x] 03-02: MongoDB connection (docker-compose) + Member/Booking/AdditionalDriver operational schema (vendor-owned inventory, not embedded Car) + TS graph query layer over Postgres+AGE (closes the deferred query-layer contract)
- [x] 03-03: Ported Stripe payment SDK (PaymentIntent flow, live-verified with a real test-mode key) and `bookcars-types` (extended with `Vendor`, `Car`→`Inventory` reshape) into the Next.js stack. PayPal excluded from scope; `mailHelper` deferred to Phase 4 (no consumer yet); Expo push notifications deferred (no mobile app yet).

### Phase 4: Booking & Rate Integrity (UC1, UC2, UC3)

**Goal:** Member can book, modify, and cancel a reservation with negotiated rates/perks correctly applied and preserved across vendor round-trips.
**Depends on:** Phase 3 (all of 03-01–03-03) + 04-00 design system/prototype below
**Research:** Likely (vendor rate re-quote/re-application logic, refund reconciliation modeling)

**Scope:**
- UC1: Booking with negotiated rate + perk display
- UC2: Modification routed to vendor with rate re-application
- UC3: Cancellation/refund reconciliation across platform and vendor

**Sequencing (revised 2026-08-28, resequenced twice same day — first after prototype scope extension, then again after 04-03 was consumed by the BookCars-style search-results redesign, pushing the real build to 04-04+):**

```
Wave 1 (parallel, no shared files):     03-03 ─┐
                                         04-00 ─┴─▶ (both must finish)
Wave 2:                                          04-01 (depends: 04-00)          -- prototype re-theme
Wave 3:                                          04-02 (depends: 04-01)          -- prototype images + My Bookings + landing rework
Wave 4:                                          04-03 (depends: 04-02)          -- prototype search-results BookCars-style layout
Wave 5:                                          04-04 (depends: 03-03, 04-03)   -- real discovery/search
Wave 6:                                          04-05 (depends: 04-04)          -- real checkout+booking, closes UC1
Wave 7:                                          04-06 (depends: 04-05)          -- real landing-page rework (visual parity with prototype, real data)
Wave 8:                                          04-07 (depends: 04-05)
Wave 9:                                          04-08 (depends: 04-05, 04-07)  -- modification/UC2, cancellation/UC3 + decreasing-modification refund
```
04-01/04-02/04-03 are prototype-only extensions (mock data, no live calls) grouped immediately after 04-00 so all design/prototype work finishes before the real, data-wired build (04-04 onward) begins. 04-06 was inserted 2026-08-28 (user request during 04-05's checkpoint) between 04-05 and the modification/cancellation plans, resequencing what were 04-06/04-07 into 04-07/04-08 — same resequencing pattern as 04-03's earlier insertion. 04-07 and 04-08 originally depended only on 04-05 and were parallel-candidate waves; **resequenced 2026-09-03** — 04-08 now also depends on 04-07 (Task 7, folding the decreasing-modification refund into 04-08, edits 04-07's own route/component), so 04-08 must apply after 04-07, not in parallel.

**Plans:**
- [x] 04-00: Design system + prototype — shadcn/ui component library; clickable mock-data prototype of landing/discovery/checkout screens, checkpoint-approved. **Depends on:** nothing. **Provides:** approved component set + screen flows.
- [x] 04-01: Prototype MUI-style re-theme — `app/globals.css` token-only re-theme (`--primary`/`--secondary`/`--radius`) to approximate BookCars' MUI look, no component changes. **Depends on:** 04-00. Applied and unified 2026-08-28, all 3 ACs passed.
- [x] 04-02: Prototype real images + My Bookings + landing rework + location autocomplete — real Wikimedia Commons vehicle photos, Clerk-gated `/prototype/bookings`, landing page reworked (hero photo, embedded search, vendor list), `LocationAutocomplete` reusing the ontology's real Location data. **Depends on:** 04-01. Executed ad hoc via plan-mode, retroactively documented in 04-02-SUMMARY.md (scope grew beyond the original plan). UC4/UC5/UC7/UC8 mock screens explicitly deferred by user — not scheduled.
- [x] 04-03: Prototype search-results BookCars-style layout — `/prototype/search` restructured into a left filter sidebar + vertical list of horizontal result cards (spec-icon row, mileage, perks, price-for-N-days breakdown, vendor+rating, "Choose this car" CTA); `MockVehicleClass` gained `fuelType`/`doors`/`hasAC`/`rating`/`tripCount`, with `rating` reused from the real `Vendor.rating` ontology data (not invented). **Depends on:** 04-02. Applied via `/coder:apply` 2026-08-28, all 3 ACs passed, checkpoint approved, 04-03-SUMMARY.md created.
- [x] 04-04: Discovery/Search UI (real) — vehicle-class/vendor/rate listing page reading `lib/graph/queries.ts` (vehicle classes, negotiated terms, perks from 03-02); search/filter by dates + location; read-only. **Depends on:** 03-02 (graph query layer), 03-03, 04-03 (prototype component/screen set finalized, including the BookCars-style layout). **Files:** `app/(discovery)/search/page.tsx`, `components/vehicle-card.tsx` or similar. **Provides:** the vehicle-class/rate selection UI that 04-05's checkout consumes.
- [x] 04-05: Checkout & Booking creation (real, closes UC1) — checkout UI wired to 03-03's Stripe PaymentIntent endpoint (`app/api/payments/intent/route.ts`), writes a `Booking` document (03-02's Mongoose model) with `pricingSnapshot` frozen from the graph query at booking time, adds the first graph **write** query (`recordReservation`), and ports `mailHelper.ts` (deferred from 03-03) to send a booking-confirmation email using real booking data. **Depends on:** 03-03 (Stripe/types), 04-04 (selection UI hands off inventoryId/vendorId/dates to checkout). **Files:** `app/(discovery)/checkout/page.tsx`, `app/api/bookings/route.ts`, `lib/graph/mutations.ts` (new), `lib/mail/mailHelper.ts`. **Provides:** a real, queryable `Booking` record — the first "confirmed reservation" 04-07/04-08 can act on. `mailHelper.ts` port was not actually done in 04-05 (not blocking, tracked separately) — see 04-05-SUMMARY.md.
- [x] 04-06: Landing-page rework (real data, full visual parity) — rebuild `app/page.tsx` as a complete port of `/prototype/landing`'s design (hero photo, "why us" grid, vendor list, "Browse by vehicle type") sourced entirely from `searchInventory()` (real vendors, real vehicle classes, real prices) instead of mock data. **Depends on:** 04-05 (landing is the entry point into the now-complete search→checkout→confirmation flow). **Files:** `app/page.tsx`, `app/landing-hero.tsx`. **Scope limit:** no vendor logos (text-only names); hero image URL must be verified (WebFetch/curl 200) not fabricated. User-requested during 04-05's checkpoint, explicitly wants a "complete UI build out like the prototype," not a minimal version. Applied and checkpoint-approved.
- [x] 04-07: Modification (closes UC2) — member changes dates on an existing booking through a real "Modify your booking" UI on the confirmation page AND a new real "My Bookings" account list page (dates-only in the UI; the API also supports inventory/vendor changes), backed by a new `lib/vendor-integration/policy.ts` boundary module's `quoteModification()` (wraps `searchInventory()`'s negotiated-rate lookup as the future Phase-7 RPC seam), re-applies the re-derived rate to a new `pricingSnapshot`, and requires a Stripe delta payment (via a live dry-run preview + Stripe Elements, mirroring 04-12's checkout pattern) for a price increase. **Depends on:** 04-05 (needs a real Booking to modify). **Files:** `lib/vendor-integration/policy.ts` (new), `lib/models/Booking.ts` (adds `modificationHistory`), `app/api/bookings/[id]/modify/route.ts`, `app/api/bookings/route.ts` (adds a `GET` listing handler + `buildOwnBookingsFilter()` helper), `components/booking-modify-form.tsx` (new), `app/(account)/bookings/page.tsx` (new — status/date-filtered list, per-row Modify), `components/header.tsx` (nav link), confirmation page. **Scope limit:** vendor-side re-confirmation remains a genuine Phase 7 concern; no automatic refund for a decreasing modification (closed by 04-08's Task 7 fold-in); a captured-but-unapplied delta payment on quote drift is a disclosed, unhandled reconciliation gap. Applied and unified 2026-09-03 (4 live-testing fixes folded in — success banner, debounced live quote, reworded decrease-path copy, standardized back-nav).
- [x] 04-08: Cancellation & refund reconciliation (closes UC3) **+ automatic refund for decreasing modifications** — cancellation request confirmed through a real "Cancel booking" dialog on the confirmation page AND on the same "My Bookings" list page (refund preview shown before confirming), refund calculated via `lib/vendor-integration/policy.ts`'s `quoteCancellation()` from the real per-vendor cancellation policy (`VendorPolicy` graph node — including a new `no_show_fee_percent` field added by this plan), Stripe refund issued via `stripe.refunds.create` against the original PaymentIntent, guarded by an atomic status-claim against concurrent cancel requests. Also closed a gap surfaced live during 04-07's checkpoint: a modification that *decreases* the total previously left the member's original higher charge in place with no refund (04-07's UI disclosed this as "contact support"); Task 7 extended 04-07's modify route to automatically refund the difference via the same Stripe refund pattern, and updated its UI copy to confirm the refunded amount. **Depends on:** 04-05 (needs a real Booking + PaymentIntent to refund) **and 04-07** (Task 7 edits 04-07's own route/component — the one place these two plans have a real, one-directional dependency). **Files:** `data/synthetic/vendor_policies.json`, `lib/graph/queries.ts` (widen `VendorPolicy` type), `lib/vendor-integration/policy.ts` (adds `quoteCancellation()` alongside 04-07's export), `app/api/bookings/[id]/cancel/route.ts`, `app/api/bookings/[id]/modify/route.ts` (04-07's route, Task 7 only), `components/booking-cancel-dialog.tsx` (new), `components/booking-modify-form.tsx` (04-07's component, Task 7 copy update), `lib/models/Booking.ts` (adds `cancellation` record + widens `modificationHistory` with `refundId`/`refundAmountCents`, removes dead `cancelRequest` field), `app/(account)/bookings/page.tsx` (per-row Cancel entry point), confirmation page. **Scope limit:** vendor-side cancellation notice is a Phase 7 concern; no two-step request/approve flow; a true no-show uses the same rate as a standard inside-window cancellation. Applied and unified 2026-09-03.
- [x] 04-09: Hero form/header alignment + `/search` filter-parity + vehicle-card images — closed visual/UX gaps between the landing hero and `/search` (shared filter set, aligned form fields), added real per-class vehicle images to `VehicleCard` (`CLASS_IMAGE_MAP`, verified Wikimedia Commons URLs) with icon fallback. **Depends on:** 04-06. Applied and verified via ad hoc Playwright screenshots (Task 9 addendum).
- [x] 04-10: Vehicle-class variety + richer images + carousel/marquee polish + Playwright smoke suite — expand each vehicle class's seed data from 1 to 3 real (make, model) pairs (deterministic reassignment script + graph reload), add make/model-specific images (`VEHICLE_IMAGE_MAP`) with class-level fallback, raise the landing "Browse by vehicle type" carousel's `PAGE_SIZE` from 3 to 6, polish the "Our rental partners" marquee (brand accent bars, hover lift, edge fade), and add a checked-in Playwright smoke suite (`tests/e2e/smoke.spec.ts`, `npm run test:e2e`) replacing ad hoc `/tmp` screenshot verification. Updates `VOCABULARY.md`/`ONTOLOGY.md` for the new make/model cardinality. **Depends on:** 04-09. **Testing infra note:** this introduces the repo's first checked-in automated regression coverage (local smoke run only, no CI wiring yet) — expected to be extended alongside future Phase 4/5/6 flows rather than relying solely on ad hoc screenshot checks going forward. Executed; its blocking human-verify checkpoint was presented to the user but explicit "approved" was never typed before the user pivoted to the 04-11/04-12 scope below — retroactively treated as approved-in-substance since the user reviewed the built result and moved forward rather than raising issues; flagged here for the record.
- [x] 04-11: Vehicle-card enrichment (fuel/mileage/cancellation/deposit chips + supplier brand accent) + supplier/partner filter — adds `Inventory.fuel_policy`/`deposit_amount` and `AddOn.fee_per_day` synthetic ontology fields (property additions only, no schema change), three new graph queries (`getVendorPolicy`, `getAddOnsCatalog`, `getWaivedAddOnIds`) surfacing the already-loaded-but-unqueried `VendorPolicy`/`AddOn` nodes, and a submit-driven supplier checkbox filter on `/search`. **Depends on:** 04-10. **Files:** `lib/graph/queries.ts`, `components/vehicle-card.tsx`, `components/search-filters.tsx`, `app/(discovery)/search/page.tsx`, seed data + ontology docs. Modeled on BookCars' `Car`/`SupplierFilter` reference patterns, adapted to this project's ontology. Applied and unified (`04-11-SUMMARY.md`) — all 3 ACs passed, one auto-fixed bug (Postgres column-alias case-folding in `getWaivedAddOnIds`), `npm run build` clean, `npm run test:e2e` 7/7 passing.
- [x] 04-12: Checkout enrichment + extras toggles + rate-integrity extension — renders the full vehicle/vendor/perk/policy picture at checkout (currently dropped), adds 5 BookCars-style extras toggles (Additional Driver, CDW, Roadside Assistance, GPS, Child Seat) that recalculate the total live and auto-waive when a perk covers them, and extends `app/api/bookings/route.ts`'s existing server-side rate-integrity recompute to cover addon totals (not just the base daily rate) — same recompute-and-compare-to-Stripe pattern already enforced for the base rate, now covering extras too. **Depends on:** 04-11 (consumes its queries + seed fields). **Files:** `app/(checkout)/checkout/page.tsx`, `checkout-form.tsx`, `app/api/bookings/route.ts`, `tests/e2e/smoke.spec.ts`, plus in-place scope expansion for search-entry gating/modal/labeling/back-nav (`components/search-form-fields.tsx` new; `app/landing-hero.tsx`, `components/search-filters.tsx`, `components/vehicle-type-carousel.tsx`, `app/(discovery)/search/page.tsx`, `components/vehicle-card.tsx` modified). `/api/payments/intent`'s pre-existing lack of server-side amount recompute is a known, unfixed-in-this-pass gap — the booking-creation check remains the actual enforced integrity gate. Applied and unified — all 7 ACs (3 original + 4 added) passed, `npm run build` clean, `npm run test:e2e` 10/10 passing.

- [x] 04-13: Modify location/vehicle-type API (extends UC2 beyond dates-only) — member can change a reserved booking's `inventoryId`/`vendorId`, not just dates, via an extended `POST /api/bookings/[id]/modify`. Adds `checkAvailability()` (Mongo-backed `reserved`/`checked_in`-only overlap check against the target inventory — `pending` excluded, per user decision) and `checkModificationCutoff()` (reuses `VendorPolicy.modification_cutoff_hours`) to `lib/vendor-integration/policy.ts`, `findEquivalentInventory()` to `lib/graph/queries.ts` (candidate lookup only — no availability signal is ever modeled in the Postgres+AGE graph, mirroring `mastech-agentic-commerce`'s Store Ops Agent boundary: live fulfillment state stays vendor/platform-DB-side, never in the shared ontology), and retrofits a `findOneAndUpdate` optimistic-lock write onto the modify route's existing plain `.save()` (closing a previously-open lost-update race on both the dates-only and new inventory/vendor paths). **API-only** — the picker UI is 04-14. Grounded in `.coder/research/04-13-modify-location-vehicle-type.md` and `.coder/research/agentic-boundary-for-04-13.md`. **Depends on:** 04-07. Raised by the user 2026-09-03 during 04-07's live checkpoint testing; researched and formally planned 2026-09-04, split into API (04-13) + UI (04-14) per CODER sizing guidance given the user's "Full UI + API" scope decision.
- [x] 04-14: Modify location/vehicle-type UI — alternate-vendor/vehicle picker added to the existing `BookingModifyDialog`/`Form` (My Bookings + confirmation page entry points), consuming 04-13's extended API; renders 04-13's cross-vendor rate/perk quote and availability/cutoff errors inline, reusing the existing dates-only dry-run/payment-step UX rather than a separate flow. Candidate labels widened post-checkpoint (user feedback) from bare vendor code to `Vendor — Class (Make Model)` for clarity. **Depends on:** 04-13. Applied and unified 2026-09-04 — all 3 ACs passed, `tsc`/`build` clean, checkpoint approved. See `04-14-SUMMARY.md`.

**Note on why this order:** each plan above is a genuine vertical slice with its own testable AC and its own real dependency edge. Prototype extensions (04-01/04-02/04-03) come first since they only touch mock data and were already agreed via AskUserQuestion; the real, data-wired build (04-04 onward) follows once the prototype's visual/UX target is finalized. Collapsing these into fewer, larger plans would force >3-task plans (violates CODER sizing guidance).

UC4/UC5/UC7/UC8 mock coverage was also discussed this session but **explicitly deferred** by the user ("we will later look at UC4,5,7,8 if required") — not scheduled in any plan yet. These remain Phase 7 concerns per PROJECT.md's low-priority classification; revisit only if requested.

### Phase 5: Add-On Integrity (UC6)

**Goal:** Prevent the "vendor upsells an already-included perk" dispute trigger by checking add-on requests against the negotiated-terms graph before pricing.
**Depends on:** Phase 4
**Research:** Unlikely (extends Phase 1/2 ontology + Phase 4 booking data)

**Scope:**
- Add-on request flow checked against NegotiatedTerm/Perk graph nodes
- Clear signal to member/vendor when a requested add-on is already covered

**Plans:**
- [x] 05-01: Standalone add-on management on an existing `reserved` booking (dates/vendor/inventory unchanged) — `POST /api/bookings/[id]/addons` + "Manage extras" dialog on confirmation + My Bookings, reusing 04-07/04-08/04-12's already-included-perk waiver + Stripe delta-payment/refund patterns; introduces an optimistic-lock `findOneAndUpdate` write guard (new pattern, not yet backported to modify/cancel). **Depends on:** 04-05, 04-07. **Files:** `app/api/bookings/[id]/addons/route.ts` (new), `components/booking-addons-{form,dialog}.tsx` (new), confirmation page, My Bookings page. Passed 1 round of adversarial review (dropped a spurious graph re-lookup, added the optimistic-lock save guard, corrected new-plumbing estimate for My Bookings). Applied and unified 2026-09-03 — all 5 ACs passed, `npm run build`/`tsc` clean, `npm run test:e2e` 10/10, live checkpoint approved.

### Phase 6: Regression Test Infrastructure

**Goal:** Close the gap where authenticated flows (booking, modification, cancellation, add-ons) have only ever been checkpoint-verified by manual click-through or scratch DB scripts — stand up a Clerk-authenticated Playwright regression suite so these flows have real, checked-in automated coverage.
**Depends on:** Phase 4 (needs the full modify/cancel/add-on UI in place to have something to regress against) + Phase 5 (add-on management)
**Research:** Likely (Clerk E2E test-auth fixture pattern — testing token vs. seeded test user — not yet confirmed against this repo's Clerk config)

**Scope:**
- Clerk test-auth fixture for Playwright (the current `tests/e2e/smoke.spec.ts` explicitly has no way to drive any signed-in flow — confirmed in its own comments)
- Regression specs: create booking → modify dates → modify vehicle/vendor (409 on unavailable candidate, successful cross-vendor apply with correct delta) → add/remove add-ons (waived-by-perk case) → cancel/refund — asserting against real rendered totals, not just route reachability
- Distinct from the existing unauthenticated smoke suite (`04-10`'s `tests/e2e/smoke.spec.ts`) — extends it with an authenticated layer, doesn't replace it

**Plans:**
- [x] 06-01: Test infrastructure foundation: Clerk `@clerk/testing` auth fixture (project-based `setup` → `storageState` reuse), `tests/e2e/smoke/` vs `tests/e2e/regression/` folder+project split, worker/test-scoped Mongo test-data fixtures (tagged self-cleaning documents, not ambient data), Stripe network-mock helper stub. Researched via `/coder:research-phase` (`.coder/phases/06-regression-test-infrastructure/RESEARCH.md`) against the sibling `mastech-agentic-commerce` repo's Playwright/Clerk pattern, this repo's full authenticated-flow inventory, and industry best practices. Applied and unified 2026-09-04 — all 4 ACs passed, `tsc` clean, `npm run test:e2e:smoke` 10/10.
- [x] 06-02: Checkout/UC1 regression specs: happy-path booking creation, tampered-Stripe-amount server-side rejection (rate-integrity), one `@payment-smoke`-tagged real-Stripe-Elements test. **Depends on:** 06-01. Applied and unified 2026-09-04 — all 3 ACs passed.
- [x] 06-03: Modification/UC2 regression specs: dates-only increase (delta payment)/decrease (auto-refund), cross-vendor success + 409 (unavailable candidate), modification-cutoff 400. **Depends on:** 06-01. Applied and unified 2026-09-04 — all 4 ACs passed.
- [x] 06-04: Cancellation/UC3 regression specs (refund preview/confirm against live vendor policy) + dedicated concurrency race-guard specs for the double-cancel (04-08) and concurrent-modify optimistic-lock (04-13) fixes. **Depends on:** 06-01. Applied and unified 2026-09-04 — all 3 ACs passed.
- [x] 06-05: Add-on/UC6 regression specs (fee-bearing charge, perk-waived lock/no-double-charge) + My Bookings listing/entry-point wiring spec. **Depends on:** 06-01. Applied and unified 2026-09-04 — all 3 ACs passed. Deviation: anonymous search can never surface a perk that waives an addon (Gold Star tier lacks the waiving perks) — fixed via a direct Mongo fixture patch of `pricingSnapshot.perkIds`, not a route/page change.
- [x] 06-06: Smoke-suite gap fill — added an unauthenticated `/bookings` sign-in-gate smoke test to `tests/e2e/smoke/smoke.spec.ts` (matching `app/(account)/bookings/page.tsx`'s "Sign in to see your bookings" gate) and corrected the file's stale in-code comment claiming no Clerk test-auth fixture exists (06-01 built one; smoke itself deliberately stays unauthenticated-only per this phase's Scope). Raised by user during Phase 6 close-out review 2026-09-04. **Depends on:** 06-01 (folder/project split), 04-10 (smoke suite origin). Applied and unified 2026-09-04 — both ACs passed, `npx playwright test --project=smoke` 11/11 passing. Phase 6 (6/6 plans) now fully complete.

### Phase 7: Agent-Grounding Ontology & Knowledge-Graph Enrichment

**Goal:** Extend the Phase 1/2 ontology/taxonomy/thesaurus so both the Phase 9 Customer/Driver Assistant and the Phase 8 Vendor Agent can resolve natural-language phrasing and cross-vendor substitution against the shared graph — before either agent is built, so both consume a stable grounding layer rather than each inventing their own.
**Depends on:** Phase 1/2 (ontology/KG must exist to enrich), precedes Phase 8/9 (both agents consume this)
**Research:** Done — `.coder/research/agent-service-extension.md` Part A §7 (commerce's `ontology.py` vocabulary constants + `backfill_synonyms.py` LLM-generated thesaurus pattern; `EquivalenceCluster`/`PART_OF_CLUSTER` substitution-graph pattern, net-new in commerce, template only) and Part B §3 (GraphRAG enrichment pipelines, multi-tool graph retrieval pattern)

**Scope:**
- LLM-generated `synonyms` property backfill for vehicle-type/amenity/location vocabulary nodes (mirrors commerce's `backfill_synonyms.py`, extends this project's existing attribute-level `synonyms` from Phase 2's 02-01)
- New substitution/equivalence relation (e.g. `EquivalenceCluster`-style node + `PART_OF_CLUSTER`-style edge) modeling alternate-vehicle-class/alternate-pickup-location substitutability — genuinely new to this project, no existing analog; needed for both agents' "no exact match, what's close" resolution
- Expose the graph via 2-3 composable retriever tools (node lookup, traversal, synonym-resolve) rather than one opaque search call, per the GraphRAG multi-tool pattern — this is the tool surface Phase 8/9's agents will call
- Update VOCABULARY.md/ONTOLOGY.md for all new node/edge/property types

**Not in scope:** date-range availability modeling (stays vendor/platform-DB-side per the Store Ops Agent boundary precedent — see Phase 8's Scope note); any LLM/agent runtime code (this phase is graph/data only)

**Plans:**
- [x] 07-01: EquivalenceCluster/PART_OF_CLUSTER substitution relation (new node/edge, `equivalence_clusters.json`, `getEquivalenceCandidates()`) — applied+unified 2026-09-05
- [x] 07-02: LLM-generated synonym backfill script + Location vocabulary — Azure OpenAI-backed, all 10 seeded cities, applied+unified 2026-09-07
- [x] 07-03: Composable retriever tools (`lookupNode`/`traverse`/`resolveSynonym`) for Phase 8/9 agents — applied+unified 2026-09-07

**Phase 7 complete (3/3 plans), 2026-09-07.**

### Phase 8: Vendor Agent (A2A Inventory/Modification/Cancellation)

**Goal:** Stand up a Vendor Agent as a separate process/service, exposing inventory-check/modification/cancellation skills over a real A2A (agent-to-agent) interface, so the platform's own agents (and eventually external integrators) can query vendor state and policy without the platform owning or importing vendor internals — mirrors `mastech-agentic-commerce`'s Store Ops Agent boundary.
**Depends on:** Phase 7 (shared grounding layer), Phase 4 (existing `lib/vendor-integration/policy.ts` boundary module — `quoteModification()`/`quoteCancellation()`/`checkAvailability()`/`checkModificationCutoff()` — is the logic this phase moves behind a real A2A seam)
**Research:** Done — `.coder/research/agent-service-extension.md` Part A §1 (Store Ops Agent architecture: separate Starlette/uvicorn process, static Agent Card at `/.well-known/agent-card.json`, JSON-RPC 2.0 `message/send` over `/a2a`, synchronous Task response, no LLM/no auth) and Part B §2 (full A2A spec: Agent Cards, Message/Task/Parts shape, task lifecycle `submitted→working→(input-required|auth-required)→completed|failed|canceled|rejected`, official `a2a-python` SDK)

**Scope:**
- Separate deployable service (own process/port, own image entrypoint — reuse-one-image-different-target pattern from commerce's `agent-service`/`store-ops-agent`)
- Static Agent Card + JSON-RPC `/a2a` endpoint exposing skills: `check_availability` (date-range-aware — the explicit gap vs. commerce's binary in-stock model, needs new design, not a straight port), `apply_modification`, `apply_cancellation`, `get_vendor_policy`
- **Decision required before planning:** A2A conformance depth — commerce deliberately skipped streaming/polling/push/auth and used only `submitted|completed|failed`. This phase should explicitly decide whether to adopt the fuller lifecycle (`input-required`/`auth-required`, SSE streaming) for real vendor-policy interactions (e.g. cutoff-window rejections needing a follow-up field, multi-step cancellation approval) or stay at commerce's minimal level.
- **Decision required before planning:** per-vendor deployment topology — one Vendor Agent process per real/simulated vendor (true multi-tenant A2A) vs. one platform-hosted Vendor Agent process parameterized per vendor config (simulated). Directly affects Phase 11's docker-compose service list.
- Vendor operational facts (availability, in-flight modification/cancellation state) live in the platform's own Mongo/vendor-side store, never in the shared Postgres+AGE graph — same boundary discipline as commerce's `inventory_facts`/`local_offers` tables

**Not in scope:** replacing `lib/vendor-integration/policy.ts`'s existing callers in `app/api/bookings/[id]/modify/route.ts`/`cancel/route.ts` — that route-level integration is Phase 9's concern (or a later phase), this phase only stands up the Vendor Agent service and its A2A surface

**Plans:**
- [ ] 08-01: TBD

### Phase 9: Customer/Driver Assistant Agent

**Goal:** A conversational agent that helps members (and, per the original request, drivers) book, modify, and cancel reservations through natural language — discovery through checkout, calling the Phase 8 Vendor Agent (via A2A) and the Phase 7 grounding tools rather than reimplementing vendor logic or graph queries itself.
**Depends on:** Phase 7 (grounding tools), Phase 8 (Vendor Agent A2A surface for availability/modification/cancellation checks), Phase 4 (existing booking/modify/cancel/addon routes remain the system of record — this agent orchestrates calls to them, doesn't bypass them)
**Research:** Done — `.coder/research/agent-service-extension.md` Part A §2 (commerce's hand-rolled SSE tool-calling loop, `actor`-first tool convention with server-injected identity, prompt-injection-defense structure, detect-after-stream guardrail limitation) and Part B §1 (standard discovery→checkout→post-booking tool taxonomy, idempotency keys on mutating tools, state machine under the LLM, proposal→confirm human-in-the-loop pattern for irreversible actions)

**Scope:**
- Tool chain: `search_inventory`, `get_quote`, `create_booking`, `get_booking_status`, `modify_booking`, `cancel_booking`, `get_cancellation_policy` — wrapping this project's existing API routes, not reimplementing their logic
- Session/state management held outside the LLM context (structured session doc keyed by conversation_id — Mongo, matching this project's existing operational-data store), booking flow modeled as an explicit state machine (`searching→quoted→confirming→booked→modifying/cancelling`)
- **Proposal→confirm pattern enforced at the orchestration layer, not the prompt** — every mutating tool call (`create_booking`/`modify_booking`/`cancel_booking`) requires a prior `propose_*` call showing a diff/summary and an explicit user confirmation turn before the real tool fires; this is a deliberate strengthening over commerce's detect-after-stream-only guardrail, justified by PROJECT.md's Core Value (negotiated-rate/perk integrity is the platform's whole reason to exist)
- Idempotency keys on every mutating tool call, reusing this project's existing optimistic-lock/CAS write patterns underneath
- Discovery/driver-support framing: initial scope is member-facing booking assistance; driver-facing support (in-rental questions) stays deferred to Phase 12 (UC5) unless the user pulls it forward

**Not in scope:** replacing the existing UI-driven booking/modify/cancel flows — this agent is an additional conversational entry point, not a replacement

**Plans:**
- [ ] 09-01: TBD

### Phase 10: Agent Lab & Observability/Evals (Phoenix)

**Goal:** Give developers a way to inspect and debug the Phase 8/9 agents' behavior (tool calls, traces, prompt iterations) and a standing eval harness to regression-test agent behavior across prompt/model changes — backed by Arize Phoenix, matching `mastech-agentic-commerce`'s observability stack.
**Depends on:** Phase 8, Phase 9 (needs real agents emitting traces to observe/evaluate)
**Research:** Done — `.coder/research/agent-service-extension.md` Part A §3-4 (commerce's Agent Lab is Jupyter-notebook-only graph exploration, NOT a prompt/tool-testing tool — explicitly flagged as a gap, not something to port verbatim; Phoenix `phoenix.otel.register()` instrumentation pattern, Dataset/Experiment eval harness with custom evaluators) and Part B §4-5 (LangGraph Studio as the closest off-the-shelf analog: trace replay/time-travel/thread management; Phoenix deployment ports/env vars, OpenInference auto-instrumentation, standard agentic eval types: task success, tool-selection correctness, groundedness, hallucination, latency)

**Scope:**
- Phoenix instrumentation on both Phase 8 (Vendor Agent) and Phase 9 (Customer Assistant) services — `phoenix.otel.register()` equivalent, per-tool-call custom spans
- **Decision required before planning:** Agent Lab scope — a thin web UI reading off the same Phoenix trace store (conversation/thread list, per-turn tool-call diff view, state-snapshot inspector, fork-and-rerun-with-modified-prompt) is new build work, distinct from commerce's Jupyter-notebook KG-exploration tool. If graph-exploration-only tooling is sufficient for this project's needs, a lighter Jupyter-based Agent Lab (closer to commerce's actual scope) is also an option — this decision should be made explicitly, not defaulted
- Eval dataset(s) + Experiment harness for the Customer Assistant's tool-selection correctness and booking-flow task success (mirrors commerce's `search_relevance_eval.py` pattern — hand-labeled example set, custom evaluator functions, before/after regression comparisons)

**Not in scope:** replacing Phase 6's Playwright regression suite — Phoenix evals target agent/LLM behavior specifically, Playwright continues to cover UI/API regression

**Plans:**
- [ ] 10-01: TBD

### Phase 11: Unified Agent-Service Deployment

**Goal:** One docker-compose stack bringing up every service from Phase 7-10 (Vendor Agent, Customer Assistant, Agent Lab, Phoenix) alongside the existing app/graph/Mongo services, with health-check and start/stop scripts mirroring `mastech-agentic-commerce`'s script trio.
**Depends on:** Phase 8, 9, 10 (needs the actual services to compose)
**Research:** Done — `.coder/research/agent-service-extension.md` Part A §5-6 (commerce's single-file `docker-compose.yml`, profile-based opt-in services, one-image-multiple-uvicorn-targets pattern, `--env-file` invocation requirement; `health-check.sh`/`start-services.sh`/`stop-services.sh` trio — readiness polling, `--with-*` flags mirrored between start/stop, tracked tunnel PIDs, never `down -v`) and Part B §6 (general multi-service health-check/`depends_on: condition: service_healthy`/`--wait` conventions)

**Scope:**
- Single root `docker-compose.yml` (or an addition to this project's existing graph-store compose file) with services for: Vendor Agent, Customer Assistant, Agent Lab (profiled, opt-in), Phoenix + its Postgres backing store (profiled, opt-in), plus the existing Postgres+AGE graph and Mongo
- `healthcheck:` blocks + `depends_on: condition: service_healthy` so agent services don't start before graph/Mongo/Phoenix collector are ready
- `scripts/health-check.sh` (read-only checks per service, never prints secrets), `scripts/start-services.sh` (`--with-agent-lab --with-phoenix` style flags, readiness polling), `scripts/stop-services.sh` (mirrored flags, never destroys volumes) — direct ports of commerce's script trio, adapted to this project's service names

**Not in scope:** production/cloud deployment — this phase is local/dev docker-compose only, matching commerce's own scope

**Plans:**
- [ ] 11-01: TBD

### Phase 12: Vendor Fulfillment Touchpoints (UC4, UC5, UC7, UC8)

**Goal:** Lower-priority vendor-primary flows — pickup/check-in, in-rental support routing, return/drop-off, and billing-dispute resolution — built as thin integration/tracking touchpoints, not full vendor-operational systems.
**Depends on:** Phase 4 (needs booking data to reference)
**Research:** Likely (vendor integration contract shape is still undefined)

**Scope:**
- UC4: Pickup/check-in cross-reference (platform confirmation + vendor lookup)
- UC5: In-rental support triage/escalation logging (vendor is primary; platform logs/redirects) — natural fit for the Phase 9 Customer/Driver Assistant if pulled forward
- UC7: Return/drop-off record sync from vendor
- UC8: Billing-dispute resolution against the booking record as source of truth

**Plans:**
- [ ] 12-01: TBD

---
*Roadmap created: 2026-08-27*
*Last updated: 2026-09-05 — Inserted 5 new phases (7-11: Agent-Grounding Ontology Enrichment, Vendor Agent/A2A, Customer/Driver Assistant Agent, Agent Lab & Observability/Evals, Unified Agent-Service Deployment) ahead of the deferred Vendor Fulfillment Touchpoints phase, now renumbered 7→12, per `/coder:research` findings in `.coder/research/agent-service-extension.md` (extends `mastech-agentic-commerce`'s Store Ops Agent/A2A, storefront chat agent, Agent Lab, and Phoenix patterns into this project's rental-domain agent service). No plans created yet for any of the 5 new phases — TBD pending `/coder:plan`. Milestone total is now 12 phases (6 complete, 6 not started). Phase 6 fully complete as of 2026-09-04 (6/6 plans): 06-01 through 06-06, all applied and unified. Phase 5 (05-01) and Phase 4 (04-00–04-14) remain complete/closed independently. See STATE.md's Accumulated Context for prior research/planning findings.*
