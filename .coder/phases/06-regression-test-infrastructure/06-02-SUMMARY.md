# 06-02 SUMMARY — Checkout/UC1 Regression Specs + Payment Smoke

Plan: `06-02-PLAN.md`
Applied: 2026-09-04

## What was built

**`tests/e2e/regression/checkout.spec.ts`**
- Happy-path spec: picks a real, negotiated-term-priced inventory/vendor via `searchInventory()`, navigates directly to `/checkout?inventoryId=...`, creates a real Stripe test-mode PaymentIntent for the exact displayed total (via the Stripe Node SDK, `payment_method: 'pm_card_visa', confirm: true`), POSTs it to `/api/bookings` exactly as `checkout-form.tsx` does, asserts 201 + confirmation-page rendering + `Booking.status === 'reserved'` + `pricingSnapshot.totalPrice` match, then cleans up via `Booking.deleteOne`.
- Rejection spec: same setup but creates a PaymentIntent for `totalPrice - 10`, POSTs to `/api/bookings`, asserts `400` with `"Charged amount does not match the negotiated rate"` and confirms no `Booking` document was created.

**`tests/e2e/regression/payment-smoke.spec.ts`**
- `@payment-smoke`-tagged spec driving the real, non-mocked Stripe Elements iframe: navigates to checkout, clicks "Continue to payment", selects the "Card" tab and fills card number/expiry/CVC inside the real iframe, submits, and asserts redirect to `/confirmation/[bookingId]` with `status: 'reserved'`.

## Deviations from plan

- **Task 1 — mocking Stripe's response cannot exercise the real check.** The plan's Task 1 instructions describe intercepting the network via `page.route()`/`mockStripePayment` so the mocked PaymentIntent's `amount` is seen as reduced. This is architecturally impossible: the rate-integrity check lives entirely server-side (`app/api/bookings/route.ts` calls `stripeAPI.paymentIntents.retrieve(paymentIntentId)`, a Next.js-server-to-Stripe.com Node HTTP call). Playwright's `page.route()` only intercepts requests from the *browser* under test — it has no effect on the server process's own outbound call. A mocked/fake PaymentIntent id would make the server's real `retrieve()` call 404 against Stripe's real API, not exercise the 400 rejection path. **Fix**: both specs create real, already-`succeeded` Stripe test-mode PaymentIntents directly via the Stripe Node SDK (`getStripe()`, `pm_card_visa`, `confirm: true`) for the exact amount each spec needs, then submit that real PaymentIntent id to `/api/bookings` via `request.post` — this genuinely exercises the server's real `retrieve()` + recompute + compare logic, which is the actual thing AC-2 needs verified. `mockStripePayment` (06-01) is unused by this plan's specs as a result.
- **06-01's `testMember`/`testBooking` fixtures are unusable for this flow.** `POST /api/bookings` always ties the created `Booking` to the real signed-in Clerk session's member via `getOrCreateMember(userId, ...)` — never to any client-supplied member. `testMember` is a synthetic Mongo document with an unrelated fake `clerkUserId`, so it can never match or clean up a booking created through real checkout. **Fix**: both spec files use only the worker-scoped `mongoClient` fixture (to establish the Mongoose connection) and track/clean up bookings directly by `bookingId`/`paymentIntentId` against the real `Booking` model.
- **Direct navigation to `/checkout?inventoryId=...` instead of driving search/select UI.** `checkout/page.tsx` accepts `inventoryId`/`vendorId`/`from`/`to` as `searchParams` directly. Both `checkout.spec.ts` specs use this to pick a real, deterministically-priced inventory/vendor pair without the added flakiness of driving the search UI — already covered by the existing smoke suite.
- **`payment-smoke.spec.ts`: real Stripe Elements DOM structure, found only via live inspection (not in source).** Stripe's `PaymentElement` renders a "Card / Bank / Klarna" tab picker before any card-number/expiry/CVC fields exist. Counter to the initial assumption (and the frame's own name), live inspection via a per-frame accessibility-role query (`frame.getByRole('button', {name:'Card'})`) across all `page.frames()` showed **both the tab picker and the resulting card fields render inside the `elements-inner-accessory-target` iframe**, not `elements-inner-easel` (which stayed empty in this render). Fixed by scoping all interactions to `page.frameLocator('iframe[src*="elements-inner-accessory-target"]')` and clicking the "Card" tab (`getByRole('button', {name:'Card', exact:true})`) before filling the card fields.

## Acceptance criteria

| AC | Result |
|---|---|
| AC-1: Happy-path checkout creates a real, correctly-priced booking | **Pass** — verified against real dev Mongo/Stripe test mode; confirmation page renders vendor/total, `Booking.status === 'reserved'`, `pricingSnapshot.totalPrice` matches. |
| AC-2: PaymentIntent charged below negotiated rate is rejected server-side | **Pass** — real underpriced PaymentIntent rejected with 400 + exact error message; no `Booking` document created. |
| AC-3: Real Stripe Elements payment succeeds end-to-end | **Pass** — real iframe interaction (Card tab + 4242 test card) confirms payment and reaches `/confirmation/[bookingId]` with `reserved` status. |

## Verification

- `npx tsc --noEmit`: clean, whole project.
- `npm run test:e2e:regression` (setup + checkout.spec.ts + payment-smoke.spec.ts, all 3 specs together): 4/4 passing (1 setup + 3 specs).
- `npx playwright test --project=setup --project=regression --grep @payment-smoke`: passing in isolation.
- No leftover booking/member documents: both specs clean up via `Booking.deleteOne` in all paths (including a `finally` in the happy path); the rejection spec confirms no booking was created at all. No `e2e-*@test.local` fixtures are used by either file (they bypass `testMember`/`testBooking` per the deviation above), so that check is moot for these two files.
- `git status`: no stray scratch/inspection files left in the working tree.

## Files changed

`tests/e2e/regression/checkout.spec.ts` (new), `tests/e2e/regression/payment-smoke.spec.ts` (new).

## Next

Run `/coder:unify` to close the loop for 06-02. 06-03, 06-04, 06-05 (all `depends_on: ["06-01"]`) remain planned and unapplied.
