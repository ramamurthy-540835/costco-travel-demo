import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph_service.agtype import parse_agtype
from graph_service.connection import get_connection

KEY_FIELD = {
    "Location": "city",
    "VehicleClass": "class_name",
    "Perk": "perk_id",
    "AddOn": "addon_id",
    "MembershipTier": "tier_id",
}


def cypher(cur, query, params=None):
    if params is not None:
        cur.execute(
            f"SELECT * FROM cypher('rental_graph', $$ {query} $$, %s::agtype) AS (result agtype);",
            (json.dumps(params),),
        )
    else:
        cur.execute(f"SELECT * FROM cypher('rental_graph', $$ {query} $$) AS (result agtype);")


def fetch_nodes(cur, label, key_field):
    cypher(cur, f"MATCH (n:{label}) RETURN n")
    rows = cur.fetchall()
    nodes = []
    for (raw,) in rows:
        props = parse_agtype(raw).get("properties", {})
        nodes.append({key_field: props.get(key_field), "synonyms": props.get("synonyms", [])})
    return nodes


def needs_backfill(node):
    return not node.get("synonyms")


def generate_synonyms(client, model, label, term):
    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": (
                    f'Term type: {label}. Term: "{term}". Generate short colloquial '
                    f"synonyms/nicknames a customer might type or say for this {label.lower()}."
                ),
            }
        ],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "generate_synonyms",
                    "description": "Generate 2-4 short colloquial synonyms/aliases a customer might use for this term",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "synonyms": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 2,
                                "maxItems": 4,
                            }
                        },
                        "required": ["synonyms"],
                    },
                },
            }
        ],
        tool_choice={"type": "function", "function": {"name": "generate_synonyms"}},
    )
    arguments = response.choices[0].message.tool_calls[0].function.arguments
    return json.loads(arguments)["synonyms"]


def main():
    parser = argparse.ArgumentParser(description="LLM-backed synonym backfill for graph vocabulary nodes.")
    parser.add_argument("--labels", default="Location", help="Comma-separated node labels to backfill.")
    parser.add_argument("--force", action="store_true", help="Re-generate synonyms even if already populated.")
    parser.add_argument(
        "--model",
        default=None,
        help="Azure OpenAI deployment name to use (defaults to AZURE_OPENAI_DEPLOYMENT_NAME env var).",
    )
    args = parser.parse_args()

    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    deployment = args.model or os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME")
    api_version = os.environ.get("AZURE_API_VERSION")
    if not api_key or not endpoint or not deployment or not api_version:
        print(
            "AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME, and "
            "AZURE_API_VERSION must all be set. Add them to .env.local and export them before running."
        )
        sys.exit(1)
    args.model = deployment

    # Some installed openai SDK versions vendor an httpx fork that defaults to the
    # `truststore` package for TLS verification; on certain macOS/Python 3.12
    # combinations, truststore's SSLContext.verify_mode patch recurses infinitely.
    # Pointing SSL_CERT_FILE at certifi's bundle makes the HTTP client use the
    # standard ssl module's default context instead of truststore, avoiding this.
    if not os.environ.get("SSL_CERT_FILE"):
        import certifi

        os.environ["SSL_CERT_FILE"] = certifi.where()

    from openai import AzureOpenAI

    client = AzureOpenAI(api_key=api_key, azure_endpoint=endpoint, api_version=api_version)

    conn = get_connection()
    cur = conn.cursor()

    labels = [label.strip() for label in args.labels.split(",") if label.strip()]
    total_updated = 0
    total_skipped = 0

    for label in labels:
        key_field = KEY_FIELD[label]
        nodes = fetch_nodes(cur, label, key_field)
        for node in nodes:
            key_val = node[key_field]
            if not needs_backfill(node) and not args.force:
                total_skipped += 1
                print(f"{label} {key_val}: skipped (already populated)")
                continue
            synonyms = generate_synonyms(client, args.model, label, key_val)
            cypher(
                cur,
                f"MATCH (n:{label} {{{key_field}: $key}}) SET n.synonyms = $synonyms",
                {"key": key_val, "synonyms": synonyms},
            )
            total_updated += 1
            print(f"{label} {key_val}: {synonyms}")

    cur.close()
    conn.close()
    print(f"\nDone. Updated: {total_updated}, Skipped: {total_skipped}")


if __name__ == "__main__":
    main()
