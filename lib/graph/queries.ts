import { runCypher } from './client';

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

export async function searchInventory(locationLabel?: string): Promise<InventorySearchResult[]> {
  const query = locationLabel
    ? `MATCH (i:Inventory)-[:INSTANCE_OF]->(vc:VehicleClass)
       MATCH (i)-[:OFFERED_BY]->(v:Vendor)
       MATCH (i)-[:LOCATED_AT]->(l:Location {city: $locationLabel})
       RETURN i, vc, v, l`
    : `MATCH (i:Inventory)-[:INSTANCE_OF]->(vc:VehicleClass)
       MATCH (i)-[:OFFERED_BY]->(v:Vendor)
       OPTIONAL MATCH (i)-[:LOCATED_AT]->(l:Location)
       RETURN i, vc, v, l`;

  const [rows, lowestTermsByVendor] = await Promise.all([
    runCypher<InventoryJoinRow>(query, locationLabel ? { locationLabel } : undefined, ['i', 'vc', 'v', 'l']),
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
