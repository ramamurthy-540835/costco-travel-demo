import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph_service.connection import get_connection

ROOT = Path(__file__).resolve().parents[2]
MOCK = ROOT / "data" / "reference" / "mock-data"
SYNTH = ROOT / "data" / "synthetic"

TAXONOMY_GROUPS = {
    "Standard": ["Economy", "Compact", "Mid-size", "Full-size"],
    "Utility": ["SUV", "Minivan", "Pickup"],
    "Premium": ["Luxury", "Convertible"],
}

# Raw vehicle_class strings that are naming variants, not new VehicleClass nodes.
# Inventory rows using these are INSTANCE_OF the canonical class; the alias itself
# becomes a VocabularyTerm --SYNONYM_OF--> canonical VehicleClass edge.
VEHICLE_CLASS_ALIASES = {
    "Compact Plus": "Compact",
}

# Agent-Enablement Ontology Layer (Phase 2): attribute-level colloquial synonyms,
# added as a `synonyms` list property directly on the node — mirrors
# mastech-agentic-commerce's synonym-property pattern (read-only reference).
VEHICLE_CLASS_SYNONYMS = {
    "Economy": ["cheapest car", "basic car", "small car"],
    "Compact": ["small sedan", "city car"],
    "Mid-size": ["medium car", "standard sedan"],
    "Full-size": ["large sedan", "big car"],
    "SUV": ["crossover", "4x4", "truck-like"],
    "Minivan": ["family van", "people carrier"],
    "Pickup": ["truck", "pickup truck"],
    "Luxury": ["premium car", "high-end car"],
    "Convertible": ["drop-top", "cabriolet"],
}

PERK_SYNONYMS = {
    "unlimited_mileage": ["no mileage cap", "unlimited miles"],
    "free_additional_driver": ["free extra driver", "no charge for second driver"],
    "no_young_driver_fee": ["no under-25 fee", "young driver waiver"],
    "waived_underage_fee": ["no under-21 fee", "underage driver waiver"],
    "free_upgrade_priority": ["priority upgrade", "free vehicle upgrade"],
    "damage_waiver_included": ["free CDW", "included damage insurance"],
    "consolidated_billing": ["single invoice billing", "one bill for the business"],
    "flexible_cancellation": ["free cancellation", "no cancellation fee"],
}

ADDON_SYNONYMS = {
    "additional_driver": ["extra driver", "second driver"],
    "young_driver_fee": ["under-25 surcharge", "young driver charge"],
    "underage_driver_fee": ["under-21 surcharge", "underage driver charge"],
    "collision_damage_waiver": ["CDW", "damage insurance", "collision coverage"],
    "gps_navigation": ["GPS", "navigation unit", "sat nav"],
    "child_seat": ["car seat", "booster seat"],
    "roadside_assistance": ["breakdown cover", "roadside help"],
    "fuel_prepay": ["prepaid gas", "fuel plan"],
}

MEMBERSHIP_TIER_SYNONYMS = {
    "gold_star": ["base tier", "starter membership"],
    "executive": ["mid tier", "upgraded membership"],
    "business": ["top tier", "highest tier", "best membership"],
}


def load_json(path):
    with open(path) as f:
        return json.load(f)


def cypher(cur, query, params=None):
    if params is not None:
        cur.execute(
            f"SELECT * FROM cypher('rental_graph', $$ {query} $$, %s::agtype) AS (result agtype);",
            (json.dumps(params),),
        )
    else:
        cur.execute(f"SELECT * FROM cypher('rental_graph', $$ {query} $$) AS (result agtype);")


def merge_node(cur, label, key_field, key_value, props):
    params = dict(props)
    params[key_field] = key_value
    prop_str = ", ".join(f"{k}: ${k}" for k in params)
    cypher(cur, f"MERGE (n:{label} {{{key_field}: ${key_field}}}) SET n += {{{prop_str}}}", params)


def merge_edge(cur, from_label, from_key, from_val, to_label, to_key, to_val, edge_type):
    cypher(
        cur,
        f"""
        MATCH (a:{from_label} {{{from_key}: $from_val}})
        MATCH (b:{to_label} {{{to_key}: $to_val}})
        MERGE (a)-[:{edge_type}]->(b)
        """,
        {"from_val": from_val, "to_val": to_val},
    )


def main():
    conn = get_connection()
    cur = conn.cursor()

    print("Wiping rental_graph...")
    cypher(cur, "MATCH (n) DETACH DELETE n")

    members = load_json(MOCK / "members_100.json")
    providers = load_json(MOCK / "rental_providers.json")
    inventory = load_json(MOCK / "rental_inventory.json")
    bookings = load_json(MOCK / "bookings_1000.json")
    tiers = load_json(SYNTH / "membership_tiers.json")
    terms = load_json(SYNTH / "negotiated_terms.json")
    perks = load_json(SYNTH / "perks.json")
    addons = load_json(SYNTH / "addon_catalog.json")
    policies = load_json(SYNTH / "vendor_policies.json")

    # --- Nodes ---

    for t in tiers:
        props = dict(t)
        props["synonyms"] = MEMBERSHIP_TIER_SYNONYMS.get(t["tier_id"], [])
        merge_node(cur, "MembershipTier", "tier_id", t["tier_id"], props)
    print(f"MembershipTier: {len(tiers)}")

    for p in providers:
        merge_node(cur, "Vendor", "provider", p["provider"], p)
    print(f"Vendor: {len(providers)}")

    for p in policies:
        merge_node(cur, "VendorPolicy", "provider", p["provider"], p)
    print(f"VendorPolicy: {len(policies)}")

    vehicle_classes = sorted(
        {row["vehicle_class"] for row in inventory if row["vehicle_class"] not in VEHICLE_CLASS_ALIASES}
    )
    for vc in vehicle_classes:
        merge_node(cur, "VehicleClass", "class_name", vc, {"class_name": vc, "synonyms": VEHICLE_CLASS_SYNONYMS.get(vc, [])})
    for group in TAXONOMY_GROUPS:
        merge_node(cur, "VehicleClass", "class_name", group, {"class_name": group, "synonyms": []})
    print(f"VehicleClass: {len(vehicle_classes) + len(TAXONOMY_GROUPS)}")

    vocabulary_terms = sorted(set(VEHICLE_CLASS_ALIASES) & {row["vehicle_class"] for row in inventory})
    for term in vocabulary_terms:
        merge_node(cur, "VocabularyTerm", "term", term, {"term": term})
    print(f"VocabularyTerm: {len(vocabulary_terms)}")

    cities = sorted({row["city"] for row in inventory})
    for city in cities:
        merge_node(cur, "Location", "city", city, {"city": city})
    print(f"Location: {len(cities)}")

    for row in inventory:
        merge_node(cur, "Inventory", "rental_id", row["rental_id"], row)
    print(f"Inventory: {len(inventory)}")

    for m in members:
        merge_node(cur, "Member", "member_id", m["member_id"], m)
    print(f"Member: {len(members)}")

    for b in bookings:
        props = {k: v for k, v in b.items() if k != "requested_addons"}
        merge_node(cur, "Reservation", "reservation_id", b["reservation_id"], props)
    print(f"Reservation: {len(bookings)}")

    for t in terms:
        props = {k: v for k, v in t.items() if k != "perks"}
        merge_node(cur, "NegotiatedTerm", "term_id", t["term_id"], props)
    print(f"NegotiatedTerm: {len(terms)}")

    for p in perks:
        props = dict(p)
        props["synonyms"] = PERK_SYNONYMS.get(p["perk_id"], [])
        merge_node(cur, "Perk", "perk_id", p["perk_id"], props)
    print(f"Perk: {len(perks)}")

    for a in addons:
        props = {k: v for k, v in a.items() if k != "typically_covered_by_perk"}
        props["synonyms"] = ADDON_SYNONYMS.get(a["addon_id"], [])
        merge_node(cur, "AddOn", "addon_id", a["addon_id"], props)
    print(f"AddOn: {len(addons)}")

    intents = load_json(SYNTH / "agent_intents.json")
    for i in intents:
        merge_node(cur, "Intent", "intent_id", i["intent_id"], i)
    print(f"Intent: {len(intents)}")

    # --- Edges ---

    tier_name_to_id = {t["name"]: t["tier_id"] for t in tiers}

    for m in members:
        tier_id = tier_name_to_id.get(m["membership_tier"])
        if tier_id:
            merge_edge(cur, "Member", "member_id", m["member_id"], "MembershipTier", "tier_id", tier_id, "HOLDS_TIER")

    for b in bookings:
        merge_edge(cur, "Member", "member_id", b["member_id"], "Reservation", "reservation_id", b["reservation_id"], "MADE")
        merge_edge(cur, "Reservation", "reservation_id", b["reservation_id"], "Location", "city", b["pickup_city"], "AT_LOCATION")
        merge_edge(cur, "Reservation", "reservation_id", b["reservation_id"], "Vendor", "provider", b["provider"], "WITH_VENDOR")
        merge_edge(cur, "Reservation", "reservation_id", b["reservation_id"], "Inventory", "rental_id", b["rental_id"], "FOR_INVENTORY")
        for addon_id in b.get("requested_addons", []):
            merge_edge(cur, "Reservation", "reservation_id", b["reservation_id"], "AddOn", "addon_id", addon_id, "REQUESTED")

    for row in inventory:
        canonical_class = VEHICLE_CLASS_ALIASES.get(row["vehicle_class"], row["vehicle_class"])
        merge_edge(cur, "Inventory", "rental_id", row["rental_id"], "VehicleClass", "class_name", canonical_class, "INSTANCE_OF")
        merge_edge(cur, "Inventory", "rental_id", row["rental_id"], "Location", "city", row["city"], "LOCATED_AT")
        merge_edge(cur, "Inventory", "rental_id", row["rental_id"], "Vendor", "provider", row["provider"], "OFFERED_BY")

    for alias, canonical in VEHICLE_CLASS_ALIASES.items():
        if alias in vocabulary_terms:
            merge_edge(cur, "VocabularyTerm", "term", alias, "VehicleClass", "class_name", canonical, "SYNONYM_OF")

    for p in providers:
        merge_edge(cur, "Vendor", "provider", p["provider"], "VendorPolicy", "provider", p["provider"], "GOVERNED_BY")

    for t in terms:
        merge_edge(cur, "MembershipTier", "tier_id", t["membership_tier"], "NegotiatedTerm", "term_id", t["term_id"], "ELIGIBLE_FOR")
        merge_edge(cur, "Vendor", "provider", t["provider"], "NegotiatedTerm", "term_id", t["term_id"], "OFFERS_TERM")
        for perk_id in t.get("perks", []):
            merge_edge(cur, "NegotiatedTerm", "term_id", t["term_id"], "Perk", "perk_id", perk_id, "INCLUDES_PERK")

    for a in addons:
        perk_id = a.get("typically_covered_by_perk")
        if perk_id:
            merge_edge(cur, "Perk", "perk_id", perk_id, "AddOn", "addon_id", a["addon_id"], "WAIVES")

    for group, children in TAXONOMY_GROUPS.items():
        for child in children:
            merge_edge(cur, "VehicleClass", "class_name", child, "VehicleClass", "class_name", group, "PARENT_OF")

    # Intent.TARGETS: each Intent points at a representative node of the entity type
    # it acts on (per data/synthetic/agent_intents.json's target_entity field), so an
    # agent can resolve a recognized intent straight to the traversal it needs (see
    # ONTOLOGY.md's "UC -> graph traversal mapping" table for the actual traversal).
    target_anchor = {
        "Reservation": ("Reservation", "reservation_id", bookings[0]["reservation_id"]),
        "Inventory": ("Inventory", "rental_id", inventory[0]["rental_id"]),
        "NegotiatedTerm": ("NegotiatedTerm", "term_id", terms[0]["term_id"]),
        "AddOn": ("AddOn", "addon_id", addons[0]["addon_id"]),
    }
    for i in intents:
        anchor = target_anchor.get(i["target_entity"])
        if anchor:
            to_label, to_key, to_val = anchor
            merge_edge(cur, "Intent", "intent_id", i["intent_id"], to_label, to_key, to_val, "TARGETS")

    print("Edges loaded.")
    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
