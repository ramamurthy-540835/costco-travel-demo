# mastech-agentic-travel

## What This Is

A member-centric, multi-vendor rental-car brokerage platform modeled on the Costco Travel operating pattern: the platform owns Discovery and Checkout (search, negotiated rates, booking, modification, cancellation, billing-dispute resolution), while independent rental vendors (Avis, Budget, Enterprise, Alamo-style) own Fulfillment (vehicle fleet, drivers, in-rental support, pickup/return). The platform's job is to protect the member's negotiated terms across the full rental lifecycle even though it never touches the vehicle or the rental agreement itself.

## Core Value

Members get Costco-style negotiated rental rates and perks that stay honored and enforceable across booking, changes, cancellation, and billing — even though the platform never fulfills the rental itself.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application |
| Version | 0.1.0 |
| Status | Prototype |
| Last Updated | 2026-09-04 |

## Requirements

### Core Features

- Member booking with negotiated multi-vendor rates and exclusive perks (UC1)
- Reservation modification routed to vendor inventory with rate re-application (UC2)
- Cancellation and refund reconciliation across platform and vendor systems (UC3)
- Add-on/upsell integrity check against already-included negotiated benefits (UC6)
- Rental-domain ontology and knowledge graph modeling members, vendors, vehicles, reservations, negotiated-rate terms, and perks — the source of truth both Discovery/Checkout and dispute resolution query against

### Validated (Shipped)
- ✓ UC1 Booking (rate-integrity server-side recompute + Stripe verification) — Phase 4, regression-covered Phase 6 (06-02)
- ✓ UC2 Modification (dates + cross-vendor, optimistic-lock CAS guard) — Phase 4, regression-covered Phase 6 (06-03, 06-04)
- ✓ UC3 Cancellation/Refund (live vendor-policy refund quote, atomic cancel claim) — Phase 4, regression-covered Phase 6 (06-04)
- ✓ UC6 Add-on integrity (perk-waiver check, fee-bearing charge) — Phase 5, regression-covered Phase 6 (06-05)
- ✓ Rental-domain ontology and knowledge graph — Phase 1/2

### Active (In Progress)
None yet.

### Planned (Next)
- UC1 Booking, UC2 Modification, UC3 Cancellation/Refund, UC6 Add-on integrity — high priority
- UC4 Vendor-counter pickup, UC5 In-rental support, UC7 Return/drop-off, UC8 Billing dispute — low priority (deferred; vendor-primary or lower member-facing urgency per stakeholder direction)

### Out of Scope
- Owning or managing a vehicle fleet — vendors own the fleet, always
- Dispatching drivers or roadside assistance — vendor operational responsibility
- Vendor-side reservation/inventory systems — the platform only integrates with them, never replaces them

## Target Users

**Primary:** Costco-style members booking rental cars
- Expect negotiated rates and perks (free additional driver, no young-driver fee, etc.) to be honored automatically
- Trust the platform (not the vendor) as the first point of contact for booking issues and billing disputes
- Book/modify/cancel through the platform; pick up/return/support directly with the vendor

**Secondary:** Vendor-side counter agents and vendor reservation systems
- Consume the platform's booking confirmations and negotiated-term data
- Need clear, unambiguous perk/benefit data to avoid upsell disputes (UC6)

## Context

**Business Context:**
Modeled directly on the Costco Travel car-rental use cases (member-centric, multi-vendor rental lifecycle). The platform is an intermediary/broker, not the fulfilling party — most operational use cases (pickup, in-rental support, return) have the vendor as primary actor, while the platform's value-add concentrates in booking, rate integrity during changes, and billing dispute resolution.

**Technical Context:**
Architecture pattern is borrowed from the sibling project `mastech-agentic-commerce`, which cleanly separates a Discovery/Checkout layer (Next.js + Clerk + Postgres/Apache AGE knowledge graph) from a Fulfillment layer (an independently-deployed vendor/ops-facing service, joined only through a shared read-only graph and an integration RPC boundary — no shared code/imports). This project reuses that separation, substituting "Store Ops Agent" with "Vendor Integration Layer" and "product/category/store" graph entities with "member/vendor/vehicle-class/reservation/negotiated-term" graph entities.

## Constraints

### Technical Constraints
- Stack must stay generic (not Costco-specific): Clerk for auth, Postgres + Apache AGE for the knowledge graph, MongoDB for operational/document data (bookings, member profiles, vendor sync state)
- Platform never has direct access to vendor fleet/inventory systems — only through vendor-provided APIs/integration contracts
- Knowledge graph is the single source of truth for negotiated-rate terms and perk eligibility, queried by both Discovery/Checkout and billing-dispute resolution

### Business Constraints
- UC1, UC2, UC3, UC6 are high priority (platform-primary or dispute-critical)
- UC4, UC5, UC7, UC8 are low priority (vendor-primary operational flows)
- Vendor cancellation/rate policies vary by contract — the platform must handle per-vendor policy variance, not a single hardcoded rule

## Key Decisions

| Decision | Rationale | Date | Status |
|----------|-----------|------|--------|
| New sibling repo, not an evolution of BookCars | Different domain model (broker vs. fleet-owner) and different stack (Clerk/Postgres+AGE/Mongo vs. Express/Mongo/custom JWT) — evolving BookCars in place would be a rewrite, not an extension | 2026-08-27 | Active |
| Mirror `mastech-agentic-commerce`'s Discovery/Checkout vs. Fulfillment separation | Same broker-vs-fulfiller shape (agentic commerce's storefront+graph vs. Store Ops Agent) maps directly onto Costco Travel vs. vendor | 2026-08-27 | Active |
| Generic stack naming (no Costco-specific branding in code) | Keep the platform pattern reusable across broker-style rental scenarios, not locked to one brand | 2026-08-27 | Active |
| Stripe PaymentIntent flow only (not Checkout Session), PayPal excluded | Custom Next.js checkout UI (Phase 4) needs PaymentIntent + Elements, not a hosted redirect; no second payment provider requirement exists | 2026-08-28 | Active |
| `mailHelper`/nodemailer deferred to Phase 4 | No booking-confirmation trigger exists yet in Phase 3 — email content should be shaped by real booking data, not ported speculatively | 2026-08-28 | Deferred |
| New `Vendor` entity added to bookcars-types port, `Car`→`Inventory` reshape | BookCars assumes the platform owns the car; this platform brokers across independent vendors | 2026-08-28 | Active |

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Negotiated-rate integrity on booking (UC1) | 100% of bookings reflect correct negotiated rate/perks | - | Not started |
| Modification rate re-application accuracy (UC2) | 100% of in-window modifications preserve negotiated rate | - | Not started |
| Cancellation/refund reconciliation time (UC3) | Refund confirmed to member within vendor SLA | - | Not started |
| Add-on double-charge prevention (UC6) | 0% of already-included perks re-charged as upsells | - | Not started |
| Knowledge graph coverage | Ontology covers members, vendors, vehicle classes, reservations, negotiated terms, perks | - | Not started |

## Tech Stack / Tools

| Layer | Technology | Notes |
|-------|------------|-------|
| Auth | Clerk | Matches `mastech-agentic-commerce`'s `clerkMiddleware()` pattern (`middleware.ts`); catch-all matcher performs no route protection by default |
| Knowledge graph | PostgreSQL + Apache AGE | Rental ontology: Member, Vendor, VehicleClass, Reservation, NegotiatedTerm, Perk nodes/edges — mirrors agentic-commerce's `commerce_graph` |
| Operational/document data | MongoDB | Member, Booking, AdditionalDriver, Vendor Mongoose models — mirrors agentic-commerce's Mongo user-sync pattern |
| Payments | Stripe (PaymentIntent flow only) | Ported from BookCars' `stripeController.ts`; PayPal excluded from scope, Checkout Session flow not ported |
| Frontend/API | Next.js (App Router) | Discovery/Checkout layer, server actions + API routes |
| Vendor integration | Separate service/RPC boundary | Fulfillment-facing integration layer, deployed independently — no shared code with Discovery/Checkout, per agentic-commerce's A2A precedent |

## Links

| Resource | URL |
|----------|-----|
| Repository | (local: /Users/vishwasjayarama/Mastech/Projects/mastech-agentic-travel) |
| Reference — stack pattern | /Users/vishwasjayarama/Mastech/Projects/mastech-agentic-commerce |
| Reference — booking-domain patterns | /Users/vishwasjayarama/Mastech/Projects/mastech-rental-car-management (BookCars) |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-09-04 after Phase 6*
