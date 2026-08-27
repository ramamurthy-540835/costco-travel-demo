# Thesaurus — Rental Ontology Phase 1

## Mileage-inclusion normalization

Raw `included_miles` values observed in `data/reference/mock-data/rental_providers.json`, across all 10 vendors (Plan 01-03 added the last 5):

| Vendor | Raw `included_miles` value | Canonical vocabulary term |
|---|---|---|
| Alamo | Unlimited | Unlimited |
| Avis | Unlimited | Unlimited |
| Budget | Unlimited | Unlimited |
| Enterprise | Unlimited | Unlimited |
| National | Unlimited | Unlimited |
| Hertz | Unlimited | Unlimited |
| Thrifty | Unlimited | Unlimited |
| Dollar | Unlimited | Unlimited |
| Sixt | `300 mi/day` | Capped |
| Payless | Unlimited | Unlimited |

Canonical vocabulary: `{Unlimited, Capped}`.

**Real normalization case, Plan 01-03:** Sixt reports `included_miles: "300 mi/day"` — the first vendor whose raw value differs from the canonical term. It normalizes to `Capped`. Its 3 `NegotiatedTerm` rows (`nt_022`–`nt_024`, gold_star/executive/business) carry the same raw `"300 mi/day"` value. This is documentation-only normalization (no graph edge — mileage normalization is not modeled as a relation, unlike VehicleClass naming-variance below); a future app-layer query is expected to map Sixt's raw value onto `Capped` when comparing across vendors.

## Cross-vendor VehicleClass naming-variance

Current data uses one shared `VehicleClass` vocabulary for 9 of 10 vendors (see `VOCABULARY.md`).

**Real case, Plan 01-03:** Payless uses `"Compact Plus"` as the raw `vehicle_class` value on a subset of its inventory, in place of the canonical `"Compact"`. This is resolved via a `SYNONYM_OF` edge from a `VocabularyTerm` alias node to the canonical `VehicleClass` node — seeded as real data (not a placeholder) starting with Plan 01-03:

```
(alias:VocabularyTerm {term: 'Compact Plus'})-[:SYNONYM_OF]->(canonical:VehicleClass {class_name: 'Compact'})
```

Direction convention: **alias points to canonical** — the `VocabularyTerm` alias is always the source, the canonical `VehicleClass` (or other vocabulary-governed node) is always the target.

`Inventory` rows carrying the raw `"Compact Plus"` value still resolve their `INSTANCE_OF` edge to the canonical `VehicleClass {class_name: 'Compact'}` node, not to a 10th VehicleClass node — the raw alias string is preserved on the `Inventory` row itself (for display fidelity) but never becomes its own `VehicleClass` node. See `graph/scripts/load_seed_data.py`'s `VEHICLE_CLASS_ALIASES` map.

## Action/Intent vocabulary (Phase 2 — the real gap)

Phase 1's thesaurus above only normalizes **attribute nouns** (mileage phrasing, VehicleClass naming). Research against the more mature sibling `mastech-agentic-commerce` project (read-only reference) confirmed it has the same limit — its `synonyms`-list-property pattern covers Color/Material/Style/Occasion/Subcategory, never verbs or comparatives. A conversational agent assisting members with reservations, and fulfillment-side agents, both need to resolve **actions** ("cancel my booking") and **comparatives** ("cheapest car"), which neither project's thesaurus previously covered. This section pioneers that piece.

**Action/verb phrases** are resolved via a new `Intent` node type (`data/synthetic/agent_intents.json`), each carrying a `synonyms` list — the same property-based pattern as the attribute-level synonyms above, applied to actions instead of nouns:

| Canonical Intent | Example synonyms | Related UC | Targets |
|---|---|---|---|
| `cancel_reservation` | "cancel my booking", "cancel my rental", "I don't need the car anymore" | UC3 | `Reservation` |
| `compare_rates` | "cheapest car", "lowest price", "best deal", "what's the best rate" | UC1 | `NegotiatedTerm` |
| `modify_reservation` | "change my booking", "update my reservation" | UC2 | `Reservation` |
| `request_addon` | "add a child seat", "I need GPS" | UC6 | `AddOn` |
| `dispute_charge` | "I was overcharged", "why was I charged for this" | UC8 | `NegotiatedTerm` |

(all 10 intents listed in `data/synthetic/agent_intents.json`; covers UC1/2/3/6 member-facing and UC4/5/7/8 fulfillment-facing use cases per `ONTOLOGY.md`'s UC → traversal mapping)

Query pattern (same shape as attribute-level synonyms): `MATCH (i:Intent) WHERE toLower($phrase) IN [x IN i.synonyms | toLower(x)] RETURN i`, then follow `(i)-[:TARGETS]->(entity)` to resolve which graph entity/traversal the recognized intent acts on.

**Comparative/policy phrases** ("cheapest", "no deposit", "flexible cancellation") are *not* modeled as new graph structure — they are documentation-only sort/filter directives on an existing field:

| Phrase pattern | Resolves to |
|---|---|
| "cheapest", "lowest price", "best deal" | sort `NegotiatedTerm.discount_pct` descending / `Inventory` price field ascending |
| "no deposit" | filter `VendorPolicy`/`NegotiatedTerm` for a zero-deposit term (not currently a modeled field — flagged for future data enrichment if a real vendor case emerges) |
| "flexible cancellation" | filter `NegotiatedTerm.cancellation_window_hours` for the longer of the two observed windows (24h/48h) |

This mirrors the Perk naming-variance section below: kept as documentation rather than over-engineered into new node types, since the underlying fields already exist.

## Perk naming-variance note

Cross-referencing `data/synthetic/perks.json`'s 8 `Perk.name` values (Unlimited Mileage, Free Additional Driver, No Young Driver Fee, Waived Underage Driver Fee (Business tier), Priority Vehicle Upgrade (subject to availability), Primary Damage Waiver Included, Consolidated Business Billing, Extended Free-Cancellation Window): **no near-duplicate or overlapping perk names exist across the current data** — all 8 perks are distinct concepts with no vendor-specific naming variance to resolve today. This section is a placeholder for a future scenario where two vendors describe what is functionally the same perk (e.g. "Free Extra Driver" vs. "Free Additional Driver") — that case would resolve via the same `SYNONYM_OF` pattern above, with a `Perk` node as the canonical target instead of `VehicleClass`.
