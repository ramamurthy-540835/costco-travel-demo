# Taxonomy — Rental Ontology Phase 1

## VehicleClass hierarchy

All 9 distinct canonical `VehicleClass.class_name` values observed in `data/reference/mock-data/rental_inventory.json` (Economy, Compact, Mid-size, Full-size, SUV, Minivan, Pickup, Luxury, Convertible), grouped into 3 parent groupings. (Payless's `"Compact Plus"` raw value, added Plan 01-03, is a naming variant of `Compact`, not a 10th class — see `THESAURUS.md`.)

| Parent Grouping | Children | Justification |
|---|---|---|
| Standard | Economy, Compact, Mid-size, Full-size | Everyday passenger cars scaled by size/price tier — the default rental segment most members book |
| Utility | SUV, Minivan, Pickup | Higher-capacity/cargo vehicles chosen for passenger count or hauling need, not price tier |
| Premium | Luxury, Convertible | Discretionary/upgrade vehicles chosen for the experience, commanding the highest daily rates |

## MembershipTier rank

Strict order sourced from `data/synthetic/membership_tiers.json`'s `rank` field:

| Rank | tier_id | name |
|---|---|---|
| 1 | gold_star | Gold Star |
| 2 | executive | Executive |
| 3 | business | Business |

Gold Star (1) < Executive (2) < Business (3).

This rank governs negotiated-term eligibility comparisons in Phase 3 (e.g. "does this member's tier meet or exceed the minimum tier required for a given perk/waiver").

## Represented as graph

Direction convention: **child points to parent**, matching `ONTOLOGY.md`'s existing "specific points to general" style (e.g. `Inventory-[:INSTANCE_OF]->VehicleClass`).

```
(child:VehicleClass)-[:PARENT_OF]->(parent:VehicleClass)
```

Example: `(economy:VehicleClass {class_name: 'Economy'})-[:PARENT_OF]->(standard:VehicleClass {class_name: 'Standard'})`

The 3 parent groupings (Standard, Utility, Premium) are themselves `VehicleClass` nodes — new nodes introduced by this taxonomy, not one of the 9 observed leaf values. Plan 01-02 must create these 3 grouping nodes in addition to the 9 leaf nodes when seeding.

This direction is fixed here so Plan 01-02 does not have to guess or re-derive it.
