# Costco Travel Agentic Platform

This repository combines two complementary Costco Travel rental-car implementations:

- **FastAPI + Vertex AI** (`app/*.py`, `static/`) provides the Cloud Run-ready reservation demo, Firestore and BigQuery integrations, and Gemini concierge.
- **Agentic Travel** (`app/*.tsx`, `components/`, `agent-service/`, `graph/`) provides the member-facing Next.js experience, tool-based customer assistant, vendor A2A agent, and local knowledge graph.

The projects retain their own runtimes and can be developed independently from this one repository. The FastAPI service remains the production-style Costco demo; the Next.js stack provides the richer agentic travel experience.

## Repository layout

```
app/*.py                     FastAPI API and Vertex AI concierge
static/                      FastAPI-served demo frontend
app/*.tsx, components/       Next.js member application
agent-service/               Customer assistant and vendor A2A agent
graph/                       PostgreSQL + Apache AGE knowledge graph
lib/                         Next.js data, payment, graph, and vendor helpers
tests/                       FastAPI tests and Next.js Playwright tests
```

## FastAPI / Vertex AI demo

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID VERTEX_LOCATION=global AGENT_MODEL=gemini-3-flash-preview
export ASSETS_BUCKET=$GOOGLE_CLOUD_PROJECT-costco-demo-assets
uvicorn app.main:app --port 8080
pytest -q
```

Startup idempotently seeds reservations for autonomous and human-in-the-loop demonstrations. Reservation changes use a protected hold/pending/confirm flow; cancellation always requires preview then confirmation.

`GET /api/cars` uses secret-managed SerpAPI inventory when configured and normalized sample inventory otherwise. Images are signed private GCS assets. With `BQ_ENABLED=true`, PII-free activity events are sent to BigQuery.

## Next.js agentic travel stack

```bash
npm ci
cp .env.local.example .env.local
cp .env.test.example .env.test
docker compose -f docker-compose.mongo.yml up -d
docker compose -f graph/docker-compose.yml up -d
pip install -r graph/requirements.txt
python graph/scripts/load_seed_data.py
npm run dev
```

The Next.js application runs on port 3000 under `/agentic-travels`. Run the supporting services in separate terminals:

```bash
npm run vendor-agent:dev
npm run customer-assistant:dev
```

The customer assistant uses tool calls and explicit proposal/confirmation gates. The vendor agent exposes inventory and policy capabilities through A2A JSON-RPC; it is the boundary for vendor fulfillment operations.

## Testing

```bash
pytest -q                    # FastAPI reservation and API flows
npm run test:e2e:smoke       # Next.js smoke tests
npm run test:e2e:regression  # Authenticated end-to-end tests
```

See `agent-service/customer-assistant/README.md`, `agent-service/vendor-agent/README.md`, and `graph/README.md` for service-specific configuration.
