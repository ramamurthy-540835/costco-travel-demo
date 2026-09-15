# 02-01 Summary — Agent-Enablement Ontology Layer

## Status: DONE

## What was done
1. Added `graph/graph_schema.sql` (and `graph/init/01-init-graph.sql`, and applied live via `create_vlabel`/`create_elabel` against the already-running container since init scripts don't re-run on an existing volume) — new `Intent` vlabel, `TARGETS` elabel.
2. Created `data/synthetic/agent_intents.json` — 10 `Intent` rows (`book_reservation`, `modify_reservation`, `cancel_reservation`, `check_availability`, `compare_rates`, `request_addon`, `check_in`, `return_vehicle`, `dispute_charge`, `escalate_support`), each with `canonical_phrase`, `synonyms`, `related_uc`, `target_entity`.
3. `graph/graph_service/schema.py` — `NODE_LABELS` +`Intent`; `EDGE_ENDPOINTS` +`TARGETS` (representative pair `Intent -> Reservation`, since `TARGETS` fans out to 4 entity types).
4. `graph/scripts/load_seed_data.py` — added `VEHICLE_CLASS_SYNONYMS`/`PERK_SYNONYMS`/`ADDON_SYNONYMS`/`MEMBERSHIP_TIER_SYNONYMS` dicts; `synonyms` property now set on every `VehicleClass`/`Perk`/`AddOn`/`MembershipTier` node; seeds 10 `Intent` nodes and `TARGETS` edges from each `Intent` to a representative existing node of its `target_entity` type (first `Reservation`/`Inventory`/`NegotiatedTerm`/`AddOn`).
5. `graph/scripts/verify_graph.py` — `Intent` expected count (10); spot-checks that `VehicleClass{class_name:"SUV"}`, `Perk` (first row), and `Intent` (first row) all have non-empty `synonyms`.
6. Updated `VOCABULARY.md` (new Intent row + "Agent-support vocabulary" section), `THESAURUS.md` (new "Action/Intent vocabulary" section — the gap-closer — plus comparative/policy-phrase documentation table), `ONTOLOGY.md` (`Intent` in Entities table, `TARGETS` in Relations block, Gaps section note). `TAXONOMY.md` unaffected — no new hierarchy.
7. Re-ran `load_seed_data.py` twice — identical counts both times (idempotent). Re-ran `verify_graph.py` — **ALL CHECKS PASSED**. Manual Cypher spot-checks confirmed: "cheapest car" → `VehicleClass{class_name:"Economy"}`; "cancel my booking" → `Intent{intent_id:"cancel_reservation"}`.

## Final counts (unchanged from Phase 1 except Intent)
Member 100, MembershipTier 3, Vendor 10, VendorPolicy 10, VehicleClass 12, VocabularyTerm 1, Location 10, Inventory 1000, Reservation 1000, NegotiatedTerm 30, Perk 8, AddOn 8, **Intent 10 (new)**. All 17 edge types present (16 from Phase 1 + new `TARGETS`).

## Deviations from plan
- `TARGETS` is modeled as `Intent -> a representative instance` of the target entity type (e.g. the first `Reservation` row), not a type-level marker node — Apache AGE vlabels don't have standalone "type" nodes to point at. This still demonstrates the traversal shape (an agent resolves intent → entity type → runs the real query per `ONTOLOGY.md`'s UC → traversal mapping table) without inventing new graph structure. Documented in `load_seed_data.py`'s comment and in `ONTOLOGY.md`.
- Init SQL (`graph/init/01-init-graph.sql`) was updated for future fresh-volume boots, but since the container already had a populated volume from Phase 1, the two new labels were also applied live via a direct `create_vlabel`/`create_elabel` call against the running Postgres container (documented in this SUMMARY for traceability).

## Files modified
- `.coder/phases/01-rental-ontology-knowledge-graph/graph_schema.sql`, `graph/init/01-init-graph.sql` (new `Intent` vlabel, `TARGETS` elabel)
- `data/synthetic/agent_intents.json` (new file)
- `graph/graph_service/schema.py`, `graph/scripts/load_seed_data.py`, `graph/scripts/verify_graph.py`
- `.coder/phases/01-rental-ontology-knowledge-graph/{VOCABULARY,THESAURUS,ONTOLOGY}.md`
- `.coder/ROADMAP.md`, `.coder/STATE.md`

No changes to any sibling project (`mastech-agentic-commerce`, `mastech-rental-car-management`) — read-only reference only.

## Next
Ontology/KG-only scope for this phase is complete. Tool-calling contracts (`check_access`/`record_audit`-style gating, typed function definitions for the conversational/fulfillment agents) are deferred until those agents are actually built — grounded in real code rather than speculative design. Run `/coder:unify` to close the Phase 2 loop, then proceed to Phase 3 (Stack Foundation).
