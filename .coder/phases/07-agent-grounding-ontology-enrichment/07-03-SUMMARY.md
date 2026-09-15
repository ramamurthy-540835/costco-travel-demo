---
phase: 07-agent-grounding-ontology-enrichment
plan: 03
subsystem: database
tags: [cypher, apache-age, graph-retrieval, tool-calling, typescript]

requires:
  - phase: 07-agent-grounding-ontology-enrichment (07-01, 07-02)
    provides: EquivalenceCluster/PART_OF_CLUSTER substitution relation, Location.synonyms backfill — both consumed by this plan's cross-checks and resolveSynonym's label set
provides:
  - lib/graph/retrievers.ts — lookupNode/traverse/resolveSynonym, the sanctioned generic query surface for Phase 8/9 agent tool-calling
  - agent-lab "Retriever Tools" demo section with real live output
  - ONTOLOGY.md/VOCABULARY.md documentation of the retriever-tool surface
affects: [08-vendor-agent-a2a, 09-customer-driver-assistant-agent]

tech-stack:
  added: []
  patterns:
    - "Generic label/property-parameterized Cypher retrievers, parallel to (not replacing) queries.ts's bespoke functions"
    - "AGE Cypher lacks ANY(...WHERE...) list-predicate support — use UNWIND ... WITH ... WHERE ... RETURN DISTINCT instead"

key-files:
  created: [lib/graph/retrievers.ts]
  modified: [agent-lab/scripts/generate_knowledge_graph_demo.py, agent-lab/docs/knowledge_graph_demo.html, .coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md, .coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md]

key-decisions:
  - "resolveSynonym searches exactly 6 labels (VehicleClass, Perk, AddOn, MembershipTier, Location, Intent), confirmed via exhaustive grep against all 14 NODE_LABELS during adversarial review"
  - "AGE's Cypher dialect rejects ANY(...WHERE...) list predicates — resolveSynonym uses UNWIND/WITH/WHERE instead, discovered via live execution, not review"

patterns-established:
  - "Any future agent/tool-calling code queries the graph via lib/graph/retrievers.ts, not by growing new bespoke queries.ts functions"

duration: ~2h
started: 2026-09-07T00:00:00Z
completed: 2026-09-07T00:00:00Z
---

# Phase 7 Plan 03: Composable Retriever Tools Summary

**Generic `lookupNode`/`traverse`/`resolveSynonym` retriever surface in `lib/graph/retrievers.ts`, verified live against the real graph and demonstrated in the agent-lab HTML demo — the sanctioned query path for Phase 8/9 agent tool-calling.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~2h |
| Tasks | 2 completed |
| Files modified | 5 (1 created, 4 modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: lookupNode resolves any labeled node by property | Pass | Verified live: Vendor/Hertz, VehicleClass/Economy (with synonyms), missing → null |
| AC-2: traverse resolves one-hop relations, either direction | Pass | Cross-checked byte-for-byte against `getNegotiatedTermsForVendor`/`getEquivalenceCandidates` |
| AC-3: resolveSynonym finds canonical nodes across every synonym-bearing label | Pass | Case-insensitive, `[]` for unknown term, both confirmed live |
| AC-4: Retriever tools documented and demonstrated | Pass | agent-lab "Retriever Tools" section with real output; ONTOLOGY.md/VOCABULARY.md both updated, grep-confirmed non-zero |

## Accomplishments

- Built `lib/graph/retrievers.ts`'s 3 generic functions, all verified live against the real Postgres+AGE graph including cross-checks against existing bespoke `queries.ts` functions — not just independently correct.
- Discovered and fixed a real Apache AGE Cypher dialect limitation (no `ANY(...WHERE...)` list-predicate support) via live execution, not caught by adversarial review.
- Extended the agent-lab HTML demo with a "Retriever Tools" section mirroring the 3 functions via equivalent raw Cypher (Python can't import TypeScript), showing real output (e.g. `lookupNode('Vendor','provider','Hertz')`, `resolveSynonym('Vegas')`).
- Documented the retriever-tool surface in both ONTOLOGY.md (new subsection) and VOCABULARY.md (note + label list) as the sanctioned query path for Phase 8/9 agent code.

## Task Commits

Not committed individually per-task in this session; see Git State note below — a single phase-completion commit will follow via the transition workflow.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `lib/graph/retrievers.ts` | Created | `lookupNode`, `traverse`, `resolveSynonym` — generic graph query surface |
| `agent-lab/scripts/generate_knowledge_graph_demo.py` | Modified | Added `gather_retriever_examples()`/`render_retriever_tools_section()`, wired into `main()`, added `pre`/`code` CSS |
| `agent-lab/docs/knowledge_graph_demo.html` | Modified (regenerated) | New "Retriever Tools" section with real live output |
| `.coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md` | Modified | New "Retriever tool surface (Phase 7-03)" subsection |
| `.coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md` | Modified | Note on retriever-tool surface + 6-label `resolveSynonym` list |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Generic functions return untyped property bags (`Record<string, unknown>`), no per-label interfaces | The point of a generic surface is label-agnosticism; typed wrappers belong to future callers, not this plan | Phase 8/9 tool schemas will need their own narrowing/validation |
| `queries.ts` left untouched | Boundary explicitly protects Phase 4-6 route call-sites | Deferred-refactor note only, no code change |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Both caught by live execution, essential correctness fixes |
| Scope additions | 0 | None |
| Deferred | 0 | None beyond the plan's own explicitly-deferred `queries.ts` refactor note |

**Total impact:** Two real bugs fixed via live verification; no scope creep.

### Auto-fixed Issues

**1. [Correctness] MembershipTier key-field mismatch in `resolveSynonym`**
- **Found during:** Task 1 implementation
- **Issue:** `SYNONYM_LABELS` used `matchProperty: 'tier_name'` for MembershipTier
- **Fix:** Corrected to `tier_id`, confirmed via `load_seed_data.py`'s `merge_node(cur, "MembershipTier", "tier_id", ...)`
- **Files:** `lib/graph/retrievers.ts`
- **Verification:** Live query against seeded MembershipTier nodes

**2. [Correctness] AGE Cypher dialect rejects `ANY(...WHERE...)` list predicates**
- **Found during:** Task 1 verification (`npx tsx scripts/verify-retrievers.ts`)
- **Issue:** Original `resolveSynonym` Cypher (`WHERE ANY(s IN n.synonyms WHERE ...)`) threw `syntax error at or near "WHERE"` — AGE's Cypher parser doesn't support this syntax
- **Fix:** Rewrote as `UNWIND n.synonyms AS s WITH n, s WHERE toLower(s) = toLower($term) RETURN DISTINCT n`
- **Files:** `lib/graph/retrievers.ts`
- **Verification:** Standalone `node -e` script against the live pool, then full re-run of `verify-retrievers.ts` — all 9 assertions PASS

### Deferred Items

None — the plan's own noted deferred item (whether existing `queries.ts` bespoke functions could be refactored to use the new retrievers internally) remains explicitly out of scope per this plan's own Boundaries, not a new deferral.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `07-03-PLAN.md` frontmatter's `files_modified` listed `lib/graph/queries.ts`, but the plan's own Objective/Output explicitly says it stays unchanged | Not modified, as the plan's substantive text intended — frontmatter discrepancy flagged here, consistent with 07-01's precedent |
| `<pre>`/`<code>` tags in the agent-lab HTML had no CSS rule, would render unreadable on the dark theme | Added CSS proactively before regenerating the demo |

## Next Phase Readiness

**Ready:**
- Phase 7 (3/3 plans) complete — ontology enrichment (EquivalenceCluster, Location/Intent synonym backfill) and the generic retriever-tool surface are both in place for Phase 8's Vendor Agent and Phase 9's Customer/Driver Assistant to consume.
- `lib/graph/retrievers.ts` is a stable, generic, label-agnostic query surface ready to be wrapped in LLM tool schemas.

**Concerns:**
- `resolveSynonym`'s 6-label list is a static array, not derived from schema — a future contributor adding `synonyms` to a new label must remember to update both `retrievers.ts` and `VOCABULARY.md`.

**Blockers:**
None.

---
*Phase: 07-agent-grounding-ontology-enrichment, Plan: 03*
*Completed: 2026-09-07*
