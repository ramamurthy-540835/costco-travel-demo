#!/usr/bin/env python3
"""
Generates a single, self-contained HTML demo page visualizing the real
enrichment layers built across this project: Vocabulary, Taxonomy,
Thesaurus, Ontology, and the Knowledge Graph itself. Read-only against the
graph — a reporting layer, not a data-mutating script.

Mirrors mastech-agentic-commerce/agent-lab/scripts/generate_knowledge_graph_demo.py's
pattern (sibling project, read-only reference), adapted to this project's
Member/Vendor two-sided-marketplace ontology (Phase 1-7).
"""
import json
import sys
from pathlib import Path

GRAPH_DIR = Path(__file__).resolve().parents[2] / "graph"
sys.path.insert(0, str(GRAPH_DIR))
sys.path.insert(0, str(GRAPH_DIR / "scripts"))

from graph_service import schema
from graph_service.agtype import parse_agtype
from graph_service.connection import get_connection
from load_seed_data import (
    ADDON_SYNONYMS,
    MEMBERSHIP_TIER_SYNONYMS,
    PERK_SYNONYMS,
    TAXONOMY_GROUPS,
    VEHICLE_CLASS_SYNONYMS,
)

# Full-dump labels: every non-transactional ontology part (vocabulary +
# NegotiatedTerm, which was previously omitted entirely) plus Member (100
# rows — small enough to show in full). Inventory/Reservation (1000 rows
# each) are the only labels still sampled, since a full 2000+2000-edge dump
# would be unreadable/unresponsive in the browser.
VOCAB_LABELS = [
    "MembershipTier", "Vendor", "VendorPolicy", "VehicleClass", "Location",
    "Perk", "AddOn", "VocabularyTerm", "Intent", "EquivalenceCluster",
    "NegotiatedTerm", "Member",
]
SAMPLE_LABELS = ["Inventory", "Reservation"]
SAMPLE_LIMIT = 40

IDENTITY_PROPS = {
    "Member": "member_id",
    "MembershipTier": "tier_id",
    "Vendor": "provider",
    "VendorPolicy": "provider",
    "VehicleClass": "class_name",
    "Location": "city",
    "Inventory": "rental_id",
    "Reservation": "reservation_id",
    "NegotiatedTerm": "term_id",
    "Perk": "perk_id",
    "AddOn": "addon_id",
    "VocabularyTerm": "term",
    "Intent": "intent_id",
    "EquivalenceCluster": "cluster_id",
}
DISPLAY_PROPS = {
    "MembershipTier": "name",
    "Perk": "name",
    "AddOn": "name",
    "EquivalenceCluster": "name",
}
LABEL_COLORS = {
    "Member": "#f4a261",
    "MembershipTier": "#2a9d8f",
    "Vendor": "#264653",
    "VendorPolicy": "#457b9d",
    "VehicleClass": "#3d5a80",
    "Location": "#e07a5f",
    "Inventory": "#81b29a",
    "Reservation": "#e63946",
    "Perk": "#f2cc8f",
    "AddOn": "#9d8189",
    "VocabularyTerm": "#c9ada7",
    "Intent": "#6d597a",
    "EquivalenceCluster": "#b56576",
    "NegotiatedTerm": "#ffb703",
}


def identity_prop(label):
    return IDENTITY_PROPS[label]


def display_prop(label):
    return DISPLAY_PROPS.get(label, identity_prop(label))


def _unwrap(raw):
    return parse_agtype(raw).get("properties", {})


def cypher(cur, query, params=None, columns=1):
    col_def = ", ".join(f"col{i} agtype" for i in range(columns))
    if params is not None:
        cur.execute(
            f"SELECT * FROM cypher('rental_graph', $$ {query} $$, %s::agtype) AS ({col_def});",
            (json.dumps(params),),
        )
    else:
        cur.execute(f"SELECT * FROM cypher('rental_graph', $$ {query} $$) AS ({col_def});")


def gather_data(conn):
    data = {}
    cur = conn.cursor()

    # 1. Vocabulary — hand-curated dicts (real code, not re-typed) + the one
    # LLM-generated property (Location.synonyms, Phase 7 Plan 07-02).
    cypher(cur, "MATCH (n:Location) RETURN n.city, n.synonyms", columns=2)
    location_synonyms = {}
    for city_raw, synonyms_raw in cur.fetchall():
        location_synonyms[parse_agtype(city_raw)] = parse_agtype(synonyms_raw) or []
    data["vocabulary"] = {
        "vehicle_class": VEHICLE_CLASS_SYNONYMS,
        "perk": PERK_SYNONYMS,
        "addon": ADDON_SYNONYMS,
        "membership_tier": MEMBERSHIP_TIER_SYNONYMS,
        "location": location_synonyms,
    }

    # 2. Taxonomy — VehicleClass PARENT_OF groupings (live) + MembershipTier rank (live).
    cypher(cur, "MATCH (child:VehicleClass)-[:PARENT_OF]->(parent:VehicleClass) RETURN parent.class_name, child.class_name", columns=2)
    taxonomy = {group: [] for group in TAXONOMY_GROUPS}
    for parent_raw, child_raw in cur.fetchall():
        taxonomy.setdefault(parse_agtype(parent_raw), []).append(parse_agtype(child_raw))
    cypher(cur, "MATCH (t:MembershipTier) RETURN t.rank, t.tier_id, t.name", columns=3)
    tiers = sorted(
        ((parse_agtype(r), parse_agtype(t), parse_agtype(n)) for r, t, n in cur.fetchall()),
        key=lambda row: row[0],
    )
    data["taxonomy"] = {"vehicle_class_groups": taxonomy, "membership_tiers": tiers}

    # 3. Thesaurus — graph-backed (VocabularyTerm naming-variance, Intent action
    # synonyms) + two small documentation-only normalization cases (not modeled
    # as graph structure — sourced from real live data / THESAURUS.md, not invented).
    cypher(cur, "MATCH (alias:VocabularyTerm)-[:SYNONYM_OF]->(canonical:VehicleClass) RETURN alias.term, canonical.class_name", columns=2)
    naming_variance = [(parse_agtype(a), parse_agtype(c)) for a, c in cur.fetchall()]

    cypher(cur, "MATCH (i:Intent) RETURN i.intent_id, i.synonyms", columns=2)
    intent_synonyms = [(parse_agtype(i), parse_agtype(s) or []) for i, s in cur.fetchall()]

    cypher(cur, "MATCH (v:Vendor) RETURN v.provider, v.included_miles", columns=2)
    mileage_raw = [(parse_agtype(p), parse_agtype(m)) for p, m in cur.fetchall()]
    mileage_normalized = [
        (provider, raw, "Capped" if raw != "Unlimited" else "Unlimited")
        for provider, raw in sorted(mileage_raw)
    ]

    comparative_phrases = [
        ("“cheapest”, “lowest price”, “best deal”", "sort NegotiatedTerm.discount_pct desc / Inventory price asc"),
        ("“no deposit”", "filter VendorPolicy/NegotiatedTerm for a zero-deposit term (not yet a modeled field)"),
        ("“flexible cancellation”", "filter NegotiatedTerm.cancellation_window_hours for the longer window"),
    ]

    data["thesaurus"] = {
        "naming_variance": naming_variance,
        "intent_synonyms": intent_synonyms,
        "mileage_normalized": mileage_normalized,
        "comparative_phrases": comparative_phrases,
    }

    # 4. Ontology — real counts per label/edge type (mirrors verify_graph.py).
    node_counts = {}
    for label in schema.NODE_LABELS:
        cypher(cur, f"MATCH (n:{label}) RETURN count(n)")
        node_counts[label] = int(parse_agtype(cur.fetchone()[0]))

    edge_counts = {}
    for edge_type, (from_label, to_label) in schema.EDGE_ENDPOINTS.items():
        cypher(cur, f"MATCH (a:{from_label})-[:{edge_type}]->(:{to_label}) RETURN count(*)")
        edge_counts[edge_type] = int(parse_agtype(cur.fetchone()[0]))

    data["ontology"] = {
        "node_labels": schema.NODE_LABELS,
        "edge_endpoints": schema.EDGE_ENDPOINTS,
        "node_counts": node_counts,
        "edge_counts": edge_counts,
    }

    # 5. Knowledge Graph sample — full vocabulary layer + a bounded, deterministic
    # sample of the transactional layer (Member/Inventory/Reservation), so the
    # graph view stays readable instead of dumping all 1000+ rows.
    nodes = []
    node_ids_seen = set()

    def add_nodes(label, limit=None):
        id_prop = identity_prop(label)
        name_prop = display_prop(label)
        order_clause = f" ORDER BY n.{id_prop} LIMIT {limit}" if limit else ""
        cypher(cur, f"MATCH (n:{label}) RETURN n.{id_prop}, n.{name_prop}{order_clause}", columns=2)
        for id_raw, name_raw in cur.fetchall():
            node_id = parse_agtype(id_raw)
            node_name = parse_agtype(name_raw)
            full_id = f"{label}:{node_id}"
            if full_id not in node_ids_seen:
                node_ids_seen.add(full_id)
                nodes.append({"id": full_id, "label": label, "name": str(node_name)})

    for label in VOCAB_LABELS:
        add_nodes(label)
    for label in SAMPLE_LABELS:
        add_nodes(label, limit=SAMPLE_LIMIT)

    edges = []
    for edge_type, (from_label, to_label) in schema.EDGE_ENDPOINTS.items():
        from_prop = identity_prop(from_label)
        to_prop = identity_prop(to_label)
        cypher(cur, f"MATCH (a:{from_label})-[:{edge_type}]->(b:{to_label}) RETURN a.{from_prop}, b.{to_prop}", columns=2)
        for from_id_raw, to_id_raw in cur.fetchall():
            from_id = f"{from_label}:{parse_agtype(from_id_raw)}"
            to_id = f"{to_label}:{parse_agtype(to_id_raw)}"
            if from_id in node_ids_seen and to_id in node_ids_seen:
                edges.append({"from": from_id, "to": to_id, "type": edge_type})

    data["knowledge_graph"] = {"nodes": nodes, "edges": edges}

    cur.close()
    return data


PAGE_STYLE = """
:root {
  --bg: #0f1419; --panel: #161b22; --border: #2a313c; --text: #e6edf3;
  --muted: #8b949e; --accent: #4fa3ff; --accent-soft: rgba(79, 163, 255, 0.12);
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2.5rem; background: var(--bg); color: var(--text); line-height: 1.5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
h1 { font-size: 1.85rem; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 0.35rem 0; }
h2 {
  font-size: 1.05rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  margin: 0 0 1.1rem 0; padding-bottom: 0.6rem; border-bottom: 1px solid var(--border);
}
h3 { font-size: 0.85rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin: 1.3rem 0 0.6rem 0; }
.subtitle { color: var(--muted); margin: 0 0 2rem 0; font-size: 0.95rem; }

.stats-bar { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; }
.stat-card {
  flex: 1 1 140px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 1.1rem 1.3rem; transition: border-color 0.15s ease, transform 0.15s ease;
}
.stat-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.stat-number { font-size: 1.9rem; font-weight: 700; color: var(--accent); line-height: 1; }
.stat-label { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; margin-top: 0.35rem; }

.section {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 1.75rem; margin-bottom: 1.5rem; transition: border-color 0.15s ease;
}
.section:hover { border-color: #3a4452; }

.chip-group { margin-bottom: 1.1rem; }
.chip-group-label { font-weight: 600; color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.5rem; }
.chip {
  display: inline-block; background: #1c2531; border: 1px solid var(--border);
  border-radius: 999px; padding: 0.3rem 0.85rem; margin: 0.2rem; font-size: 0.85rem;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.chip:hover { background: var(--accent-soft); border-color: var(--accent); }
.chip.llm { border-color: #6d597a; background: rgba(109, 89, 122, 0.18); }

.tree { margin-left: 0; }
.tree-category { font-weight: 600; margin-top: 0.9rem; }
.tree-category:first-child { margin-top: 0; }
.tree-subcategory { margin-left: 1.5rem; color: var(--muted); font-size: 0.9rem; padding: 0.15rem 0; }

table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { text-align: left; padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.03em; }
tbody tr { transition: background 0.1s ease; }
tbody tr:hover { background: rgba(255, 255, 255, 0.03); }
.label-tag { font-size: 0.7rem; color: var(--muted); }
.note { color: var(--muted); font-size: 0.85rem; margin: 0.5rem 0 1rem 0; }

#graph-container { overflow: hidden; border: 1px solid var(--border); border-radius: 10px; background: #0b0f14; }

pre {
  background: #0b0f14; border: 1px solid var(--border); border-radius: 8px; padding: 0.9rem 1.1rem;
  overflow-x: auto; font-size: 0.82rem; color: var(--text); margin: 0 0 1rem 0;
}
code { color: var(--accent); font-size: 0.85rem; }
"""


def render_stats_bar(data):
    node_counts = data["ontology"]["node_counts"]
    stats = [
        ("Members", node_counts.get("Member", 0)),
        ("Vendors", node_counts.get("Vendor", 0)),
        ("Inventory", node_counts.get("Inventory", 0)),
        ("Reservations", node_counts.get("Reservation", 0)),
        ("Locations", node_counts.get("Location", 0)),
    ]
    cards = "".join(
        f'<div class="stat-card"><div class="stat-number">{count}</div><div class="stat-label">{label}</div></div>'
        for label, count in stats
    )
    return f'<div class="stats-bar">{cards}</div>'


def render_methodology_section():
    return (
        '<div class="section"><h2>Shared Vocabulary, Two Sides of the Market</h2>'
        "<p>This graph is the single source of truth both members and vendors resolve natural-language "
        "phrasing against — the same synonym-property pattern serves a member typing “pick up in Vegas” "
        "and a fulfillment-side agent matching cross-vendor VehicleClass naming variance. Most of this "
        "vocabulary is hand-curated (Phase 2); <code>Location.synonyms</code> is the first slice generated "
        "by a real LLM call (Phase 7) rather than a hardcoded dict, via <code>graph/scripts/backfill_synonyms.py</code>.</p>"
        '<div class="chip-group"><div class="chip-group-label">Verified live</div>'
        '<span class="chip">Azure OpenAI forced-tool-call backfill</span>'
        '<span class="chip">Idempotent re-run (no duplicate calls)</span>'
        '<span class="chip">verify_graph.py Location.synonyms check</span></div>'
        "</div>"
    )


def render_vocabulary_section(data):
    vocab = data["vocabulary"]
    body = ""
    groups = [
        ("VehicleClass (hand-curated)", vocab["vehicle_class"]),
        ("Perk (hand-curated)", vocab["perk"]),
        ("AddOn (hand-curated)", vocab["addon"]),
        ("MembershipTier (hand-curated)", vocab["membership_tier"]),
    ]
    for label, term_map in groups:
        body += f'<h3>{label}</h3>'
        for term, synonyms in term_map.items():
            chips = "".join(f'<span class="chip">{s}</span>' for s in synonyms)
            body += f'<div class="chip-group"><div class="chip-group-label">{term}</div>{chips}</div>'

    body += '<h3>Location (LLM-generated — Phase 7)</h3>'
    for city, synonyms in sorted(vocab["location"].items()):
        chips = "".join(f'<span class="chip llm">{s}</span>' for s in synonyms)
        body += f'<div class="chip-group"><div class="chip-group-label">{city}</div>{chips}</div>'

    return f'<div class="section"><h2>Vocabulary</h2>{body}</div>'


def render_taxonomy_section(data):
    taxonomy = data["taxonomy"]
    body = '<h3>VehicleClass hierarchy</h3><div class="tree">'
    for group in sorted(taxonomy["vehicle_class_groups"].keys()):
        body += f'<div class="tree-category">{group}</div>'
        for child in sorted(taxonomy["vehicle_class_groups"][group]):
            body += f'<div class="tree-subcategory">&rarr; {child}</div>'
    body += "</div>"

    body += '<h3>MembershipTier rank</h3><table><thead><tr><th>Rank</th><th>tier_id</th><th>name</th></tr></thead><tbody>'
    for rank, tier_id, name in taxonomy["membership_tiers"]:
        body += f"<tr><td>{rank}</td><td>{tier_id}</td><td>{name}</td></tr>"
    body += "</tbody></table>"

    return f'<div class="section"><h2>Taxonomy</h2>{body}</div>'


def render_thesaurus_section(data):
    thesaurus = data["thesaurus"]

    body = '<h3>VehicleClass naming-variance (graph-backed)</h3>'
    body += '<table><thead><tr><th>Alias (VocabularyTerm)</th><th>Canonical VehicleClass</th></tr></thead><tbody>'
    for alias, canonical in sorted(thesaurus["naming_variance"]):
        body += f"<tr><td>{alias}</td><td>{canonical}</td></tr>"
    body += "</tbody></table>"

    body += '<h3>Intent / action synonyms (graph-backed)</h3>'
    body += '<table><thead><tr><th>Intent</th><th>Synonyms</th></tr></thead><tbody>'
    for intent_id, synonyms in sorted(thesaurus["intent_synonyms"]):
        body += f'<tr><td>{intent_id}</td><td>{", ".join(synonyms)}</td></tr>'
    body += "</tbody></table>"

    body += '<h3>Mileage-inclusion normalization</h3><p class="note">Documentation-only — not modeled as graph structure. Raw value observed live on Vendor.included_miles.</p>'
    body += '<table><thead><tr><th>Vendor</th><th>Raw included_miles</th><th>Canonical term</th></tr></thead><tbody>'
    for provider, raw, canonical in thesaurus["mileage_normalized"]:
        body += f"<tr><td>{provider}</td><td>{raw}</td><td>{canonical}</td></tr>"
    body += "</tbody></table>"

    body += '<h3>Comparative / policy phrases</h3><p class="note">Documentation-only — sort/filter directives on existing fields, not new graph structure.</p>'
    body += '<table><thead><tr><th>Phrase pattern</th><th>Resolves to</th></tr></thead><tbody>'
    for phrase, resolution in thesaurus["comparative_phrases"]:
        body += f"<tr><td>{phrase}</td><td>{resolution}</td></tr>"
    body += "</tbody></table>"

    return f'<div class="section"><h2>Thesaurus</h2>{body}</div>'


def render_ontology_section(data):
    ontology = data["ontology"]
    node_rows = "".join(
        f'<tr><td>{label}</td><td>{ontology["node_counts"][label]}</td></tr>'
        for label in ontology["node_labels"]
    )
    edge_rows = "".join(
        f'<tr><td>{edge_type}</td><td>{ontology["edge_counts"][edge_type]}</td>'
        f'<td>{from_label} &rarr; {to_label}</td></tr>'
        for edge_type, (from_label, to_label) in ontology["edge_endpoints"].items()
    )
    return (
        '<div class="section"><h2>Ontology</h2>'
        '<table><thead><tr><th>Node Label</th><th>Count</th></tr></thead>'
        f'<tbody>{node_rows}</tbody></table>'
        '<table style="margin-top: 1rem"><thead><tr><th>Edge Type</th><th>Count</th><th>From &rarr; To</th></tr></thead>'
        f'<tbody>{edge_rows}</tbody></table></div>'
    )


def render_page_shell(data):
    return (
        f"<style>{PAGE_STYLE}</style>"
        "<h1>Mastech Agentic Travel &mdash; Rental Ontology &amp; Knowledge Graph</h1>"
        '<p class="subtitle">Vocabulary, Taxonomy, Thesaurus, Ontology, and the Knowledge Graph — members, vendors, inventory, and reservations — all from real, live data.</p>'
        + render_stats_bar(data)
        + render_methodology_section()
        + render_vocabulary_section(data)
        + render_taxonomy_section(data)
        + render_thesaurus_section(data)
        + render_ontology_section(data)
    )


def render_knowledge_graph_section(graph_data):
    """
    Rendered via vis-network (CDN-loaded, free/MIT), same proven config as
    mastech-agentic-commerce's demo. Real, disclosed tradeoff: viewing this
    section requires internet access to load vis-network from the CDN.
    """
    vis_nodes = [
        {
            "id": node["id"],
            "label": node["name"],
            "color": LABEL_COLORS.get(node["label"], "#666"),
            "title": f'{node["label"]}: {node["name"]}',
            "group": node["label"],
        }
        for node in graph_data["nodes"]
    ]
    vis_edges = [
        {"from": edge["from"], "to": edge["to"], "title": edge["type"], "arrows": "to"}
        for edge in graph_data["edges"]
    ]
    nodes_json = json.dumps(vis_nodes).replace("<", "\\u003c")
    edges_json = json.dumps(vis_edges).replace("<", "\\u003c")

    graph = (
        '<script src="https://cdn.jsdelivr.net/npm/vis-network@9/standalone/umd/vis-network.min.js"></script>'
        '<p class="note">Every ontology node type shown: full vocabulary layer (MembershipTier/Vendor/VendorPolicy/'
        'VehicleClass/Location/Perk/AddOn/VocabularyTerm/Intent/EquivalenceCluster), full NegotiatedTerm (30 rows) '
        f'and Member (100 rows), plus the first {SAMPLE_LIMIT} Inventory and {SAMPLE_LIMIT} Reservation rows by id — '
        'those two are still sampled since a full 1000+1000-row dump of each would be unreadable/unresponsive in the browser.</p>'
        '<div id="graph-container" style="height: 700px;"></div>'
        "<script>"
        "(function() {"
        f"  var nodes = new vis.DataSet({nodes_json});"
        f"  var edges = new vis.DataSet({edges_json});"
        '  var container = document.getElementById("graph-container");'
        "  var data = { nodes: nodes, edges: edges };"
        "  var options = {"
        "    physics: {"
        '      solver: "forceAtlas2Based",'
        "      forceAtlas2Based: {"
        "        gravitationalConstant: -60, springLength: 120, springConstant: 0.06, damping: 0.4"
        "      },"
        "      stabilization: { iterations: 200 }"
        "    },"
        "    interaction: { hover: true, tooltipDelay: 100, zoomView: true, dragView: true },"
        '    nodes: { shape: "dot", size: 9, font: { color: "#e6edf3", size: 11 }, borderWidth: 1 },'
        '    edges: { color: { color: "#2a313c", highlight: "#4fa3ff" }, width: 1, smooth: { type: "continuous" } }'
        "  };"
        "  new vis.Network(container, data, options);"
        "})();"
        "</script>"
    )
    return f'<div class="section"><h2>Knowledge Graph</h2>{graph}</div>'


def gather_retriever_examples(conn):
    """
    Mirrors lib/graph/retrievers.ts's lookupNode/traverse/resolveSynonym via
    equivalent raw Cypher — this script is pure Python/psycopg and cannot
    import the real TypeScript functions, so it re-runs the same query shapes
    directly against the live graph to demonstrate real output.
    """
    cur = conn.cursor()

    cypher(cur, "MATCH (n:Vendor {provider: 'Hertz'}) RETURN n")
    lookup_row = cur.fetchone()
    lookup_result = _unwrap(lookup_row[0]) if lookup_row else None

    cypher(
        cur,
        "MATCH (from:Vendor {provider: 'Hertz'})-[:OFFERS_TERM]->(to:NegotiatedTerm) RETURN DISTINCT to",
    )
    traverse_rows = [_unwrap(r[0]) for r in cur.fetchall()]

    cypher(
        cur,
        "MATCH (n:Location) UNWIND n.synonyms AS s WITH n, s WHERE toLower(s) = toLower('Vegas') RETURN DISTINCT n",
    )
    synonym_rows = [_unwrap(r[0]) for r in cur.fetchall()]

    return {
        "lookup_node": {"call": "lookupNode('Vendor', 'provider', 'Hertz')", "result": lookup_result},
        "traverse": {
            "call": "traverse('Vendor', 'provider', 'Hertz', 'OFFERS_TERM', 'NegotiatedTerm', 'out')",
            "result": traverse_rows,
        },
        "resolve_synonym": {"call": "resolveSynonym('Vegas')", "result": synonym_rows},
    }


def render_retriever_tools_section(examples):
    def code_block(label, example):
        result_json = json.dumps(example["result"], indent=2)
        return (
            f'<h3>{label}</h3>'
            f'<p class="note"><code>{example["call"]}</code></p>'
            f'<pre>{result_json}</pre>'
        )

    body = (
        '<p class="note">Real, live output from the generic retriever-tool surface in '
        '<code>lib/graph/retrievers.ts</code> (Phase 7-03) — the sanctioned query path for the future '
        'Phase 8 Vendor Agent and Phase 9 Customer/Driver Assistant. Existing bespoke functions in '
        '<code>lib/graph/queries.ts</code> remain in place for their current Phase 4-6 call-sites; this '
        'is a parallel, label-agnostic surface, not a replacement. Queries below are run directly via this '
        'script\'s own Cypher, mirroring (not importing) the real TypeScript functions.</p>'
        + code_block("lookupNode", examples["lookup_node"])
        + code_block("traverse", examples["traverse"])
        + code_block("resolveSynonym", examples["resolve_synonym"])
    )
    return f'<div class="section"><h2>Retriever Tools</h2>{body}</div>'


def main():
    conn = get_connection()
    data = gather_data(conn)
    retriever_examples = gather_retriever_examples(conn)
    conn.close()

    body = render_page_shell(data)
    body += render_retriever_tools_section(retriever_examples)
    body += render_knowledge_graph_section(data["knowledge_graph"])

    graph_json = json.dumps(data["knowledge_graph"]).replace("<", "\\u003c")
    body += f"<script>const GRAPH_DATA = {graph_json};</script>"

    html = f"<title>Mastech Agentic Travel Knowledge Graph Demo</title>{body}"

    output_path = Path(__file__).resolve().parent.parent / "docs" / "knowledge_graph_demo.html"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html)
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
