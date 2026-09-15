---
phase: 09-customer-driver-assistant-agent
plan: 02
subsystem: ui
tags: [chat-ui, sse-client, clerk, dialog, propose-confirm]

requires:
  - phase: 09-customer-driver-assistant-agent
    plan: 01
    provides: agent-service/customer-assistant's POST /chat SSE tool-calling endpoint

provides:
  - Global floating "Travel Assistant" launcher + slide-over chat panel, signed-in members only
  - Browser-native SSE client (fetch + ReadableStream, not EventSource) consuming 09-01's /chat contract
  - Explicit Confirm/Cancel UI gate on every propose_* tool_result, structurally rate-limited to one in-flight turn

affects: []

tech-stack:
  patterns:
    - "Manual SSE parsing via fetch()+ReadableStream/TextDecoder — 09-01's /chat is POST-only, browsers' native EventSource cannot send a POST body"
    - "Reused existing Dialog/Button/Input primitives (components/ui/*) for the slide-over panel — no new design system/component library introduced"
    - "user.id from useUser() passed directly as memberId — server-side memberId is the raw Clerk userId (see getOrCreateMember in app/api/bookings/route.ts)"

key-files:
  created:
    - components/assistant-chat.tsx
    - components/assistant-launcher.tsx
  modified:
    - app/layout.tsx
    - agent-service/customer-assistant/server.ts
    - .env.local

key-decisions:
  - "Mount point is app/layout.tsx (not header.tsx) — matches where <Header /> itself is already globally mounted; header.tsx left unmodified, a deliberate deviation from the plan's files_modified list per its own 'or header.tsx if that's already the convention' phrasing"
  - "Confirm/Cancel buttons disabled while a turn is in-flight (disabled={sending}) — structural fix for a real race condition (see Auto-fixed Issues), not just a test workaround"

patterns-established:
  - "Cross-origin browser calls to an agent-service process with credentials: 'include' require an explicit Access-Control-Allow-Origin (never '*') plus Allow-Credentials and an OPTIONS preflight branch — applies to any future browser-facing agent-service endpoint (e.g. a driver-facing surface)"

duration: ~2h
started: 2026-09-08T00:00:00Z
completed: 2026-09-08T00:00:00Z
---

# Phase 9 Plan 02: Customer Assistant Chat UI Summary

**Global floating launcher + slide-over chat panel streaming from 09-01's `/chat` SSE endpoint, reusing this app's existing Dialog/Button/Input primitives, with a structural Confirm/Cancel gate that prevents any mutating tool call from firing without an explicit member click.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~2h |
| Started | 2026-09-08 |
| Completed | 2026-09-08 |
| Tasks | 2 completed |
| Files modified | 5 (2 created, 3 modified) |

## Acceptance Criteria Results

| AC | Description | Result | Evidence |
|----|--------------|--------|----------|
| AC-1 | Launcher globally reachable, panel opens | ✅ Pass | Live Playwright run: launcher visible on `/` and `/bookings` without remount, panel opens showing "Travel Assistant" heading |
| AC-2 | Token-by-token streaming + tool call/result indicators | ✅ Pass | Live run: assistant bubble grew from `"…"` at t=3s to 626 chars by t=8s; indicator line `"Checking: search_inventory…Done: search_inventory"` rendered inline |
| AC-3 | Explicit confirm/cancel gate before any mutating call | ✅ Pass | Live run against a real seeded booking: `propose_modification`'s `tool_result` rendered a Confirm/Cancel card; zero `/chat` requests fired while the card was showing; the confirming request only fired after Confirm was clicked; direct MongoDB read post-confirm shows `from`/`to` updated to the proposed dates and a new `modificationHistory` entry |
| AC-4 | Real Clerk session forwarded, no hand-typed member ID | ✅ Pass | Live `/chat` request body inspected: `memberId` sourced from `useUser().user.id` (client hook), never typed by the member; Clerk session cookie forwarded via `credentials: 'include'` |

## Auto-fixed Issues

1. **Missing CORS on `agent-service/customer-assistant/server.ts` (09-01's file, transport-level gap).** The very first browser verification pass showed zero streamed tokens/indicators despite a direct `curl` against the same process working perfectly — curl doesn't enforce CORS, so the earlier direct-curl sanity check gave false confidence. Root cause: zero `Access-Control-*` headers, so the browser silently blocked the credentialed cross-origin `fetch()` response. Fixed with a `withCors()` helper (`Access-Control-Allow-Origin` set to `ENV.NEXTJS_APP_URL`, `Access-Control-Allow-Credentials: true`, allowed methods/headers) plus an `OPTIONS` preflight branch returning 204. Judged in-scope as a transport-level fix, not a contract change — the event vocabulary and tool semantics are untouched.

2. **Confirm-button race condition allowing an overlapping second `/chat` turn (real UI bug in `components/assistant-chat.tsx`).** Clicking Confirm the instant the proposal card rendered sent a second POST on the same `conversation_id` while the propose turn's stream was still open, corrupting the model's context for that conversation — observed as the model re-calling `propose_modification` instead of `modify_booking`, and the booking's dates staying unchanged in Mongo. Isolated via a raw-curl sequential-turn test (proved the model calls `modify_booking` correctly given identical phrasing with no overlap), confirming the bug was UI timing, not prompt wording. Fixed by adding `disabled={sending}` to both Confirm and Cancel buttons — they stay disabled until the in-flight turn's stream fully completes. Re-verified end-to-end: Confirm click now only fires once re-enabled, the model correctly calls `modify_booking`, and the change persists in Mongo.

## Deviations from Plan

- `components/header.tsx` was not modified, despite being listed in the plan's `files_modified` — `app/layout.tsx` was chosen as the actual global mount point instead (matching where `<Header />` itself is mounted), which the plan itself allowed ("or header.tsx if that's already the global-mount convention").
- `agent-service/customer-assistant/server.ts` (09-01's file, not in 09-02's `files_modified`) was touched for the CORS fix above — flagged per this project's SUMMARY-accuracy convention, not silently omitted.

## Verification

- `npx tsc --noEmit` clean throughout, including after the race-condition fix.
- Full live browser verification (Playwright, real Clerk sign-in, real seeded booking via Stripe test-mode PaymentIntent) of AC-1 through AC-4 against the actual running 09-01 process — not mocked.
- Direct MongoDB inspection (`db.collection('Booking')`) confirmed the AC-3 modification genuinely persisted (`from`/`to` updated, `modificationHistory` entry recorded).
- No regressions: existing booking/modify/cancel UI flows were not touched by this plan (`components/booking-modify-dialog.tsx` etc. untouched).
- All temporary verification scripts (`verify-assistant-ui.ts`, `check-booking.ts`, `seed-and-cookie.ts`) and their output deleted per project convention.

All 4 ACs Pass. Phase 9 is now 2/2 plans complete.
