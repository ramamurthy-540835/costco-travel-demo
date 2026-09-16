import { runCypher, runSql } from './client';

export interface VehicleClass {
  class_name: string;
  synonyms?: string[];
  [key: string]: unknown;
}

export interface NegotiatedTerm {
  term_id: string;
  vendor_id?: string;
  [key: string]: unknown;
}

export interface Perk {
  perk_id: string;
  synonyms?: string[];
  [key: string]: unknown;
}

export interface VendorPolicy {
  provider: string;
  standard_cancellation_window_hours?: number;
  no_show_fee_percent?: number;
  [key: string]: unknown;
}

export interface AddOn {
  addon_id: string;
  name?: string;
  fee_per_day?: number;
  synonyms?: string[];
  [key: string]: unknown;
}

interface VertexResult {
  properties: Record<string, unknown>;
}

// Fallback broadening step for free-text vehicleClass terms the graph
// synonym table (resolveSynonym) can't cover, e.g. "something spacious for a
// family road trip" — never the primary path (see 09-04-PLAN.md section 5).
// `vehicle_class_embeddings` is a plain relational table (not a graph
// vertex), populated by graph/scripts/backfill_embeddings.py.
export async function findVehicleClassesBySemanticQuery(
  queryEmbedding: number[],
  limit = 3,
): Promise<string[]> {
  const rows = await runSql<{ class_name: string }>(
    `SELECT class_name FROM vehicle_class_embeddings ORDER BY embedding <=> $1::vector LIMIT $2`,
    [`[${queryEmbedding.join(',')}]`, limit],
  );
  return rows.map((r) => r.class_name);
}

export async function getVehicleClasses(): Promise<VehicleClass[]> {
  const rows = await runCypher<VertexResult>('MATCH (n:VehicleClass) RETURN n');
  return rows.map((row) => row.properties as unknown as VehicleClass);
}

export async function getNegotiatedTermsForVendor(vendorId: string): Promise<NegotiatedTerm[]> {
  const rows = await runCypher<VertexResult>(
    'MATCH (v:Vendor {provider: $vendorId})-[:OFFERS_TERM]->(t:NegotiatedTerm) RETURN t',
    { vendorId },
  );
  return rows.map((row) => row.properties as unknown as NegotiatedTerm);
}

export async function getPerksForTerm(termId: string): Promise<Perk[]> {
  const rows = await runCypher<VertexResult>(
    'MATCH (t:NegotiatedTerm {term_id: $termId})-[:INCLUDES_PERK]->(p:Perk) RETURN p',
    { termId },
  );
  return rows.map((row) => row.properties as unknown as Perk);
}

export async function getVendorPolicy(provider: string): Promise<VendorPolicy | null> {
  const rows = await runCypher<VertexResult>(
    'MATCH (v:Vendor {provider: $provider})-[:GOVERNED_BY]->(p:VendorPolicy) RETURN p',
    { provider },
  );
  return rows.length > 0 ? (rows[0].properties as unknown as VendorPolicy) : null;
}

export async function getEquivalenceCandidates(className: string): Promise<VehicleClass[]> {
  const rows = await runCypher<VertexResult>(
    `MATCH (input:VehicleClass {class_name: $className})-[:PART_OF_CLUSTER]->(c:EquivalenceCluster)<-[:PART_OF_CLUSTER]-(sibling:VehicleClass)
     WHERE sibling.class_name <> $className
     RETURN DISTINCT sibling`,
    { className },
  );
  return rows.map((row) => row.properties as unknown as VehicleClass);
}

export async function getAddOnsCatalog(): Promise<AddOn[]> {
  const rows = await runCypher<VertexResult>('MATCH (a:AddOn) RETURN a');
  return rows.map((row) => row.properties as unknown as AddOn);
}

export async function getWaivedAddOnIds(perkIds: string[]): Promise<Set<string>> {
  if (perkIds.length === 0) return new Set();

  const rows = await runCypher<{ addon_id: string }>(
    'MATCH (p:Perk)-[:WAIVES]->(a:AddOn) WHERE p.perk_id IN $perkIds RETURN a.addon_id',
    { perkIds },
    ['addon_id'],
  );
  return new Set(rows.map((row) => row.addon_id));
}

export async function getInventoryIdsByCity(city: string): Promise<string[]> {
  const rows = await runCypher<{ rental_id: string }>(
    'MATCH (i:Inventory)-[:LOCATED_AT]->(l:Location {city: $city}) RETURN i.rental_id AS rental_id',
    { city },
    ['rental_id'],
  );
  return rows.map((row) => row.rental_id);
}

export interface Inventory {
  rental_id: string;
  city?: string;
  provider?: string;
  vehicle_class?: string;
  daily_rate?: number;
  [key: string]: unknown;
}

export interface Vendor {
  provider: string;
  rating?: number;
  [key: string]: unknown;
}

export interface Location {
  city: string;
  [key: string]: unknown;
}

export interface InventorySearchResult {
  inventory: Inventory;
  vehicleClass: VehicleClass;
  vendor: Vendor;
  location: Location | null;
  negotiatedTerm: NegotiatedTerm | null;
  perks: Perk[];
}

interface InventoryJoinRow {
  i: VertexResult;
  vc: VertexResult;
  v: VertexResult;
  l: VertexResult | null;
}

interface LowestTermJoinRow {
  provider: string;
  rank: number;
  t: VertexResult;
  p: VertexResult | null;
}

// NegotiatedTerm is keyed by (Vendor x MembershipTier), not by Inventory or
// VehicleClass — an anonymous search has no member/tier context, so we resolve
// each vendor's lowest-rank MembershipTier's term as the publicly displayable
// "starting rate" (rank order: Gold Star=1 < Executive=2 < Business=3).
async function getLowestRankTermsByVendor(): Promise<
  Map<string, { term: NegotiatedTerm; perks: Perk[] }>
> {
  const rows = await runCypher<LowestTermJoinRow>(
    `MATCH (mt:MembershipTier)-[:ELIGIBLE_FOR]->(t:NegotiatedTerm)<-[:OFFERS_TERM]-(v:Vendor)
     OPTIONAL MATCH (t)-[:INCLUDES_PERK]->(p:Perk)
     RETURN v.provider AS provider, mt.rank AS rank, t, p`,
    undefined,
    ['provider', 'rank', 't', 'p'],
  );

  const byVendor = new Map<string, { rank: number; term: NegotiatedTerm; perks: Map<string, Perk> }>();

  for (const row of rows) {
    const term = row.t.properties as unknown as NegotiatedTerm;
    const perk = row.p ? (row.p.properties as unknown as Perk) : null;
    const existing = byVendor.get(row.provider);

    if (!existing || row.rank < existing.rank) {
      const perks = new Map<string, Perk>();
      if (perk) perks.set(perk.perk_id, perk);
      byVendor.set(row.provider, { rank: row.rank, term, perks });
    } else if (row.rank === existing.rank && existing.term.term_id === term.term_id) {
      // Same lowest-rank term, additional INCLUDES_PERK row — accumulate perks.
      if (perk) existing.perks.set(perk.perk_id, perk);
    }
    // row.rank === existing.rank but a different term_id would mean >1 term at
    // the lowest tier for this vendor (not expected per the 30-row seed) — the
    // first one encountered is kept, no silent duplicate row is produced.
  }

  const result = new Map<string, { term: NegotiatedTerm; perks: Perk[] }>();
  for (const [provider, entry] of byVendor) {
    result.set(provider, { term: entry.term, perks: Array.from(entry.perks.values()) });
  }
  return result;
}

// Candidate lookup only — never a substitute for a live availability check.
// Live per-unit availability must never be modeled as graph state (per the
// platform/vendor boundary decision in .coder/research/agentic-boundary-for-04-13.md);
// that stays Mongo-side via checkAvailability() in lib/vendor-integration/policy.ts.
// No caller within this plan — 04-14's picker UI wraps this in its own API route.
export async function findEquivalentInventory(
  locationLabel?: string,
  vehicleClassName?: string,
): Promise<InventorySearchResult[]> {
  // Filters are applied as inline pattern properties, not a trailing WHERE —
  // in Cypher (including AGE), a WHERE following an OPTIONAL MATCH scopes
  // only to that OPTIONAL MATCH, not the whole preceding pattern, so a
  // trailing `WHERE vc.class_name = $x` after `OPTIONAL MATCH (l:Location)`
  // silently fails to filter on vc/i at all (verified live: returned all
  // 1000 rows regardless of vehicleClassName). Inline pattern matching avoids
  // the scoping issue entirely, at the cost of making an empty-filter Location
  // OPTIONAL MATCH required whenever a locationLabel is given — matching this
  // function's pre-existing "location filter implies a Location row must
  // exist" contract.
  const vcPattern = vehicleClassName !== undefined ? 'vc:VehicleClass {class_name: $vehicleClassName}' : 'vc:VehicleClass';
  const locationMatch =
    locationLabel !== undefined
      ? `MATCH (i)-[:LOCATED_AT]->(l:Location {city: $locationLabel})`
      : `OPTIONAL MATCH (i)-[:LOCATED_AT]->(l:Location)`;

  const query = `MATCH (i:Inventory)-[:INSTANCE_OF]->(${vcPattern})
     MATCH (i)-[:OFFERED_BY]->(v:Vendor)
     ${locationMatch}
     RETURN i, vc, v, l`;

  const params: Record<string, unknown> = {};
  if (locationLabel !== undefined) params.locationLabel = locationLabel;
  if (vehicleClassName !== undefined) params.vehicleClassName = vehicleClassName;

  const [rows, lowestTermsByVendor] = await Promise.all([
    runCypher<InventoryJoinRow>(query, params, ['i', 'vc', 'v', 'l']),
    getLowestRankTermsByVendor(),
  ]);

  return rows.map((row) => {
    const inventory = row.i.properties as unknown as Inventory;
    const vehicleClass = row.vc.properties as unknown as VehicleClass;
    const vendor = row.v.properties as unknown as Vendor;
    const location = row.l ? (row.l.properties as unknown as Location) : null;
    const termEntry = lowestTermsByVendor.get(vendor.provider);

    return {
      inventory,
      vehicleClass,
      vendor,
      location,
      negotiatedTerm: termEntry?.term ?? null,
      perks: termEntry?.perks ?? [],
    };
  });
}

export async function searchInventory(
  locationLabel?: string,
  vehicleClassName?: string,
  vendorId?: string,
): Promise<InventorySearchResult[]> {
  // Inline pattern-property filters, not a trailing WHERE — see
  // findEquivalentInventory's comment above for why a WHERE after an
  // OPTIONAL MATCH silently fails to filter the whole pattern.
  const vcPattern = vehicleClassName !== undefined ? 'vc:VehicleClass {class_name: $vehicleClassName}' : 'vc:VehicleClass';
  const vPattern = vendorId !== undefined ? 'v:Vendor {provider: $vendorId}' : 'v:Vendor';
  const locationMatch =
    locationLabel !== undefined
      ? `MATCH (i)-[:LOCATED_AT]->(l:Location {city: $locationLabel})`
      : `OPTIONAL MATCH (i)-[:LOCATED_AT]->(l:Location)`;

  const query = `MATCH (i:Inventory)-[:INSTANCE_OF]->(${vcPattern})
     MATCH (i)-[:OFFERED_BY]->(${vPattern})
     ${locationMatch}
     RETURN i, vc, v, l`;

  const params: Record<string, unknown> = {};
  if (locationLabel !== undefined) params.locationLabel = locationLabel;
  if (vehicleClassName !== undefined) params.vehicleClassName = vehicleClassName;
  if (vendorId !== undefined) params.vendorId = vendorId;

  const [rows, lowestTermsByVendor] = await Promise.all([
    runCypher<InventoryJoinRow>(query, params, ['i', 'vc', 'v', 'l']),
    getLowestRankTermsByVendor(),
  ]);

  return rows.map((row) => {
    const inventory = row.i.properties as unknown as Inventory;
    const vehicleClass = row.vc.properties as unknown as VehicleClass;
    const vendor = row.v.properties as unknown as Vendor;
    const location = row.l ? (row.l.properties as unknown as Location) : null;
    const termEntry = lowestTermsByVendor.get(vendor.provider);

    return {
      inventory,
      vehicleClass,
      vendor,
      location,
      negotiatedTerm: termEntry?.term ?? null,
      perks: termEntry?.perks ?? [],
    };
  });
}
