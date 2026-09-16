---
phase: 09-customer-driver-assistant-agent
plan: 06
subsystem: agent-service
tags: [a2a, vendor-agent, availability-check, conversational-boundary]

requires:
  - phase: 09-customer-driver-assistant-agent
    plan: 01
    provides: agent-service/customer-assistant's POST /chat SSE tool-calling endpoint, TOOLS/TOOL_HANDLERS, and propose_booking
  - phase: 08-vendor-agent-a2a
    plan: 01
    provides: Vendor Agent service (agent-card + /a2a JSON-RPC dispatcher), callVendorSkill/isVendorTaskError client, check_availability skill

provides:
  - propose_booking now makes a real A2A check_availability call to the Vendor Agent before quoting/charging, gating on a live per-date-range availability check
  - Vendor-declined-availability is a distinct, non-retryable error surfaced to the member in plain text, separate from the existing id-mismatch retry path
  - callVendorSkill no longer crashes the process on a network-level failure (ECONNREFUSED etc.) — returns a VendorTaskError instead

affects: []

tech-stack:
  patterns:
    - "A conversational booking flow (LLM tool-calling) is the natural place for an A2A vendor boundary check; a traditional direct-checkout HTTP route can legitimately stay graph-only — the two surfaces are allowed to diverge in vendor-integration depth as long as the boundary is explicit and documented, not accidental"
    - "An A2A client function whose type signature promises a typed error union (T | VendorTaskError) must actually catch network-level fetch failures itself — a bare `await fetch(...)` throws on ECONNREFUSED/DNS failure, which is an uncaught rejection at the call site, not the graceful error the return type implies. This bug was latent (get_quote's only caller, unused by the booking flow) until this plan made callVendorSkill load-bearing for every new booking."

key-files:
  modified:
    - agent-service/customer-assistant/tools.ts
    - agent-service/customer-assistant/chat-loop.ts
    - agent-service/customer-assistant/vendor-agent-client.ts

key-decisions:
  - "app/api/bookings/route.ts and app/(checkout)/checkout/checkout-form.tsx were left completely untouched, per the user's explicit instruction that A2A can be avoided in the traditional/non-chat booking experience."
  - "Reused the existing check_availability vendor-agent skill and callVendorSkill/isVendorTaskError client as-is — no new vendor-agent skill or transport change was needed; this plan is purely a new caller of Phase 8's existing A2A layer."
  - "The availability gate lives entirely in propose_booking (before PaymentIntent creation), not duplicated in create_booking — matches the existing propose/confirm split where propose_booking is where all checks/quoting happen and create_booking just replays the already-vetted pendingProposal."
  - "Fixed an unplanned but necessary bug in callVendorSkill (bare fetch() not wrapped in try/catch) discovered during live verification of the vendor-agent-down scenario — required for this plan's own stated requirement that the gate fail cleanly, not crash, when the Vendor Agent is unreachable."
---

# Phase 9 Plan 06 Summary: A2A Vendor-Agent Verification in the Conversational Booking Flow

| | |
|---|---|
| Started | 2026-09-10 |
| Completed | 2026-09-10 |
| Tasks | 2 planned (availability gate + prompt guidance) + 1 unplanned fix (callVendorSkill network-error handling) |
| Files modified | 3 |

## Acceptance Criteria Results

| AC | Description | Result | Evidence |
|----|--------------|--------|----------|
| AC-1 | propose_booking calls the Vendor Agent (A2A) for a real availability check before quoting/charging | ✅ Pass | Direct handler invocation for an unoccupied inventory/date range succeeded end-to-end (PaymentIntent + pendingProposal created) only after a real `check_availability` A2A round-trip to the running Vendor Agent (`:4100`) |
| AC-2 | A vendor-reported unavailable date range blocks the proposal with a plain-text error, no PaymentIntent/pendingProposal created | ✅ Pass | Created a real conflicting `reserved` Booking row directly in Mongo, then called `propose_booking` for the same inventory/overlapping dates — got back `"Alamo reports this vehicle is not available for 2026-11-02 to 2026-11-04 — try different dates or another vendor."` and no PaymentIntent side effect |
| AC-3 | Vendor Agent unreachable fails cleanly, not by hanging or crashing | ✅ Pass | Stopped the vendor-agent process, called `propose_booking` — got back `"Vendor availability check failed: Vendor Agent unreachable: fetch failed"` instead of an uncaught crash (see Auto-fixed Issue #1) |
| AC-4 | Traditional checkout path (`/checkout`, `POST /api/bookings`) unaffected | ✅ Pass | Neither file was modified; `POST /api/bookings` still matches directly against `searchInventory()` results with zero Vendor Agent involvement |

## Auto-fixed Issues

1. **`callVendorSkill`'s bare `fetch()` was not wrapped in try/catch, so a network-level failure (Vendor Agent process down → `ECONNREFUSED`) threw an uncaught rejection instead of returning the `VendorTaskError` its own return type promises.** This was latent because the only prior caller (`get_quote`) is unused by the booking flow — this plan made `callVendorSkill` load-bearing for every new booking proposal, surfacing the bug during the AC-3 verification step (stopping the vendor-agent process to test the failure path caused an unhandled `TypeError: fetch failed` crash rather than a graceful error). Fixed in `agent-service/customer-assistant/vendor-agent-client.ts` by wrapping the `fetch()` call in try/catch and returning `{ error: true, message: "Vendor Agent unreachable: ..." }` on failure. Re-verified: same repro now returns the clean error string above.

## Deviations from Plan

- None in scope/approach — the plan's three sections (availability gate in `propose_booking`, one-line prompt addition, documenting the runtime dependency) were implemented as designed.
- One unplanned fix (see Auto-fixed Issue #1) was required to actually satisfy the plan's own AC-3/Verification requirement that a Vendor-Agent-down scenario "fail cleanly ... rather than hanging" — the plan anticipated this failure mode conceptually but the concrete implementation gap (missing try/catch) was only discovered during live verification.

## Verification

- `npx tsc --noEmit` clean after all changes.
- Live, against the real running services (Next.js `:3000`, customer-assistant tools invoked directly against the live graph/Mongo/Stripe, vendor-agent `:4100`):
  - Confirmed `check_availability`'s A2A contract directly via `curl` against `:4100/a2a`.
  - Full successful `propose_booking` run for an open inventory/date range — real A2A call fired, PaymentIntent created.
  - Real conflicting `Booking` row created in Mongo (cleaned up after) — `propose_booking` for the same inventory/overlapping dates correctly blocked with a vendor-availability error, no PaymentIntent created.
  - Vendor-agent process stopped and restarted — confirmed the clean-failure error message, then confirmed normal operation resumed after restart.
- Confirmed via `git status`/file diff that `app/api/bookings/route.ts` and `app/(checkout)/checkout/checkout-form.tsx` were not touched.
- All scratch verification artifacts (temp Mongo booking doc, `/tmp/*.txt` output files) deleted; vendor-agent process restarted in its original form.

All 4 ACs Pass.
