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
| 4 | Booking & Rate Integrity (UC1, UC2, UC3) | 04-00, 04-01, 04-02, 04-03, 04-04 | Not started | - |
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

**Sequencing (revised 2026-08-28 — split into vertical slices, each ≤3 tasks per CODER sizing guidance):**

```
Wave 1 (parallel, no shared files):     03-03 ─┐
                                         04-00 ─┴─▶ (both must finish)
Wave 2:                                          04-01 (depends: 03-03, 04-00)
Wave 3:                                          04-02 (depends: 04-01)
Wave 4:                                          04-03 (depends: 04-02) ── 04-04 (depends: 04-02)
```
04-03 and 04-04 both depend only on 04-02 (a confirmed booking to act on), not on each other — they touch different code paths (modification vs. cancellation/refund) so they're wave-4 parallel candidates, not a forced chain.

**Plans:**
- [ ] 04-00: Design system + prototype — evaluate shadcn/ui (or similar, matching `mastech-agentic-commerce`'s storefront pattern) as the component library; produce a Figma (or equivalent) clickable prototype of core booking/discovery/checkout screens for user review *before* any production UI code is written. Design should match or improve on BookCars' UX. No code dependency on 03-03 — can be planned/executed now. **Depends on:** nothing. **Provides:** approved component set + screen flows that 04-01/04-02 build against (no revision needed once approved).
- [ ] 04-01: Discovery/Search UI — vehicle-class/vendor/rate listing page reading `lib/graph/queries.ts` (vehicle classes, negotiated terms, perks from 03-02) through 04-00's approved component library; search/filter by dates + location; no booking mutation yet, read-only. **Depends on:** 03-02 (graph query layer), 04-00 (component library + approved screen). **Files:** `app/(discovery)/search/page.tsx`, `components/vehicle-card.tsx` or similar per 04-00's component set. **Provides:** the vehicle-class/rate selection UI that 04-02's checkout consumes.
- [ ] 04-02: Checkout & Booking creation (closes UC1) — checkout UI wired to 03-03's Stripe PaymentIntent endpoint (`app/api/payments/intent/route.ts`), writes a `Booking` document (03-02's Mongoose model) with `pricingSnapshot` frozen from the graph query at booking time, adds the first graph **write** query (`recordReservation` — the write-side counterpart to 03-02's read-only `lib/graph/queries.ts`, closing that deferred item), and ports `mailHelper.ts` (deferred from 03-03) to send a booking-confirmation email using the now-real booking data. **Depends on:** 03-03 (Stripe/types), 04-01 (selection UI hands off inventoryId/vendorId/dates to checkout). **Files:** `app/(discovery)/checkout/page.tsx`, `app/api/bookings/route.ts`, `lib/graph/mutations.ts` (new — write queries, mirrors `queries.ts`'s client), `lib/mail/mailHelper.ts` (ported from BookCars, ties to real `Booking` fields for confirmation content). **Provides:** a real, queryable `Booking` record — the first "confirmed reservation" 04-03/04-04 can act on.
- [ ] 04-03: Modification (closes UC2) — member changes dates/inventory on an existing booking; re-queries the graph for the current negotiated rate (via 03-02's `getNegotiatedTermsForVendor`), re-applies it to a new `pricingSnapshot`, and re-runs the Stripe PaymentIntent flow only for a rate delta (not a full re-charge). **Depends on:** 04-02 (needs a real Booking to modify). **Files:** `app/api/bookings/[id]/modify/route.ts`, extends `lib/models/Booking.ts`'s status transitions (no schema break — status already supports re-entry to `pending`). **Scope limit:** vendor-side re-confirmation of the modified reservation is a Vendor Integration Layer concern (per PROJECT.md's separate-service boundary) — this plan only handles the platform-side rate re-application and Mongo/graph updates, not an actual vendor API call (no vendor integration contract exists yet — Phase 6 concern).
- [ ] 04-04: Cancellation & refund reconciliation (closes UC3) — cancellation request against a booking, refund calculated per-vendor cancellation policy (`VendorPolicy` graph node from Phase 1 seed data, not a hardcoded rule — per PROJECT.md's "vendor cancellation policies vary by contract" constraint), Stripe refund issued via `stripe.refunds.create` against the original PaymentIntent. **Depends on:** 04-02 (needs a real Booking + PaymentIntent to refund). Runs independently of 04-03 (different code path — no file overlap beyond `Booking.ts` status enum, which both plans only append to, never redefine). **Files:** `app/api/bookings/[id]/cancel/route.ts`, `lib/payment/stripe.ts` (extend with a `refundPayment` export, additive to 03-03's file). **Scope limit:** same vendor-integration boundary as 04-03 — refund is platform-side (Stripe) plus status update; actual vendor-side cancellation notice is a Phase 6 concern.

**Note on why this order, not a single "04-01: booking UI" catch-all:** each plan above is a genuine vertical slice with its own testable AC and its own real dependency edge — 04-01 has nothing to check out yet without discovery, 04-02 has nothing to modify/cancel without a real booking. Collapsing these into fewer, larger plans would force >3-task plans (violates CODER sizing guidance) and produce vaguer task `<action>` blocks that would need revision once 04-00's prototype and 03-03's types are actually in hand.

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
*Last updated: 2026-08-28 — Phase 3 complete: 03-01 (Next.js/Clerk scaffold), 03-02 (Mongo + graph query layer), and 03-03 (Stripe PaymentIntent + bookcars-types/Vendor port, live-verified with a real test-mode key) all applied and verified. Phase 4 resequenced into 5 vertical-slice plans (04-00 design, 04-01 discovery/search, 04-02 checkout+booking closing UC1 (also where deferred mailHelper + the deferred graph-write query land), 04-03 modification/UC2, 04-04 cancellation+refund/UC3) so each plan has a real, non-reflexive dependency and stays within CODER's ≤3-task sizing guidance — avoids needing to revise plans mid-APPLY once upstream outputs exist.*
