# 06-05 SUMMARY — Add-ons/UC6 + My Bookings Account Listing

Plan: `06-05-PLAN.md`
Applied: 2026-09-04

## What was built

**`tests/e2e/regression/addons.spec.ts`** (2 specs):
1. Fee-bearing addon: creates a booking, reads its persisted `pricingSnapshot.perkIds`, finds a non-waived fee-bearing addon from `getAddOnsCatalog()`, asserts the route's `dryRun: true` preview equals `fee_per_day * nights`, pays via a real confirmed Stripe PaymentIntent, confirms, and asserts the Mongo-persisted `pricingSnapshot.addonTotal`/`addonIds` match.
2. Perk-waived addon: creates a booking, then directly patches its persisted `pricingSnapshot.perkIds` in Mongo to a real seed perk that waives an addon (see Deviation below). Opens the confirmation page's "Manage extras" dialog, asserts the waived addon renders `checked`+`disabled` with copy `"Included with your perks — $0"`, then calls the route directly and asserts `chargedAddonIds` excludes the waived addon and Mongo state is unaffected (still $0, addon absent) — proving the route never charges a waived addon even under a direct API call.

**`tests/e2e/regression/my-bookings.spec.ts`** (2 specs):
1. Listing + entry points: creates a booking, navigates to `/bookings`, locates its card via `[data-slot="card"]` + `hasText`, and opens/closes each of the Modify, Cancel booking, and Manage extras dialogs, confirming all three wire up correctly from the listing.
2. Status filter: confirms a reserved booking appears with no filter, disappears under `?status=cancelled`, and reappears once the filter is cleared.

## Deviations from plan

- **Perk-waived test cannot use a real anonymous-search result — seed-data structural gap.** The plan implied sourcing the waiving perk from a real `searchInventory()` candidate's perks. Investigation showed `searchInventory()`'s anonymous path always resolves each vendor's lowest-rank ("Gold Star") `NegotiatedTerm` (`getLowestRankTermsByVendor()` in `lib/graph/queries.ts`), and per `data/synthetic/negotiated_terms.json`, Gold Star terms for every vendor carry only `unlimited_mileage` — the four addon-waiving perks (`free_additional_driver`, `no_young_driver_fee`, `waived_underage_fee`, `damage_waiver_included`) exist only on `executive`/`business` tier terms, which anonymous search never surfaces. No booking created through the real search+checkout path can ever land in the AC-2 scenario today. **Fix**: create a normal booking, then directly overwrite its persisted `pricingSnapshot.perkIds` in Mongo with a real seed perk (probed via `getWaivedAddOnIds()` against the known seed vocabulary, not hardcoded to a specific addon). This is fixture manipulation, not a change to the boundary-protected `addons/route.ts` or `bookings/page.tsx` — both still recompute `getWaivedAddOnIds()` live from whatever `perkIds` the booking actually has, so the test exercises real production logic. Same pattern as 06-03's direct-Mongo conflict seeding.
- **Card locator uses `[data-slot="card"]` + `hasText`, not exact-text matching.** `CardTitle` renders a single combined text node (`"{class_name} — {vendorId}"`), so `getByText(vendorId, { exact: true })` never matches. Anchoring on the `data-slot="card"` attribute (confirmed via `components/ui/card.tsx`) with substring `hasText` is precise and matches the plan's own instruction to verify real rendered structure rather than assume it.

## Acceptance criteria

| AC | Result |
|---|---|
| AC-1: Adding a fee-bearing addon charges `fee_per_day * nights` and persists correctly | **Pass** |
| AC-2: A perk-waived addon renders locked at $0 in the UI and is never charged, even via a direct API call | **Pass** — required the Mongo-fixture deviation above to reach a real waiving-perk state at all |
| AC-3: My Bookings lists reserved bookings with working Modify/Cancel/Addons entry points and a working status filter | **Pass** |

## Verification

- `npx tsc --noEmit`: clean, whole project.
- `addons.spec.ts` + `my-bookings.spec.ts` isolated run: 5/5 passing (including setup).
- Full `npx playwright test --project=regression` (setup + checkout + cancel + concurrency + modify + addons + my-bookings + payment-smoke, 17 specs): all passing — one pre-existing, unrelated `modify.spec.ts` availability-race flake self-resolved on Playwright's built-in retry (not caused by this plan's changes; that spec/route was untouched here).
- No leftover seeded documents: every spec cleans up its booking(s) in a `finally` block.
- `git status`: only the two new spec files plus already-tracked prior-plan infra; no stray scratch files (temporary debug script used during investigation was deleted).

## Files changed

`tests/e2e/regression/addons.spec.ts` (new), `tests/e2e/regression/my-bookings.spec.ts` (new). No source files touched (`app/api/bookings/[id]/addons/route.ts`, `app/(account)/bookings/page.tsx` unchanged, per plan boundary).

## Next

Run `/coder:unify` to close the loop for 06-05 — this is the last plan in Phase 6 (5/5), so unify should also mark the phase complete.
