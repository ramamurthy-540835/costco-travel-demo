# Customer Assistant

Standalone conversational agent for members: search inventory, get quotes, and book/modify/cancel reservations through a chat interface. Wraps this project's existing `/api/bookings*`/`/api/payments/intent` routes and the Phase 8 Vendor Agent — it does not reimplement their business logic, rate/perk integrity checks, or optimistic-lock CAS. One process serves all signed-in members; identity comes from the caller's forwarded Clerk session, never from the model.

## Run

```bash
npm run customer-assistant:dev
```

Runs `tsx agent-service/customer-assistant/server.ts` directly — no Next.js/Express dependency, no coupling to the Next.js process being up. The server loads `.env.local` itself (a plain `tsx` invocation doesn't get Next's auto-loading), so run it from the repo root.

### Required env vars (defined in `.env.local`)

| Var | Purpose |
|---|---|
| `MONGODB_URI` | `ConversationSession` state + this app's own Mongo-backed data |
| Graph/Postgres+AGE env vars (see `lib/graph/client.ts`) | Inventory search, quote/rate lookups |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI resource key |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Azure deployment name — passed as `model` on every `chat.completions.create` call; Azure requires the deployment name here, not a generic model id |
| `AZURE_API_VERSION` | Required by this project's Azure resource. The plain v1-GA `baseURL` style (`.../openai/v1/`, no explicit `api-version`) was tried first and rejected with `400 API version not supported` even when a `defaultQuery` fallback was added — mixing a v1-GA-style `baseURL` with an explicit `api-version` query param is itself invalid against this resource. The `AzureOpenAI` class from the `openai` npm package is used instead; it builds the deployment-scoped URL + `api-version` query param internally from this var. Defaults to `2025-01-01-preview` if unset. |
| `VENDOR_AGENT_URL` | Phase 8 Vendor Agent base URL, e.g. `http://localhost:4100` |
| `NEXTJS_APP_URL` | Next.js app base URL, e.g. `http://localhost:3000` — every mutating/read tool calls this app's own routes |
| `PORT` | Optional, defaults to `4200` |

## Endpoints

- `GET /health`
- `POST /chat` — SSE stream. Body: `{ conversation_id, message, memberId, email }`. The caller's Clerk session cookie must be forwarded on the `Cookie` header — this service never decodes it itself, it forwards it verbatim to the Next.js routes it calls, which re-validate it. `memberId`/`email` are resolved by the caller (the signed-in browser session) and passed as request-level context; the model never supplies these as tool arguments.

Browsers' native `EventSource` cannot send a POST body or custom headers — any UI consuming this endpoint must use `fetch()` with a streamed `ReadableStream` response body, not `EventSource`.

### SSE event vocabulary

| `type` | Fields | Meaning |
|---|---|---|
| `token` | `content` | A fragment of the assistant's streamed text reply |
| `tool_call` | `name`, `args` | The model invoked a tool with these (parsed) arguments |
| `tool_result` | `name`, `result` | The tool handler's real result, forwarded back to the model |
| `done` | — | Turn finished, no more events |
| `error` | `message` | The turn failed (Azure error, or the tool-call loop didn't converge after 8 rounds) |

## The 10 tools

7 base tools (`search_inventory`, `get_quote`, `create_booking`, `modify_booking`, `cancel_booking`, `get_booking_status`, `get_cancellation_policy`) plus 3 propose/preview gate tools (`propose_modification`, `propose_cancellation`, `propose_booking`).

Booking, modification, and cancellation are two-step by server-side design, not just prompting: the model must call the matching `propose_*` tool first; the confirm tool (`create_booking`/`modify_booking`/`cancel_booking`) then atomically consumes that session's one pending proposal (`session-store.ts`'s `consumePendingProposal`, a single `findOneAndUpdate`). A confirm call with no matching pending proposal — missing, already consumed, or expired — is rejected before the real mutating route is ever called.

`consumePendingProposal` matches on an **identity key** (`bookingId` for modify/cancel, the opaque `paymentIntentId` for create), not full-argument equality. A model naturally restates or reformats incidental fields (e.g. echoing dates in a different format, or adding a `from` it inferred from earlier context) when confirming — matching on the full args object as a whole embedded document (as originally implemented) made this brittle, since a subset or reformatted object can never equal Mongo's stored embedded document. On a match, the handler executes using the **originally-proposed args** stored on the session (`matched.pendingProposal.args`), not the model's freshly-restated ones — the mutation always reflects exactly what was quoted to the member, never a model-drifted restatement.

## Live-verified examples

All examples below are copied from real `/chat` responses against seeded data (real Mongo bookings, a real Vendor Agent, real Stripe test-mode PaymentIntents, a real signed-in Clerk test member) — not invented.

### Modification propose → confirm round-trip

Turn 1 — propose:

```bash
curl -N -H "Cookie: $COOKIE" -H "Content-Type: application/json" http://localhost:4200/chat -d '{
  "conversation_id":"convo-1","memberId":"...","email":"...",
  "message":"Please change booking 6a9fc5368dd7c30b8ec8fa5c to run from 2026-10-04 to 2026-10-07."
}'
```

```
data: {"type":"tool_call","name":"propose_modification","args":{"bookingId":"6a9fc5368dd7c30b8ec8fa5c","from":"2026-10-04","to":"2026-10-07"}}
data: {"type":"tool_result","name":"propose_modification","result":{"proposal":{"deltaCents":0,"newTotalPrice":108,"vendorId":"Alamo","dailyRate":36,"perkIds":["unlimited_mileage"]}}}
data: {"type":"token","content":"I have previewed the modification..."}
data: {"type":"done"}
```

Turn 2 (same `conversation_id`) — confirm:

```bash
curl -N -H "Cookie: $COOKIE" -H "Content-Type: application/json" http://localhost:4200/chat -d '{
  "conversation_id":"convo-1","memberId":"...","email":"...",
  "message":"Yes, please go ahead and confirm that modification."
}'
```

```
data: {"type":"tool_call","name":"modify_booking","args":{"bookingId":"6a9fc5368dd7c30b8ec8fa5c","from":"2026-10-04","to":"2026-10-07"}}
data: {"type":"tool_result","name":"modify_booking","result":{"modification":{"bookingId":"6a9fc5368dd7c30b8ec8fa5c","totalPrice":108,"deltaCents":0,"refundAmountCents":0,"refundId":null}}}
```

### AC-3 rejection path (confirm with no prior propose in this conversation)

```
data: {"type":"tool_call","name":"modify_booking","args":{"bookingId":"6a9fc5368dd7c30b8ec8fa5c","from":"2026-10-04","to":"2026-10-07"}}
data: {"type":"tool_result","name":"modify_booking","result":{"error":"No matching pending modification proposal found (missing, already used, or expired). Call propose_modification again."}}
```

The model self-corrected by re-calling `propose_modification` in the same turn — the rejection reaches the model as ordinary tool output, not a thrown error.

### AC-6 payment gate (create_booking)

Propose:

```
data: {"type":"tool_call","name":"propose_booking","args":{"inventoryId":"RC10001","vendorId":"Alamo","from":"2026-11-01","to":"2026-11-04"}}
data: {"type":"tool_result","name":"propose_booking","result":{"totalPrice":108,"paymentIntentId":"pi_...","clientSecret":"pi_..._secret_...","note":"create_booking cannot succeed until the member completes payment in the UI against this client_secret."}}
```

Confirm attempt before payment (rejected — no bypass of the route's own check):

```
data: {"type":"tool_call","name":"create_booking","args":{"inventoryId":"RC10001","vendorId":"Alamo","from":"2026-11-01","to":"2026-11-04","paymentIntentId":"pi_..."}}
data: {"type":"tool_result","name":"create_booking","result":{"error":"Payment has not succeeded"}}
```

Note: this first failed confirm attempt still consumes that pending proposal (the atomic consume happens before the downstream route call resolves) — the model must re-propose (a fresh `propose_booking`/PaymentIntent) after a failed confirm, which it does automatically. This is an accepted consequence of keeping the consume step atomic and single-shot; a caller is never left able to retry the same consumed proposal twice.

Confirm attempt after payment succeeds (real `POST /api/bookings` call, real booking created):

```
data: {"type":"tool_call","name":"create_booking","args":{"inventoryId":"RC10001","vendorId":"Alamo","from":"2026-11-01","to":"2026-11-04","paymentIntentId":"pi_..."}}
data: {"type":"tool_result","name":"create_booking","result":{"booking":{"bookingId":"6a9fc6198dd7c30b8ec8fa61"}}}
```

## Known accepted limitations (pre-existing, out of this plan's boundaries)

- `POST /api/bookings` has no route-level idempotency/dedupe protection of its own. This agent's one-time-consume proposal gate (`consumePendingProposal`) is the only protection against a duplicate `create_booking` confirm through this agent; a caller bypassing the agent entirely and calling the route directly twice with the same succeeded PaymentIntent is a pre-existing route-level gap, not fixed by this plan.
- `POST /api/payments/intent` has no Clerk auth check and trusts its caller's `amount` directly into Stripe with no server-side rate recompute of its own. `propose_booking`'s handler computes the real total itself (the same rate/perk logic `POST /api/bookings` uses) before calling this endpoint, and never forwards a model-supplied amount — this bounds the risk to "the agent computes correctly" rather than the route enforcing it independently.
- A failed confirm attempt (e.g. `create_booking` before payment succeeds) consumes that pending proposal — see the AC-6 example above. The member/model must propose again; this is a one-time-consume tradeoff, not a bug.
