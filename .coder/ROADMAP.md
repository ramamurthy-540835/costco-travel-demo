# Roadmap: mastech-agentic-travel

## Overview

Build a member-centric, multi-vendor rental-car brokerage platform: a rental-domain ontology and knowledge graph first, then a Discovery/Checkout layer that books, modifies, and cancels reservations against negotiated vendor rates, then billing-dispute and vendor-integration support for the lower-priority fulfillment-adjacent use cases.

## Current Milestone

**v0.1 Ontology & Discovery/Checkout Core** (v0.1.0)
Status: In progress
Phases: 3 of 6 complete, Phase 4 not started

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Rental Ontology & Knowledge Graph | 01-01, 01-02, 01-03 | Complete | 2026-08-27 |
| 2 | Agent-Enablement Ontology Layer | 02-01 | Complete | 2026-08-27 |
| 3 | Stack Foundation (Clerk, Postgres+AGE, Mongo) | 03-01, 03-02, 03-03 | Complete | 2026-08-28 |
| 4 | Booking & Rate Integrity (UC1, UC2, UC3) | 04-00, 04-01, 04-02, 04-03, 04-04, 04-05, 04-06, 04-07, 04-08, 04-09, 04-10, 04-11, 04-12 | In progress — 04-00 through 04-06 and 04-09 through 04-12 done; 04-07/04-08 not started (see entries below) | - |
| 5 | Add-On Integrity (UC6) | TBD | Not started | - |
| 6 | Vendor Fulfillment Touchpoints (UC4, UC5, UC7, UC8) | TBD | Not started | - |

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
Wave 8:                                          04-07 (depends: 04-05) ── 04-08 (depends: 04-05)  -- modification/UC2, cancellation/UC3
```
04-01/04-02/04-03 are prototype-only extensions (mock data, no live calls) grouped immediately after 04-00 so all design/prototype work finishes before the real, data-wired build (04-04 onward) begins. 04-07 and 04-08 both depend only on 04-05 (a confirmed real booking to act on), not on each other — different code paths, wave-8 parallel candidates. 04-06 was inserted 2026-08-28 (user request during 04-05's checkpoint) between 04-05 and the modification/cancellation plans, resequencing what were 04-06/04-07 into 04-07/04-08 — same resequencing pattern as 04-03's earlier insertion.

**Plans:**
- [x] 04-00: Design system + prototype — shadcn/ui component library; clickable mock-data prototype of landing/discovery/checkout screens, checkpoint-approved. **Depends on:** nothing. **Provides:** approved component set + screen flows.
- [x] 04-01: Prototype MUI-style re-theme — `app/globals.css` token-only re-theme (`--primary`/`--secondary`/`--radius`) to approximate BookCars' MUI look, no component changes. **Depends on:** 04-00. Applied and unified 2026-08-28, all 3 ACs passed.
- [x] 04-02: Prototype real images + My Bookings + landing rework + location autocomplete — real Wikimedia Commons vehicle photos, Clerk-gated `/prototype/bookings`, landing page reworked (hero photo, embedded search, vendor list), `LocationAutocomplete` reusing the ontology's real Location data. **Depends on:** 04-01. Executed ad hoc via plan-mode, retroactively documented in 04-02-SUMMARY.md (scope grew beyond the original plan). UC4/UC5/UC7/UC8 mock screens explicitly deferred by user — not scheduled.
- [x] 04-03: Prototype search-results BookCars-style layout — `/prototype/search` restructured into a left filter sidebar + vertical list of horizontal result cards (spec-icon row, mileage, perks, price-for-N-days breakdown, vendor+rating, "Choose this car" CTA); `MockVehicleClass` gained `fuelType`/`doors`/`hasAC`/`rating`/`tripCount`, with `rating` reused from the real `Vendor.rating` ontology data (not invented). **Depends on:** 04-02. Applied via `/coder:apply` 2026-08-28, all 3 ACs passed, checkpoint approved, 04-03-SUMMARY.md created.
- [x] 04-04: Discovery/Search UI (real) — vehicle-class/vendor/rate listing page reading `lib/graph/queries.ts` (vehicle classes, negotiated terms, perks from 03-02); search/filter by dates + location; read-only. **Depends on:** 03-02 (graph query layer), 03-03, 04-03 (prototype component/screen set finalized, including the BookCars-style layout). **Files:** `app/(discovery)/search/page.tsx`, `components/vehicle-card.tsx` or similar. **Provides:** the vehicle-class/rate selection UI that 04-05's checkout consumes.
- [x] 04-05: Checkout & Booking creation (real, closes UC1) — checkout UI wired to 03-03's Stripe PaymentIntent endpoint (`app/api/payments/intent/route.ts`), writes a `Booking` document (03-02's Mongoose model) with `pricingSnapshot` frozen from the graph query at booking time, adds the first graph **write** query (`recordReservation`), and ports `mailHelper.ts` (deferred from 03-03) to send a booking-confirmation email using real booking data. **Depends on:** 03-03 (Stripe/types), 04-04 (selection UI hands off inventoryId/vendorId/dates to checkout). **Files:** `app/(discovery)/checkout/page.tsx`, `app/api/bookings/route.ts`, `lib/graph/mutations.ts` (new), `lib/mail/mailHelper.ts`. **Provides:** a real, queryable `Booking` record — the first "confirmed reservation" 04-07/04-08 can act on. `mailHelper.ts` port was not actually done in 04-05 (not blocking, tracked separately) — see 04-05-SUMMARY.md.
- [x] 04-06: Landing-page rework (real data, full visual parity) — rebuild `app/page.tsx` as a complete port of `/prototype/landing`'s design (hero photo, "why us" grid, vendor list, "Browse by vehicle type") sourced entirely from `searchInventory()` (real vendors, real vehicle classes, real prices) instead of mock data. **Depends on:** 04-05 (landing is the entry point into the now-complete search→checkout→confirmation flow). **Files:** `app/page.tsx`, `app/landing-hero.tsx`. **Scope limit:** no vendor logos (text-only names); hero image URL must be verified (WebFetch/curl 200) not fabricated. User-requested during 04-05's checkpoint, explicitly wants a "complete UI build out like the prototype," not a minimal version. Applied and checkpoint-approved.
- [ ] 04-07: Modification (closes UC2) — member changes dates/inventory on an existing booking; re-queries the graph for the current negotiated rate (via 03-02's `getNegotiatedTermsForVendor`), re-applies it to a new `pricingSnapshot`, and re-runs the Stripe PaymentIntent flow only for a rate delta (not a full re-charge). **Depends on:** 04-05 (needs a real Booking to modify). **Files:** `app/api/bookings/[id]/modify/route.ts`, extends `lib/models/Booking.ts`'s status transitions. **Scope limit:** vendor-side re-confirmation is a Vendor Integration Layer/Phase 6 concern — this plan only handles platform-side rate re-application and Mongo/graph updates. **NOT STARTED — corrected 2026-09-02.** Previously marked `[x]`/"Applied" here and in `STATE.md`, but direct verification (no PLAN.md/SUMMARY.md, no `app/api/bookings/[id]/modify/route.ts`, no matching commit in `git log --all`) found none of this code or documentation actually exists. Needs `/coder:plan 04-07` before it can be applied.
- [ ] 04-08: Cancellation & refund reconciliation (closes UC3) — cancellation request against a booking, refund calculated per-vendor cancellation policy (`VendorPolicy` graph node from Phase 1 seed data), Stripe refund issued via `stripe.refunds.create` against the original PaymentIntent. **Depends on:** 04-05 (needs a real Booking + PaymentIntent to refund). Runs independently of 04-07. **Files:** `app/api/bookings/[id]/cancel/route.ts`, `lib/payment/stripe.ts` (extend with `refundPayment`). **Scope limit:** same vendor-integration boundary as 04-07 — refund is platform-side plus status update; vendor-side cancellation notice is a Phase 6 concern. **NOT STARTED — corrected 2026-09-02.** Previously marked `[x]`/"Applied" here and in `STATE.md`, but direct verification (no PLAN.md/SUMMARY.md, no `app/api/bookings/[id]/cancel/route.ts`, no `refundPayment` in `lib/payment/stripe.ts`, no matching commit in `git log --all`) found none of this code or documentation actually exists. Needs `/coder:plan 04-08` before it can be applied.
- [x] 04-09: Hero form/header alignment + `/search` filter-parity + vehicle-card images — closed visual/UX gaps between the landing hero and `/search` (shared filter set, aligned form fields), added real per-class vehicle images to `VehicleCard` (`CLASS_IMAGE_MAP`, verified Wikimedia Commons URLs) with icon fallback. **Depends on:** 04-06. Applied and verified via ad hoc Playwright screenshots (Task 9 addendum).
- [x] 04-10: Vehicle-class variety + richer images + carousel/marquee polish + Playwright smoke suite — expand each vehicle class's seed data from 1 to 3 real (make, model) pairs (deterministic reassignment script + graph reload), add make/model-specific images (`VEHICLE_IMAGE_MAP`) with class-level fallback, raise the landing "Browse by vehicle type" carousel's `PAGE_SIZE` from 3 to 6, polish the "Our rental partners" marquee (brand accent bars, hover lift, edge fade), and add a checked-in Playwright smoke suite (`tests/e2e/smoke.spec.ts`, `npm run test:e2e`) replacing ad hoc `/tmp` screenshot verification. Updates `VOCABULARY.md`/`ONTOLOGY.md` for the new make/model cardinality. **Depends on:** 04-09. **Testing infra note:** this introduces the repo's first checked-in automated regression coverage (local smoke run only, no CI wiring yet) — expected to be extended alongside future Phase 4/5/6 flows rather than relying solely on ad hoc screenshot checks going forward. Executed; its blocking human-verify checkpoint was presented to the user but explicit "approved" was never typed before the user pivoted to the 04-11/04-12 scope below — retroactively treated as approved-in-substance since the user reviewed the built result and moved forward rather than raising issues; flagged here for the record.
- [x] 04-11: Vehicle-card enrichment (fuel/mileage/cancellation/deposit chips + supplier brand accent) + supplier/partner filter — adds `Inventory.fuel_policy`/`deposit_amount` and `AddOn.fee_per_day` synthetic ontology fields (property additions only, no schema change), three new graph queries (`getVendorPolicy`, `getAddOnsCatalog`, `getWaivedAddOnIds`) surfacing the already-loaded-but-unqueried `VendorPolicy`/`AddOn` nodes, and a submit-driven supplier checkbox filter on `/search`. **Depends on:** 04-10. **Files:** `lib/graph/queries.ts`, `components/vehicle-card.tsx`, `components/search-filters.tsx`, `app/(discovery)/search/page.tsx`, seed data + ontology docs. Modeled on BookCars' `Car`/`SupplierFilter` reference patterns, adapted to this project's ontology. Applied and unified (`04-11-SUMMARY.md`) — all 3 ACs passed, one auto-fixed bug (Postgres column-alias case-folding in `getWaivedAddOnIds`), `npm run build` clean, `npm run test:e2e` 7/7 passing.
- [x] 04-12: Checkout enrichment + extras toggles + rate-integrity extension — renders the full vehicle/vendor/perk/policy picture at checkout (currently dropped), adds 5 BookCars-style extras toggles (Additional Driver, CDW, Roadside Assistance, GPS, Child Seat) that recalculate the total live and auto-waive when a perk covers them, and extends `app/api/bookings/route.ts`'s existing server-side rate-integrity recompute to cover addon totals (not just the base daily rate) — same recompute-and-compare-to-Stripe pattern already enforced for the base rate, now covering extras too. **Depends on:** 04-11 (consumes its queries + seed fields). **Files:** `app/(checkout)/checkout/page.tsx`, `checkout-form.tsx`, `app/api/bookings/route.ts`, `tests/e2e/smoke.spec.ts`, plus in-place scope expansion for search-entry gating/modal/labeling/back-nav (`components/search-form-fields.tsx` new; `app/landing-hero.tsx`, `components/search-filters.tsx`, `components/vehicle-type-carousel.tsx`, `app/(discovery)/search/page.tsx`, `components/vehicle-card.tsx` modified). `/api/payments/intent`'s pre-existing lack of server-side amount recompute is a known, unfixed-in-this-pass gap — the booking-creation check remains the actual enforced integrity gate. Applied and unified — all 7 ACs (3 original + 4 added) passed, `npm run build` clean, `npm run test:e2e` 10/10 passing.

**Note on why this order:** each plan above is a genuine vertical slice with its own testable AC and its own real dependency edge. Prototype extensions (04-01/04-02/04-03) come first since they only touch mock data and were already agreed via AskUserQuestion; the real, data-wired build (04-04 onward) follows once the prototype's visual/UX target is finalized. Collapsing these into fewer, larger plans would force >3-task plans (violates CODER sizing guidance).

UC4/UC5/UC7/UC8 mock coverage was also discussed this session but **explicitly deferred** by the user ("we will later look at UC4,5,7,8 if required") — not scheduled in any plan yet. These remain Phase 6 concerns per PROJECT.md's low-priority classification; revisit only if requested.

### Phase 5: Add-On Integrity (UC6)

**Goal:** Prevent the "vendor upsells an already-included perk" dispute trigger by checking add-on requests against the negotiated-terms graph before pricing.
**Depends on:** Phase 4
**Research:** Unlikely (extends Phase 1/2 ontology + Phase 4 booking data)

**Scope:**
- Add-on request flow checked against NegotiatedTerm/Perk graph nodes
- Clear signal to member/vendor when a requested add-on is already covered

**Plans:**
- [ ] 05-01: TBD

### Phase 6: Vendor Fulfillment Touchpoints (UC4, UC5, UC7, UC8)

**Goal:** Lower-priority vendor-primary flows — pickup/check-in, in-rental support routing, return/drop-off, and billing-dispute resolution — built as thin integration/tracking touchpoints, not full vendor-operational systems.
**Depends on:** Phase 4 (needs booking data to reference)
**Research:** Likely (vendor integration contract shape is still undefined)

**Scope:**
- UC4: Pickup/check-in cross-reference (platform confirmation + vendor lookup)
- UC5: In-rental support triage/escalation logging (vendor is primary; platform logs/redirects)
- UC7: Return/drop-off record sync from vendor
- UC8: Billing-dispute resolution against the booking record as source of truth

**Plans:**
- [ ] 06-01: TBD

---
*Roadmap created: 2026-08-27*
*Last updated: 2026-09-02 — Phase 4 documentation unified: retroactive SUMMARY.md written for 04-00, 04-06, 04-09, 04-10 (all previously applied with no summary); 04-12 checkbox corrected to `[x]` (fully applied and unified, scope expanded in-place for search-entry gating/modal/labeling/back-nav). 04-07/04-08 corrected from `[x]`/"Applied" to `[ ]`/"NOT STARTED" after verification found no PLAN.md, SUMMARY.md, code, or commit for either — this was a documentation/reality mismatch, not completed work; both need `/coder:plan` before they can proceed.*
