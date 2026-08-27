# Project State

## Project Reference

See: .coder/PROJECT.md (updated 2026-08-27)

**Core value:** Members get Costco-style negotiated rental rates and perks that stay honored and enforceable across booking, changes, cancellation, and billing — even though the platform never fulfills the rental itself.
**Current focus:** Project initialized — ready for planning

## Current Position

Milestone: v0.1 Ontology & Discovery/Checkout Core
Phase: 4 of 6 (Booking & Rate Integrity) — Not started (transitioning in)
Plan: Not started
Status: Ready to plan/apply Phase 4. Phase 3 (03-01, 03-02, 03-03) fully complete and transitioned.
Last activity: 2026-08-28 — Phase 3 transition complete: PROJECT.md evolved (tech stack + key decisions updated), ROADMAP.md marked Phase 3 complete, STATE.md repositioned to Phase 4.

Progress:
- Milestone: [████░░░░░░] 38%
- Phase 1: [██████████] 100%
- Phase 2: [██████████] 100%
- Phase 3: [██████████] 100% (03-01, 03-02, 03-03 all complete)
- Phase 4: [░░░░░░░░░░] 0% (04-00 drafted/reviewed/finalized, not yet applied)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Loop complete — ready for next PLAN]
```

Phase 3 is now fully complete — a phase transition (PROJECT.md/ROADMAP.md update + phase commit) is due before starting Phase 4 plans, per CODER's transition-phase workflow.

## Accumulated Context

### Decisions
- Phase 3 (03-01): use latest Next.js (15.x/React 19) and latest `@clerk/nextjs`, not pinned to `mastech-agentic-commerce`'s older Next ^14.2.35/React 18 — user-approved override of an adversarial-review flag. Implication: Next 15's async dynamic APIs (`params`/`searchParams`/`cookies()`/`headers()`) apply here; agentic-commerce snippets referencing those APIs synchronously will need adapting when copied in later phases, not pasted verbatim. Resolved to Next 16.3.3/Tailwind v4 at apply time (that's what "latest" was on 2026-08-28); Tailwind v4 uses `@tailwindcss/postcss` + `@import "tailwindcss"` in globals.css instead of the classic `@tailwind` directives.
- Phase 3 (03-01): `create-next-app@latest` refuses to scaffold into a non-empty directory even with `--yes` — hand-wrote the scaffold files per the plan's documented fallback instead.
- Phase 3 (03-01): AC-2 revised post-checkpoint — bare `clerkMiddleware()` with a matcher does NOT globally enforce sign-in redirect (confirmed live: `/` returned 200, not a redirect). `mastech-agentic-commerce` itself doesn't do global protection either — it gates per-page via `auth()`/`redirect()` (see `app/user-profile/page.tsx`). Since 03-01 is scaffold-only with no protected page yet, AC-2 now covers only that Clerk auth plumbing works (sign-in/sign-up render with real keys), confirmed live. Route-level gating (`auth.protect()` or per-page checks) is deferred to whichever Phase 4+ plan adds the first page that needs it.
- Design system/component library (shadcn or similar, per agentic-commerce's storefront) and a Figma prototype review before design work — raised by user during 03-01 APPLY, explicitly out of scope for this plan (minimal placeholder page only). Added to ROADMAP as a Phase 4 pre-step (see below) — needs its own plan before Phase 4 booking UI work starts.
- New sibling repo (not an evolution of BookCars) — different domain model and stack
- Mirrors `mastech-agentic-commerce`'s Discovery/Checkout vs. Fulfillment separation
- UC1, UC2, UC3, UC6 high priority; UC4, UC5, UC7, UC8 low priority (per stakeholder direction)
- Phase 1 split into 01-01 (Vocabulary/Taxonomy/Thesaurus layer design, extending existing ONTOLOGY.md) and 01-02 (Postgres+AGE store stand-up + real seed load), mirroring agentic-commerce's 5-layer (Vocabulary/Taxonomy/Thesaurus/Ontology/Knowledge Graph) model
- Graph store infra lives under `graph/` at repo root (docker-compose, init SQL, Python loader/verify scripts), port 5434 to avoid colliding with agentic-commerce's 5433 if both run locally
- Query-layer contract for Phase 2/3 to consume the graph is explicitly deferred, not part of either Phase 1 plan

- Phase 4 resequenced (2026-08-28) into 5 vertical-slice plans instead of a "04-00 design + 04-01 TBD" placeholder: 04-00 (design, no deps, ready now) → 04-01 (discovery/search, reads 03-02's graph layer) → 04-02 (checkout+booking, closes UC1, consumes 03-03's Stripe/types, adds the deferred graph-write query + deferred mailHelper) → 04-03 (modification/UC2) and 04-04 (cancellation+refund/UC3), both depending only on 04-02, not each other. Reasoning: each plan needs a real prior output to build against (04-02 needs 04-01's selection UI; 04-03/04-04 need a real Booking from 04-02) — collapsing these would force >3-task plans and vague task actions that get revised once upstream outputs actually exist.
- 2026-08-28: 03-03 APPLY completed live with a real Stripe test-mode key — user chose to reuse the same sandbox/key already used for `mastech-agentic-commerce` rather than provision a second Stripe sandbox. Trade-off accepted: test PaymentIntents/customers from both apps co-mingle in one Stripe dashboard view (cosmetic only, no functional effect). All 5 ACs (AC-1, AC-2, AC-3, AC-4, AC-5) passed on first verification, no deviations.
- 2026-08-28: Both 03-03-PLAN.md and 04-00-PLAN.md passed the standing capped adversarial review. 03-03's punch list (7 items): Booking type field mismatch (`memberId`→`member` to match `lib/models/Booking.ts`'s real ObjectId field), full-tree secrets grep (was staged-diff-only), explicit `{ error: string }` 400 body, new AC-5 for Stripe customer-reuse (no duplicate customers), Vendor-model double-registration verify step, `package-lock.json` added to files_modified, `BookingStatus` reworded from "enum" to "string union." 04-00's punch list (12 items, higher-severity theme): AC-4/boundaries/checkpoint all asserted a false premise that Clerk's matcher excludes `/prototype` (it doesn't — the matcher is a catch-all; `/prototype` stays public only because `clerkMiddleware()` enforces nothing by default and nothing links to it) — reworded throughout; `depends_on: []`→`["03-01"]` plus a genuine Prior-Work reference (plan's own text relies on 03-01's Tailwind v4 decision); added `app/layout.tsx`/`app/page.tsx` to DO NOT CHANGE (no nav exists yet — nothing stopped an agent from creating one to link `/prototype`); mock-data field names corrected to align with `lib/graph/queries.ts`'s real `class_name`/`term_id`/`perk_id` shapes (previously invented non-existent fields); Task 1/2 `<verify>` steps made actually executable by an autonomous agent (added component-existence `ls` check, replaced browser-console check with curl+build); `tailwind.config.ts` added to Task 1 files; pinned `npx shadcn@latest init`; added a concrete AC-4 line to `<verification>`.

### Deferred Issues
- Mongo↔Clerk webhook handler to populate `clerkUserId` — deferred to Phase 4 (no real sign-up flow needs it yet)
- Graph write queries (recording a reservation) — deferred to Phase 4 once booking flows exist
- Production Mongo hosting decision — local docker-compose sufficient for now

### Data enhancements made during APPLY (user-approved)
- `bookings_1000.json` gained `rental_id` (FK to Inventory, backfilled by provider+city+vehicle exact match, all 1000 matched) and `requested_addons` (~33% of rows) — original file had neither, leaving `FOR_INVENTORY` and `REQUESTED` edges unseedable otherwise. See `01-02-SUMMARY.md` Deviations for detail.
- `graph/init/01-init-graph.sql` filename (not `001-...` as originally planned) — the `apache/age` image's own baked init script doesn't run in guaranteed alphabetical order with mounted files; renamed to sort reliably after it.
- Plan 01-03: expanded vendors 5→10 (Hertz, Thrifty, Dollar, Sixt, Payless added), `Inventory` 500→1000 rows, `NegotiatedTerm` 15→30, `VendorPolicy` 5→10. `rental_inventory_500.json` renamed to `rental_inventory.json`. Added BookCars-aligned fields (`Vendor.minimum_rental_days/price_change_rate`, `Inventory.vehicle_type/gearbox/seats`). Sixt's real `"300 mi/day"` mileage and Payless's real `"Compact Plus"` VehicleClass alias converted the Thesaurus layer from illustrative-only to real seeded `VocabularyTerm`/`SYNONYM_OF` data. See `01-03-SUMMARY.md`.
- Plan 02-01 (new Phase 2, inserted after Phase 1 per user decision — renumbered old Phases 2–5 to 3–6): new `Intent` node type (10 rows, `data/synthetic/agent_intents.json`) + `TARGETS` edge for action/intent-level vocabulary (the confirmed gap in `mastech-agentic-commerce`'s own thesaurus pattern); `synonyms` list property added directly on `VehicleClass`/`Perk`/`AddOn`/`MembershipTier` nodes (attribute-level, ported from that project's pattern). Ontology/KG only — no tool-calling contract yet. See `02-01-SUMMARY.md`.
- Plan 03-02: established a standing, capped adversarial plan-review practice for all future PLANs — max 3 agents, max 2 rounds, run strictly sequentially (never Workflow-tool fan-out), grounded in `~/.claude/coder/references/subagent-criteria.md`. Applied to 03-02 itself: caught real defects (AGE parameterized-cypher binding shape; pooled-connection `search_path` reset) before APPLY.
- Plan 03-02: AC-3's "9 VehicleClass nodes" target was stale by APPLY time — Phase 2's later ontology work added 3 grouping nodes (Standard/Utility/Premium). Actual/correct seeded count is 12, confirmed via direct cypher query, not a code defect.

### Blockers/Concerns
None yet.

## Session Continuity

Last session: 2026-08-28
Stopped at: Phase 3→4 transition complete. Phase 3 fully closed (03-01, 03-02, 03-03 all PLAN✓ APPLY✓ UNIFY✓). PROJECT.md and ROADMAP.md evolved to reflect Phase 3's shipped tech (Stripe PaymentIntent, bookcars-types port, Vendor entity).
Next action: 04-00-PLAN.md is drafted/reviewed/finalized and ready for /coder:apply — depends only on 03-01 (complete). Awaiting user go-ahead.
Resume file: .coder/phases/03-stack-foundation/03-03-SUMMARY.md
Resume file: .coder/phases/04-booking-rate-integrity/04-00-PLAN.md

---
*STATE.md — Updated after every significant action*
