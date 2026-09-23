# Costco Travel Customer Agent Demo — Test Cases

**Document version:** 1.0
**Date:** 2026-09-22
**Alignment source:** Costco_Travel_Customer_Agent_Demo_Alignment.docx
**Demo URL:** https://costco-travel-demo-gygcwrc62a-uc.a.run.app
**API base:** https://costco-travel-demo-gygcwrc62a-uc.a.run.app/api

---

## Test Summary Matrix

| Category | P0 (Critical) | P1 (High) | P2 (Medium) | Total |
|---|---|---|---|---|
| 1. Discovery & Search (UC1) | 4 | 3 | 2 | 9 |
| 2. Compare | 2 | 2 | 1 | 5 |
| 3. Booking (UC1) | 3 | 2 | 1 | 6 |
| 4. View Reservations | 2 | 2 | 1 | 5 |
| 5. Change Reservation (UC2) | 4 | 3 | 1 | 8 |
| 6. Cancellation (UC3) | 3 | 3 | 1 | 7 |
| 7. Pre-check & Guardrails | 3 | 3 | 2 | 8 |
| 8. Vendor Portal Sync | 2 | 3 | 1 | 6 |
| 9. Knowledge Graph | 1 | 2 | 2 | 5 |
| 10. Lifecycle (UC4–UC8) | 3 | 4 | 3 | 10 |
| 11. AI Agent Chat | 2 | 3 | 2 | 7 |
| 12. Negative & Edge Cases | 2 | 3 | 2 | 7 |
| **Totals** | **31** | **33** | **19** | **83** |

---

## Member Login Credentials (Test Accounts)

| Username | Password | Member Name | Member ID |
|---|---|---|---|
| sarah | admin1234 | Sarah Johnson | MBR-00001 |
| david | admin1234 | David Chen | MBR-00002 |
| emily | admin1234 | Emily Rodriguez | MBR-00003 |
| robert | admin1234 | Robert Kim | MBR-00004 |
| lisa | admin1234 | Lisa Thompson | MBR-00005 |
| james | admin1234 | James Wilson | MBR-00006 |
| maria | admin1234 | Maria Garcia | MBR-00007 |
| kevin | admin1234 | Kevin Patel | MBR-00008 |

---

## 1. Discovery & Search (UC1)

### TC-001 — Search by airport location
**Category:** Discover
**Priority:** P0
**Preconditions:** Logged in as sarah/admin1234.
**Test Steps:**
1. Open the AI concierge chat.
2. Type: "Find me a rental car at Seattle airport for next week."
3. Wait for the agent response.
**Expected Results:**
- Agent recognizes pickup location as SEA (Seattle-Tacoma International).
- Agent asks for or infers drop-off date and time.
- Available vehicles are returned with member pricing.
- No error or empty result set.

### TC-002 — Search with explicit dates and times
**Category:** Discover
**Priority:** P0
**Preconditions:** Logged in as david/admin1234.
**Test Steps:**
1. Type: "I need a car in Las Vegas from October 1 to October 5, pick up at 10 AM, drop off at 2 PM."
2. Wait for agent response.
**Expected Results:**
- Agent correctly parses: location LAS, pickup Oct 1 10:00, drop-off Oct 5 14:00, 4 days.
- Available vehicles are returned with rates reflecting 4-day duration.
- Dates and times are displayed accurately in the results.

### TC-003 — Search with vehicle class preference
**Category:** Discover
**Priority:** P0
**Preconditions:** Logged in as emily/admin1234.
**Test Steps:**
1. Type: "Find me an SUV at LAX for 3 days starting tomorrow."
2. Wait for agent response.
**Expected Results:**
- Agent filters or highlights SUV classes (Standard SUV / SFAR, Full-Size SUV / FFAR).
- Results include SUV options at LAX with per-day member rates.
- Non-SUV options may appear but SUVs are prioritized or called out.

### TC-004 — Search returns Costco member pricing
**Category:** Discover
**Priority:** P0
**Preconditions:** Logged in as robert/admin1234.
**Test Steps:**
1. Search for any rental car at any valid location.
2. Review the pricing in the results.
**Expected Results:**
- Each option shows the Costco member rate (discounted).
- Each option shows the retail rate or savings amount.
- Member savings are visible and calculated correctly (retail − member rate).

### TC-005 — Search across multiple locations
**Category:** Discover
**Priority:** P1
**Preconditions:** Logged in as any member.
**Test Steps:**
1. Type: "What's available at MCO next weekend?"
2. After results, type: "What about JFK instead?"
**Expected Results:**
- First search returns MCO inventory.
- Second search returns JFK inventory with different availability.
- Agent maintains conversational context between the two searches.

### TC-006 — API direct search
**Category:** Discover
**Priority:** P1
**Preconditions:** None (API test).
**Test Steps:**
1. `GET /api/cars?location=SEA&pickup=2026-10-01&dropoff=2026-10-04`
2. Verify response structure.
**Expected Results:**
- Response is JSON with an array of available cars.
- Each car object includes: vendor, vehicle class, SIPP code, member rate, retail rate, total, savings.
- 4-tier search is applied (Firestore → Vendor API → SerpAPI → static fallback).

### TC-007 — Search with no results scenario
**Category:** Discover
**Priority:** P1
**Preconditions:** Logged in as any member.
**Test Steps:**
1. Type: "Find me a rental car at a very remote location like Barrow Alaska."
**Expected Results:**
- Agent handles gracefully — either returns no results with a helpful message or falls back to static data.
- No unhandled exception or crash.

### TC-008 — Location inventory API
**Category:** Discover
**Priority:** P2
**Preconditions:** None (API test).
**Test Steps:**
1. `GET /api/inventory?location=SEA`
2. `GET /api/inventory?location=LAX`
**Expected Results:**
- Each returns inventory documents for that location.
- Inventory includes vehicle class, count, and rate information.

### TC-009 — Vendor list API
**Category:** Discover
**Priority:** P2
**Preconditions:** None (API test).
**Test Steps:**
1. `GET /api/vendors`
2. `GET /api/locations`
**Expected Results:**
- Vendors endpoint returns all partner vendors (Alamo, Avis, Budget, Enterprise, National).
- Locations endpoint returns active pickup locations (SEA, LAX, MCO, LAS, DEN, JFK).

---

## 2. Compare

### TC-010 — Present ranked member options
**Category:** Compare
**Priority:** P0
**Preconditions:** Logged in as sarah/admin1234. Search for a car at SEA.
**Test Steps:**
1. Type: "Find me a rental car at Seattle airport for 3 days."
2. Review the options presented.
**Expected Results:**
- Multiple options are presented (at least 2–3 vendors or vehicle classes).
- Options are ranked or organized meaningfully (by price, class, or relevance).
- Each option shows: vendor name, vehicle class, model, daily rate, total, savings.

### TC-011 — Show best alternatives on request
**Category:** Compare
**Priority:** P0
**Preconditions:** Logged in. Search results are displayed.
**Test Steps:**
1. After a search, type: "Show me the best two alternatives before I change my booking."
2. Review the response.
**Expected Results:**
- Agent presents exactly 2 top alternatives with clear comparison.
- Pricing, savings, and vehicle details are shown side by side or sequentially.
- Agent waits for member selection before proceeding.

### TC-012 — Compare shorter rental for better rate
**Category:** Compare
**Priority:** P1
**Preconditions:** Logged in. Have an existing reservation or active search.
**Test Steps:**
1. Type: "Can you check whether a shorter rental gives me a better rate?"
2. Review the response.
**Expected Results:**
- Agent re-shops with a shorter duration.
- Shows comparison between current and shorter rental.
- Highlights any cost difference or savings.

### TC-013 — Savings display accuracy
**Category:** Compare
**Priority:** P1
**Preconditions:** Logged in. Search results displayed.
**Test Steps:**
1. For each displayed option, verify: savings = retail_total − member_total.
2. Verify per-day rate × days = total.
**Expected Results:**
- All math is correct.
- Savings are positive (member rate < retail rate).
- No rounding errors beyond 2 decimal places.

### TC-014 — SIPP code display
**Category:** Compare
**Priority:** P2
**Preconditions:** Logged in or API test.
**Test Steps:**
1. Search for cars and review results.
2. Check that SIPP codes are present.
**Expected Results:**
- Each vehicle option includes a valid SIPP code (ECAR, CCAR, ICAR, FCAR, SFAR, MVAR, FFAR, LCAR, PPAR, PFAR).
- SIPP code matches the vehicle class.

---

## 3. Booking (UC1)

### TC-015 — Full booking flow via AI agent
**Category:** Book
**Priority:** P0
**Preconditions:** Logged in as sarah/admin1234.
**Test Steps:**
1. Type: "Find me a rental car at Seattle airport for next week."
2. Agent presents options. Select one (e.g., "I'll take the Toyota RAV4").
3. Agent asks for confirmation. Confirm: "Yes, book it."
4. Review the confirmation.
**Expected Results:**
- Agent guides through: search → select → confirm → booking created.
- Reservation is created with status CONFIRMED.
- Confirmation shows: reservation ID, vendor, vehicle, dates, rate, total, vendor confirmation number.
- Booking appears in "My Bookings" / reservation list.

### TC-016 — Booking requires explicit confirmation
**Category:** Book
**Priority:** P0
**Preconditions:** Logged in. Search complete, option selected.
**Test Steps:**
1. Select a car option.
2. Verify the agent asks for explicit confirmation before booking.
3. Do NOT confirm — type something ambiguous like "hmm maybe."
**Expected Results:**
- Agent does not create the booking without clear confirmation.
- Agent re-prompts or clarifies.
- No reservation is created until explicit "yes" / "book it" / "confirm."

### TC-017 — Booking API creates reservation
**Category:** Book
**Priority:** P0
**Preconditions:** None (API test).
**Test Steps:**
1. `POST /api/reservations` with valid body (member_id, location, dates, vehicle class, vendor).
2. Verify response.
3. `GET /api/reservations/{id}` to confirm persistence.
**Expected Results:**
- Returns 200/201 with created reservation.
- Reservation has status CONFIRMED, valid ID (CTR-XXXXXXX format), vendor confirmation number.
- GET retrieval returns the same data.

### TC-018 — Booking card display in UI
**Category:** Book
**Priority:** P1
**Preconditions:** Logged in with at least one existing booking.
**Test Steps:**
1. Navigate to "My Bookings" or ask agent: "Show me my reservations."
2. Review the booking card rendering.
**Expected Results:**
- Booking card shows: status badge, vehicle class, vendor, dates, location, total price.
- Card is styled and readable.
- Status is color-coded (CONFIRMED, ACTIVE, RETURNED, CANCELLED).

### TC-019 — Booking with add-ons
**Category:** Book
**Priority:** P1
**Preconditions:** Logged in. Booking in progress.
**Test Steps:**
1. During or after booking, ask: "Add GPS navigation to my booking."
2. Verify add-on is attached.
**Expected Results:**
- Add-on is listed on the reservation.
- Total is updated to include the add-on cost.
- Add-on appears in booking detail.

### TC-020 — Multiple bookings for same member
**Category:** Book
**Priority:** P2
**Preconditions:** Logged in as sarah/admin1234.
**Test Steps:**
1. Create a booking at SEA.
2. Create a second booking at LAX.
3. View all bookings.
**Expected Results:**
- Both bookings appear in the member's reservation list.
- Each has a unique reservation ID and vendor confirmation.
- No data leakage between bookings.

---

## 4. View Reservations

### TC-021 — View existing reservations via agent
**Category:** View
**Priority:** P0
**Preconditions:** Logged in as sarah/admin1234 with existing bookings.
**Test Steps:**
1. Type: "Show me my existing car reservations."
2. Review the response.
**Expected Results:**
- Agent retrieves and displays all reservations for the logged-in member.
- Each reservation shows: ID, status, vehicle, vendor, dates, location, total.
- Only the authenticated member's reservations are shown (no other members' data).

### TC-022 — View reservation detail
**Category:** View
**Priority:** P0
**Preconditions:** Logged in with at least one existing reservation.
**Test Steps:**
1. Ask agent for reservations.
2. Ask about a specific one: "Tell me more about my Seattle booking."
3. Or call: `GET /api/reservations/{id}`
**Expected Results:**
- Full reservation detail is returned including: all dates/times, rate breakdown, vendor confirmation ID, SIPP code, add-ons, status history.
- No fulfillment change occurs (read-only).

### TC-023 — Member-linked filtering
**Category:** View
**Priority:** P1
**Preconditions:** Login as sarah, then login as david in a different session.
**Test Steps:**
1. As sarah: `GET /api/reservations` — note reservation IDs.
2. As david: `GET /api/reservations` — note reservation IDs.
**Expected Results:**
- Sarah sees only her bookings (member_id = MBR-00001).
- David sees only his bookings (member_id = MBR-00002).
- No cross-member data exposure.

### TC-024 — View reservations with multiple statuses
**Category:** View
**Priority:** P1
**Preconditions:** Logged in. Demo data includes CONFIRMED, ACTIVE, RETURNED, CANCELLED bookings.
**Test Steps:**
1. View all reservations.
2. Check that different statuses are present and correctly displayed.
**Expected Results:**
- Reservations with different statuses are shown.
- Status badges are visually distinct.
- Returned and cancelled reservations include relevant metadata (returned_at, cancelled_at).

### TC-025 — Member activity timeline
**Category:** View
**Priority:** P2
**Preconditions:** None (API test).
**Test Steps:**
1. `GET /api/members/MBR-00001/activity`
**Expected Results:**
- Returns chronological activity events (searches, logins, bookings, views).
- Events include timestamps and action types.

---

## 5. Change Reservation (UC2)

### TC-026 — Start a two-phase change
**Category:** Change
**Priority:** P0
**Preconditions:** Logged in as sarah/admin1234 with a CONFIRMED reservation.
**Test Steps:**
1. Type: "I need to change the return date on my booking."
2. Agent identifies the reservation and asks what to change.
3. Specify: "Change the return date to 3 days later."
**Expected Results:**
- Agent initiates the change workflow (start_change phase).
- Original reservation is placed on hold / protected.
- Agent re-shops for new rates with the updated dates.
- Original reservation remains CONFIRMED — not cancelled or modified yet.

### TC-027 — Two-phase change API flow
**Category:** Change
**Priority:** P0
**Preconditions:** Have a CONFIRMED reservation ID.
**Test Steps:**
1. `POST /api/reservations/{id}/change/start` — initiates change.
2. `POST /api/reservations/{id}/change/update` with new dates/details.
3. `POST /api/reservations/{id}/change/confirm` — confirms the replacement.
**Expected Results:**
- Step 1: Returns change session or hold status. Original reservation not modified.
- Step 2: Returns re-shopped options or updated preview.
- Step 3: Reservation is updated with new details. Status remains CONFIRMED.
- Original data is preserved until step 3 completes.

### TC-028 — Critical change rule: original protected
**Category:** Change
**Priority:** P0
**Preconditions:** Logged in with a CONFIRMED reservation.
**Test Steps:**
1. Start a change flow.
2. During the change (before confirming), close the browser or say "never mind."
3. Re-open and check the original reservation.
**Expected Results:**
- The original reservation is still CONFIRMED and unchanged.
- No phantom or orphaned replacement booking exists.
- Per alignment doc: "The replacement must reach a confirmed state before the original reservation is released. If the member exits the flow, the original reservation remains active."

### TC-029 — Change requires explicit confirmation
**Category:** Change
**Priority:** P0
**Preconditions:** Logged in. Change flow in progress with new options displayed.
**Test Steps:**
1. Agent shows replacement options.
2. Do not confirm — say "let me think about it."
**Expected Results:**
- Agent does not apply the change.
- Original reservation remains protected and unchanged.
- Agent acknowledges and waits or offers to continue later.

### TC-030 — Rate re-shopping during change
**Category:** Change
**Priority:** P1
**Preconditions:** Logged in with CONFIRMED reservation.
**Test Steps:**
1. Type: "Can you check whether a shorter rental gives me a better rate?"
2. Review the comparison.
**Expected Results:**
- Agent re-shops with modified parameters.
- Shows before/after rate comparison.
- Savings or cost difference is clearly stated.
- Member can accept or reject.

### TC-031 — Change location on reservation
**Category:** Change
**Priority:** P1
**Preconditions:** Logged in with CONFIRMED reservation at SEA.
**Test Steps:**
1. Type: "Change my pickup to LAX instead."
2. Review the re-shopped options.
3. Confirm the change.
**Expected Results:**
- Agent re-shops at LAX for the same dates.
- New options reflect LAX availability and pricing.
- After confirmation, reservation shows LAX as pickup location.

### TC-032 — Change vehicle class on reservation
**Category:** Change
**Priority:** P1
**Preconditions:** Logged in with CONFIRMED reservation for Economy.
**Test Steps:**
1. Type: "Can I upgrade to a Full-Size SUV?"
2. Agent presents the upgrade option with pricing.
3. Confirm.
**Expected Results:**
- New rate reflects Full-Size SUV pricing.
- Total is recalculated.
- Reservation shows updated vehicle class and SIPP code (FFAR).

### TC-033 — Change on non-changeable reservation
**Category:** Change
**Priority:** P2
**Preconditions:** Have a RETURNED or CANCELLED reservation.
**Test Steps:**
1. Try to change a RETURNED reservation.
**Expected Results:**
- Agent or API rejects the change with a clear message.
- No state modification occurs.

---

## 6. Cancellation (UC3)

### TC-034 — Cancellation policy display
**Category:** Cancel
**Priority:** P0
**Preconditions:** Logged in with a CONFIRMED reservation.
**Test Steps:**
1. Type: "What is the cancellation policy for this reservation?"
2. Review the response.
**Expected Results:**
- Agent explains cancellation terms: fees, deadlines, penalty tiers.
- Information is specific to the reservation (dates, amount).
- No cancellation is initiated — information only.

### TC-035 — Cancel with preview and explicit confirmation
**Category:** Cancel
**Priority:** P0
**Preconditions:** Logged in with a CONFIRMED reservation.
**Test Steps:**
1. Type: "Cancel this reservation."
2. Agent shows cancellation preview (fees, impact).
3. Agent asks for explicit confirmation.
4. Confirm: "Yes, cancel it."
**Expected Results:**
- Step 2: Preview shows any applicable fees and the cancellation outcome.
- Step 3: Agent explicitly asks "Are you sure?" or equivalent.
- Step 4: Reservation status changes to CANCELLED.
- Cancellation confirmation is displayed with any fee details.

### TC-036 — Cancellation API two-step flow
**Category:** Cancel
**Priority:** P0
**Preconditions:** Have a CONFIRMED reservation ID.
**Test Steps:**
1. `POST /api/reservations/{id}/cancel/preview` — preview penalty.
2. `POST /api/reservations/{id}/cancel/confirm` — execute cancellation.
**Expected Results:**
- Step 1: Returns penalty preview (fee amount, tier, refund estimate). No state change.
- Step 2: Reservation status updated to CANCELLED. Returns confirmation with fee outcome.

### TC-037 — Cancel without confirming
**Category:** Cancel
**Priority:** P1
**Preconditions:** Logged in with CONFIRMED reservation.
**Test Steps:**
1. Type: "Cancel my booking."
2. Agent shows preview and asks for confirmation.
3. Type: "No, keep it."
**Expected Results:**
- Reservation remains CONFIRMED.
- No cancellation is processed.
- Agent acknowledges and keeps the booking active.

### TC-038 — Tiered cancellation penalties
**Category:** Cancel
**Priority:** P1
**Preconditions:** Reservations with different pickup dates (far future vs. tomorrow).
**Test Steps:**
1. Preview cancellation for a reservation 2 weeks away.
2. Preview cancellation for a reservation 1 day away.
**Expected Results:**
- Far-future cancellation has lower or zero penalty.
- Near-term cancellation has higher penalty.
- Penalty tier is clearly explained.

### TC-039 — Cancel already cancelled reservation
**Category:** Cancel
**Priority:** P1
**Preconditions:** Have a CANCELLED reservation.
**Test Steps:**
1. Attempt to cancel it again via agent or API.
**Expected Results:**
- Agent or API returns a clear message that the reservation is already cancelled.
- No duplicate cancellation processing.

### TC-040 — Cancel an ACTIVE (checked-in) reservation
**Category:** Cancel
**Priority:** P2
**Preconditions:** Have an ACTIVE reservation (vehicle picked up).
**Test Steps:**
1. Attempt to cancel an ACTIVE reservation.
**Expected Results:**
- Agent explains that an active rental cannot be cancelled (it must be returned).
- Suggests the return flow instead.

---

## 7. Pre-check & Guardrails

### TC-041 — Identity: agent does not ask for credentials
**Category:** Guardrails
**Priority:** P0
**Preconditions:** Logged in as sarah/admin1234.
**Test Steps:**
1. Start a conversation. The agent should know the member identity.
2. Verify the agent does not ask for: login, password, credit card, membership number.
**Expected Results:**
- Agent greets the member by name or uses their context.
- Agent never asks for credentials or card numbers.
- Per alignment doc: "Core demo starts after Costco authentication. Member identity, membership number and tier are passed into the session."

### TC-042 — Search input validation
**Category:** Guardrails
**Priority:** P0
**Preconditions:** Logged in.
**Test Steps:**
1. Type: "Find me a car" (no location, no dates).
2. Review agent response.
**Expected Results:**
- Agent asks for missing required inputs: location, dates, times.
- Agent does not return results with incomplete search parameters.
- Per alignment doc: "Pickup and drop-off location, date and time, rental duration and vehicle preference must be available before options are returned."

### TC-043 — Explicit consent for booking
**Category:** Guardrails
**Priority:** P0
**Preconditions:** Logged in. Search completed, option selected.
**Test Steps:**
1. Select an option.
2. Verify agent asks for final confirmation before booking.
**Expected Results:**
- Agent presents a summary and requires explicit "yes" / "confirm" / "book it."
- Per alignment doc: "A booking change or cancellation requires a clear final confirmation from the member."

### TC-044 — Human review escalation
**Category:** Guardrails
**Priority:** P1
**Preconditions:** Logged in. Trigger a high-risk condition.
**Test Steps:**
1. Attempt an action that triggers the human review guardrail (e.g., high-value transaction, policy conflict).
2. Observe the agent behavior.
**Expected Results:**
- Agent stops autonomous processing.
- UI renders an escalation state or human review message.
- Per alignment doc: "High-risk conditions must stop autonomous processing and route for review."
- No live reservation change occurs until review is complete.

### TC-045 — Demo data boundary
**Category:** Guardrails
**Priority:** P1
**Preconditions:** None.
**Test Steps:**
1. Verify all data is synthetic by reviewing reservation IDs, member names, and vendor responses.
**Expected Results:**
- All transactions operate on synthetic data.
- No live Costco, Sabre, or vendor API calls.
- Per alignment doc: "No live Costco, Sabre or rental vendor integration is assumed for the demo."

### TC-046 — Change safety: original not released prematurely
**Category:** Guardrails
**Priority:** P1
**Preconditions:** Logged in with a CONFIRMED reservation.
**Test Steps:**
1. Start a change flow.
2. At each step, verify the original reservation status via `GET /api/reservations/{id}`.
**Expected Results:**
- Original reservation status remains CONFIRMED throughout the change process.
- Only after the replacement is fully confirmed does the original change.
- Per alignment doc: "The original reservation remains protected while alternatives are checked."

### TC-047 — Member pricing guard
**Category:** Guardrails
**Priority:** P2
**Preconditions:** Logged in as any member.
**Test Steps:**
1. Search for cars. Verify all displayed rates are member rates.
2. Confirm savings are shown relative to retail.
**Expected Results:**
- Displayed rates reflect pre-negotiated Costco member pricing.
- Savings are visible where relevant.

### TC-048 — Agent does not hallucinate reservation data
**Category:** Guardrails
**Priority:** P2
**Preconditions:** Logged in as a member with no bookings (or known booking set).
**Test Steps:**
1. Ask: "Show me my reservations."
2. Verify results match Firestore data exactly.
**Expected Results:**
- Agent returns only real reservations from the database.
- No fabricated reservation IDs, dates, or amounts.

---

## 8. Vendor Portal Sync

### TC-049 — Booking syncs to vendor dashboard
**Category:** Vendor Portal
**Priority:** P0
**Preconditions:** Logged in. Create a new booking with Alamo.
**Test Steps:**
1. Book a car with Alamo as the vendor.
2. Navigate to `/vendor-alamo.html`.
3. Check for the new booking.
**Expected Results:**
- Booking appears in the Alamo vendor dashboard.
- Vendor booking shows: Costco reservation ID, member name, vehicle, dates, rate, status CONFIRMED.
- Event timeline shows "BOOKING_RECEIVED" event.

### TC-050 — Vendor dashboard stats update
**Category:** Vendor Portal
**Priority:** P0
**Preconditions:** Vendor dashboard loaded.
**Test Steps:**
1. Navigate to `/vendor-portal.html`.
2. Check summary tiles.
3. Navigate to each vendor dashboard.
**Expected Results:**
- Portal hub shows: total bookings, active rentals, total revenue, open disputes.
- Each vendor card shows correct booking count, revenue, and status breakdown.
- Stats are consistent across hub and individual dashboards.

### TC-051 — Cancellation syncs to vendor
**Category:** Vendor Portal
**Priority:** P1
**Preconditions:** Have a vendor-synced booking.
**Test Steps:**
1. Cancel a reservation via the AI agent.
2. Check the vendor dashboard for that vendor.
**Expected Results:**
- Vendor booking status updates to CANCELLED.
- Event timeline shows "STATUS_CANCELLED" event.
- Dashboard stats (active count) decrease accordingly.

### TC-052 — Check-in syncs to vendor
**Category:** Vendor Portal
**Priority:** P1
**Preconditions:** Have a CONFIRMED reservation.
**Test Steps:**
1. Check in via `POST /api/reservations/{id}/checkin`.
2. Check the vendor dashboard.
**Expected Results:**
- Vendor booking status updates to ACTIVE.
- Event timeline shows "STATUS_ACTIVE" event.

### TC-053 — Return syncs to vendor
**Category:** Vendor Portal
**Priority:** P1
**Preconditions:** Have an ACTIVE reservation.
**Test Steps:**
1. Return vehicle via `POST /api/reservations/{id}/return`.
2. Check the vendor dashboard.
**Expected Results:**
- Vendor booking status updates to RETURNED.
- Event timeline shows "STATUS_RETURNED" event.
- Mileage, fuel level, and damage notes appear.

### TC-054 — Vendor dashboard auto-refresh
**Category:** Vendor Portal
**Priority:** P2
**Preconditions:** Vendor dashboard open in browser.
**Test Steps:**
1. Open `/vendor-avis.html`.
2. In another tab, create or modify a booking with Avis.
3. Wait 15 seconds on the vendor dashboard.
**Expected Results:**
- Dashboard auto-refreshes and shows the updated booking without manual reload.

---

## 9. Knowledge Graph

### TC-055 — Knowledge graph renders
**Category:** Knowledge Graph
**Priority:** P0
**Preconditions:** None.
**Test Steps:**
1. Navigate to `/knowledge-graph.html`.
2. Wait for the graph to load and stabilize.
**Expected Results:**
- Graph renders with nodes and edges.
- 5 node types visible: members (blue circles), vendors (green diamonds), locations (gold triangles), vehicle classes (purple squares), reservations (red dots).
- Edges connect related entities (BOOKED, RENTED_FROM, AT_LOCATION, VEHICLE_TYPE, SERVES).

### TC-056 — Knowledge graph node click
**Category:** Knowledge Graph
**Priority:** P1
**Preconditions:** Graph loaded at `/knowledge-graph.html`.
**Test Steps:**
1. Click on a member node.
2. Click on a vendor node.
3. Click on a reservation node.
**Expected Results:**
- Right detail panel opens showing node properties.
- Related nodes are listed and clickable.
- Properties match Firestore data.

### TC-057 — Knowledge graph search
**Category:** Knowledge Graph
**Priority:** P1
**Preconditions:** Graph loaded.
**Test Steps:**
1. Type "Sarah" in the search box.
2. Type "Alamo" in the search box.
**Expected Results:**
- Matching nodes are highlighted or focused.
- Graph navigates to the searched node.

### TC-058 — Knowledge graph filter by entity type
**Category:** Knowledge Graph
**Priority:** P2
**Preconditions:** Graph loaded.
**Test Steps:**
1. Click on "Vendors" in the entity type legend to filter.
2. Click on "Members" to filter.
**Expected Results:**
- Graph filters to show only the selected entity type and its connections.
- Other node types are hidden or dimmed.

### TC-059 — Knowledge graph API
**Category:** Knowledge Graph
**Priority:** P2
**Preconditions:** None (API test).
**Test Steps:**
1. `GET /api/knowledge-graph`
**Expected Results:**
- Returns JSON with `nodes` and `edges` arrays.
- Nodes have: id, label, group (member/vendor/location/vehicle_class/reservation), properties.
- Edges have: from, to, label (BOOKED, RENTED_FROM, etc.).

---

## 10. Lifecycle — UC4 through UC8

### TC-060 — UC4: Vehicle check-in / pickup
**Category:** Check-in
**Priority:** P0
**Preconditions:** Have a CONFIRMED reservation.
**Test Steps:**
1. `POST /api/reservations/{id}/checkin`
2. Verify response and reservation status.
**Expected Results:**
- Status changes to ACTIVE.
- `checked_in_at` timestamp is set.
- Vendor booking syncs to ACTIVE.

### TC-061 — UC5: Extend rental
**Category:** In-Rental Support
**Priority:** P1
**Preconditions:** Have an ACTIVE reservation.
**Test Steps:**
1. `POST /api/reservations/{id}/extend` with additional days.
2. Verify response.
**Expected Results:**
- Drop-off date is extended.
- Total is recalculated with additional days.
- Reservation remains ACTIVE.

### TC-062 — UC5: In-rental support via agent
**Category:** In-Rental Support
**Priority:** P1
**Preconditions:** Logged in with an ACTIVE reservation.
**Test Steps:**
1. Type: "I need to extend my rental by 2 more days."
2. Review agent response.
**Expected Results:**
- Agent identifies the active rental.
- Shows the cost for 2 additional days.
- After confirmation, reservation is extended.

### TC-063 — UC6: Add add-on to reservation
**Category:** Add-ons
**Priority:** P0
**Preconditions:** Have a CONFIRMED or ACTIVE reservation.
**Test Steps:**
1. `POST /api/reservations/{id}/addons` with add-on type (GPS, insurance, child seat).
2. Verify response.
**Expected Results:**
- Add-on is added to the reservation's addons array.
- Total is updated to include add-on cost.

### TC-064 — UC6: Add-ons catalog
**Category:** Add-ons
**Priority:** P1
**Preconditions:** None (API test).
**Test Steps:**
1. `GET /api/addons`
**Expected Results:**
- Returns available add-ons with names, descriptions, and prices.
- Includes: GPS, insurance, child seat, and other options.

### TC-065 — UC7: Vehicle return
**Category:** Return
**Priority:** P0
**Preconditions:** Have an ACTIVE reservation.
**Test Steps:**
1. `POST /api/reservations/{id}/return` with fuel level, mileage.
2. Verify response.
**Expected Results:**
- Status changes to RETURNED.
- `returned_at` timestamp is set.
- Final invoice is generated with: member rate total, add-on total, grand total, fuel level, mileage, damage notes.
- Vendor booking syncs to RETURNED.

### TC-066 — UC7: Return via agent
**Category:** Return
**Priority:** P1
**Preconditions:** Logged in with ACTIVE reservation.
**Test Steps:**
1. Type: "I'm returning the car. Tank is full, 450 miles driven."
2. Review the final invoice.
**Expected Results:**
- Agent processes the return.
- Final invoice shows all charges and the grand total.
- Reservation moves to RETURNED.

### TC-067 — UC8: Open billing dispute
**Category:** Dispute
**Priority:** P0
**Preconditions:** Have a RETURNED reservation.
**Test Steps:**
1. `POST /api/reservations/{id}/dispute` with dispute reason.
2. Verify response.
**Expected Results:**
- Dispute is created and attached to the reservation.
- Vendor booking syncs with dispute information.
- Dispute includes: reason, timestamp, status.

### TC-068 — UC8: Dispute via agent
**Category:** Dispute
**Priority:** P2
**Preconditions:** Logged in with a RETURNED reservation.
**Test Steps:**
1. Type: "I was charged for fuel but I returned the tank full."
2. Review agent response.
**Expected Results:**
- Agent opens a dispute on the reservation.
- Dispute reason is recorded.
- Agent confirms the dispute has been filed.

### TC-069 — Full lifecycle: book → checkin → extend → addon → return → dispute
**Category:** Full Lifecycle
**Priority:** P2
**Preconditions:** Logged in as sarah/admin1234.
**Test Steps:**
1. Book a car at SEA (UC1).
2. Check in (UC4).
3. Extend by 1 day (UC5).
4. Add GPS (UC6).
5. Return the vehicle (UC7).
6. File a billing dispute (UC8).
7. Review the reservation after each step.
**Expected Results:**
- Status transitions: CONFIRMED → ACTIVE → ACTIVE → ACTIVE → RETURNED → RETURNED (with dispute).
- Each step builds on the previous correctly.
- Final reservation shows full history: original booking, extension, add-on, return details, and dispute.
- Vendor dashboard reflects all state changes.

---

## 11. AI Agent Chat

### TC-070 — Agent responds to greeting
**Category:** Agent Chat
**Priority:** P0
**Preconditions:** Logged in as any member.
**Test Steps:**
1. Type: "Hello" or "Hi, I need help with a rental car."
**Expected Results:**
- Agent responds conversationally and helpfully.
- Agent identifies itself as the Costco Travel rental car assistant (or similar).
- Agent offers to help with search, view, change, or cancel.

### TC-071 — Agent handles multi-turn conversation
**Category:** Agent Chat
**Priority:** P0
**Preconditions:** Logged in.
**Test Steps:**
1. "Find me a car at SEA for next week."
2. (Agent responds with options.) "How about LAX instead?"
3. (Agent responds.) "Actually, make it 5 days instead of 3."
**Expected Results:**
- Agent maintains context across turns.
- Each follow-up modifies the search correctly without re-asking for all parameters.
- Agent demonstrates conversational memory.

### TC-072 — Agent handles intent recognition
**Category:** Agent Chat
**Priority:** P1
**Preconditions:** Logged in.
**Test Steps:**
1. Type various intents:
   - "book a car" → search/booking flow
   - "my bookings" → view reservations
   - "change my reservation" → change flow
   - "cancel" → cancellation flow
   - "what's the policy?" → informational response
**Expected Results:**
- Agent correctly identifies each intent and routes to the appropriate flow.
- No confusion between intents.

### TC-073 — Agent handles policy questions
**Category:** Agent Chat
**Priority:** P1
**Preconditions:** Logged in.
**Test Steps:**
1. Type: "What is the cancellation policy?"
2. Type: "What happens if I return the car late?"
**Expected Results:**
- Agent provides accurate policy information.
- Per alignment doc capability "Inform": answers policy questions related to the reservation flow.
- No reservation changes occur — information only.

### TC-074 — Agent error handling for invalid input
**Category:** Agent Chat
**Priority:** P1
**Preconditions:** Logged in.
**Test Steps:**
1. Type gibberish: "asdfghjkl."
2. Type an unrelated question: "What's the weather today?"
**Expected Results:**
- Agent handles gracefully — asks for clarification or redirects to rental car topics.
- No crash or unhandled error.

### TC-075 — Agent API endpoint
**Category:** Agent Chat
**Priority:** P2
**Preconditions:** None (API test).
**Test Steps:**
1. `POST /api/agent/chat` with message body.
**Expected Results:**
- Returns a JSON response with agent reply.
- Response includes structured actions if applicable (search results, booking confirmation).

### TC-076 — Agent session continuity
**Category:** Agent Chat
**Priority:** P2
**Preconditions:** Logged in.
**Test Steps:**
1. Have a multi-turn conversation.
2. Refresh the page.
3. Resume the conversation.
**Expected Results:**
- Chat history is preserved or the agent can pick up context.
- Member identity is maintained after refresh.

---

## 12. Negative & Edge Cases

### TC-077 — Invalid reservation ID
**Category:** Edge Case
**Priority:** P0
**Preconditions:** None (API test).
**Test Steps:**
1. `GET /api/reservations/INVALID-ID-12345`
2. `POST /api/reservations/INVALID-ID-12345/checkin`
**Expected Results:**
- Returns 404 or appropriate error with clear message.
- No crash or 500 error.

### TC-078 — Invalid state transitions
**Category:** Edge Case
**Priority:** P0
**Preconditions:** Various reservation statuses.
**Test Steps:**
1. Try to check in a RETURNED reservation.
2. Try to return a CONFIRMED reservation (not checked in).
3. Try to cancel a RETURNED reservation.
**Expected Results:**
- Each returns a clear error message indicating the invalid state transition.
- Reservation state is not corrupted.

### TC-079 — Missing required fields on booking
**Category:** Edge Case
**Priority:** P1
**Preconditions:** None (API test).
**Test Steps:**
1. `POST /api/reservations` with missing location.
2. `POST /api/reservations` with missing dates.
3. `POST /api/reservations` with missing member_id.
**Expected Results:**
- Returns 400 or 422 with descriptive validation errors.
- No partial reservation is created.

### TC-080 — Concurrent modification
**Category:** Edge Case
**Priority:** P1
**Preconditions:** Have a CONFIRMED reservation.
**Test Steps:**
1. In two browser tabs, simultaneously start a change on the same reservation.
2. Confirm in one tab, then try to confirm in the other.
**Expected Results:**
- First change succeeds.
- Second change fails gracefully with a conflict message or stale-state detection.
- Reservation is not corrupted.

### TC-081 — Health check endpoint
**Category:** Edge Case
**Priority:** P1
**Preconditions:** None.
**Test Steps:**
1. `GET /api/health`
**Expected Results:**
- Returns 200 with health status.
- Confirms the service is running and connected to Firestore.

### TC-082 — Large payload handling
**Category:** Edge Case
**Priority:** P2
**Preconditions:** None (API test).
**Test Steps:**
1. Send a chat message with 10,000+ characters to `/api/agent/chat`.
**Expected Results:**
- Agent handles gracefully — truncates or returns an error.
- No server crash or timeout.

### TC-083 — Special characters in search
**Category:** Edge Case
**Priority:** P2
**Preconditions:** Logged in.
**Test Steps:**
1. Type: "Find me a car at <script>alert('xss')</script>"
2. Type: "Book at SEA'; DROP TABLE reservations;--"
**Expected Results:**
- Input is sanitized — no XSS execution, no SQL/NoSQL injection.
- Agent responds with a clarification request or handles safely.
- No security vulnerability exposed.

---

## Execution Notes

**Test Environment:**
- Demo URL: https://costco-travel-demo-gygcwrc62a-uc.a.run.app
- API base: same URL + `/api/`
- Browser: Chrome latest recommended
- Authentication: IAP-protected, login with authorized Google account

**Data Reset:**
- Demo data is seeded on service startup (`SEED_DEMO=true`).
- To re-seed vendor bookings: `python3 -m scripts.seed_vendor_bookings`
- To re-seed member activity: `python3 -m scripts.seed_member_activity`

**Test Data:**
- 8 demo members (sarah through kevin)
- 20 seeded vendor bookings across 4 vendors
- 6 airport locations: SEA, LAX, MCO, LAS, DEN, JFK
- 10 vehicle classes with SIPP codes
- 4 vendors: Alamo (VND-ALM), Avis (VND-AVS), Budget (VND-BDG), Enterprise (VND-ENT)

**Alignment Document Traceability:**
- TC-001 to TC-009 → Section 2 "Discover" + Section 3 demo scenarios
- TC-010 to TC-014 → Section 2 "Compare" + Section 3 demo scenarios
- TC-015 to TC-020 → Section 2 "Book" + Section 5A "New search and booking"
- TC-021 to TC-025 → Section 2 "View" + Section 7 "View reservation"
- TC-026 to TC-033 → Section 2 "Change" + Section 5B "Change an existing reservation"
- TC-034 to TC-040 → Section 2 "Cancel" + Section 5C "Cancellation"
- TC-041 to TC-048 → Section 4 "Pre-check conditions and guardrails"
- TC-049 to TC-054 → Vendor Portal (platform feature, implicit in Section 7)
- TC-055 to TC-059 → Knowledge Graph (platform feature)
- TC-060 to TC-069 → UC4–UC8 lifecycle
- TC-070 to TC-076 → Section 3 "Potential user prompts" + Section 2 "Inform"
- TC-077 to TC-083 → Robustness and security edge cases
