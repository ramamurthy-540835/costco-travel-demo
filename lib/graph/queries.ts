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
