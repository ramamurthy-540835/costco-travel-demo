// Vendor-integration boundary (Phase 6 seam).
//
// This module is the single place where vendor-contract-varying business
// rules — "what does this vendor currently offer/allow" — are decided.
// Today it answers that question in-process against the shared knowledge
// graph (lib/graph/queries.ts). When Phase 6 stands up the real,
// independently-deployed Vendor Integration Layer service (per
// .coder/PROJECT.md's Discovery/Checkout vs. Fulfillment separation),
// only this file's internals change to an RPC call — callers in
// app/api/bookings/[id]/*/route.ts never need to change.

import { searchInventory } from '@/lib/graph/queries';

export interface ModificationQuote {
  dailyRate: number;
  negotiatedTermId: string;
  perkIds: string[];
  currency: string;
}

// `from`/`to` are part of this contract for signature-forward-compatibility
// with a future real vendor-availability check (a real vendor system might
// reject a date range as unavailable even though the negotiated rate still
// resolves) — today's graph-only implementation has no per-date availability
// data, so these params aren't yet used beyond being present in the contract.
export async function quoteModification(params: {
  vendorId: string;
  inventoryId: string;
  from: string;
  to: string;
}): Promise<ModificationQuote | null> {
  void params.from;
  void params.to;

  const results = await searchInventory();
  const match = results.find(
    (r) => r.inventory.rental_id === params.inventoryId && r.vendor.provider === params.vendorId,
  );
  if (!match || !match.negotiatedTerm) {
    return null;
  }

  return {
    dailyRate: (match.inventory.daily_rate as number | undefined) ?? 0,
    negotiatedTermId: match.negotiatedTerm.term_id,
    perkIds: match.perks.map((p) => p.perk_id as string),
    currency: 'usd',
  };
}
