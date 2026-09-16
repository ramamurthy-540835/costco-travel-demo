---
phase: 09-customer-driver-assistant-agent
plan: 01
subsystem: api
tags: [azure-openai, tool-calling, sse, mongo, a2a, stripe, session-state]

requires:
  - phase: 08-vendor-agent-a2a
    provides: agent-service/vendor-agent's A2A Agent Card + JSON-RPC /a2a endpoint (check_availability, apply_modification, apply_cancellation, get_vendor_policy)
  - phase: 04-checkout-modification-cancellation
    provides: POST /api/bookings, /api/bookings/[id]/modify, /api/bookings/[id]/cancel, /api/payments/intent (unchanged, called via forwarded Clerk session)
  - phase: 01-rental-ontology-knowledge-graph
    provides: lib/graph/queries.ts's searchInventory, negotiated-rate/perk data
provides:
  - Standalone Customer Assistant process (agent-service/customer-assistant/) with a POST /chat SSE tool-calling endpoint over 10 tools
  - Mongo-backed ConversationSession session-state model with an atomic propose-then-confirm gate (consumePendingProposal)
  - agent-service/customer-assistant/README.md's /chat SSE contract for 09-02's chat UI to consume
affects: [09-customer-driver-assistant-agent (09-02, chat UI)]

tech-stack:
  added: [openai (npm, AzureOpenAI client)]
  patterns:
    - "AzureOpenAI class (not a hand-rolled v1-GA baseURL) for this project's Azure OpenAI resource, which requires an explicit api-version"
    - "Identity-key + stored-original-args confirm pattern: consumePendingProposal matches on caller-supplied identity fields via per-field dot-paths, then the mutating call executes using the session's originally-proposed args, never the model's freshly-restated ones"
    - "tool-role chat messages are turn-scoped only — never persisted into cross-turn session history"

key-files:
  created:
    - agent-service/customer-assistant/env.ts
    - agent-service/customer-assistant/session-store.ts
    - agent-service/customer-assistant/vendor-agent-client.ts
    - agent-service/customer-assistant/tools.ts
    - agent-service/customer-assistant/chat-loop.ts
    - agent-service/customer-assistant/server.ts
    - agent-service/customer-assistant/README.md
  modified:
    - package.json
    - .coder/phases/01-rental-ontology-knowledge-graph/VOCABULARY.md

key-decisions:
  - "AzureOpenAI SDK class over a hand-rolled v1-GA baseURL client — this Azure resource rejects the v1-GA style outright (400 API version not supported), even with a defaultQuery api-version fallback"
  - "consumePendingProposal matches on an identity key (bookingId, or the opaque paymentIntentId) via per-field dot-paths, not whole-embedded-document equality — a model naturally restates/reformats incidental fields when confirming, and Mongo's whole-doc equality made every real confirm attempt brittle"
  - "Confirm handlers execute using the session's originally-stored proposal args, not the model's restated confirm-time args — guarantees the mutation always reflects exactly what was quoted to the member"
  - "search_inventory tool output capped to 10 rows (real-data discovery, this session) — the full 1000+-row catalog blew past Azure's per-request rate limit and had no member-facing value beyond a handful of options"

patterns-established:
  - "agent-service/customer-assistant/ alongside agent-service/vendor-agent/ — both standalone Node/tsx processes outside the Next.js module graph, own ports, own .env.local loaders"
  - "Every mutating tool call resolves caller identity/auth only from server-side request context (Clerk cookie forwarded from the /chat request), never from model tool-call arguments"

duration: ~3h (spanning env-fix cycles + live verification)
started: 2026-09-08T00:00:00Z
completed: 2026-09-08T00:00:00Z
---

# Phase 9 Plan 01: Customer Assistant Backend Summary

**Standalone Node/tsx Customer Assistant at `agent-service/customer-assistant/` serving a 10-tool Azure-OpenAI-backed `POST /chat` SSE tool-calling loop, with a Mongo-backed session-state model enforcing a server-side propose-then-confirm gate on every mutating booking operation — wrapping this project's existing checkout/modification/cancellation/payment routes and the Phase 8 Vendor Agent with zero duplicated business logic.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~3h |
| Started | 2026-09-08 |
| Completed | 2026-09-08 |
| Tasks | 4 completed |
| Files modified | 9 |

## Acceptance Criteria Results

| AC | Description | Result | Evidence |
|----|--------------|--------|----------|
| AC-1 | Independently deployable process, own port, no Next.js coupling | ✅ Pass | `npm run customer-assistant:dev` boots standalone on port 4200, loads `.env.local` itself, connects to real Mongo — no `next dev` process required |
| AC-2 | Discovery tools return real graph/Mongo-backed data | ✅ Pass | Live `/chat` `search_inventory`/`get_quote` calls returned real `lib/graph/queries.ts`-sourced inventory/rate data through the model's own tool resolution |
| AC-3 | Mutating tools require propose-then-confirm, enforced server-side | ✅ Pass | Live-verified: a `modify_booking` confirm with no matching pending proposal in that conversation returned the server-side rejection (`"No matching pending modification proposal found..."`) before any real route was called; the model self-corrected by re-proposing |
| AC-4 | Mutating tool calls forward the caller's real Clerk session, never a client-supplied member ID | ✅ Pass | `server.ts` forwards the request's `Cookie` header verbatim to every internal `fetchJson` call in `tools.ts`; `memberId`/`email` come only from the `/chat` request body's server-side context, never from model tool-call args |
| AC-5 | Vendor Agent calls use the real A2A JSON-RPC surface | ✅ Pass | `get_quote`/`get_cancellation_policy` call `vendor-agent-client.ts`'s `callVendorSkill`, a real `message/send` JSON-RPC POST to the Phase 8 Vendor Agent's `/a2a` endpoint; a `failed` Task state returns a typed error, never throws |
| AC-6 | `create_booking` only fires after a real succeeded PaymentIntent — never chat-text-only | ✅ Pass | Live-verified through the full chat loop: a confirm attempt before payment returned the route's own `"Payment has not succeeded"` error; after completing payment on the real Stripe test-mode PaymentIntent, the same confirm flow succeeded and created a real booking |

## Key Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `AzureOpenAI` SDK class instead of the plan's originally-specified v1-GA `baseURL` client | This project's Azure resource rejected the v1-GA style with `400 API version not supported`, even with a `defaultQuery` api-version fallback added — mixing a v1-GA `baseURL` with an explicit `api-version` param is itself invalid against this resource | `chat-loop.ts` uses `new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment })`, which builds the deployment-scoped URL + query param internally |
| `consumePendingProposal` redesigned to match on identity fields via per-field dot-paths, not whole-object equality | The original whole-embedded-document filter (`'pendingProposal.args': args`) is fundamentally incompatible with any subset/reformatted args object — a model restating a date differently or adding an inferred field at confirm time could never match, making every real confirm attempt fail until the model happened to echo the exact original object | `modify_booking`/`cancel_booking` match on `bookingId`, `create_booking` matches on the opaque `paymentIntentId`; all three then execute using the session's stored original proposal args |
| `search_inventory` capped to 10 results | The real catalog (1000+ rows) returned as a tool result triggered a genuine Azure rate-limit `429` during live verification | Tool result now returns `{totalMatches, results: results.slice(0, 10)}` |
| Tool-role messages never persisted into cross-turn session history | A bare `tool`-role message is only valid immediately following its own `tool_calls` message within the *same* completions request; replaying it standalone into a later turn was rejected by the Azure API with a 400 | Only `user`/final `assistant` text turns are persisted via `appendHistory`; the assistant's own text reply carries cross-turn context for tool outcomes |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed (real bugs found during live verification, not caught by direct-handler testing) | 5 | Fixed and re-verified live before qualifying Task 3; no deferred work |
| Scope additions | 0 | None |
| Deferred | 0 | None (accepted limitations documented in README, per plan boundaries) |

### Auto-fixed Issues

**1. [Correctness] `computeBookingTotal` over-charged add-ons**
- **Found during:** Task 2 live verification
- **Issue:** Unconditionally summed all non-waived priced add-ons into the quoted total, but this tool chain has no `addonIds` param and `POST /api/bookings` defaults to `[]` — every `create_booking` attempt failed with a rate-mismatch rejection
- **Fix:** Removed add-on computation; `totalPrice: dailyRate * nights` only
- **Files:** `agent-service/customer-assistant/tools.ts`

**2. [Correctness] `consumePendingProposal`'s whole-document-equality match was brittle against natural model variance**
- **Found during:** Task 3 live verification (a real modify confirm failed because the model added a `from` field the original propose call never had)
- **Issue:** Matching on full/partial `args` object equality against Mongo's embedded document can never succeed for a model-restated subset or reformatted object
- **Fix:** Redesigned `consumePendingProposal` to filter on caller-supplied identity fields via per-field dot-paths (`pendingProposal.args.<key>`); `create_booking`/`modify_booking`/`cancel_booking` now match on an identity key alone and execute using the session's originally-stored proposal args
- **Files:** `agent-service/customer-assistant/session-store.ts`, `agent-service/customer-assistant/tools.ts`

**3. [Compatibility] Azure OpenAI client rejected the plan's specified v1-GA `baseURL` style**
- **Found during:** Task 3 live verification
- **Issue:** `400 API version not supported`, even with a `defaultQuery` api-version fallback
- **Fix:** Switched to the `openai` package's `AzureOpenAI` class
- **Files:** `agent-service/customer-assistant/chat-loop.ts`

**4. [Correctness] `search_inventory` tool output size triggered a real Azure rate-limit error**
- **Found during:** Task 3 live verification
- **Issue:** Full 1000+-row catalog relayed to the model as tool output
- **Fix:** Capped to 10 results plus a `totalMatches` count
- **Files:** `agent-service/customer-assistant/tools.ts`

**5. [Correctness] Cross-turn replay of `tool`-role history entries rejected by the Azure API**
- **Found during:** Task 3 live verification
- **Issue:** `400 ... messages with role 'tool' must be a response to a preceding message with 'tool_calls'` — `compactedHistory`'s flat replay lost the structural linkage a `tool` message requires
- **Fix:** Stopped persisting `tool`-role entries into `session-store.ts`'s history; only `user`/final `assistant` text turns are persisted
- **Files:** `agent-service/customer-assistant/chat-loop.ts`

## Issues Encountered

None outstanding. All issues found during live verification were fixed and re-verified in this same APPLY pass.

## Next Phase Readiness

**Ready:**
- 09-02 (chat UI) can consume this plan's `/chat` SSE contract directly — event vocabulary (`token`/`tool_call`/`tool_result`/`done`/`error`) documented in the README, along with the `fetch()`-not-`EventSource` requirement
- `propose_booking`'s `client_secret` is ready for 09-02's Stripe Elements payment-collection step per AC-6
- All 10 tool names recorded in `VOCABULARY.md` as the agent-facing vocabulary, parallel to Phase 8's skill vocabulary

**Concerns:**
- A failed confirm attempt (e.g. `create_booking` before payment completes) consumes that pending proposal — the model must re-propose. Documented as an accepted tradeoff of keeping the consume step single-shot/atomic, not a bug, but 09-02's UI should account for this (a failed confirm needs a fresh propose, not a bare retry).
- `POST /api/bookings`'s lack of route-level idempotency and `POST /api/payments/intent`'s lack of its own auth/rate-recompute are pre-existing gaps outside this plan's boundaries — disclosed in the README, not fixed here.

**Blockers:** None.

---
*Phase: 09-customer-driver-assistant-agent, Plan: 01*
*Completed: 2026-09-08*
