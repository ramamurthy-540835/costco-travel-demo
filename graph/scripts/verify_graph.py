import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph_service import schema
from graph_service.agtype import parse_agtype
from graph_service.connection import get_connection

ROOT = Path(__file__).resolve().parents[2]
MOCK = ROOT / "data" / "reference" / "mock-data"
SYNTH = ROOT / "data" / "synthetic"


def load_json(path):
    with open(path) as f:
        return json.load(f)


def count_label(cur, label):
    cur.execute(f"SELECT * FROM cypher('rental_graph', $$ MATCH (n:{label}) RETURN n $$) AS (n agtype);")
    rows = cur.fetchall()
    for (raw,) in rows:
        parse_agtype(raw)
    return len(rows)


def edge_exists(cur, edge_type, from_label, to_label):
    cur.execute(
        f"SELECT * FROM cypher('rental_graph', $$ MATCH (a:{from_label})-[e:{edge_type}]->(b:{to_label}) RETURN e LIMIT 1 $$) AS (e agtype);"
    )
    rows = cur.fetchall()
    for (raw,) in rows:
        parse_agtype(raw)
    return len(rows) > 0


def resolve_one(cur, label, key_field, key_value):
    cur.execute(
        f"SELECT * FROM cypher('rental_graph', $$ MATCH (n:{label} {{{key_field}: $val}}) RETURN n $$, %s::agtype) AS (n agtype);",
        (json.dumps({"val": key_value}),),
    )
    row = cur.fetchone()
    if row is None:
        return None
    return parse_agtype(row[0])


def main():
    conn = get_connection()
    cur = conn.cursor()
    failed = False

    inventory = load_json(MOCK / "rental_inventory.json")
    members = load_json(MOCK / "members_100.json")
    providers = load_json(MOCK / "rental_providers.json")
    bookings = load_json(MOCK / "bookings_1000.json")
    terms = load_json(SYNTH / "negotiated_terms.json")
    perks = load_json(SYNTH / "perks.json")
    addons = load_json(SYNTH / "addon_catalog.json")
    policies = load_json(SYNTH / "vendor_policies.json")
    intents = load_json(SYNTH / "agent_intents.json")
    equivalence_clusters = load_json(SYNTH / "equivalence_clusters.json")

    # "Compact Plus" (Payless) is a naming variant, not a canonical VehicleClass —
    # it becomes a VocabularyTerm node instead, so it must not inflate this count.
    vehicle_class_aliases = {"Compact Plus"}
    distinct_classes = {row["vehicle_class"] for row in inventory} - vehicle_class_aliases
    distinct_cities = {row["city"] for row in inventory}

    expected = {
        "Member": len(members),
        "Vendor": len(providers),
        "VehicleClass": len(distinct_classes) + 3,  # + Standard/Utility/Premium groupings
        "Inventory": len(inventory),
        "Reservation": len(bookings),
        "MembershipTier": 3,
        "Location": len(distinct_cities),
        "NegotiatedTerm": len(terms),
        "Perk": len(perks),
        "AddOn": len(addons),
        "VendorPolicy": len(policies),
        "VocabularyTerm": len({row["vehicle_class"] for row in inventory} & vehicle_class_aliases),
        "Intent": len(intents),
        "EquivalenceCluster": len(equivalence_clusters),
    }

    print("== Label counts ==")
    for label in schema.NODE_LABELS:
        actual = count_label(cur, label)
        exp = expected[label]
        ok = actual == exp
        failed = failed or not ok
        print(f"{'PASS' if ok else 'FAIL'} {label}: expected={exp} actual={actual}")

    print("\n== Edge type presence ==")
    for edge_type, (from_label, to_label) in schema.EDGE_ENDPOINTS.items():
        exists = edge_exists(cur, edge_type, from_label, to_label)
        ok = exists
        print(f"{'PASS' if ok else 'FAIL'} {edge_type} ({from_label}->{to_label})")
        failed = failed or not ok

    print("\n== Identity resolution ==")
    m0 = members[0]
    resolved = resolve_one(cur, "Member", "member_id", m0["member_id"])
    ok = resolved is not None and resolved.get("properties", {}).get("member_id") == m0["member_id"]
    failed = failed or not ok
    print(f"{'PASS' if ok else 'FAIL'} Member lookup ({m0['member_id']})")

    v0 = providers[0]
    resolved = resolve_one(cur, "Vendor", "provider", v0["provider"])
    ok = resolved is not None and resolved.get("properties", {}).get("provider") == v0["provider"]
    failed = failed or not ok
    print(f"{'PASS' if ok else 'FAIL'} Vendor lookup ({v0['provider']})")

    r0 = bookings[0]
    resolved = resolve_one(cur, "Reservation", "reservation_id", r0["reservation_id"])
    ok = resolved is not None and resolved.get("properties", {}).get("reservation_id") == r0["reservation_id"]
    failed = failed or not ok
    print(f"{'PASS' if ok else 'FAIL'} Reservation lookup ({r0['reservation_id']})")

    print("\n== Agent-enablement spot-checks ==")
    vc = resolve_one(cur, "VehicleClass", "class_name", "SUV")
    ok = vc is not None and len(vc.get("properties", {}).get("synonyms", [])) > 0
    failed = failed or not ok
    print(f"{'PASS' if ok else 'FAIL'} VehicleClass 'SUV' has non-empty synonyms")

    perk0 = perks[0]
    p = resolve_one(cur, "Perk", "perk_id", perk0["perk_id"])
    ok = p is not None and len(p.get("properties", {}).get("synonyms", [])) > 0
    failed = failed or not ok
    print(f"{'PASS' if ok else 'FAIL'} Perk '{perk0['perk_id']}' has non-empty synonyms")

    intent0 = intents[0]
    it = resolve_one(cur, "Intent", "intent_id", intent0["intent_id"])
    ok = it is not None and len(it.get("properties", {}).get("synonyms", [])) > 0
    failed = failed or not ok
    print(f"{'PASS' if ok else 'FAIL'} Intent '{intent0['intent_id']}' has non-empty synonyms")

    print("\n== EquivalenceCluster partition (Phase 7) ==")
    real_classes = sorted(distinct_classes)
    cur.execute(
        "SELECT * FROM cypher('rental_graph', $$ MATCH (vc:VehicleClass)-[:PART_OF_CLUSTER]->(c:EquivalenceCluster) RETURN vc.class_name $$) AS (class_name agtype);"
    )
    seeded = [parse_agtype(row[0]) for row in cur.fetchall()]
    ok = sorted(seeded) == real_classes
    failed = failed or not ok
    print(f"{'PASS' if ok else 'FAIL'} every real VehicleClass has exactly one PART_OF_CLUSTER edge (expected={real_classes} actual={sorted(seeded)})")

    print("\n== Location synonyms (Phase 7, LLM-backfilled) ==")
    cur.execute("SELECT * FROM cypher('rental_graph', $$ MATCH (n:Location) RETURN n $$) AS (n agtype);")
    location_rows = cur.fetchall()
    failing_cities = []
    for (raw,) in location_rows:
        props = parse_agtype(raw).get("properties", {})
        if not (props.get("synonyms") or []):
            failing_cities.append(props.get("city"))
    ok = len(failing_cities) == 0
    failed = failed or not ok
    if ok:
        print(f"PASS Location.synonyms non-empty ({len(location_rows)}/{len(location_rows)})")
    else:
        print(f"FAIL Location.synonyms non-empty ({len(location_rows) - len(failing_cities)}/{len(location_rows)}) — missing: {failing_cities}")

    print("\n== VehicleClass embeddings (09-04, pgvector fallback) ==")
    cur.execute("SELECT count(*) FROM public.vehicle_class_embeddings WHERE embedding IS NOT NULL")
    (embedded_count,) = cur.fetchone()
    ok = embedded_count == len(distinct_classes)
    # Non-fatal: the embeddings table only populates once an Azure embeddings
    # deployment is provisioned (external, human-action step) and
    # backfill_embeddings.py has been run — absence must not fail this script.
    print(
        f"{'PASS' if ok else 'SKIP'} vehicle_class_embeddings populated "
        f"({embedded_count}/{len(distinct_classes)}) — SKIP is expected until "
        f"AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME is provisioned and backfill_embeddings.py has run"
    )

    cur.close()
    conn.close()

    if failed:
        print("\nFAILED")
        sys.exit(1)
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
