---
phase: 09-customer-driver-assistant-agent
plan: 07
subsystem: infra
tags: [nextjs, basepath, clerk, middleware, stripe, routing]

requires:
  - phase: 09 (09-01/09-02/09-03)
    provides: customer-assistant agent-service + chat UI making same-origin fetch calls that needed basePath-awareness
provides:
  - App served under /agentic-travels basePath, mirroring mastech-agentic-commerce's convention
  - Shared lib/basePath.ts BASE_PATH constant, consumed by both the Next app's client components and the separate customer-assistant agent-service process
  - Root "/" redirect into /agentic-travels
affects: any future work adding a same-origin fetch()/EventSource call, or a new agent-service process making REST calls into this app's own routes

tech-stack:
  added: []
  patterns:
    - "Client-side fetch() calls are never basePath-aware automatically (unlike <Link>/router.push) — every literal fetch('/api/...') needs manual BASE_PATH prefixing"
    - "Cross-process REST calls (agent-service → Next app) import BASE_PATH via existing relative-import precedent (../../lib/basePath) rather than baking the prefix into an overridable env var's default — single source of truth"

key-files:
  created: [lib/basePath.ts]
  modified: [next.config.js, middleware.ts, app/layout.tsx, .env.local.example, "app/(checkout)/checkout/checkout-form.tsx", components/booking-cancel-dialog.tsx, components/booking-modify-form.tsx, components/booking-addons-form.tsx, components/assistant-chat.tsx, components/assistant-payment.tsx, agent-service/customer-assistant/env.ts, agent-service/customer-assistant/tools.ts]

key-decisions:
  - "middleware.ts matcher needed an explicit '/' entry — the catch-all negative-lookahead pattern doesn't match the bare root path once basePath strips a request down to it (plan-protected file, user-approved via AskUserQuestion after live verification)"
  - "agent-service/customer-assistant's NEXTJS_APP_URL stays a bare origin; BASE_PATH is imported into tools.ts's fetchJson instead of baked into the env var's default, so an overridden NEXTJS_APP_URL can't silently drop the prefix"

patterns-established:
  - "Any new literal fetch('/api/...')/fetch(`/api/...`) call site must import BASE_PATH from '@/lib/basePath' (Next app) or '../../lib/basePath' (agent-service) and prefix the path"

duration: ~3h (across original APPLY + 2 live-testing bugfix rounds)
started: 2026-09-15T13:00:00
completed: 2026-09-15T13:35:00
---

# Phase 9 Plan 07: /agentic-travels basePath convention Summary

**App now served under /agentic-travels (root redirects into it), every same-origin fetch call across the Next app and the separate customer-assistant agent-service process updated to stay correct under the prefix, with two live-testing-discovered gaps (middleware root-path matcher, assistant-payment.tsx) closed before sign-off.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: App reachable under prefix, root redirects | Pass | `next.config.js` basePath + redirects() confirmed live; root-path 500 (middleware matcher gap) found and fixed during verification |
| AC-2: Every client-side API call resolves under the prefix | Pass | All 5 originally-planned components fixed; live testing surfaced 2 additional call sites outside the plan's `files_modified` list (agent-service `tools.ts`, and `components/assistant-payment.tsx`) — both fixed |
| AC-3: Sign-in/sign-up + post-sign-out routing correct under prefix | Pass | `NEXT_PUBLIC_CLERK_SIGN_IN_URL`/`_UP_URL` + `ClerkProvider afterSignOutUrl` updated and verified |
| AC-4: Type-checking stays green | Pass | `npx tsc --noEmit` clean after every round of changes, including the two post-APPLY fixes |

## Accomplishments

- Full `/agentic-travels` basePath convention live, matching `mastech-agentic-commerce`'s pattern exactly.
- Closed a real, user-blocking bug live during manual QA: booking creation failing with "Booking could not be created" because `assistant-payment.tsx` (missed by the original plan's file scope) posted to bare `/api/bookings*`.
- Closed a second real bug: the agent-service `customer-assistant` process's server-to-server calls into this app's own `/api/bookings*` routes also needed the prefix — fixed via a shared-constant import rather than a duplicated/bakeable env-var string, after the user's own architectural pushback on the first (weaker) fix attempt.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `next.config.js` | Modified | `basePath: '/agentic-travels'` + root `redirects()` |
| `lib/basePath.ts` | Created | Shared `BASE_PATH` constant |
| `middleware.ts` | Modified (deviation) | Added explicit `'/'` matcher entry — root path was 500ing |
| `app/layout.tsx` | Modified | `ClerkProvider afterSignOutUrl={BASE_PATH}` |
| `.env.local.example` | Modified | Prefixed Clerk sign-in/up URLs |
| `app/(checkout)/checkout/checkout-form.tsx` | Modified | Prefixed `/api/payments/intent`, `/api/bookings` |
| `components/booking-cancel-dialog.tsx` | Modified | Prefixed `/api/bookings/:id/cancel` (2 call sites) |
| `components/booking-modify-form.tsx` | Modified | Prefixed `/api/bookings/:id/modify` (3 sites) + `/api/payments/intent` |
| `components/booking-addons-form.tsx` | Modified | Prefixed `/api/bookings/:id/addons` (3 sites) + `/api/payments/intent` |
| `components/assistant-chat.tsx` | Modified | Prefixed 3 same-origin call sites; left `${ASSISTANT_URL}/chat` (different origin) untouched |
| `components/assistant-payment.tsx` | Modified (deviation) | Prefixed `/api/bookings`, `/api/bookings/:id/addons`, `/api/bookings/:id/modify` — missed by original plan scope, root cause of a live "Booking could not be created" failure |
| `agent-service/customer-assistant/env.ts` | Modified (deviation) | Kept `NEXTJS_APP_URL` as bare origin (reverted first fix attempt of baking `/agentic-travels` into its default) |
| `agent-service/customer-assistant/tools.ts` | Modified (deviation) | Imported shared `BASE_PATH`; `fetchJson` now builds `${ENV.NEXTJS_APP_URL}${BASE_PATH}${path}` |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Add explicit `'/'` to middleware matcher | Root path 500'd with a Clerk "can't detect clerkMiddleware()" error once basePath stripped it to `/` — the negative-lookahead catch-all didn't match | Presented as a finding via AskUserQuestion (file was plan-protected); user approved |
| Import `BASE_PATH` into agent-service `tools.ts` rather than bake prefix into `NEXTJS_APP_URL`'s default | User explicitly questioned the first fix's fragility (an overridden env var would silently drop the prefix); single source of truth avoids drift | Cross-process convention now established for any future agent-service→Next-app call |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 3 | All essential correctness fixes surfaced by live manual QA, not scope creep |
| Deferred | 1 | Logged as new tech debt (TD-11), unrelated to basePath |

### Auto-fixed Issues

**1. Middleware root-path matcher gap**
- **Found during:** Live verification after Task 3 (checkpoint)
- **Issue:** Bare root path 500'd — catch-all negative-lookahead matcher doesn't match `/` once basePath strips the request down to it
- **Fix:** Added explicit `'/'` entry to `middleware.ts`'s matcher array
- **Files:** `middleware.ts`
- **Verification:** `curl` header inspection (`x-clerk-auth-status` present after fix); user-approved via AskUserQuestion since file was plan-protected

**2. Agent-service→Next-app booking/add-on calls broken under basePath**
- **Found during:** Post-APPLY manual chat testing — user reported booking proposal with a GPS add-on failing
- **Issue:** `agent-service/customer-assistant/tools.ts`'s `fetchJson` concatenated `${ENV.NEXTJS_APP_URL}${path}` with bare `/api/bookings...` literals — 404 under the new basePath
- **Fix:** Reverted an initial fix (baking `/agentic-travels` into `NEXTJS_APP_URL`'s default) after user pushback; imported the shared `BASE_PATH` constant into `tools.ts` instead
- **Files:** `agent-service/customer-assistant/env.ts`, `agent-service/customer-assistant/tools.ts`
- **Verification:** `npx tsc --noEmit` clean; service restarted and retested live

**3. `assistant-payment.tsx` unprefixed booking-creation POST**
- **Found during:** Post-APPLY manual chat testing — user reported "Booking could not be created" after a successful vendor-availability check + Stripe payment
- **Issue:** This component (outside the original plan's `files_modified` list) posts directly to `/api/bookings`, `/api/bookings/:id/addons`, `/api/bookings/:id/modify` after payment confirmation, bypassing the already-fixed `checkout-form.tsx`/`booking-modify-form.tsx`
- **Fix:** Imported `BASE_PATH`, prefixed all 3 URLs
- **Files:** `components/assistant-payment.tsx`
- **Verification:** `npx tsc --noEmit` clean; full repo sweep for any other unprefixed `fetch()`/`router.push`/`redirect` calls found none remaining

### Deferred Items

- TD-11 (`.coder/ROADMAP.md`): intermittent "no available rental cars" report — investigated, no code defect found, likely LLM tool-call/reasoning inconsistency (same class as TD-4); deferred to Phase 10 Phoenix tracing. Unrelated to this plan's basePath scope; not blocking sign-off.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Two call sites outside the plan's declared `files_modified` scope (agent-service `tools.ts`, `assistant-payment.tsx`) | Both found via live manual QA rather than static analysis at plan time; fixed and verified in-session |

## Next Phase Readiness

**Ready:**
- `/agentic-travels` basePath convention fully live and verified end-to-end (discovery, checkout, modify, cancel, add-ons, conversational booking).
- `BASE_PATH` import pattern established for both the Next app and the separate agent-service process — any future same-origin call site has a clear precedent to follow.

**Concerns:**
- TD-11 (intermittent "no available rental cars") remains open, deferred to Phase 10.

**Blockers:**
- None.

---
*Phase: 09-customer-driver-assistant-agent, Plan: 07*
*Completed: 2026-09-15*
