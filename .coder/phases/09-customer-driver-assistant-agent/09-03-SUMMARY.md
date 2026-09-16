---
phase: 09-customer-driver-assistant-agent
plan: 03
subsystem: ui
tags: [chat-ui, hybrid-search, prompt-engineering, card-view, playwright]

requires:
  - phase: 09-customer-driver-assistant-agent
    plan: 01
    provides: agent-service/customer-assistant's POST /chat SSE tool-calling endpoint and TOOLS/TOOL_HANDLERS
  - phase: 09-customer-driver-assistant-agent
    plan: 02
    provides: components/assistant-chat.tsx slide-over chat panel and propose/confirm gate

provides:
  - search_inventory hybrid filter (structured city/vehicleClass graph query + Phase 7 resolveSynonym thesaurus fallback)
  - Conversational SYSTEM_PROMPT that keeps replies to one short sentence and never restates card-rendered vehicle details
  - Tool-name-keyed rendering: search_inventory results render as a horizontal strip of the existing VehicleCard component
  - Chat panel auto-scrolls to the newest message/card on every stream update

affects: []

tech-stack:
  patterns:
    - "Tailwind's `sm:` breakpoint is viewport-width, not container-width — a component designed for full-width contexts (VehicleCard's sm:flex-row) still triggers its wide layout inside a narrow flex/strip item on any normal desktop viewport; the fix belongs in the consuming layout's width, not in the reused component"
    - "Direct SSE curl debugging (real Clerk cookie extracted from a Playwright storageState file, then raw `curl -N /chat`) isolates whether a live bug is in the backend/graph query or in the model's own tool-calling behavior, without any UI rendering in the way"
    - "Model tool-argument omission is a live-only bug class: a tool handler can be 100% correct under direct unit-style calls while the LLM still declines to pass an argument the user's message implies — only caught by exercising the real model, not by testing the handler in isolation"

key-files:
  modified:
    - agent-service/customer-assistant/tools.ts
    - agent-service/customer-assistant/chat-loop.ts
    - lib/graph/queries.ts
    - components/assistant-chat.tsx

key-decisions:
  - "AG-UI rejected, vector-embedding discovery deferred — both decided during planning, restated here for continuity (see 09-03-PLAN.md Context)."
  - "components/vehicle-card.tsx left unmodified per the plan's boundary; the narrow-panel truncation bug found during live verification was fixed entirely in the consuming layout (assistant-chat.tsx's strip-item width and DialogContent panel width), not by forking or adding props to VehicleCard."
  - "MAX_VISIBLE_CARDS lowered from the plan's default cap to 3 once cards were widened to fit VehicleCard's sm:flex-row layout without truncation — keeps the strip legible rather than showing more narrower/truncated cards."

patterns-established:
  - "When reusing a component with viewport-based responsive classes inside a narrow flex/strip container, size the container to fit the component's breakpoint layout rather than fighting it with container overrides."
  - "Chat panels showing streamed content and dynamically-inserted cards must auto-scroll on every message-array update (not just on new-message-count) since a message's rendered height grows in place as tokens/cards stream in."

duration: ~3h
started: 2026-09-04T00:00:00Z
completed: 2026-09-08T00:00:00Z
---

# Phase 9 Plan 03: Conversational UX Upgrade Summary

**Hybrid (structured + synonym) vehicle-class search, a conversational one-sentence system prompt, and real `VehicleCard` rendering for search results — plus two live-testing-only bugs found and fixed (model tool-argument omission, verbose card-restating prose) and a visual truncation/auto-scroll polish pass driven by direct Playwright screenshot review.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~3h |
| Started | 2026-09-04 |
| Completed | 2026-09-08 |
| Tasks | 3 completed (+ 1 unplanned visual-polish pass) |
| Files modified | 4 |

## Acceptance Criteria Results

| AC | Description | Result | Evidence |
|----|--------------|--------|----------|
| AC-1 | Hybrid search: vehicle-class filter + synonym resolution actually applied | ✅ Pass | Live Playwright run: "Find me an SUV in Las Vegas" → `search_inventory` called with `vehicleClass: "SUV"`; all 3 rendered cards read class "SUV". Direct handler test confirmed backend filter correctness; direct SSE curl tests confirmed synonym resolution ("crossover" → "SUV", 11/11 results correct) |
| AC-2 | Conversational, non-redundant assistant prose | ✅ Pass | Live run: reply was a single sentence ("Found a few SUVs in Las Vegas — take a look!") with no rates, provider names, deposit amounts, or seat counts restated — all of that appears only in the rendered cards |
| AC-3 | search_inventory results render as VehicleCards, not plain text | ✅ Pass | Live run: 3 `VehicleCard`s rendered in a horizontal scrollable strip (`.assistant-vehicle-card` count = 3), each with photo, spec chips, price breakdown, provider/rating, and a CTA, fully legible with no clipped text |
| AC-4 | propose_*/Confirm-Cancel gate regression (09-02) still holds | ✅ Pass | Live run against a dynamically-discovered real reserved booking: `propose_modification` rendered an enabled Confirm/Cancel card; Cancel dismissed it with zero mutating request sent |

## Auto-fixed Issues

1. **Model omitting `vehicleClass` from `search_inventory` tool calls despite explicit user intent (live-model-behavior bug, not a backend bug).** `lib/graph/queries.ts`'s `searchInventory()` and the handler's `resolveTerm()` were already verified correct via direct calls, but the live model consistently called `search_inventory({city: "Las Vegas"})` only — never including `vehicleClass` — across 3 repeated direct SSE `curl` runs, despite the user's message saying "an SUV." Root-caused by bypassing the browser entirely and inspecting raw `tool_call` SSE events via `curl -N` with a real Clerk session cookie. Fixed by strengthening both `tools.ts`'s `search_inventory` schema description/parameter descriptions ("ALWAYS pass vehicleClass... never omit it") and `chat-loop.ts`'s `SYSTEM_PROMPT` with an explicit leading instruction. Re-verified: 3/3 consecutive post-fix runs correctly passed `vehicleClass`.

2. **Verbose markdown prose restating full per-vehicle details (AC-2 violation).** The model's replies were numbered markdown lists repeating rate/provider/deposit/seat/gearbox details already shown on the cards, contradicting the existing prompt instruction not to restate them. Fixed by tightening `SYSTEM_PROMPT` to require one short plain sentence with no lists/markdown and an explicit enumeration of fields that must never be repeated. Re-verified: all post-fix replies were single short plain sentences.

3. **VehicleCard content truncated inside the narrow chat panel (found via direct screenshot review, not caught by the functional Playwright assertions).** `VehicleCard`'s root layout uses `sm:flex-row`, a *viewport*-width Tailwind breakpoint, not a container-width one — it switched to its wide three-column image/details/price layout on any normal desktop browser regardless of the 288px-wide strip item it was given, truncating text ("Automa[tic]", "Gasolin[e]", "Toyota RAV[4]"). Fixed entirely in `assistant-chat.tsx` (the only file touched): widened the strip item from `w-72` (288px) to `w-[440px]` and the `DialogContent` panel from `max-w-sm` to `sm:max-w-lg`, giving `VehicleCard`'s row layout enough room; lowered `MAX_VISIBLE_CARDS` from 4 to 3 to keep the wider strip legible. `components/vehicle-card.tsx` itself was not modified, per the plan's boundary. Re-verified via screenshot: no clipped text, full card content visible.

4. **Chat panel not auto-scrolling to the newest message/proposal card.** Discovered via screenshot review: after a multi-turn conversation, the newest assistant message (including a Confirm/Cancel proposal card) rendered below the visible scroll position, invisible without manual scrolling — a real conversational-UX defect since the panel is the primary interaction surface. Fixed by adding a `scrollRef` + `useEffect` on the `messages` array that scrolls the message container to `scrollHeight` on every update (covers in-place growth from streamed tokens/tool events, not just new-message-count changes). Re-verified via screenshot: the newest message, including the Confirm/Cancel card, is now always in view.

## Deviations from Plan

- The plan's `files_modified` list did not anticipate the tool-schema/system-prompt strengthening in Issues #1-2 above — these fall within Task 1/Task 2's stated scope (hybrid filter correctness, conversational prose) but were live-testing discoveries, not pre-planned edits.
- The plan's boundary that `components/vehicle-card.tsx` is "reused as-is, not forked or modified" was upheld; the truncation fix (Issue #3) instead widened `assistant-chat.tsx`'s consuming layout (strip-item width, dialog panel width, card cap) — a deviation from the plan's original card-strip sizing intent (`w-72`, 4 visible cards) but not from its component-reuse boundary.
- Issue #4 (auto-scroll) was not called out anywhere in the plan — it surfaced only from the user's explicit "look at the actual UI... make it very neat" instruction driving direct screenshot-based verification rather than assertion-only testing.

## Verification

- `npx tsc --noEmit` clean throughout, including after all four fixes.
- Full live browser verification (real Clerk sign-in, Playwright) of AC-1 through AC-4 against the actual running agent-service + Next app — not mocked.
- Direct SSE `curl` debugging (real Clerk session cookie extracted from Playwright's `storageState`) used to isolate and re-verify the two live-model-behavior bugs (Issues #1-2) independent of any UI rendering.
- Direct visual screenshot review (not just DOM assertions) caught Issues #3-4, which passed all functional Playwright assertions but were visually broken/hard-to-use — matches this project's precedent that automated assertions alone are insufficient for UI/UX quality claims.
- No regressions: 09-02's propose/confirm gate, Confirm/Cancel button disable-while-sending behavior, and existing booking/modify/cancel flows were not touched.
- All temporary verification artifacts deleted: `tests/e2e/smoke/verify-ui-tmp.spec.ts`, `verify-filter-tmp.ts` (repo root), `/tmp/cookie.txt`, `/tmp/chat-raw*.txt`, `/tmp/ui-*.png`. Dev servers (Next.js :3000, customer-assistant :4200) stopped.

All 4 ACs Pass. Phase 9 is now 3/3 plans complete (reopened from its prior 09-02 close, per the Phase 6 `06-06` precedent).
