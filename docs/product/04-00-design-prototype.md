# 04-00: Design System & Prototype

## Component library

Chose **shadcn/ui** (matching `mastech-agentic-commerce`'s storefront pattern). Installed via
`npx shadcn@latest init` + `add`, scoped to exactly 6 primitives needed for the three prototype
screens: `button`, `card`, `input`, `select`, `dialog`, `badge`.

**Deviation from plan:** the current shadcn CLI (v4.19.0) generates components on top of
`@base-ui/react` rather than the `@radix-ui/react-*` packages the plan anticipated. This is a
CLI-version artifact, not a design choice — `@base-ui/react` is shadcn's new default headless
primitives library. Functionally equivalent for this prototype's needs; noted so 04-01/04-02
don't expect Radix-specific APIs (e.g. base-ui uses `data-open`/`data-closed` attributes instead
of Radix's single `data-state` attribute, and a `render` prop for polymorphic elements instead of
Radix's `asChild`).

## Screen flow (maps to UC1)

0. **`/prototype/landing`** — hero + value-prop copy, "Search rentals" CTA, "Sign in" link, a
   "why us" highlight row, and a vehicle-class teaser grid. Scoped down from BookCars'
   `Home.tsx` (no map, no supplier carousel, no i18n, no destination tabs) to the pieces that
   matter for this platform's differentiator: negotiated rates + honored perks. **Added
   post-checkpoint**, at user request, to represent the full discovery→checkout flow rather
   than starting the click-through at search.
1. **`/prototype/search`** — filter bar (location, dates, vehicle class) above a card grid of
   vehicle-class listings with per-perk badges and a daily rate.
2. **`/prototype/vehicle/[id]`** — detail view for one vehicle class: full perk list, larger
   card, "Book now" → checkout.
3. **`/prototype/checkout`** — booking summary + a static payment-form shell (name/email +
   placeholder card-details block, explicitly not a real Stripe Elements mount) + a Dialog-based
   fake confirmation on submit.

All four screens run on mock data (`app/prototype/mock-data.ts`) — no live graph queries, no
Stripe calls, no Mongo writes — **except** the landing page's "Sign in" link, which intentionally
points at the real `/sign-in` (Clerk, built in 03-01) rather than a mock sign-in screen, since
that page already exists and works; duplicating it as a mock would be pure rework. Mock
vehicle-class objects use the real `lib/graph/queries.ts` field names (`class_name`, `term_id`,
`vendor_id`, `perk_id`) for the schema-aligned portion, with prototype-only display fields
(`dailyRate`, `vendorName`, `imageLabel`, etc.) called out in a code comment so 04-01 doesn't
expect a 1:1 shape match.

## UX deviation from BookCars

BookCars' `Checkout.tsx` shows the payment form and booking summary as sequential steps in a
single scrollable page with no persistent side-by-side view of what's being paid for. This
prototype instead places the booking summary and payment form in a two-column layout
(`grid md:grid-cols-2`) so the price breakdown stays visible while filling in payment details —
reduces the chance a member submits without noticing the total.

## Post-checkpoint polish pass

Per user feedback after the initial checkpoint: content read as too technical for an end user
("design prototype, mock data only" copy visible on-screen), sign-in/sign-up wasn't reachable
from a header, and vehicle images were plain gray boxes with technical labels. Fixed:

- Added `app/prototype/layout.tsx` — a header (logo + "Sign in"/"Sign up", both linking to the
  real Clerk pages) shared across all four `/prototype/*` screens. Scoped to the prototype route
  group only; `app/layout.tsx` remains untouched.
- Rewrote all user-visible copy to be end-user-facing — no mention of "prototype," "mock," or
  implementation details anywhere on screen (technical notes now live only in code comments).
- Added `app/prototype/vehicle-image.tsx` — an icon+gradient placeholder shared by all vehicle
  cards, replacing plain gray boxes with a technical text label. Still illustrative only (no
  real photography), but reads as an intentional placeholder rather than debug output.

## Scope notes

- `/prototype/*` routes are not linked from any production navigation (`app/layout.tsx`,
  `app/page.tsx` untouched) and are not covered by any route protection — `middleware.ts`'s
  `clerkMiddleware()` enforces no default protection, so this required no exclusion.
- These routes are a design artifact only; 04-01/04-02 will build the real, data-wired versions
  and this `app/prototype/` tree is expected to be deleted or repurposed once they land.
