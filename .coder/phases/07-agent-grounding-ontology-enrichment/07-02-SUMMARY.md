---
phase: 07-agent-grounding-ontology-enrichment
plan: 02
completed: 2026-09-07T00:00:00Z
---

# 07-02 Summary: LLM-generated synonym backfill + Location vocabulary enrichment

## Outcome
All 3 tasks executed, all 3 acceptance criteria met.

## Deviation from reviewed plan
The reviewed plan targeted plain OpenAI API. Mid-APPLY, at the Task 2 checkpoint, the user reported they had already provisioned Azure OpenAI credentials instead and asked to switch. Classified as a Spec-level change (the plan's own AC-1/Task 1/Task 2 text named "OpenAI" specifically). Plan text (`07-02-PLAN.md`) was updated first, then code:
- `graph/scripts/backfill_synonyms.py` builds an `openai.AzureOpenAI` client (`api_key`/`azure_endpoint`/`api_version`) instead of `openai.OpenAI`
- `--model` falls back to `AZURE_OPENAI_DEPLOYMENT_NAME` (Azure's `model` param must be a deployment name)
- `.env.local.example` lists `AZURE_OPENAI_API_KEY`/`AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_DEPLOYMENT_NAME`/`AZURE_API_VERSION` instead of `OPENAI_API_KEY`
- `graph/requirements.txt`'s `openai>=1.0,<2.0` pin unchanged — `AzureOpenAI` ships in the same package

A separate, unplanned fix was needed to get the live call working at all: the installed `openai==3.2.0` package vendors an internal `httpx2` fork whose default TLS verification (`truststore`) recurses infinitely on this machine (macOS/Python 3.12), surfacing as `openai.APIConnectionError`. Fixed by setting `SSL_CERT_FILE` to `certifi.where()` before constructing the client (bypasses `truststore`, uses the standard `ssl` module instead) — no package downgrade, per explicit user instruction. Considered but did not adopt the sibling `mastech-agentic-commerce` project's pattern (plain `OpenAI` client + `base_url` + explicit real `httpx.Client()`, no `api_version`) — this SDK version's `http_client` param strictly validates against its internal `httpx2.Client`, rejecting a real `httpx.Client()` instance.

## Task 1: backfill_synonyms.py
Built `graph/scripts/backfill_synonyms.py` — Azure-OpenAI-forced-tool-call synonym generator, `--labels`/`--force`/`--model` CLI, idempotent (skips nodes with existing non-empty `synonyms` unless `--force`), reuses `load_seed_data.py`'s connection pattern. Syntax and `--help` verified clean.

## Task 2: live backfill run (checkpoint, approved)
Ran live against real Azure OpenAI: all 10 `Location` nodes updated with real, non-hardcoded synonyms (e.g. `Las Vegas: ['Vegas', 'Sin City', 'The Strip', 'City of Lights']`). AC-1 satisfied. Re-ran with no flags: all 10 skipped, 0 updated — AC-2 (idempotency) confirmed.

## Task 3: verification + documentation
Added `Location.synonyms` non-empty check to `verify_graph.py` — passes 10/10. Updated `VOCABULARY.md` (new Phase 7 agent-support-vocabulary section) and `ONTOLOGY.md` (`Location` row + Phase 7 gaps paragraph). `grep -c backfill_synonyms` on both docs non-zero. AC-3 satisfied.

## Task 4 (added mid-APPLY): self-contained HTML ontology/knowledge-graph viewer
User requested a self-contained HTML viewer for Vocabulary/Taxonomy/Thesaurus/Ontology/Knowledge Graph, mirroring/extending `mastech-agentic-commerce/agent-lab`'s demo, before unify. Added as Task 4 to this plan, then built:
- New `agent-lab/` folder: `requirements.txt`, `scripts/generate_knowledge_graph_demo.py` (read-only reporting script, no server/build step), `docs/knowledge_graph_demo.html` (generated output, 59,914 bytes)
- Reuses real code (`load_seed_data.py`'s synonym dicts) rather than re-typing vocabulary; live-queries this plan's own `Location.synonyms` backfill, taxonomy groupings, thesaurus (naming-variance + Intent synonyms + mileage normalization), and per-label/edge-type ontology counts
- Knowledge Graph view: full vocabulary layer + bounded 8-row sample of Member/Inventory/Reservation (avoids dumping 1000+ nodes), rendered via CDN-loaded vis-network
- One bug fixed during the live run: the `cypher()` helper needed a `columns=N` param to match multi-column `RETURN` queries (was hardcoded to 1 column, causing `DatatypeMismatch`)
- Verified: script ran clean against the live graph; output spot-checked for real data (`Las Vegas` synonym chips present) and valid embedded graph JSON (101 nodes, 102 edges)

## Post-Task-4 cleanup (2026-09-07): drift fix + knowledge-graph detail expansion
User asked to clear the previously-flagged drift and make the Knowledge Graph view more detailed before unify.

**Member drift, root-caused and fixed.** The stray node behind `Member: expected=100 actual=101` was not seed-pipeline drift: it had only a `member_id` property (`6a918a636e134d1cdc979023`, absent from `members_100.json`) and one `RESERVED` edge to an `Inventory` node. `RESERVED` is created only by real live-app code, `lib/graph/mutations.ts`'s `recordReservation()` (`MERGE (m:Member {member_id: $memberId}) ... CREATE (m)-[:RESERVED ...]->(i)`) — a `MERGE` that silently creates a bare Member node on any booking against an unrecognized member_id. Concluded this was leftover manual/dev test data from exercising the booking flow, not a data-integrity bug. Deleted the node and its edge via `DETACH DELETE`. `verify_graph.py` now reports `ALL CHECKS PASSED`.

**Knowledge-graph detail expanded.** Found `NegotiatedTerm` (30 rows) was entirely missing from the viewer's node set — a full ontology type omitted, not just under-sampled. Moved `NegotiatedTerm` and `Member` (100 rows) into the full-dump label set in `agent-lab/scripts/generate_knowledge_graph_demo.py`; raised the remaining sampled labels' (`Inventory`/`Reservation`, 1000 rows each) limit from 8 to 40. Regenerated `agent-lab/docs/knowledge_graph_demo.html`: 287 nodes / 562 edges, all 14 ontology node types represented (was 101 nodes / 102 edges, 3 sampled types, 1 type entirely absent).

## Files modified
- `graph/requirements.txt`
- `.env.local.example`
- `graph/scripts/backfill_synonyms.py` (new)
- `graph/scripts/verify_graph.py`
- `.coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md`
- `.coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md`
- `.coder/phases/07-agent-grounding-ontology-enrichment/07-02-PLAN.md` (Azure pivot + Task 4 addition)
- `.coder/STATE.md`
- `agent-lab/requirements.txt` (new)
- `agent-lab/scripts/generate_knowledge_graph_demo.py` (new)
- `agent-lab/docs/knowledge_graph_demo.html` (new, generated)

## Acceptance criteria
- AC-1: Pass — real Azure OpenAI call, all 10 cities backfilled
- AC-2: Pass — idempotent, confirmed via second run
- AC-3: Pass — both docs updated and grep-confirmed
