import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph_service.agtype import parse_agtype
from graph_service.connection import get_connection


def cypher(cur, query, params=None):
    if params is not None:
        cur.execute(
            f"SELECT * FROM cypher('rental_graph', $$ {query} $$, %s::agtype) AS (result agtype);",
            (json.dumps(params),),
        )
    else:
        cur.execute(f"SELECT * FROM cypher('rental_graph', $$ {query} $$) AS (result agtype);")


def fetch_vehicle_classes(cur):
    cypher(cur, "MATCH (n:VehicleClass) RETURN n")
    rows = cur.fetchall()
    classes = []
    for (raw,) in rows:
        props = parse_agtype(raw).get("properties", {})
        classes.append(props)
    return classes


def describe(vehicle_class):
    class_name = vehicle_class.get("class_name")
    synonyms = vehicle_class.get("synonyms") or []
    bits = [f"{class_name} — a {class_name.lower()} rental vehicle class."]
    if synonyms:
        bits.append(f"Also called: {', '.join(synonyms)}.")
    for field in ("gearbox", "seats", "fuel_policy", "vehicle_type"):
        val = vehicle_class.get(field)
        if val is not None:
            bits.append(f"{field.replace('_', ' ')}: {val}.")
    return " ".join(bits)


def existing_class_names(cur):
    cur.execute("SELECT class_name FROM public.vehicle_class_embeddings")
    return {row[0] for row in cur.fetchall()}


def main():
    parser = argparse.ArgumentParser(description="LLM-backed embedding backfill for VehicleClass discovery.")
    parser.add_argument("--force", action="store_true", help="Re-embed even if already populated.")
    # Same model mastech-agentic-commerce uses for its own pgvector product
    # search (agent-service/scripts/backfill_embeddings.py there) —
    # text-embedding-3-small, 1536 dims, matching vehicle_class_embeddings.embedding.
    parser.add_argument(
        "--model",
        default=None,
        help="Azure OpenAI embeddings deployment name (defaults to AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME env var, "
        "or 'text-embedding-3-small' if that's unset too).",
    )
    args = parser.parse_args()

    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    deployment = (
        args.model or os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME") or "text-embedding-3-small"
    )
    api_version = os.environ.get("AZURE_API_VERSION")
    if not api_key or not endpoint or not api_version:
        print(
            "AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_API_VERSION must all be set. "
            "Add them to .env.local and export them before running. The embeddings deployment itself "
            f"(defaulting to '{deployment}') must also be provisioned in the Azure portal — this is "
            "external infra, not something this script can create."
        )
        sys.exit(1)
    args.model = deployment

    # See backfill_synonyms.py's identical comment: avoids an httpx/truststore
    # infinite-recursion bug on some macOS/Python 3.12 combinations.
    if not os.environ.get("SSL_CERT_FILE"):
        import certifi

        os.environ["SSL_CERT_FILE"] = certifi.where()

    from openai import AzureOpenAI

    client = AzureOpenAI(api_key=api_key, azure_endpoint=endpoint, api_version=api_version)

    conn = get_connection()
    cur = conn.cursor()

    classes = fetch_vehicle_classes(cur)
    already_done = existing_class_names(cur)

    total_updated = 0
    total_skipped = 0

    for vehicle_class in classes:
        class_name = vehicle_class.get("class_name")
        if class_name in already_done and not args.force:
            total_skipped += 1
            print(f"VehicleClass {class_name}: skipped (already populated)")
            continue

        description = describe(vehicle_class)
        response = client.embeddings.create(model=args.model, input=description)
        embedding = response.data[0].embedding

        cur.execute(
            """
            INSERT INTO public.vehicle_class_embeddings (class_name, description, embedding)
            VALUES (%s, %s, %s::vector)
            ON CONFLICT (class_name) DO UPDATE
              SET description = EXCLUDED.description, embedding = EXCLUDED.embedding
            """,
            (class_name, description, json.dumps(embedding)),
        )
        conn.commit()
        total_updated += 1
        print(f"VehicleClass {class_name}: {description}")

    cur.close()
    conn.close()
    print(f"\nDone. Updated: {total_updated}, Skipped: {total_skipped}")


if __name__ == "__main__":
    main()
