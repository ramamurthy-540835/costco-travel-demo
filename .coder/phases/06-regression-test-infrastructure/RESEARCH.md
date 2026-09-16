# Phase 6 Research — Regression Test Infrastructure

**Date:** 2026-09-04
**Unknowns researched:** 3

## Summary

1. **Sibling repo pattern (`mastech-agentic-commerce`)** — uses official `@clerk/testing` with a project-dependency chain (`setup` → `chromium` → `chromium-signout`) so auth happens once via real UI sign-in and `storageState` is reused; smoke = one linear happy-path test; regression specs are narrow single-bug guards. Weaknesses to avoid copying: no CI wiring, `workers:1`/`retries:0`, no data seeding (ambient-data dependent).
   → [research/sibling-repo-playwright-pattern.md](research/sibling-repo-playwright-pattern.md)

2. **This repo's authenticated-flow inventory** — 5 flow families gated by Clerk `auth()`: booking creation/checkout (incl. server-side Stripe-amount integrity check), modification (7+ status-code branches: 401/404/400/409/200/500), cancellation/refund (with an atomic claim-then-update race guard), add-ons (fee-bearing vs. perk-waived), and My Bookings listing. No seed script exists — Mongo booking data is effectively empty; tests must self-create bookings via the real checkout flow. Postgres/AGE inventory graph is already seeded and reusable.
   → [research/authenticated-flows-inventory.md](research/authenticated-flows-inventory.md)

3. **Industry best practices** — confirms `@clerk/testing`'s `clerkSetup()`/`setupClerkTestingToken()` as the correct pattern (must run project-based, not `globalSetup`); recommends Playwright `test.extend` worker/test-scoped fixtures for tagged, self-cleaning Mongo test data instead of ambient data; folder+tag tiering (`e2e/smoke`, `e2e/regression`, `@smoke`/`@regression`) filtered via `--grep`, not `.serial`; mock Stripe PaymentIntent/client-secret at the network layer for the main suite, keep one narrow `@payment-smoke` test driving the real Stripe Elements iframe; standard CI wiring via `playwright install --with-deps` + `webServer` health-check + `upload-artifact@v4`.
   → [research/playwright-clerk-best-practices.md](research/playwright-clerk-best-practices.md)

## Key implications for planning 06-01

- **Adopt, don't copy verbatim:** replicate the sibling repo's `@clerk/testing` + project-dependency + storageState-reuse pattern, but *improve* on it — wire into CI, add `retries` for flake tolerance, and add real data-seeding fixtures (the sibling repo has none; this repo's own flows are complex enough — modify/cancel/addon race conditions — that ambient-data testing would be unreliable).
- **Scope regression coverage to the 5 flow families** in the inventory, with explicit tests for the two previously-fixed-bug races already called out (cancellation claim-then-update, checkout price-tamper rejection) as narrow regression guards, matching the sibling repo's "named after the bug" convention.
- **Stripe:** mock PaymentIntent creation via `page.route` for modify/cancel/addon delta-payment and refund assertions; reserve one `@payment-smoke` test for the real checkout Stripe Elements flow.
- **Test data:** since no booking data is seeded, every authenticated regression test must create its own booking via the UI/API first (checkout flow) — build a fixture for this rather than relying on the one known real booking ID.
- **Tiering:** `tests/e2e/smoke/*` (existing unauthenticated smoke.spec.ts content, tagged `@smoke`) vs. `tests/e2e/regression/*` (new authenticated flows, tagged `@regression`), plus a `setup` project for Clerk auth per sibling-repo pattern.
- **Open item for `/coder:plan`:** confirm whether My Bookings page has a status/date filter UI before scoping filter-specific tests (inventory flagged this as unconfirmed).

## Next steps

Review findings above, then choose:
1. Review consolidated findings (this file + individual research files)
2. Plan this phase (`/coder:plan` → `06-01`)
3. Discuss this phase (`/coder:discuss`)
4. Done for now
