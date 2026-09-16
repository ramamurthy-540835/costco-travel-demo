# Rental Graph — Postgres + Apache AGE (local dev)

## Setup

```
docker compose -f graph/docker-compose.yml up -d
```

That's the only manual step. On first boot against a fresh volume, `init/001-init-graph.sql` creates the `rental_graph` graph and all vlabels/elabels via `docker-entrypoint-initdb.d`. It will not re-run on a container restart against an existing volume.

## Loading and verifying seed data

```
pip install -r graph/requirements.txt
python graph/scripts/load_seed_data.py
python graph/scripts/verify_graph.py
```

`load_seed_data.py` wipes and re-MERGEs the graph from `data/reference/mock-data/*.json` and `data/synthetic/*.json` — safe to re-run.

## Local-dev-only

This is local-dev-only infra. Apache AGE is unsupported on managed Postgres (Supabase, RDS, etc.) — this graph store does not go to production as-is.

## Connecting from Python

Every DB connection (not just container init) must run `LOAD 'age';` and `SET search_path = ag_catalog, "$user", public;` as separate statements before issuing any Cypher. `graph_service/connection.py`'s `get_connection()` does this for all Python code in this project — always get connections through it rather than opening psycopg connections directly.

## Ports

Postgres is exposed on `5434` (not the default `5432`) to avoid colliding with `mastech-agentic-commerce`'s graph store, which uses `5433`, if both projects run locally at the same time.
