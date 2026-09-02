# Vocabulary — Rental Ontology Phase 1

Canonical term list for every name-valued property across the 11 ontology node types (`ONTOLOGY.md`). Every value below is observed verbatim in the cited source file — none invented.

| Node Type | Property | Canonical Value(s) | Source File |
|---|---|---|---|
| Member | member_id | `M0001`–`M0100` (100 distinct IDs) | `data/reference/mock-data/members_100.json` |
| Member | membership_tier | Gold Star, Executive, Business | `data/reference/mock-data/members_100.json` |
| MembershipTier | tier_id | `gold_star`, `executive`, `business` | `data/synthetic/membership_tiers.json` |
| MembershipTier | name | Gold Star, Executive, Business | `data/synthetic/membership_tiers.json` |
| Vendor | provider | Alamo, Avis, Budget, Enterprise, National, Hertz, Thrifty, Dollar, Sixt, Payless (10, Plan 01-03) | `data/reference/mock-data/rental_providers.json` |
| Vendor | minimum_rental_days / price_change_rate | added Plan 01-03, BookCars `Supplier`-aligned (`minimumRentalDays`, `priceChangeRate`) — backfilled onto all 10 vendors | `data/reference/mock-data/rental_providers.json` |
| VehicleClass | class_name | Economy, Compact, Mid-size, Full-size, SUV, Minivan, Pickup, Luxury, Convertible | `data/reference/mock-data/rental_inventory.json` |
| VocabularyTerm | term | `Compact Plus` — Payless-only naming variant of canonical `Compact`, added Plan 01-03 (see THESAURUS.md) | `data/reference/mock-data/rental_inventory.json` |
| Location | city | Las Vegas, Orlando, San Francisco, Seattle, Denver, Chicago, Dallas, Phoenix, Los Angeles, New York | `data/reference/mock-data/rental_inventory.json` |
| Inventory | rental_id | `RC10001`–`RC10500` (original 500) + `RC10501`–`RC11000` (500 added Plan 01-03 for the 5 new vendors) — 1000 distinct IDs | `data/reference/mock-data/rental_inventory.json` |
| Inventory | vehicle_make / vehicle_model | 3 canonical (make, model) pairs per `VehicleClass` (Plan 04-10, deterministic reassignment by `rental_id`): Economy — Nissan Versa, Hyundai Accent, Kia Rio; Compact / Compact Plus — Toyota Corolla, Honda Civic, Mazda Mazda3; Mid-size — Toyota Camry, Honda Accord, Hyundai Sonata; Full-size — Chevrolet Malibu, Nissan Altima, Ford Fusion; SUV — Toyota RAV4, Honda CR-V, Ford Escape; Luxury — BMW 3 Series, Mercedes-Benz C-Class, Audi A4; Convertible — Ford Mustang, Chevrolet Camaro, Mazda MX-5; Minivan — Chrysler Pacifica, Honda Odyssey, Toyota Sienna; Pickup — Ford F-150, Chevrolet Silverado, Ram 1500 | `data/reference/mock-data/rental_inventory.json` |
| Inventory | vehicle_type / gearbox / seats | added Plan 01-03, BookCars `Car`-aligned (`CarType`, `GearboxType`, seats) — backfilled onto all 1000 rows | `data/reference/mock-data/rental_inventory.json` |
| Inventory | fuel_policy | Free Tank, Full to Full, Like for Like (added Plan 04-11, deterministic by hash of `rental_id`, `scripts/add-vehicle-extras-fields.mjs`) — backfilled onto all 1000 rows | `data/reference/mock-data/rental_inventory.json` |
| Inventory | deposit_amount | 150 (Economy/Compact/Compact Plus/Mid-size), 250 (Full-size/SUV/Minivan), 400 (Luxury/Convertible/Pickup) — added Plan 04-11, deterministic by `VehicleClass` tier | `data/reference/mock-data/rental_inventory.json` |
| Reservation | reservation_id | 1000 distinct IDs | `data/reference/mock-data/bookings_1000.json` |
| Reservation | rental_id | FK to Inventory.rental_id (backfilled, Plan 01-01 data enhancement — see ONTOLOGY.md Gaps section) | `data/reference/mock-data/bookings_1000.json` |
| Reservation | status | Pending, Confirmed, Cancelled, Completed | `data/reference/mock-data/bookings_1000.json` |
| NegotiatedTerm | term_id | `nt_001`–`nt_015` (original 5 vendors × 3 tiers) + `nt_016`–`nt_030` (5 new vendors × 3 tiers, Plan 01-03) — 30 rows total | `data/synthetic/negotiated_terms.json` |
| NegotiatedTerm | included_miles | Unlimited (27 rows) or `300 mi/day` (Sixt's 3 rows, Plan 01-03 — see THESAURUS.md) | `data/synthetic/negotiated_terms.json` |
| NegotiatedTerm | refund_type | `full_refund_if_within_window` | `data/synthetic/negotiated_terms.json` |
| Perk | perk_id | unlimited_mileage, free_additional_driver, no_young_driver_fee, waived_underage_fee, free_upgrade_priority, damage_waiver_included, consolidated_billing, flexible_cancellation | `data/synthetic/perks.json` |
| Perk | name | Unlimited Mileage, Free Additional Driver, No Young Driver Fee, Waived Underage Driver Fee (Business tier), Priority Vehicle Upgrade (subject to availability), Primary Damage Waiver Included, Consolidated Business Billing, Extended Free-Cancellation Window | `data/synthetic/perks.json` |
| AddOn | addon_id | additional_driver, young_driver_fee, underage_driver_fee, collision_damage_waiver, gps_navigation, child_seat, roadside_assistance, fuel_prepay | `data/synthetic/addon_catalog.json` |
| AddOn | name | Additional Driver, Young Driver Fee (under 25), Underage Driver Fee (under 21, Business), Collision Damage Waiver, GPS Navigation Unit, Child Safety Seat, Roadside Assistance Plan, Prepaid Fuel Option | `data/synthetic/addon_catalog.json` |
| AddOn | fee_per_day | added Plan 04-11 (manual edit, not scripted): additional_driver 12, collision_damage_waiver 15, roadside_assistance 6, gps_navigation 8, child_seat 10 — young_driver_fee/underage_driver_fee/fuel_prepay left without fee_per_day (out of scope) | `data/synthetic/addon_catalog.json` |
| VendorPolicy | provider | Alamo, Avis, Budget, Enterprise, National, Hertz, Thrifty, Dollar, Sixt, Payless (10, Plan 01-03) | `data/synthetic/vendor_policies.json` |
| VendorPolicy | standard_cancellation_window_hours | 24 (all 10 rows) | `data/synthetic/vendor_policies.json` |
| VendorPolicy | refund_processing_days | 5 (all 10 rows) | `data/synthetic/vendor_policies.json` |
| Intent | intent_id | book_reservation, modify_reservation, cancel_reservation, check_availability, compare_rates, request_addon, check_in, return_vehicle, dispute_charge, escalate_support (added Phase 2) | `data/synthetic/agent_intents.json` |

## Agent-support vocabulary (Phase 2)

Added so a conversational agent (member-facing) and fulfillment-side agents can resolve colloquial phrasing against the graph, without a separate disambiguation service — mirrors `mastech-agentic-commerce`'s `synonyms`-list-property pattern (read-only reference), adapted to Apache AGE/Cypher.

A `synonyms` list property was added directly onto these existing node types:

| Node Type | Property | Example |
|---|---|---|
| VehicleClass | synonyms | `SUV: ["crossover", "4x4", "truck-like"]`, `Economy: ["cheapest car", "basic car", "small car"]` |
| Perk | synonyms | `waived_underage_fee: ["no under-21 fee", "underage driver waiver"]` |
| AddOn | synonyms | `collision_damage_waiver: ["CDW", "damage insurance", "collision coverage"]` |
| MembershipTier | synonyms | `business: ["top tier", "highest tier", "best membership"]` |

Queried the same way as `mastech-agentic-commerce`: `toLower($keyword) IN [x IN n.synonyms | toLower(x)]`. See `graph/scripts/load_seed_data.py`'s `*_SYNONYMS` dicts for the full lists.

## Notes
- Plan 04-11 surfaces `VendorPolicy` (via `Vendor-[:GOVERNED_BY]->VendorPolicy`) and `AddOn` (via `Perk-[:WAIVES]->AddOn`) in the app for the first time — both node types were loaded into the graph since Phase 1 but never queried by `lib/graph/queries.ts` until `getVendorPolicy`/`getAddOnsCatalog`/`getWaivedAddOnIds` were added in that plan.
- `Inventory.vehicle_make`/`vehicle_model` were originally a single hardcoded (make, model) pair per `VehicleClass` across all 1000 rows (Plan 01-03). Plan 04-10 expanded this to 3 pairs per class (see table above), assigned deterministically via a hash of `rental_id` (`scripts/reassign-vehicle-makes.mjs`) so re-running the script is idempotent. Still per-row free-text, not a small closed vocabulary in the sense of an enum — but no longer 1:1 with `VehicleClass`.
- `VendorPolicy` has no separate natural-key field distinct from `provider` in the source file — it shares the `provider` value with `Vendor` (confirmed by inspecting `data/synthetic/vendor_policies.json`).
- `rental_inventory_500.json` was renamed to `rental_inventory.json` in Plan 01-03 — the `_500` suffix became inaccurate once the file grew to 1000 rows.
