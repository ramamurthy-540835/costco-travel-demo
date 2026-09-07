# Research: Agent Service Extension (Customer/Driver Assistant, Vendor A2A, Agent Lab, Phoenix, Docker-Compose)

**Date:** 2026-09-05
**Requested by:** User, via `/coder:research`
**Agents used:** 2 parallel — `Explore` (codebase: `mastech-agentic-commerce` sibling repo) + `general-purpose` (web: 2025-2026 best practices)

## Topic

Extend the roadmap with an Agent Service layer:
- Customer/Driver Assistant agent — conversational booking/modify/cancel, discovery-to-checkout tools (mirrors agentic-commerce's storefront chat agent)
- Vendor Agent — A2A interaction across the vendor-inventory boundary for inventory checks, modifications, cancellations with vendor-policy application (mirrors agentic-commerce's Store Ops Agent)
- Shared knowledge graph grounding, with ontology/taxonomy/thesaurus enrichment
- Agent Lab for developer assistance
- Observability/Evals via Arize Phoenix
- Single docker-compose deployment + health-check/start-stop scripts

---

## Part A — Codebase findings: `mastech-agentic-commerce` (source of truth for the pattern to port)

### 1. Store Ops Agent + A2A pattern
- `agent-service/agent_service/store_ops/service.py` — standalone Starlette/uvicorn app, own port (8100), own actor identity (`STORE_OPS_ACTOR_ID`). **No LLM call** — pure rules/tool-dispatch agent, not conversational.
- `agent-service/agent_service/store_ops/agent_card.py` — static Agent Card at `GET /.well-known/agent-card.json`: `protocolVersion`, `skills` (projected from OpenAI function defs), `agentInterfaces: [{transport:"JSONRPC", url:".../a2a"}]`, `securitySchemes: []` (no auth — documented demo-scoped limitation).
- `agent-service/agent_service/store_ops/tools.py` — 3 tools: `check_inventory`, `find_equivalence_candidates`, `get_local_offer`.
- Transport: JSON-RPC 2.0, single method `message/send`, POST `/a2a`. Request wraps a custom payload as a `data`-kind Part; response wraps a synchronous Task (`status.state` ∈ `submitted|completed|failed` — **no polling/streaming/push**, single round-trip only).
- Caller side: `agent-service/agent_service/storefront/tools/store_ops_client_tool.py` (`_query_store_ops`) — always a real HTTP call to a different process/port, never an in-process function call, "to prove the trust boundary is real" (code comment).
- Boundary: both agents read the same shared Postgres+AGE KG (Product/EquivalenceCluster nodes), but each owns **separate Postgres tables** for operational facts (`inventory_facts`, `local_offers`) — KG is shared context, operational state is not.
- Design history: `.coder/research/store-ops-agent-a2a-extension.md` in that repo — explicit that this is *scoped-down* A2A conformance (Agent Card ✔, JSON-RPC ✔, Task/Message/Parts ✔; streaming/polling/push/auth deliberately skipped). Travel should state its own conformance level explicitly too, not over/under-claim.
- **Reusability for travel:** near 1:1 — Vendor Agent as separate process, static Agent Card, `/a2a` JSON-RPC endpoint, tools like `check_availability`/`find_alternative_vehicle`/`get_vendor_policy`/`apply_modification`/`apply_cancellation`. Gap: commerce's pattern is binary in-stock/out-of-stock; travel needs **date-range availability**, which this pattern doesn't model — new design work required here.

### 2. Customer-facing conversational assistant
- `agent-service/agent_service/storefront/chat.py` (`run_chat_turn`) — custom hand-rolled multi-turn SSE tool-calling loop directly against Azure OpenAI chat completions (`stream=True`), manual tool-call chunk reassembly, rate limiting, history summarization, output-guardrail checks. **No LangGraph/CrewAI.**
- Tool chain (discovery→checkout) in `storefront/tools/`: `search_products` (hybrid keyword+pgvector+category-graph+synonym+preference re-sort), `add_to_cart`/`remove_from_cart`/`clear_cart`/`view_cart`, `trigger_checkout` (real Stripe Checkout Session), `extract_preference`/`get_my_preferences`, `check_store_availability` (the A2A call).
- Convention: every tool takes `actor` as first param, server-injected from verified session, **never model-controlled** (stripped from model args before dispatch). Ambient request context (e.g. `cart_items`) also injected server-side, never from the model.
- Prompt: one large `SYSTEM_PROMPT` — role/scope anchor + explicit prompt-injection defenses, off-topic refusal, per-tool behavioral rules, strict no-false-claims rule ("never say a purchase is done/complete" unless it is), CMS content flagged as untrusted literal data.
- Guardrails as code, not just prompt: per-actor rate limiter, history summarization above char threshold, post-generation output-violation scan (`_check_output_violations`) — logs to audit but doesn't block an already-streamed response (a real limitation worth improving on for travel, since it means guardrail violations aren't prevented, only detected after the fact).
- **Reusability for travel:** the tool-calling loop shape, `actor`-first convention, SSE event vocabulary, and prompt-injection-defense structure translate directly to a booking/modify/cancel assistant. Cart/Stripe-checkout tools are commerce-specific; travel's equivalents are `search_inventory`→`quote`→`book`→`modify`→`cancel`.

### 3. Agent Lab
- `agent-lab/` — **Jupyter-based dev workspace, not a chat app or agent-builder IDE.**
- Stack: `psycopg[binary]`, `jupyter`/`jupyterlab`, `ipywidgets`, `networkx`, `ipysigma` — pure Python/Jupyter, no orchestration framework.
- Contents: `graph_display.py` (shared display/identity helpers), `notebooks/graph_exploration.ipynb` (interactive KG exploration via networkx/ipysigma against the **live** Postgres+AGE graph), `scripts/generate_knowledge_graph_demo.py` (static HTML KG viz), `docs/` (demo narrative/deck, not app code).
- Wiring: docker-compose opt-in `profiles: [agent-lab]` service (port 8888), build context `.` (repo root) so it can `import agent_service.graph.schema` directly — thin Python client of the same codebase/DB, not its own API.
- **Important gap flagged by the sub-agent:** this is explicitly NOT prompt/tool-testing or agent-scaffolding tooling — it's a graph-inspection + demo-generation notebook. If the travel roadmap's "Agent Lab" concept means a prompt/tool-call debugging harness (which the web research below suggests is the more common meaning), **that is new territory, not something to port verbatim** — see Part B §4 for what a richer Agent Lab would need.

### 4. Phoenix observability/evals
- docker-compose, profile `phoenix`: `phoenix-db` (Postgres 16 backing store) + `phoenix` (`arizephoenix/phoenix:latest`, ports 6006 UI/HTTP-OTLP, 4317 gRPC-OTLP), `PHOENIX_SQL_DATABASE_URL` pointed at `phoenix-db`.
- Instrumentation: `agent-service/agent_service/tracing.py` — `phoenix.otel.register(...)`, `protocol="http/protobuf"`, `auto_instrument=True`, `batch=True`; endpoint/project name from env; sets the **global** OTel TracerProvider as an import-time side effect (import order matters — must happen before other instrumented modules load). Manual spans added in `chat.py` per tool call (`tool.{name}` spans with `tool.args`/`tool.success`/`tool.rate_limited`/etc. attributes).
- Eval suite: `agent-service/evals/` — `search_eval_set.json` (15 hand-labeled query/expected-relevant-ids/tier examples), `search_relevance_eval.py` (real Phoenix Dataset/Experiment run via `phoenix.client.experiments.run_experiment`, custom evaluators: MRR, NDCG@10, preference-boost). `evals/README.md` documents a genuine before/after regression run with real numbers — not aspirational.
- **Reusability:** `tracing.py` registration pattern and the Dataset/Experiment harness are directly reusable; only the eval query content is commerce-specific.

### 5. Docker-compose setup
- Single root `docker-compose.yml` (prod override is separate, not merged at dev layer).
- Services: `postgres` (AGE, port 5433, healthcheck `pg_isready`), `agent-service` (FastAPI, port 8000, `depends_on: postgres condition: service_healthy`), `store-ops-agent` (**same image as agent-service**, different uvicorn target, port 8100), `phoenix-db`+`phoenix` (profile `phoenix`), `mcp-http` (profile `mcp`, port 8765), `agent-lab` (profile `agent-lab`, port 8888), `sanity-studio` (profile `studio`, port 3333), `storefront` (Next.js, port 3000, always-on).
- Convention (explicit comment): unprofiled services always-on; studio/mcp/phoenix/agent-lab opt-in via `docker compose --profile <name> up -d`.
- Networking: default bridge network, service-name addressing (`http://store-ops-agent:8100`, `PG_HOST=postgres`). Must invoke with `--env-file agent-service/.env` since Compose's `${VAR}` substitution needs shell env or explicit `--env-file`, not each service's own `env_file:`.
- **Reusability:** the profile-based opt-in convention and the "one image, multiple uvicorn targets" pattern (agent-service / store-ops-agent) map directly onto travel's customer-assistant + vendor-agent split.

### 6. Health-check / start / stop scripts
- `scripts/health-check.sh` — read-only; checks Storefront/Studio (HTTP), agent-service `/docs`, Store Ops Agent card endpoint (HTTP), MCP stdio+HTTP, tunnel processes, Postgres (TCP), Phoenix UI+OTLP (HTTP/TCP), external managed services via DNS-resolution-only. Never prints `.env` contents.
- `scripts/start-services.sh` — `docker compose --env-file ... up -d` for core set, polls readiness (`wait_for` TCP/HTTP); flags `--with-studio --with-mcp --with-phoenix --with-agent-lab --with-tunnels` bring up profiled services; tunnel PIDs tracked in `.pids/*.pid` with `set -m` for process-group kill.
- `scripts/stop-services.sh` — mirrors start's flags; never `down -v` (explicitly volume-preserving); kills tracked tunnel PIDs (SIGTERM→SIGKILL after 5s); final orphan-reap for stray `uvicorn agent_service*`/ssh processes.
- **Reusability:** strong, fully reusable template — carry over the profile-flag mirroring and "never `-v`" data-safety discipline verbatim.

### 7. Ontology/taxonomy/thesaurus enrichment beyond what travel already ported
- `agent-service/agent_service/graph/ontology.py` — controlled vocabulary constants (colors/materials/styles/occasions/subcategories), explicitly "curated, real-data-grounded, not exhaustive," safe to extend additively.
- `agent-service/scripts/backfill_synonyms.py` — **LLM-generated thesaurus enrichment**: for every vocabulary node, Azure OpenAI forced-tool-call (`generate_synonyms`, 2-4 synonyms) writes a `synonyms: string[]` property via `upsert_node`. Handles same-name-different-label collisions via `(label, key, display_term)` tuples; composite keys for subcategories to avoid cross-parent collisions.
- Consumption: `product_search_tool.py`'s `_attribute_candidates` matches against both canonical `name` and `synonyms` — flat term↔synonym mapping only, not a taxonomy/ontology relation.
- **Genuinely new concept, not a synonym extension:** `EquivalenceCluster` nodes + `PART_OF_CLUSTER` edges — models Product↔Product **substitutability** (for out-of-stock recovery), a structurally distinct relation type from flat synonyms. This was net-new work in commerce (not ported from elsewhere), so travel should treat it as a **template pattern**, not an existing asset to copy. Direct analog for travel: an alternative-vehicle/alternative-route substitution subgraph.
- **Reusability:** vocabulary-constants module + LLM-backfill-synonyms script pattern translate directly (e.g. vehicle-type/amenity/location vocabulary). `EquivalenceCluster` pattern is the best template for "ontology enrichment beyond synonyms."

---

## Part B — Web research: 2025-2026 best practices

### 1. Customer/Driver conversational assistant — standard tool taxonomy

| Stage | Tools |
|---|---|
| Discovery | `search_inventory(location, dates, vehicle_class, filters)`, `get_availability(vendor_id, sku)`, `get_pricing_rules(vendor_id)` |
| Quoting | `get_quote(inventory_id, extras[])`, `apply_promo(code)`, `calculate_taxes_fees()` |
| Checkout | `create_booking(quote_id, customer_id, payment_token)`, `confirm_payment(payment_intent_id)` |
| Post-booking | `get_booking_status(booking_id)`, `modify_booking(booking_id, changes)`, `cancel_booking(booking_id, reason)`, `get_cancellation_policy(booking_id)` |
| Support | `escalate_to_human(context)`, `send_confirmation(channel)` |

Key conventions:
- **Idempotency keys on every mutating tool** — LLM tool-call retries are common; financial/inventory actions must not double-fire. (Travel's existing `modify`/`cancel` routes already use CAS/atomic-claim patterns per STATE.md — this generalizes cleanly to agent-invoked calls.)
- **Two-tier tool schema**: unrestricted read/query tools vs. gated write/action tools requiring explicit confirmation.
- **State/session management**: structured session state (cart/quote/vendor/identity) held **outside** LLM context (state-machine reducer or Mongo/Redis doc keyed by conversation_id), not reconstructed from chat history each turn. Booking flow modeled as an explicit state machine (`searching→quoted→confirming→booked→modifying/cancelling`); LLM proposes transitions, a deterministic guard enforces legality.
- **Human-in-the-loop before irreversible actions**: agent calls a *proposal* tool returning a diff/summary; actual mutating tool only fires after explicit user "yes" — enforced by the orchestration layer, not left to prompt-level judgment (prompt-only confirmation is bypassable via injection/drift).

### 2. A2A protocol (a2a-protocol.org, Linux Foundation-governed, Google-originated)
- **Agent Cards**: JSON discovery docs at `/.well-known/agent.json` (note: commerce repo uses `/agent-card.json` — check current spec convention before travel finalizes its path) declaring identity/skills/modalities/auth/streaming support. Platform fetches vendor's card to learn capabilities without ever touching vendor internals.
- **Message format**: id, `role` (user/agent), `parts` (text/file/data), optional `contextId`/`taskId` for multi-turn correlation.
- **Task lifecycle**: `submitted → working → (input-required | auth-required) → completed | failed | canceled | rejected`. Maps well onto brokerage flows — e.g. vendor agent returns `input-required` for a missing field, `auth-required` if platform hasn't authenticated for that vendor yet. (Commerce's implementation only uses `submitted|completed|failed` — travel could adopt the fuller lifecycle for real vendor-policy interaction, e.g. cutoff windows, multi-step cancellation confirmation.)
- **Interaction pattern**: `message/send` or `message/stream` (SSE); vendor processes async, returns a Task the platform polls/streams.
- **SDKs**: official `a2a-python`/`a2a-js`; framework adapters for LangGraph, CrewAI, Google ADK (native A2A client/server support).
- **Mapping for travel:** platform agent = A2A client; each rental vendor = A2A server exposing skills like `check_inventory`, `apply_modification`, `apply_cancellation`, each vendor enforcing its own policy (rate rules, cutoff hours, no-show fees — cf. `VendorPolicy` in the existing graph) internally rather than the platform hardcoding it.

### 3. Knowledge-graph/ontology enrichment for agent grounding (GraphRAG)
- Dominant enrichment pattern: LLM-driven extraction against a target ontology (entity + relation types) — Neo4j `SimpleKGPipeline`, Microsoft GraphRAG, LlamaIndex `PropertyGraphIndex` — run incrementally as new source data lands. Directly applicable to syncing vehicle-class/location/addon/vendor-policy vocabulary as vendor catalogs update.
- Thesaurus/synonym expansion usually a **separate, periodic batch job** (embedding-similarity search over existing labels to detect near-duplicates/aliases, merge or add `ALIAS_OF` edges) — not inline with agent calls. Matches commerce's `backfill_synonyms.py` batch-script pattern.
- Mature GraphRAG implementations expose the graph via **multiple composable retriever tools** (vector-similarity node lookup, Cypher/graph-traversal query, subgraph summarization) rather than one opaque `graph_search` tool — lets the agent plan multi-hop resolution (e.g. "premium SUV in Austin" → location → vendor → vehicle-class synonym → policy).
- Practical fit: expose the Postgres+AGE graph via an MCP/tool server with 2-3 distinct tools (lookup, traverse, synonym-resolve), plus a scheduled enrichment job for new vendor data.

### 4. Agent Lab / developer tooling (richer than commerce's notebook-only version)
- **LangGraph Studio** (LangSmith) is the closest off-the-shelf analog: visual graph execution view, "time travel" rewind/replay from any past state, thread management, prompt iteration.
- Common in-house pattern for teams not adopting LangSmith wholesale: a lightweight internal playground UI backed by the **same OTel/OpenInference trace store used in production** (i.e., Phoenix) — Agent Lab and observability share one trace backend, with the Lab UI adding editable prompt/tool-schema forms and a "replay this trace with a new prompt version" action.
- Table-stakes features to design toward: conversation/thread list, per-turn tool-call diff view, state-snapshot inspector, fork-a-trace-and-rerun-with-modified-prompt, side-by-side prompt-version comparison.
- **Implication for travel:** commerce's Agent Lab (Jupyter graph-exploration notebook) covers KG debugging only. If the roadmap wants "developer assistance" in the fuller sense (prompt/tool-call testing, trace replay), that's a **new build**, best done as a thin web UI reading from the same Phoenix trace store — not an extension of the Jupyter notebook pattern.

### 5. Phoenix observability & evals
- Deployment: `arize/phoenix` container — ports 6006 (UI+OTLP/HTTP), 4317 (OTLP/gRPC), optional 9090 (Prometheus). `PHOENIX_SQL_DATABASE_URL` for Postgres backing store (14+) vs. SQLite+`PHOENIX_WORKING_DIR` volume for simpler local setups.
- Built on OpenTelemetry + **OpenInference** semantic conventions; auto-instrumentation exists for LangChain, LlamaIndex, DSPy, Vercel AI SDK, and provider SDKs (OpenAI/Anthropic/Bedrock) across Python/TS/Java.
- Standard eval types for agentic/tool-calling systems: task/goal success, tool-selection correctness, groundedness/faithfulness, hallucination detection, latency/cost per turn, human or LLM-as-judge labels.
- Datasets → Experiments model: traces grouped into Datasets (input+expected output), replayed via Experiments against different prompt/app versions with attached evaluators — direct analog for regression-testing the booking agent's tool-calling behavior across prompt/model changes (mirrors commerce's `search_relevance_eval.py`).

### 6. Single docker-compose orchestration — general shape
- One `docker-compose.yml`: `frontend`, `agent-service` (customer/driver assistant), `vendor-integration-service`/`vendor-agent` (A2A server), `graph-db` (Postgres+AGE here), `mongo`, `phoenix`.
- Health checks per service (`healthcheck:` blocks) + `depends_on: condition: service_healthy` so the agent service doesn't accept traffic before graph/Mongo/Phoenix collector are actually up — called out as the most common failure mode in compose setups lacking health checks (agent boots, first trace write fails because Phoenix isn't ready).
- Single bridge network, service-name hostnames (`http://phoenix:6006/v1/traces`, `mongodb://mongo:27017`).
- Start/stop convention: `docker compose up -d --wait` (blocks until healthchecks pass) + `docker compose down`; a `status.sh` curling each health endpoint for a pass/fail table. Matches and reinforces commerce's own script trio (Part A §6) — no material contradiction.

### Sources (web)
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [What is A2A](https://a2a-protocol.org/latest/topics/what-is-a2a/)
- [Arize Phoenix Docs](https://arize.com/docs/phoenix)
- [Phoenix Docker Self-Hosting](https://arize.com/docs/phoenix/self-hosting/deployment-options/docker)
- [LangGraph Platform](https://www.langchain.com/langgraph-platform)
- [LangGraph Studio Docs](https://docs.langchain.com/langgraph-platform/langgraph-studio)
- [Neo4j: What is GraphRAG](https://neo4j.com/blog/genai/what-is-graphrag/)

**Caveat from the web-research agent:** `WebSearch` was non-functional this session (proxy error); findings came from direct `WebFetch` of primary docs + the model's own knowledge base. Worth a second pass with working WebSearch for broader triangulation (car-rental/OTA case studies specifically, `a2a-python` repo internals, LangSmith trace-replay deep-dive) before finalizing an architecture doc.

---

## Key Gaps / Open Questions Surfaced (not resolved by this research — for planning)

1. **Date-range availability** — commerce's Store Ops Agent models binary in-stock/out-of-stock; a rental Vendor Agent needs date-range conflict checking (the existing `checkAvailability()` in `lib/vendor-integration/policy.ts` already does this server-side — question is whether that logic moves behind the A2A boundary or stays platform-side and the Vendor Agent becomes a thinner shim).
2. **A2A conformance level to target** — commerce deliberately skipped streaming/polling/push/auth. Travel should decide up front how much fuller lifecycle (`input-required`/`auth-required`, SSE streaming) it actually needs for real vendor-policy interactions (e.g. cutoff-window rejections, multi-step cancellation approval) vs. staying at commerce's minimal-conformance level.
3. **Agent Lab scope** — commaerce's version is graph-debugging-only (Jupyter). If travel wants genuine "developer assistance" (prompt/tool testing, trace replay), that's new build work reading off Phoenix's trace store, not a port.
4. **EquivalenceCluster-style substitution graph** — no existing travel analog; would need new node/edge types (e.g. alternate vehicle class / alternate pickup location) modeled fresh, following commerce's pattern as a template only.
5. **Guardrail enforcement timing** — commerce's output-violation check is detect-after-stream, not prevent-before-send. Given travel's stricter integrity requirements (negotiated-rate/perk correctness is the whole point of PROJECT.md's Core Value), travel likely needs a stronger pre-commit guard on mutating tool calls (proposal→confirm pattern from Part B §1), not just post-hoc detection.
6. **Which parts run per-vendor vs. platform-side** — the Vendor Agent A2A boundary needs a decision on whether each real vendor gets its own deployed agent instance (true multi-tenant A2A) or the platform hosts one Vendor Agent process per vendor config (simulated, single deployment) — directly affects the docker-compose service list and Phase 7 scope.

---

## Summary (5 bullets)

- Commerce's Store Ops Agent (separate Starlette/uvicorn process, static Agent Card, JSON-RPC `/a2a`, no LLM) is a near-1:1 template for a travel Vendor Agent — main gap is date-range availability, which commerce's binary in-stock model doesn't cover.
- Commerce's customer chat agent is a hand-rolled SSE tool-calling loop (no LangGraph) with a strict `actor`-first tool convention and prompt-injection defenses — directly portable to a booking/modify/cancel assistant; only the cart/Stripe tools are commerce-specific.
- Commerce's "Agent Lab" is a Jupyter graph-debugging notebook, not a prompt/tool-testing IDE — if the roadmap wants the fuller "developer assistance" meaning, that's new work best built as a thin UI over the same Phoenix trace store.
- Phoenix instrumentation (OpenInference/OTel `phoenix.otel.register`) and the Dataset/Experiment eval harness are directly reusable; docker-compose profile-based opt-in services + the start/stop/health-check script trio are a strong, near-verbatim reusable template.
- A2A's full task lifecycle (`input-required`/`auth-required`, SSE streaming) and the `EquivalenceCluster`-style substitution-graph pattern are both available as *design templates*, not existing assets — travel needs fresh decisions on A2A conformance depth and per-vendor deployment topology before planning Phase 7/8 specifics.

---
Review the findings above. This research informs but does not automatically integrate into plans or code.
