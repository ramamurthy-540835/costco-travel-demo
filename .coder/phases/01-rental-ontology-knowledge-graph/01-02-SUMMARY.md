# 01-02 Summary — Postgres + Apache AGE Stand-up + Seed Load

## Status: DONE

## Tasks completed
1. **Docker Compose stand-up** — `graph/docker-compose.yml` (image `apache/age:release_PG16_1.6.0`, port 5434, self-sufficient init via `docker-entrypoint-initdb.d`), `graph/init/01-init-graph.sql` (verbatim copy of `graph_schema.sql`'s DDL, minus comments), `graph/README.md`. Container verified healthy; `rental_graph` confirmed in `ag_catalog.ag_graph`; 12 vlabels + 16 elabels created (13/17 including AGE's default base labels). AC-1 and AC-2 satisfied.
2. **Connection/agtype helpers + seed loader** — `graph/graph_service/{connection,agtype,schema}.py`, `graph/scripts/load_seed_data.py`. Loads all 11 real node types (VocabularyTerm intentionally excluded) via wipe-then-MERGE, plus all 16 edge types. Ran twice consecutively with identical counts — idempotent. AC-3 (loader half) satisfied.
3. **Verification script** — `graph/scripts/verify_graph.py`. All 12 label counts match real source-file counts, all 16 edge types checked (14 present, `SYNONYM_OF` correctly asserted as 0 — see Deviations), all 3 identity-resolution lookups (Member/Vendor/Reservation) pass. AC-3 and AC-4 satisfied.

## Deviations from the plan (with rationale)

1. **Init SQL filename**: plan specified `graph/init/001-init-graph.sql`. Renamed to `01-init-graph.sql` because the `apache/age` image ships its own baked-in `00-create-extension-age.sql`, and this image's entrypoint does not process `docker-entrypoint-initdb.d/*` in guaranteed alphabetical order — `001-init-graph.sql` ran *before* `00-create-extension-age.sql` in practice, causing the baked script's non-idempotent `CREATE EXTENSION age;` (no `IF NOT EXISTS`) to fail and the container to exit. `01-init-graph.sql` sorts unambiguously after `00-...` regardless of locale/collation quirks, fixing this.
2. **`bookings_1000.json.rental_id` added** (data enhancement, user-approved): the original file had no FK to a specific `Inventory` row — only `provider`/`pickup_city`/`vehicle` strings — so `Reservation-[:FOR_INVENTORY]->Inventory` had no real join key. Backfilled by matching each booking's (provider, pickup_city, vehicle) against inventory's (provider, city, vehicle_make+vehicle_model); all 1000 rows matched exactly. Mirrors `mastech-agentic-commerce` sibling `mastech-rental-car-management`'s `Booking.car` FK convention (`backend/src/models/Booking.ts`), read-only reference only.
3. **`bookings_1000.json.requested_addons` added** (data enhancement, user-approved): no source data existed for `Reservation-[:REQUESTED]->AddOn` (needed for UC6). Backfilled a `requested_addons` list on ~33% of reservations, sourced from real `addon_catalog.json` IDs.
4. **`SYNONYM_OF` verify exception**: Task 3's action as written required "at least one edge" for all 16 edge types, but this phase's own boundaries explicitly forbid loading THESAURUS.md's illustrative-only placeholder entries as real seed data, and current data has no real VehicleClass/vendor naming variance to normalize. `verify_graph.py` was corrected to assert exactly 0 `SYNONYM_OF` edges (documented as expected, not a failure) — the same treatment as the `VocabularyTerm` = 0 exception already in the plan.
5. **`VehicleClass` count includes the 3 taxonomy groupings** (Standard/Utility/Premium) per TAXONOMY.md — 9 leaf classes + 3 parent groupings = 12, not 9. `verify_graph.py`'s expected count reflects this.

No changes were made to any sibling project (`mastech-agentic-commerce`, `mastech-rental-car-management`) — used read-only for reference only, per user's standing constraint.

## Files modified
- `graph/docker-compose.yml`, `graph/init/01-init-graph.sql`, `graph/README.md`
- `graph/requirements.txt`, `graph/graph_service/{__init__,connection,agtype,schema}.py`
- `graph/scripts/{load_seed_data,verify_graph}.py`
- `data/reference/mock-data/bookings_1000.json` (enhanced: `+rental_id`, `+requested_addons`)
- `.coder/phases/01-rental-ontology-knowledge-graph/{ONTOLOGY.md,VOCABULARY.md}` (documented the data enhancements)

## Next
Phase 1 complete. Run `/coder:unify` to close the loop, then proceed to Phase 2 (Stack Foundation).
