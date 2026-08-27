# Roadmap: mastech-agentic-travel

## Overview

Build a member-centric, multi-vendor rental-car brokerage platform: a rental-domain ontology and knowledge graph first, then a Discovery/Checkout layer that books, modifies, and cancels reservations against negotiated vendor rates, then billing-dispute and vendor-integration support for the lower-priority fulfillment-adjacent use cases.

## Current Milestone

**v0.1 Ontology & Discovery/Checkout Core** (v0.1.0)
Status: In progress
Phases: 1 of 6 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Rental Ontology & Knowledge Graph | 01-01, 01-02, 01-03 | Complete | 2026-08-27 |
| 2 | Agent-Enablement Ontology Layer | 02-01 | Complete | 2026-08-27 |
| 3 | Stack Foundation (Clerk, Postgres+AGE, Mongo) | TBD | Not started | - |
| 4 | Booking & Rate Integrity (UC1, UC2, UC3) | TBD | Not started | - |
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
- **Port directly:** `backend/src/payment/stripe.ts`, `backend/src/payment/paypal.ts` (framework-agnostic SDK calls) → Next.js API routes/server actions
- **Port directly:** `backend/src/utils/mailHelper.ts` (`nodemailer`/SendGrid) → same library works unchanged in Next.js
- **Port directly:** `mobile/` Expo push notification flow → independent of backend framework
- **Port as base, extend:** `packages/bookcars-types` → starting point for the ontology's Booking/Car/Location/User types, with a new `Vendor` entity inserted (BookCars has no vendor-abstraction layer; it assumes the platform owns the car)
- **Port with adaptation:** Mongoose models (`Booking.ts`, `User.ts`, `AdditionalDriver.ts`) → schemas mostly transfer since Mongo stays in this stack, but `Car` becomes vendor-owned inventory, not platform-owned
- **Port logic, move to graph:** fee/perk calculation currently duplicated in `admin/src/utils/helper.ts` and `frontend/src/utils/helper.ts` (`getFullInsurance`, `getCollisionDamageWaiver`, `getAdditionalDriver`, etc. — see BookCars [[CONCERNS]]) → becomes NegotiatedTerm/Perk graph relations (feeds Phase 1 ontology and Phase 5 add-on integrity) instead of hardcoded, duplicated JS functions
- **Do not port:** `authHelper.ts`/custom JWT auth (replaced by Clerk), Express routes/controllers (replaced by Next.js routing; underlying validation/business-rule logic is portable, the routing plumbing isn't)
- **Reference only, no direct port:** React/Vite frontend components (`Checkout.tsx`, filters, date pickers) — useful for UX flow reference, not a line-for-line port into Next.js App Router
- **Possible reuse:** `rrule`-based scheduling (admin) for vendor availability/inventory calendars, if that need emerges

**Plans:**
- [ ] 03-01: TBD

### Phase 4: Booking & Rate Integrity (UC1, UC2, UC3)

**Goal:** Member can book, modify, and cancel a reservation with negotiated rates/perks correctly applied and preserved across vendor round-trips.
**Depends on:** Phase 3
**Research:** Likely (vendor rate re-quote/re-application logic, refund reconciliation modeling)

**Scope:**
- UC1: Booking with negotiated rate + perk display
- UC2: Modification routed to vendor with rate re-application
- UC3: Cancellation/refund reconciliation across platform and vendor

**Plans:**
- [ ] 04-01: TBD

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
*Last updated: 2026-08-27 — Phase 1 extended with 01-03 (vendor expansion to 10, BookCars-aligned enrichment); Phase 2 (Agent-Enablement Ontology Layer) inserted and completed; Phases 2–5 renumbered to 3–6*
