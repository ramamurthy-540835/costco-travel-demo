---
phase: 07-agent-grounding-ontology-enrichment
plan: 01
completed: 2026-09-05T00:00:00Z
duration: ~45min
---

# Phase 7 Plan 01: EquivalenceCluster/PART_OF_CLUSTER Substitution Relation Summary

## Objective

Add a new `EquivalenceCluster` node type + `PART_OF_CLUSTER` edge to the rental knowledge graph, modeling cross-`VehicleClass` substitutability ("no exact match, what's close") — distinct from the existing `PARENT_OF` classification taxonomy (Standard/Utility/Premium). Expose via `getEquivalenceCandidates()`. Grounding work for Phase 8 (Vendor Agent) and Phase 9 (Customer/Driver Assistant).

## What Was Built

| File | Purpose |
|---|---|
| `data/synthetic/equivalence_clusters.json` | New — 5 clusters partitioning all 9 real VehicleClass names |
| `graph/scripts/load_seed_data.py` | Seeds `EquivalenceCluster` nodes + `PART_OF_CLUSTER` edges; partition-completeness assert |
| `graph/scripts/verify_graph.py` | Count check + per-class `PART_OF_CLUSTER` edge-completeness check |
| `graph/graph_service/schema.py` | `NODE_LABELS`/`EDGE_ENDPOINTS` extended (dependency for `verify_graph.py`, not in original `files_modified` list) |
| `lib/graph/queries.ts` | New `getEquivalenceCandidates(className)` query function |
| `package.json` | Added `tsx` devDependency (live TS verification tooling) |
| `.coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md` | New Entities row, Relations line, Phase 7 gaps paragraph |
| `.coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md` | New cluster-listing table + rationale vs. `TAXONOMY.md` |

## Acceptance Criteria Results

| Criterion | Status |
|---|---|
| AC-1: Seeding invariant — every real VehicleClass has exactly one `PART_OF_CLUSTER` edge | Pass |
| AC-2: Query correctness — `getEquivalenceCandidates()` returns correct siblings, singleton clusters return none | Pass |
| AC-3: Documentation updated | Pass |

## Verification Results

- `python3 graph/scripts/load_seed_data.py` — clean, `EquivalenceCluster: 5`, `Edges loaded.`, `Done.`
- `python3 graph/scripts/verify_graph.py` — `ALL CHECKS PASSED`, including `PASS EquivalenceCluster: expected=5 actual=5`, `PASS PART_OF_CLUSTER (VehicleClass->EquivalenceCluster)`, and the new partition check (9/9 real classes)
- Live query via `npx tsx`: `'Economy'` → `['Compact']`, `'Pickup'` → `[]`
- `npx tsc --noEmit` — clean
- `grep -c EquivalenceCluster` on ONTOLOGY.md/VOCABULARY.md — 3/3, non-zero

## Deviations

None from the plan itself. `graph/graph_service/schema.py` was touched even though not listed in the plan's `files_modified` frontmatter — a necessary real dependency for `verify_graph.py`'s label-count/edge-presence checks to recognize the new schema elements, not a scope change.

The plan had already been adversarially reviewed (1 full round + 1 spot-check) before this APPLY, which caught and fixed what would otherwise have been execution-time defects: the `VertexResult` mapping pattern, a non-functional raw-`psql` verify step, and a missing `tsx` dependency for the TS verify step. As a result, every command in this APPLY ran clean on the first attempt — no live-execution surprises.

## Key Patterns/Decisions

- `PART_OF_CLUSTER` (substitutability) is deliberately modeled as a separate relation from `PARENT_OF` (classification taxonomy) — same node type on both ends, different semantic axis.
- `getEquivalenceCandidates()` follows the file's existing `VertexResult`-mapping convention exactly, not a new pattern.

## Next Phase

07-02 (LLM-generated synonym backfill + Location vocabulary enrichment) and 07-03 (composable retriever tools) remain TBD — planned next, either sequentially or in parallel since neither depends on 07-01's output.

---
*Completed: 2026-09-05*
