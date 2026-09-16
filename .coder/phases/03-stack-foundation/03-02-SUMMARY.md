---
phase: 03-stack-foundation
plan: 02
subsystem: infra
tags: [mongodb, mongoose, postgres, apache-age, graph-query-layer]

# Dependency graph
requires:
  - phase: 03-stack-foundation
    plan: 01
    provides: Next.js App Router project, env-file conventions
  - phase: 01-rental-ontology-knowledge-graph
    provides: seeded rental_graph (VehicleClass, NegotiatedTerm, Perk, Vendor)
provides:
  - Local MongoDB (docker-compose) + cached-connection helper
  - Mongoose operational schema: Member, Booking, AdditionalDriver (vendor-owned inventory, not embedded Car)
  - TS graph query layer over Postgres+AGE (lib/graph/client.ts, lib/graph/queries.ts) — closes the query-layer contract deferred since Phase 1
  - /api/health route confirming both stores live
affects: [04-00, 04-01]

# Tech tracking
tech-stack:
  added: [mongoose@9.9.4, pg@8.23.0, "@types/pg@8.23.1", validator@13.15.35, "@types/validator@13.15.10"]
  patterns:
    - "pg.Pool singleton cached on global, mirroring lib/mongodb.ts's hot-reload-safe pattern"
    - "pool.on('connect', ...) re-applies AGE's LOAD/search_path setup per pooled connection (session-scoped, not global)"
    - "AGE param binding via node-postgres $1 placeholder (not psycopg2's %s) casting a single JSON-encoded arg to ::agtype"
    - "Booking stores pricingSnapshot at booking time (rate/perks), not live graph refs — so later rate changes don't retroactively alter confirmed bookings"

key-files:
  created: [docker-compose.mongo.yml, lib/mongodb.ts, lib/models/Member.ts, lib/models/Booking.ts, lib/models/AdditionalDriver.ts, lib/graph/client.ts, lib/graph/queries.ts, app/api/health/route.ts]
  modified: [package.json, .env.local.example, .env.local]

key-decisions:
  - "Adversarial review (3 agents, 2 rounds, run strictly sequentially per user's capped-review directive) caught two real defects before APPLY: AGE's parameterized-cypher binding shape, and pooled-connection search_path reset — both fixed in the plan text before execution"
  - "AC-3's '9 VehicleClass nodes' figure is stale: Phase 2 (agent-ontology-enablement, executed after this plan was drafted) added 3 grouping nodes (Standard/Utility/Premium). Health check now correctly reports vehicleClassCount:12 — verified as the real, current seeded count via direct cypher query, not a defect in this plan's code."
  - "Member drops BookCars' own auth/password fields entirely; clerkUserId is the join key (webhook sync deferred to Phase 4 per plan's scope limits)"

deferred:
  - "Mongo↔Clerk webhook handler that populates clerkUserId — no real sign-up flow needs it yet"
  - "Graph write queries (recording a reservation) — Phase 4 concern once booking flows exist"
  - "Production Mongo hosting decision — local docker-compose is sufficient for now"

acceptance-criteria:
  AC-1: "PASS — /api/health reports mongo:ok"
  AC-2: "PASS — tsc --noEmit clean; Booking uses inventoryId/vendorId string refs, not embedded Car"
  AC-3: "PASS (with noted deviation) — graph query returns real seeded data; count is 12 not 9 due to later Phase 2 additions, confirmed correct via direct query"
  AC-4: "PASS — no secret-shaped strings in any tracked/staged file; .env.local.example carries only placeholders"
---

## What was built

Two operational data stores are now wired into the app:

1. **MongoDB** — `docker-compose.mongo.yml` runs `mongo:7` on `27018` (avoids colliding with agentic-commerce's likely default `27017`). `lib/mongodb.ts` ports agentic-commerce's cached-global-connection pattern verbatim, reading `MONGODB_URI` lazily inside the function body so a missing env var doesn't break `next build`.
2. **Mongoose schema** — `Member` (Clerk-owned identity via `clerkUserId`, `membershipTierId` as a graph-node reference), `Booking` (vendor-owned inventory via `inventoryId`/`vendorId` string refs, plus a `pricingSnapshot` frozen at booking time), `AdditionalDriver` (ported near-verbatim from BookCars).
3. **Graph query layer** — `lib/graph/client.ts` is a `pg.Pool` singleton with AGE's `LOAD`/`search_path` re-applied per pooled connection, and a `runCypher()` helper using node-postgres's `$1::agtype` parameter binding. `lib/graph/queries.ts` exposes `getVehicleClasses`, `getNegotiatedTermsForVendor`, `getPerksForTerm`.
4. **Health check** — `app/api/health/route.ts` checks both stores via `Promise.allSettled` so one failure doesn't mask the other.

Verified live: `curl localhost:3002/api/health` → `{"mongo":"ok","graph":"ok","vehicleClassCount":12}`.

## Process note

This plan was the first to go through the newly-established capped adversarial review process (max 3 agents, max 2 rounds, strictly sequential — per user directive, grounded in `subagent-criteria.md` rather than heavy Workflow-tool orchestration). It caught real, substantive defects in the original Task 3 draft before any code was written.
