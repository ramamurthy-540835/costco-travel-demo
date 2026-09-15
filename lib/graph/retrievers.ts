import { runCypher } from './client';

export type RetrievedNode = Record<string, unknown>;

export interface SynonymMatch {
  label: string;
  matchProperty: string;
  canonical: RetrievedNode;
}

interface VertexResult {
  properties: Record<string, unknown>;
}

// label/matchProperty/edgeType/toLabel/fromLabel are always fixed string
// literals chosen by calling code, never forwarded from untrusted input in
// this plan's scope — only matchValue/fromValue/term are runtime values, and
// those always go through runCypher's $-parameterized params object, never
// string-interpolated, avoiding Cypher injection. A future caller that lets
// an LLM choose label/edgeType directly must validate against
// graph/graph_service/schema.py's NODE_LABELS/EDGE_ENDPOINTS first.
export async function lookupNode(
  label: string,
  matchProperty: string,
  matchValue: string,
): Promise<RetrievedNode | null> {
  const rows = await runCypher<VertexResult>(
    `MATCH (n:${label} {${matchProperty}: $matchValue}) RETURN n LIMIT 1`,
    { matchValue },
  );
  return rows.length > 0 ? rows[0].properties : null;
}

export async function traverse(
  fromLabel: string,
  fromProperty: string,
  fromValue: string,
  edgeType: string,
  toLabel: string,
  direction: 'out' | 'in',
): Promise<RetrievedNode[]> {
  const pattern =
    direction === 'out'
      ? `(from:${fromLabel} {${fromProperty}: $fromValue})-[:${edgeType}]->(to:${toLabel})`
      : `(from:${fromLabel} {${fromProperty}: $fromValue})<-[:${edgeType}]-(to:${toLabel})`;
  const rows = await runCypher<VertexResult>(`MATCH ${pattern} RETURN DISTINCT to`, { fromValue });
  return rows.map((row) => row.properties);
}

// Every node label that carries a synonyms list property, confirmed live
// against real data (not schema.py, which has no property-level info):
// VehicleClass/Perk/AddOn/MembershipTier are hand-seeded (load_seed_data.py's
// *_SYNONYMS dicts), Location is LLM-generated (07-02's backfill_synonyms.py),
// and Intent is seeded via data/synthetic/agent_intents.json (Phase 2's
// 02-01) - verified by verify_graph.py's own non-empty-synonyms check.
const SYNONYM_LABELS: Array<{ label: string; matchProperty: string }> = [
  { label: 'VehicleClass', matchProperty: 'class_name' },
  { label: 'Perk', matchProperty: 'perk_id' },
  { label: 'AddOn', matchProperty: 'addon_id' },
  { label: 'MembershipTier', matchProperty: 'tier_id' },
  { label: 'Location', matchProperty: 'city' },
  { label: 'Intent', matchProperty: 'intent_id' },
];

export async function resolveSynonym(term: string): Promise<SynonymMatch[]> {
  const results = await Promise.all(
    SYNONYM_LABELS.map(async ({ label, matchProperty }) => {
      const rows = await runCypher<VertexResult>(
        `MATCH (n:${label}) UNWIND n.synonyms AS s WITH n, s WHERE toLower(s) = toLower($term) RETURN DISTINCT n`,
        { term },
      );
      return rows.map((row) => ({
        label,
        matchProperty,
        canonical: row.properties,
      }));
    }),
  );
  return results.flat();
}
