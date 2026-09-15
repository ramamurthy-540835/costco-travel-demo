---
phase: 08-vendor-agent-a2a
plan: 01
subsystem: api
tags: [a2a, json-rpc, tsx, agent-card, vendor-integration]

requires:
  - phase: 04-checkout-modification-cancellation
    provides: lib/vendor-integration/policy.ts (quoteModification, checkAvailability, checkModificationCutoff, quoteCancellation)
  - phase: 01-rental-ontology-knowledge-graph
    provides: lib/graph/queries.ts's getVendorPolicy(), the Vendor/VendorPolicy/NegotiatedTerm graph nodes
provides:
  - Standalone Vendor Agent process (agent-service/vendor-agent/) with a static A2A Agent Card and a JSON-RPC /a2a endpoint over 4 skills
  - Extensible Task/TaskState model (submitted|working|completed|failed|input-required|auth-required) for Phase 9 to build on
affects: [09-customer-driver-assistant]

tech-stack:
  added: []
  patterns: ["A2A Agent Card + JSON-RPC message/send dispatch, Node http module only (no Express/Fastify)", "dependency-free .env.local loader for bare tsx processes outside Next.js"]

key-files:
  created:
    - agent-service/vendor-agent/server.ts
    - agent-service/vendor-agent/agent-card.ts
    - agent-service/vendor-agent/skills.ts
    - agent-service/vendor-agent/README.md
  modified:
    - package.json
    - .coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md
    - .coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md

key-decisions:
  - "Top-level agent-service/ folder (not repo-root vendor-agent/), mirroring mastech-agentic-commerce's layout, per explicit user request"
  - "Node's built-in http module, no Express/Fastify — repo has no HTTP framework dependency and one small endpoint doesn't warrant adding one"
  - "Dependency-free .env.local loader in server.ts — bare tsx invocations don't get Next's auto env-loading and this repo has no dotenv"

patterns-established:
  - "agent-service/<agent-name>/ as the convention for standalone A2A agent processes outside the Next.js app; Phase 9's Customer/Driver Assistant should land at agent-service/customer-assistant/"
  - "Skill handlers import lib/ via relative paths (../../lib/...), never the @/lib/... alias, since agent-service/ is outside Next's module graph"

duration: ~45min
started: 2026-09-07T00:00:00Z
completed: 2026-09-08T00:00:00Z
---

# Phase 8 Plan 01: Vendor Agent A2A Layer Summary

**Standalone Node/tsx Vendor Agent at `agent-service/vendor-agent/` serving a 4-skill A2A Agent Card and JSON-RPC `/a2a` dispatch, wrapping `lib/vendor-integration/policy.ts` and `lib/graph/queries.ts` with zero duplicated business logic.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~45min |
| Started | 2026-09-07 |
| Completed | 2026-09-08 |
| Tasks | 3 completed |
| Files modified | 7 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Agent Card served, all 4 skills described | Pass | Live-verified: `GET /.well-known/agent-card.json` returns 200 with exactly 4 skills, each with id/name/description/inputSchema |
| AC-2: check_availability / get_vendor_policy round-trip real data | Pass | `check_availability` against real `RC10001`/`Alamo` returned real Mongo-backed `{available: true}`; `get_vendor_policy` against real `Alamo` returned the real graph `VendorPolicy` node (`modification_cutoff_hours: 24`, etc.) |
| AC-3: apply_modification / apply_cancellation wrap real policy.ts logic | Pass | `apply_modification` returned the real negotiated term (`nt_001`, `dailyRate: 36`) and correctly failed on cutoff violation and unknown inventoryId; `apply_cancellation` returned correct refund logic for in-window/out-of-window `hoursUntilStart` and failed cleanly on unknown vendorId — no thrown exceptions/500s in any failure path |
| AC-4: Task-state model extensible without over-building | Pass | `TaskState` union includes `input-required`/`auth-required` as uninstantiated forward-compatible members; dispatch always returns a full `Task` object |

## Accomplishments

- Stood up a fully standalone A2A agent process (own port, `tsx`-run, no Next.js/Express coupling) that boots and serves real graph/Mongo-backed data
- All 4 skills live-verified against real seeded data (`Alamo`/`RC10001`) for both success and failure paths, including JSON-RPC-level error cases (parse error, unknown method)
- Zero duplicated business logic — every skill handler is a thin call-through to `policy.ts`/`queries.ts`

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `agent-service/vendor-agent/agent-card.ts` | Created | Static A2A Agent Card (name, description, url, 4 skills w/ inputSchema) |
| `agent-service/vendor-agent/server.ts` | Created | `.env.local` loader, `Task`/`TaskState` types, `http` server (Agent Card GET + JSON-RPC `/a2a` POST) |
| `agent-service/vendor-agent/skills.ts` | Created | `SKILLS` registry: 4 handlers wrapping `policy.ts`/`queries.ts`, each try/catch-wrapped to a `completed`/`failed` `Task` |
| `agent-service/vendor-agent/README.md` | Created | Run instructions, env vars, live-verified curl examples per skill + error paths |
| `package.json` | Modified | Added `vendor-agent:dev` npm script |
| `.coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md` | Modified | Added "Vendor Agent A2A skill surface (Phase 8-01)" subsection |
| `.coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md` | Modified | Added note on skill-name vocabulary, parallel to `Intent` |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `agent-service/` top-level folder instead of repo-root `vendor-agent/` | Explicit user request to mirror `mastech-agentic-commerce`'s layout | Phase 9's Customer/Driver Assistant should land at `agent-service/customer-assistant/` alongside this |
| Adopted the sibling repo's folder-naming convention only, not its Python/FastAPI stack | This repo is already TypeScript/Node; porting frameworks wasn't requested and would be unwarranted scope | Vendor Agent stays consistent with the rest of this codebase's stack |
| Dependency-free `.env.local` loader in `server.ts` | Bare `tsx` doesn't auto-load env like `next dev`/`next build`, and repo has no `dotenv` — found during adversarial plan review before any code was written | Avoids a guaranteed first-run crash on any Mongo/graph call; no new dependency added |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 3 | All caught during adversarial plan review, before APPLY — zero rework during execution |
| Scope additions | 0 | None |
| Deferred | 0 | None |

**Total impact:** Plan executed exactly as adversarially-reviewed; no deviations during APPLY itself.

### Auto-fixed Issues

**1. [Correctness] Missing `.env.local` loading for bare `tsx` invocation**
- **Found during:** Adversarial plan review (round 1), before Task 1 execution
- **Issue:** `next dev`/`next build` auto-load `.env.local`; a bare `tsx agent-service/vendor-agent/server.ts` does not, and the repo has no `dotenv` dependency — `MONGODB_URI`/graph env vars would be `undefined`, throwing on first DB call
- **Fix:** Added a dependency-free loader (`fs`/`path`) at the top of `server.ts`, run before any import that could trigger a DB connection
- **Files:** `agent-service/vendor-agent/server.ts`
- **Verification:** Live-verified — `npm run vendor-agent:dev` successfully connected to real Mongo/graph and served real data

**2. [Clarity] Ambiguous import-path convention for `lib/` modules**
- **Found during:** Adversarial plan review (round 1)
- **Issue:** Plan didn't specify whether skill handlers should use the `@/lib/...` alias (used throughout the Next.js app) or relative paths — `agent-service/` sits outside Next's module graph, so alias resolution under bare `tsx` was unverified
- **Fix:** Plan and implementation standardized on relative paths (`../../lib/vendor-integration/policy`)
- **Files:** `agent-service/vendor-agent/skills.ts`
- **Verification:** `npx tsc --noEmit` clean; live run resolved all imports correctly

**3. [Correctness] AC-3's gherkin implied wrong params for `apply_cancellation`**
- **Found during:** Adversarial plan review (round 1)
- **Issue:** Original AC-3 wording implied `apply_cancellation` took `inventoryId`/`from`/`to` like `apply_modification`; `quoteCancellation()`'s real signature only takes `vendorId`/`hoursUntilStart`
- **Fix:** AC-3 gherkin corrected to match `policy.ts`'s real signature
- **Files:** `.coder/phases/08-vendor-agent-a2a/08-01-PLAN.md`
- **Verification:** Task 2 implemented and live-verified against the corrected signature

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Phase 9's Customer/Driver Assistant has a real A2A surface to call (`POST /a2a`, `message/send`) instead of importing `policy.ts` directly
- `agent-service/` convention established for standalone agent processes; Phase 9 can land at `agent-service/customer-assistant/`
- `TaskState` union already includes `input-required`/`auth-required` for Phase 9 to extend without restructuring the Task shape

**Concerns:**
- No streaming/polling/push/auth on the A2A surface yet (deliberate scope limit, per the 2026-09-07 decision) — Phase 9 will need to decide whether/when to add these
- No docker-compose service definition yet (deliberately deferred to Phase 11)

**Blockers:** None.

---
*Phase: 08-vendor-agent-a2a, Plan: 01*
*Completed: 2026-09-08*
