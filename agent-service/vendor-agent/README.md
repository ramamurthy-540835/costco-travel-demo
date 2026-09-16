# Vendor Agent

Standalone A2A surface for rental-vendor operations: inventory availability, modification/cancellation quotes, and vendor policy lookup. Wraps `lib/vendor-integration/policy.ts` and `lib/graph/queries.ts` — it does not reimplement their logic. One process serves all seeded vendors; vendor identity is a request parameter, not a per-vendor deployment.

## Run

```bash
npm run vendor-agent:dev
```

Runs `tsx agent-service/vendor-agent/server.ts` directly — no Next.js/Express dependency. The server loads `.env.local` itself (a plain `tsx` invocation doesn't get Next's auto-loading), so run it from the repo root.

### Required env vars (defined in `.env.local`)

| Var | Purpose |
|---|---|
| `MONGODB_URI` | Booking data for `check_availability` |
| Graph/Postgres+AGE env vars (see `lib/graph/client.ts`) | Vendor/VendorPolicy/NegotiatedTerm lookups |
| `VENDOR_AGENT_PORT` | Optional, defaults to `4100` |

## Endpoints

- `GET /.well-known/agent-card.json` — static Agent Card listing the 4 skills
- `POST /a2a` — JSON-RPC 2.0, `method: "message/send"`, `params: { skill, ...args }`

## Live-verified examples

Agent Card:

```bash
curl -s localhost:4100/.well-known/agent-card.json | python3 -m json.tool
```

Returns the agent name/description/url and exactly 4 skills (`check_availability`, `apply_modification`, `apply_cancellation`, `get_vendor_policy`), each with `id`/`name`/`description`/`inputSchema`.

### check_availability

```bash
curl -s localhost:4100/a2a -X POST -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","method":"message/send",
  "params":{"skill":"check_availability","vendorId":"Alamo","inventoryId":"RC10001","from":"2026-12-01","to":"2026-12-05"},
  "id":1
}' | python3 -m json.tool
```

```json
{"jsonrpc":"2.0","result":{"id":"check_availability-...","status":{"state":"completed"},"result":{"available":true}},"id":1}
```

### apply_modification

```bash
curl -s localhost:4100/a2a -X POST -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","method":"message/send",
  "params":{"skill":"apply_modification","vendorId":"Alamo","inventoryId":"RC10001","from":"2026-12-01","to":"2026-12-05"},
  "id":2
}' | python3 -m json.tool
```

```json
{"jsonrpc":"2.0","result":{"id":"apply_modification-...","status":{"state":"completed"},"result":{"quote":{"dailyRate":36,"negotiatedTermId":"nt_001","perkIds":["unlimited_mileage"],"currency":"usd"},"cutoff":{"allowed":true,"cutoffHours":24}}},"id":2}
```

Failure path (cutoff violated — `from` inside the vendor's `modification_cutoff_hours` window):

```bash
curl -s localhost:4100/a2a -X POST -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","method":"message/send",
  "params":{"skill":"apply_modification","vendorId":"Alamo","inventoryId":"RC10001","from":"2026-09-07T15:00:00Z","to":"2026-09-08"},
  "id":3
}' | python3 -m json.tool
```

```json
{"jsonrpc":"2.0","result":{"id":"apply_modification-...","status":{"state":"failed","message":"Modification cutoff violated: requires 24h notice"}},"id":3}
```

### apply_cancellation

```bash
curl -s localhost:4100/a2a -X POST -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","method":"message/send",
  "params":{"skill":"apply_cancellation","vendorId":"Alamo","hoursUntilStart":48},
  "id":4
}' | python3 -m json.tool
```

```json
{"jsonrpc":"2.0","result":{"id":"apply_cancellation-...","status":{"state":"completed"},"result":{"refundPercent":100,"withinFreeWindow":true}},"id":4}
```

Unknown vendor (failure path, not a 500):

```bash
curl -s localhost:4100/a2a -X POST -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","method":"message/send",
  "params":{"skill":"apply_cancellation","vendorId":"NotARealVendor","hoursUntilStart":48},
  "id":5
}' | python3 -m json.tool
```

```json
{"jsonrpc":"2.0","result":{"id":"apply_cancellation-...","status":{"state":"failed","message":"Unknown vendorId: NotARealVendor"}},"id":5}
```

### get_vendor_policy

```bash
curl -s localhost:4100/a2a -X POST -H 'Content-Type: application/json' -d '{
  "jsonrpc":"2.0","method":"message/send",
  "params":{"skill":"get_vendor_policy","vendorId":"Alamo"},
  "id":6
}' | python3 -m json.tool
```

```json
{"jsonrpc":"2.0","result":{"id":"get_vendor_policy-...","status":{"state":"completed"},"result":{"provider":"Alamo","rating":4.7,"modification_cutoff_hours":24,"standard_cancellation_window_hours":24,"no_show_fee_applies":true,"no_show_fee_percent":0,"modification_allowed":true,"refund_processing_days":5}},"id":6}
```

## JSON-RPC error responses

- Malformed JSON body → `{"error":{"code":-32700,"message":"Parse error"}}`
- Any `method` other than `message/send` → `{"error":{"code":-32601,"message":"Method not found"}}`
- Unknown `params.skill` → a `failed` Task (not a JSON-RPC error — the skill name is an application-level param, not the RPC method)

## Task-state model

`TaskState` is `'submitted' | 'working' | 'completed' | 'failed' | 'input-required' | 'auth-required'`. Only `completed`/`failed` are assigned by this plan's dispatch logic; `input-required`/`auth-required` are forward-compatible union members reserved for Phase 9 (the Customer/Driver Assistant), so adding real auth/clarification flows later extends the union and one dispatch branch rather than restructuring the response shape.
