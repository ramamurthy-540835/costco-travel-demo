# Rental-Car Ontology & Knowledge Graph — Phase 1

## Sources used
- `data/reference/mock-data/*.json` — Costco-Travel-shaped mock data (members, bookings, inventory, providers). Copied from `/Users/vishwasjayarama/Developer/mock-data`.
- `/Users/vishwasjayarama/Developer/bookcars-db` — real BookCars demo MongoDB dump. Fleet-owner schema (Supplier owns Car directly), not broker-shaped — used as **schema reference only** (already captured in BookCars `.coder/codebase/ARCHITECTURE.md`/`STRUCTURE.md`), not copied into this project.
- [BookCars wiki](https://github.com/aelassas/bookcars/wiki/) — confirms entity set (Supplier, Car, Customer, Booking, Location, Payment) and demo-database/price-calculation/supplier-contract conventions.
- Original UC1–UC8 spec (Costco Travel-style broker model) — source of membership tiers, negotiated-rate/perk language, and lifecycle statuses.
- `data/synthetic/*.json` — generated in this phase to fill gaps mock-data didn't cover (tiers, perks, negotiated terms, vendor policies, add-on catalog).

## Entities (graph nodes)

| Node | Key fields | Data source |
|---|---|---|
| `Member` | member_id, name, email, membership_tier, membership_status | `mock-data/members_100.json` |
| `MembershipTier` | tier_id, name, rank | `data/synthetic/membership_tiers.json` (Gold Star / Executive / Business — observed in members_100.json) |
| `Vendor` | provider, rating, minimum_rental_days, price_change_rate | `mock-data/rental_providers.json` (Alamo, Avis, Budget, Enterprise, National, Hertz, Thrifty, Dollar, Sixt, Payless — 10, Plan 01-03) |
| `VehicleClass` | class_name (Economy, Compact, Mid-size, Full-size, SUV, Minivan, Pickup, Luxury, Convertible) | `mock-data/rental_inventory.json` |
| `Location` | city (10 US metros), synonyms (LLM-generated, Phase 7) | `mock-data/rental_inventory.json` |
| `Inventory` | rental_id, vehicle_make/model, vehicle_type, gearbox, seats, fuel_policy, deposit_amount | `mock-data/rental_inventory.json` — `vehicle_make`/`vehicle_model` cardinality is many-per-class (3 canonical pairs per `VehicleClass` as of Plan 04-10, not 1:1; see VOCABULARY.md). `fuel_policy`/`deposit_amount` added Plan 04-11 (deterministic, `scripts/add-vehicle-extras-fields.mjs`) |
| `Reservation` | reservation_id, rental_id (FK to Inventory), pickup_date, return_date, status (Pending/Confirmed/Cancelled/Completed) | `mock-data/bookings_1000.json` |
| `NegotiatedTerm` | term_id, discount_pct, included_miles, cancellation_window_hours | `data/synthetic/negotiated_terms.json` — per (Vendor × MembershipTier) |
| `Perk` | perk_id, name, category | `data/synthetic/perks.json` |
| `AddOn` | addon_id, name, fee_per_day | `data/synthetic/addon_catalog.json` — for UC6 integrity checks. `fee_per_day` added Plan 04-11 (5 of 8 addons; queried via `getAddOnsCatalog()`/`getWaivedAddOnIds()`, `lib/graph/queries.ts`) |
| `VendorPolicy` | cancellation window, modification cutoff, refund SLA | `data/synthetic/vendor_policies.json` — queried via `getVendorPolicy()` as of Plan 04-11 (previously loaded but never queried) |
| `EquivalenceCluster` | cluster_id, name | `data/synthetic/equivalence_clusters.json` — Phase 7, agent-grounding ontology enrichment |

## Relations (graph edges)

```
(Member)-[:HOLDS_TIER]->(MembershipTier)
(Member)-[:MADE]->(Reservation)
(Reservation)-[:AT_LOCATION]->(Location)
(Reservation)-[:WITH_VENDOR]->(Vendor)
(Reservation)-[:FOR_INVENTORY]->(Inventory)
(Inventory)-[:INSTANCE_OF]->(VehicleClass)
(Inventory)-[:LOCATED_AT]->(Location)
(Inventory)-[:OFFERED_BY]->(Vendor)
(Vendor)-[:GOVERNED_BY]->(VendorPolicy)
(MembershipTier)-[:ELIGIBLE_FOR]->(NegotiatedTerm)
(Vendor)-[:OFFERS_TERM]->(NegotiatedTerm)
(NegotiatedTerm)-[:INCLUDES_PERK]->(Perk)
(Perk)-[:WAIVES]->(AddOn)          -- e.g. free_additional_driver WAIVES additional_driver addon
(Reservation)-[:REQUESTED]->(AddOn) -- for UC6 double-charge check
```

`NegotiatedTerm` is keyed by `(Vendor, MembershipTier)`, not by Member — this is deliberate: it lets Discovery/Checkout and billing-dispute resolution both resolve "what does this member get from this vendor" via `Member -[:HOLDS_TIER]-> MembershipTier -[:ELIGIBLE_FOR]-> NegotiatedTerm <-[:OFFERS_TERM]- Vendor`, without duplicating per-member copies of the same terms.

## Vocabulary / Taxonomy / Thesaurus layers

Plan 01-01 extends this ontology with three enrichment layers, mirroring `mastech-agentic-commerce`'s five-layer model (Vocabulary/Taxonomy/Thesaurus/Ontology/Knowledge Graph):

- [`VOCABULARY.md`](./VOCABULARY.md) — canonical term list for every name-valued property across the 11 node types above, traced to real source files
- [`TAXONOMY.md`](./TAXONOMY.md) — `VehicleClass` parent/child grouping (Standard/Utility/Premium) and `MembershipTier` strict rank order (Gold Star < Executive < Business), expressed as graph structure
- [`THESAURUS.md`](./THESAURUS.md) — cross-vendor mileage-phrasing and VehicleClass/Perk naming-variance normalization scheme (Sixt's mileage phrasing and Payless's "Compact Plus" class alias are real cases as of Plan 01-03; Perk naming-variance remains forward-looking)

New node added to the Entities table:

| Node | Key fields | Data source |
|---|---|---|
| `VocabularyTerm` | term, canonical target reference | derived, this plan |
| `Intent` | intent_id, canonical_phrase, synonyms, related_uc, target_entity | `data/synthetic/agent_intents.json` — Phase 2, agent-enablement ontology layer |

New relations added to the Relations block:

```
(child:VehicleClass)-[:PARENT_OF]->(parent:VehicleClass)   -- TAXONOMY.md
(alias:VocabularyTerm)-[:SYNONYM_OF]->(canonical)           -- THESAURUS.md
(intent:Intent)-[:TARGETS]->(entity)                        -- THESAURUS.md, Phase 2 — entity is Reservation/Inventory/NegotiatedTerm/AddOn per intent
(vc:VehicleClass)-[:PART_OF_CLUSTER]->(c:EquivalenceCluster) -- Phase 7 — substitutability, distinct from PARENT_OF's Standard/Utility/Premium classification taxonomy
```

`VehicleClass`, `Perk`, `AddOn`, and `MembershipTier` also gained a `synonyms` list property directly on the node (Phase 2) — colloquial phrasings an agent can match against, mirroring `mastech-agentic-commerce`'s attribute-synonym pattern. See `THESAURUS.md`'s "Action/Intent vocabulary" section.

## UC → graph traversal mapping

| Use case | Traversal |
|---|---|
| UC1 Booking | resolve `Member → MembershipTier → NegotiatedTerm ← Vendor` at booking time to price the reservation and display included perks |
| UC2 Modification | re-run the same traversal against the (possibly changed) `Inventory`/`Vendor` to confirm the negotiated rate still applies |
| UC3 Cancellation/Refund | read `NegotiatedTerm.cancellation_window_hours` / `VendorPolicy.refund_processing_days` against `Reservation` timestamps |
| UC6 Add-on integrity | before pricing an `AddOn` request, check `Perk -[:WAIVES]-> AddOn` for the member's active `NegotiatedTerm` — if matched, block the upsell |
| UC8 Billing dispute | same traversal as UC1, replayed against the original reservation timestamp, as the source-of-truth reconciliation |

## Gaps intentionally left synthetic (not in mock-data)
- `MembershipTier`, `Perk`, `NegotiatedTerm`, `VendorPolicy`, `AddOn` — none existed in `mock-data`; generated in `data/synthetic/` this phase, derived from `rental_providers.json` discount/mileage fields plus the UC spec's perk language (free additional driver, no young-driver fee, waived underage fee for Business tier, unlimited mileage).
- `operational_relative_seeds.json` (mock-data) — relative-date templates, kept as-is for generating time-sensitive test scenarios (e.g. "pickup in 2 days" for UC2/UC3 cutoff testing); not modeled as a graph node.
- `bookings_1000.json.rental_id` — added in Plan 01-02 (data enhancement, user-approved): the original file had no FK from Reservation to a specific Inventory row (only provider/pickup_city/vehicle strings). Backfilled by matching each booking's (provider, pickup_city, vehicle) against `rental_inventory_500.json`'s (provider, city, vehicle_make+vehicle_model) — all 1000 rows matched exactly, no ambiguous/missing joins. This makes `Reservation-[:FOR_INVENTORY]->Inventory` a real FK join instead of a heuristic match, mirroring BookCars' `Booking.car` ObjectId-ref pattern (`backend/src/models/Booking.ts`).
- `bookings_1000.json.requested_addons` — added in Plan 01-02 (data enhancement, user-approved): the original file had no add-on-request data, so `Reservation-[:REQUESTED]->AddOn` (needed for UC6 integrity checks) had no rows to seed. Backfilled a `requested_addons` list (`addon_id` values from `addon_catalog.json`) on ~33% of reservations.
- **Plan 01-03 (user-approved) vendor expansion**: added 5 vendors (Hertz, Thrifty, Dollar, Sixt, Payless) → 10 total, referencing BookCars' `Supplier`/`Car` field shapes (`backend/src/models/{SupplierForm,Car}.ts` via `SupplierForm.ts`/`Car.ts` in `mastech-rental-car-management`, read-only reference). `Vendor` gained `minimum_rental_days`/`price_change_rate` (backfilled onto all 10); `Inventory` gained `vehicle_type`/`gearbox`/`seats` (backfilled onto all 1000 rows, BookCars `CarType`/`GearboxType`-aligned). `Inventory` grew from 500 to 1000 rows (100/vendor, proportional). `NegotiatedTerm` grew from 15 to 30 rows (5 new vendors × 3 tiers), `VendorPolicy` from 5 to 10. `data/reference/mock-data/rental_inventory_500.json` renamed to `rental_inventory.json` (the `_500` suffix became inaccurate). `bookings_1000.json`/`members_100.json` intentionally NOT touched — new vendors have inventory/terms/policies but no reservations yet (deferred to Phase 3).
- **Plan 01-03 real thesaurus data**: Sixt reports `included_miles: "300 mi/day"` (not "Unlimited") and Payless uses `"Compact Plus"` as a raw `vehicle_class` naming variant of `Compact` on part of its inventory — see `THESAURUS.md`. This converts `VocabularyTerm`/`SYNONYM_OF` from the Plan 01-02 "0, documented exception" state to real non-zero seeded data.
- **Phase 2 (Agent-Enablement Ontology Layer)**: added a new `Intent` node type + `TARGETS` edge (action/intent-level vocabulary — "cancel my booking", "cheapest car" — a gap not covered by `mastech-agentic-commerce`'s own thesaurus, confirmed via read-only research), plus a `synonyms` list property directly on `VehicleClass`/`Perk`/`AddOn`/`MembershipTier` (attribute-level, ported from that project's pattern). Scoped to ontology/knowledge-graph only — no tool-calling contract (`check_access`/`record_audit`-style gating) yet; that's deferred until the actual conversational/fulfillment agents are built. See `THESAURUS.md`'s "Action/Intent vocabulary" section and `.coder/phases/02-agent-ontology-enablement/`.
- **Phase 7 (Agent-Grounding Ontology & Knowledge-Graph Enrichment)**: added a new `EquivalenceCluster` node type + `PART_OF_CLUSTER` edge modeling cross-`VehicleClass` substitutability ("no exact match, what's close") — deliberately distinct from `PARENT_OF`'s Standard/Utility/Premium classification taxonomy. Exposed via `getEquivalenceCandidates()` (`lib/graph/queries.ts`). 07-02 (LLM-generated synonym backfill + Location vocabulary enrichment) closed the `Location.synonyms` gap via a real Azure OpenAI backfill script (`graph/scripts/backfill_synonyms.py`), giving all 10 seeded cities non-hardcoded colloquial aliases. 07-03 (composable retriever tools) closed out the phase — see the "Retriever tool surface" subsection below.

### Retriever tool surface (Phase 7-03)
`lib/graph/retrievers.ts`'s `lookupNode(label, matchProperty, matchValue)`, `traverse(fromLabel, fromProperty, fromValue, edgeType, toLabel, direction)`, and `resolveSynonym(term)` are the sanctioned generic query path for any future agent/tool-calling code — the Phase 8 Vendor Agent and Phase 9 Customer/Driver Assistant should call these (or wrap them in LLM tool schemas) rather than growing new bespoke `queries.ts` functions per prompt. `resolveSynonym` searches every node label carrying a `synonyms` array property: `VehicleClass`, `Perk`, `AddOn`, `MembershipTier`, `Location`, `Intent`. The existing bespoke functions in `lib/graph/queries.ts` (`getVehicleClasses`, `getNegotiatedTermsForVendor`, `getEquivalenceCandidates`, etc.) remain unchanged for their current Phase 4-6 route call-sites — this is a parallel surface, not a replacement. Demonstrated with real live output in `agent-lab/docs/knowledge_graph_demo.html`'s "Retriever Tools" section.

## Next
- Implement as Postgres + Apache AGE schema — see `graph_schema.sql` in this directory.
- Plan 01-01: Vocabulary/Taxonomy/Thesaurus layers (docs + `graph_schema.sql` additions), extending this ontology.
- Plan 01-02: stand up the Postgres + Apache AGE instance, load real seed data from `data/synthetic/` + `data/reference/mock-data/` via Cypher, verify.
- A query-layer contract for Phase 2/3 to consume the graph is explicitly deferred — out of scope for both Phase 1 plans.
