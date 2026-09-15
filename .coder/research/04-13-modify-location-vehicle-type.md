# Research: 04-13 — Modify Location/Vehicle-Type on Reserved Booking

## Q1: Availability/Double-Booking Signal

### Current State (with file:line citations)

- `Inventory` node schema, per ONTOLOGY.md table: `rental_id, vehicle_make/model, vehicle_type, gearbox, seats, fuel_policy, deposit_amount` (`.coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md:19`). No quantity/count/units-available property exists or is documented anywhere in the schema, seed loader, or docs. `graph/scripts/load_seed_data.py:157` (`merge_node(cur, "Inventory", "rental_id", row["rental_id"], row)`) merges one node per row of `rental_inventory.json`, one row per physical vehicle listing — confirmed by ONTOLOGY.md:87 ("`Inventory` grew from 500 to 1000 rows (100/vendor, proportional)"). Each `Inventory` node is a single physical-unit stand-in, not a pooled/counted SKU.
- `searchInventory()` (`lib/graph/queries.ts:169-197`) runs a pure `MATCH` over AGE with no date parameter at all — `from`/`to` aren't even passed into the Cypher query. It returns every `Inventory` node matching location/class, with zero concept of "already reserved for this date range."
- `quoteModification()` (`lib/vendor-integration/policy.ts:20-41`) explicitly documents this gap: `from`/`to` are accepted "for signature-forward-compatibility with a future real vendor-availability check ... today's graph-only implementation has no per-date availability data" (lines 22-25), and both params are `void`-discarded (lines 33-34).
- AGE (Apache AGE via Postgres) has no documented counter/property-mutation-with-locking mechanism used anywhere in this codebase — `lib/graph/client.ts` runs each Cypher query as its own single-statement query via `pool.query()` (no multi-statement transaction wrapper, no `SELECT ... FOR UPDATE` equivalent exposed). Nothing in `graph/init/01-init-graph.sql` or `graph_schema.sql` defines any Inventory-side "held/available" state or counter.
- `Booking.ts` (`lib/models/Booking.ts:19-27`) stores `inventoryId`/`vendorId` as plain indexed strings referencing the graph node id — Bookings never touch Postgres/AGE. Indexes exist for exactly this kind of query: `bookingSchema.index({ inventoryId: 1, from: 1, to: 1 })` (`lib/models/Booking.ts:112`) and `bookingSchema.index({ vendorId: 1, from: 1, to: 1 })` (`lib/models/Booking.ts:111`).
- Existing optimistic-lock pattern: `app/api/bookings/[id]/addons/route.ts:139-154` uses `Booking.findOneAndUpdate({_id, status:'reserved', 'pricingSnapshot.totalPrice': <value read earlier>}, {$set...}, {new:true})` — a compare-and-swap on a snapshot field read earlier in the request, guarding against a concurrent modification to the *same* booking landing in between. Contrast: `app/api/bookings/[id]/modify/route.ts` has **no such guard** — it does `booking.save()` (line ~155, after mutating fields directly on the in-memory doc) with no `findOneAndUpdate`/CAS at all. This is a pre-existing lost-update gap on the modify route itself, independent of 04-13's location/vehicle-type question, and 04-13's implementation is the natural place to close it (it already touches every code path in this route).

### Recommendation

Check availability via MongoDB, not the Postgres/AGE graph. The graph has zero infrastructure for per-date/per-unit state today (no quantity field on `Inventory`, no transactional counter primitive exposed by `runCypher`), and Bookings — the only place date ranges and reservation status live — are already 100% in Mongo with indexes purpose-built for this (`{inventoryId:1, from:1, to:1}`). Since each `Inventory` node is a single-physical-unit stand-in (not a pooled SKU with a count), the correct capacity number is **1**: at most one `reserved`/`checked_in` booking may hold a given `inventoryId` for any overlapping date range at a time. Adding a synthetic "quantity" field to the graph to support this would be inventing schema not present in the seed data or ontology docs — avoid it.

### Concrete Implementation Shape

In `app/api/bookings/[id]/modify/route.ts`, after resolving the target `inventoryId`/`from`/`to` (post-`quoteModification` success, before applying the Stripe delta) and only when `inventoryId !== booking.inventoryId` (a real location/vehicle-type change, not a same-inventory date-only modification — 04-13's stated scope extension):

```ts
const conflict = await Booking.exists({
  _id: { $ne: booking._id },
  inventoryId,
  status: { $in: ['reserved', 'checked_in'] },
  from: { $lt: new Date(to) },
  to: { $gt: new Date(from) },
});
if (conflict) {
  return NextResponse.json({ error: 'That vehicle is no longer available for these dates' }, { status: 409 });
}
```

Race-condition guard: this existence check alone is not atomic against a second concurrent request modifying/creating a booking onto the same `inventoryId` between the check and the write (classic check-then-act). Close it the same way `addons/route.ts` already does, extended to also pin the *previous* `inventoryId` so a stale in-memory `booking` can't clobber a swap that already happened concurrently:

```ts
const claimed = await Booking.findOneAndUpdate(
  { _id: booking._id, status: 'reserved', inventoryId: booking.inventoryId /* CAS on prior inventory */ },
  { $set: { inventoryId, vendorId, from, to, pricingSnapshot }, $push: { modificationHistory: {...} } },
  { new: true },
);
if (!claimed) return NextResponse.json({ error: 'This booking changed, please retry' }, { status: 409 });
```
This doesn't fully eliminate the double-booking window between two *different* bookings racing onto the same new `inventoryId` (Mongo has no native "reserve unique slot" constraint here), but combined with the pre-check it's the same strength of guarantee the codebase already accepts elsewhere (`addons/route.ts:139-154`'s CAS is also a "read snapshot, write only if unchanged" pattern, not a hard exclusive lock) — consistent with the existing risk posture, not a regression.

## Q2: Cross-Vendor Re-Match

### Current State (with file:line citations)

- `quoteModification()` (`lib/vendor-integration/policy.ts:20-41`) matches purely on `(inventoryId, vendorId)` pair supplied by the caller (line 30-32: `r.inventory.rental_id === params.inventoryId && r.vendor.provider === params.vendorId`) — it does not care whether `vendorId` is the same as the booking's current vendor. Nothing prevents `modify/route.ts` from being called with a new `inventoryId` belonging to a different vendor; `quoteModification` will happily resolve it.
- `modify/route.ts:44-46` takes `vendorId = body.vendorId ?? booking.vendorId` directly from the request body with no validation that it matches the original vendor — the door is already technically open for cross-vendor swap at the API-payload level.
- `getVendorPolicy(provider)` (`lib/graph/queries.ts:65-70`) is keyed per-`Vendor` via `GOVERNED_BY` → `VendorPolicy` (cancellation window, no-show fee — `VendorPolicy` interface, `lib/graph/queries.ts:22-26`). `quoteCancellation()` (`policy.ts:52-70`) calls it per-vendor. Critically, **`modify/route.ts` never calls `getVendorPolicy`/`quoteCancellation` at all** — it only calls `quoteModification` (rate/perks), so today's modify flow has no vendor-policy-driven "modification cutoff" enforcement in the first place, cross-vendor or not.
- `Booking.modificationHistory` (`lib/models/Booking.ts:79-104`) already stores a full snapshot per prior state: `from, to, inventoryId, vendorId, pricingSnapshot (negotiatedTermId, dailyRate, currency, perkIds, addonIds, addonTotal, totalPrice), modifiedAt, refundId, refundAmountCents`. This is **vendor-swap-complete already** — a vendor change is just another field-diff between two ordinary history entries, no schema change needed. The route (`modify/route.ts:141-146`) already pushes `booking.vendorId`/`booking.inventoryId` from *before* the update, and the top-level fields (line 149-150) get the *new* vendor/inventory — so a same-vendor date/location change and a cross-vendor swap are structurally identical writes today.
- `getWaivedAddOnIds(perkIds)` (`lib/graph/queries.ts:72-80`) is perk-driven, not vendor-driven — it takes whatever `perkIds` array it's given and returns waived `AddOn` ids via `Perk-[:WAIVES]->AddOn`. `modify/route.ts:58-68` already re-derives waivers from the *new* quote's `perkIds` (`quote.perkIds`, resolved from the new `inventoryId`/`vendorId`'s `NegotiatedTerm`) and re-filters `existingAddonIds` against that new waived set (line 63-64) — this logic is vendor-agnostic by construction: whatever vendor the new `inventoryId` belongs to, `quote.perkIds` already reflects that vendor's own `NegotiatedTerm`/perks (via `searchInventory()`'s per-vendor `OFFERS_TERM`/`INCLUDES_PERK` join, `lib/graph/queries.ts:97-118` `getLowestRankTermsByVendor`... actually per-member term resolution — but the mechanism of "waivers recompute from the new quote's perkIds" already works correctly across a vendor change with **zero code changes required**.
- What's missing for a full cross-vendor swap: (1) no cancellation-window/no-show-fee check against the *original* vendor's policy before releasing the old inventory — `quoteCancellation()` exists (`policy.ts:52`) but `modify/route.ts` never calls it; (2) no check of the *new* vendor's modification-cutoff-style policy before committing the swap; (3) the refund/charge math in `modify/route.ts:56-58, 88-133` is currently a straight delta between old and new `totalPrice`, not a "refund old vendor's cancellation terms, then pay new vendor's booking price" — a true cross-vendor swap conceptually involves two separate vendor contracts, not one continuous modification, and the current delta-only math conflates them.

### Recommendation

Model it as "cancel old + rebook new" in the vendor-facing/economic sense, but keep it as **one Mongo document update** at the persistence layer (not two separate documents/two Stripe flows) — i.e., reuse the *policy logic* from cancel (via `quoteCancellation`) and the *quoting logic* from booking creation, but keep `modificationHistory`'s existing per-entry-snapshot shape, which already supports this with no schema change. Concretely:

- When the resolved new `inventoryId`'s vendor (`match.vendor.provider` from `searchInventory()`) differs from `booking.vendorId`, treat the *old* leg under `quoteCancellation`'s rules (apply the old vendor's `no_show_fee_percent`/cancellation window to determine what fraction of the old booking's remaining value is refundable) and the *new* leg under `quoteModification`'s rules (new vendor's rate/perks, exactly as today). This reuses both existing boundary functions in `lib/vendor-integration/policy.ts` without adding new ones.
- Do NOT physically create a second `Booking` document / cancel-then-recreate at the Mongo level — `modificationHistory` already carries the full audit trail (including `refundId`/`refundAmountCents` per entry, `lib/models/Booking.ts:96-97`), so a true in-place field swap on the same document preserves the member-facing "one booking" identity (booking id, receipts, support lookups) that a cancel+recreate would break.

### Concrete Implementation Shape

In `modify/route.ts`, after `quoteModification()` succeeds for the new `inventoryId`, determine the new vendor from the same `searchInventory()` match (or have `quoteModification` return `vendorProvider` in its result) and compare to `booking.vendorId`:

```ts
const isVendorSwap = vendorId !== booking.vendorId; // vendorId here must be derived from the resolved match, not trusted from body
if (isVendorSwap) {
  const oldPolicy = await getVendorPolicy(booking.vendorId);
  const hoursUntilStart = (booking.from.getTime() - Date.now()) / 3_600_000;
  const cancelQuote = await quoteCancellation({ vendorId: booking.vendorId, hoursUntilStart });
  // apply cancelQuote.refundPercent to the OLD leg's remaining value instead of
  // the current straight totalPrice delta, before computing the new leg's charge
}
```

For the addon/perk re-waiver: no change needed to `getWaivedAddOnIds()` itself — `modify/route.ts:59-64`'s existing call already re-invokes it against `quote.perkIds`, and `quote.perkIds` is already scoped to whichever vendor's `NegotiatedTerm` matched the new `inventoryId` (`policy.ts:37`, `match.perks.map(...)` from `searchInventory()`'s per-vendor perk join). This is the one piece of 04-13 that Phase 5's addon-integrity work already gets "for free" from the existing `modify` route's re-quote step — confirm with a test that swaps vendors and asserts `chargedAddonIds`/`addonTotal` reflect the *new* vendor's perks, not a stale carry-over.

`modificationHistory` needs no schema change (`lib/models/Booking.ts:79-104` already has independent `inventoryId`/`vendorId`/`pricingSnapshot` per entry) — it would need a change only if the plan decides a vendor-swap history entry must *also* record the old vendor's cancellation-fee percent/refund reasoning distinctly from an ordinary refund; today `refundAmountCents`/`refundId` (line 96-97) capture the dollar outcome but not *why* (rate delta vs. cancellation-fee) — worth flagging for planning if audit/support needs that distinction.

## Open Questions for Planning

1. Should the pre-existing missing-CAS gap in `modify/route.ts` (no `findOneAndUpdate`, unlike `addons/route.ts`) be fixed as part of 04-13, or filed as a separate fix? 04-13 already has to touch every line of this route's write path, making it the natural place — but it's scope creep beyond "location/vehicle-type" if the plan wants a narrow diff.
2. For Q1's overlap check, should `status: 'pending'` bookings also count toward the conflict, or only `reserved`/`checked_in`? (Pending bookings may never complete payment — including them risks false "unavailable" rejections; excluding them risks two pending-then-confirmed bookings colliding. No existing code establishes a precedent either way.)
3. For Q2, does `quoteModification()`'s signature need to start returning the vendor provider explicitly (today the caller already knows `vendorId` from its own `body.vendorId ?? booking.vendorId`, but that value is client-supplied and untrusted for determining "is this actually a vendor swap" — the route should derive it from the `searchInventory()` match instead, which means `ModificationQuote` needs a `vendorId`/`provider` field added, a small but real interface change).
4. Should a cross-vendor swap be blocked entirely if the *old* vendor's modification cutoff has already passed (mirroring how `quoteCancellation` gates a no-show fee on `hoursUntilStart`), even though `modify/route.ts` today has no modification-cutoff check for same-vendor changes either? This is a pre-existing gap, not unique to 04-13, but cross-vendor swap is the natural forcing function to add it.

## Sources (files read)

- `lib/models/Booking.ts` (full)
- `lib/graph/queries.ts` (full)
- `app/api/bookings/[id]/modify/route.ts` (full)
- `app/api/bookings/[id]/addons/route.ts` (full)
- `lib/vendor-integration/policy.ts` (full)
- `lib/graph/client.ts` (full)
- `graph/init/01-init-graph.sql`
- `.coder/phases/01-rental-ontology-knowledge-graph/graph_schema.sql`
- `.coder/phases/01-rental-ontology-knowledge-graph/ONTOLOGY.md`
- `graph/scripts/load_seed_data.py`
