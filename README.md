# Agentic Travel (TKT-001585)

A member-centric, multi-vendor rental-car brokerage platform modeled on the Costco Travel
operating pattern: the platform owns **Discovery and Checkout** (search, negotiated rates,
booking, modification, cancellation), while independent rental vendors (Avis, Budget,
Enterprise, Alamo-style) own **Fulfillment** (vehicle fleet, pickup/return). The platform's
job is to protect a member's negotiated terms and perks across the full rental lifecycle even
though it never touches the vehicle or the rental agreement itself.

A conversational Customer Assistant sits on top of the same booking flow — members can search,
book, modify, cancel, and manage add-ons through chat instead of clicking through forms.

## Architecture

```
                         ┌─────────────────────────┐
        member (browser) │   Next.js app (:3000)    │  Clerk auth, Stripe payments
        ───────────────▶ │   /app, /api/*           │
                         └───────────┬──────────────┘
                                     │ REST (own routes; re-validates Clerk session)
                     ┌───────────────┼────────────────────┐
                     ▼                                    ▼
        ┌─────────────────────────┐          ┌─────────────────────────┐
        │ Customer Assistant       │  A2A/    │ Vendor Agent             │
        │ (:4200) — chat/SSE       │  JSON-RPC│ (:4100) — availability,  │
        │ agent-service/           │ ───────▶ │ modification/cancel      │
        │ customer-assistant       │          │ quotes, vendor policy    │
        └───────────┬──────────────┘          └───────────┬─────────────┘
                     │ MongoDB (conversation/session state)│
                     ▼                                      ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  MongoDB (:27018)         Postgres + Apache AGE graph (:5434) │
        │  Member / Booking docs    Vendor / Inventory / NegotiatedTerm │
        │                           / Perk / Location knowledge graph  │
        └─────────────────────────────────────────────────────────────┘
```

The platform (Next.js app) never talks to a vendor's fleet system directly — it goes through
the Vendor Agent's A2A surface, which applies vendor policy (cutoff windows, refund rules)
before returning a quote. The knowledge graph is the single source of truth for negotiated
rates and perk eligibility, queried by both the booking flow and the chat agents.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend/app | Next.js (App Router) + TypeScript + Tailwind |
| Auth | Clerk |
| Payments | Stripe (test mode) |
| Operational data | MongoDB (`Member`, `Booking` documents via Mongoose) |
| Knowledge graph | PostgreSQL + Apache AGE (Cypher), local-dev-only |
| Conversational agent | Standalone Node/`tsx` service, Azure OpenAI (function calling) + SSE |
| Vendor integration | Standalone A2A (JSON-RPC 2.0) service |
| E2E testing | Playwright, Clerk test-mode users |
| Dev tooling | Agent Lab (Python) — knowledge-graph inspection/demo scripts |

## Prerequisites

- Node.js 20+, npm
- Docker (for local MongoDB and the Postgres+AGE graph store)
- Python 3.10+ (only if you touch `graph/scripts/*` or `agent-lab/*`)
- A Clerk application, a Stripe test-mode account, and an Azure OpenAI resource (chat
  completions with function calling) — see [Environment variables](#environment-variables)

## Getting started

```bash
npm install

cp .env.local.example .env.local   # fill in Clerk / Stripe / Azure OpenAI values
cp .env.test.example .env.test      # only needed for the Playwright regression suite

docker compose -f docker-compose.mongo.yml up -d
docker compose -f graph/docker-compose.yml up -d

pip install -r graph/requirements.txt
python graph/scripts/load_seed_data.py
python graph/scripts/verify_graph.py

npm run dev                        # Next.js app on :3000 (basePath /agentic-travels)
npm run vendor-agent:dev           # Vendor Agent on :4100 (separate terminal)
npm run customer-assistant:dev     # Customer Assistant on :4200 (separate terminal)
```

The Next.js app is served under the `/agentic-travels` base path (`lib/basePath.ts`) —
`http://localhost:3000/agentic-travels`. Both agent services are plain `tsx` processes with
no watch mode: after editing anything under `agent-service/**`, kill and restart the process
to pick up the change.

## Environment variables

All variables are documented inline in [`.env.local.example`](.env.local.example) — Clerk,
MongoDB, the graph database, Azure OpenAI, and Stripe. Service-specific variables (Vendor
Agent, Customer Assistant) are documented in each service's own README:

- [`agent-service/vendor-agent/README.md`](agent-service/vendor-agent/README.md)
- [`agent-service/customer-assistant/README.md`](agent-service/customer-assistant/README.md)
- [`graph/README.md`](graph/README.md)

`.env.test.example` documents the Clerk test-mode credentials needed only for the Playwright
regression suite.

## Project structure

```
app/                      Next.js App Router — pages, layouts, /api routes
components/               Shared React components, incl. the chat widget (assistant-chat.tsx)
lib/
  models/                 Mongoose schemas (Member, Booking)
  graph/                  Postgres+AGE client and query layer
  vendor-integration/     Vendor policy application (wrapped by the Vendor Agent)
  payment/                Stripe helpers
agent-service/
  vendor-agent/           Standalone A2A service — inventory/policy checks (:4100)
  customer-assistant/     Standalone chat/SSE service — conversational booking (:4200)
graph/                    Postgres+AGE docker-compose, init SQL, seed/verify scripts
agent-lab/                Python knowledge-graph inspection/demo tooling
tests/e2e/                Playwright smoke + regression suites (Clerk-authenticated)
docs/product/             Feature specs / design docs
.coder/                   Project/roadmap/phase-plan tracking (PROJECT.md, ROADMAP.md, STATE.md)
```

## Testing

```bash
npm run test:e2e:smoke        # fast, no-auth-required checks
npm run test:e2e:regression   # full Clerk-authenticated regression suite
```

The regression suite drives real chat/booking flows against a real Clerk test-mode user
(`.env.test`) and expects MongoDB, the graph store, and both agent services to be running.

## Further reading

- [`.coder/PROJECT.md`](.coder/PROJECT.md) — product scope, use cases, current status
- [`agent-service/vendor-agent/README.md`](agent-service/vendor-agent/README.md) — A2A skills, JSON-RPC examples
- [`agent-service/customer-assistant/README.md`](agent-service/customer-assistant/README.md) — chat tools, SSE contract, propose/confirm gating
- [`graph/README.md`](graph/README.md) — knowledge graph setup and seeding
