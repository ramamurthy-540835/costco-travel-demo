"""Seed member_activity collection with a realistic full-journey timeline for all 8 demo members.

Event types:
  login           — member authenticated via Costco SSO
  search          — car search (location, dates, party size, budget)
  view_listing    — member viewed a vehicle card from search results
  view_reservation — member opened a reservation in manage view
  booking_started — member opened the date/booking modal
  booking_confirmed — reservation confirmed
  booking_changed — reservation modified
  booking_cancelled — reservation cancelled
  addon_added     — add-on attached to reservation
  dispute_opened  — billing dispute filed
  chat_session    — AI concierge conversation
"""
import os, sys, json
from datetime import datetime, timedelta, timezone

os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "ctoteam")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google.cloud import firestore

DB = firestore.Client(project="ctoteam", database="costco-demo")
NOW = datetime.now(timezone.utc)


def ts(days_ago: float = 0, hours_ago: float = 0) -> str:
    return (NOW - timedelta(days=days_ago, hours=hours_ago)).isoformat()


def activity(member_id, event_type, payload, *, session_id, source="web", reservation_id=None, days_ago=0.0, hours_ago=0.0):
    return {
        "member_id": member_id,
        "event_type": event_type,
        "timestamp": ts(days_ago=days_ago, hours_ago=hours_ago),
        "session_id": session_id,
        "source": source,
        "reservation_id": reservation_id,
        "payload": payload,
    }


# ── Build activity for each member ────────────────────────────────────────────

ACTIVITIES: list[dict] = []

# ── MBR-00001 Sarah Johnson · Executive · MCO + LAS power user ───────────────
# She has 5 reservations (incl. 1 cancelled, 1 active). Very engaged. Uses AI chat.
ACTIVITIES += [
    activity("MBR-00001","login",{"method":"sso","device":"desktop"},session_id="sess-001-a",days_ago=14),
    activity("MBR-00001","search",{"location":"MCO","pickup":"2026-09-09","return":"2026-09-10","party_size":2,"car_class_hint":"Intermediate"},session_id="sess-001-a",days_ago=14,hours_ago=-1),
    activity("MBR-00001","view_listing",{"car_class":"Intermediate","vendor":"Enterprise","rate_per_day":47.0},session_id="sess-001-a",days_ago=14,hours_ago=-2),
    activity("MBR-00001","view_listing",{"car_class":"Full-Size","vendor":"Avis","rate_per_day":54.0},session_id="sess-001-a",days_ago=14,hours_ago=-2.2),
    activity("MBR-00001","booking_started",{"car_class":"Intermediate","location":"MCO"},session_id="sess-001-a",reservation_id="CTR-D21OUT1",days_ago=14,hours_ago=-3),
    activity("MBR-00001","booking_confirmed",{"reservation_id":"CTR-D21OUT1","car_class":"Intermediate","total":47.0},session_id="sess-001-a",reservation_id="CTR-D21OUT1",days_ago=14,hours_ago=-3.5),

    activity("MBR-00001","login",{"method":"sso","device":"mobile"},session_id="sess-001-b",days_ago=12),
    activity("MBR-00001","search",{"location":"LAS","pickup":"2026-09-08","return":"2026-09-09","party_size":2},session_id="sess-001-b",days_ago=12,hours_ago=-0.5),
    activity("MBR-00001","view_listing",{"car_class":"Full-Size","vendor":"Avis","rate_per_day":54.0},session_id="sess-001-b",days_ago=12,hours_ago=-1),
    activity("MBR-00001","booking_confirmed",{"reservation_id":"CTR-D30HRS1","car_class":"Full-Size","total":54.0},session_id="sess-001-b",reservation_id="CTR-D30HRS1",days_ago=12,hours_ago=-1.5),

    activity("MBR-00001","login",{"method":"sso","device":"desktop"},session_id="sess-001-c",days_ago=10),
    activity("MBR-00001","chat_session",{"message":"Can I upgrade CTR-D21OUT1 to a Full-Size?","action":"show_change_flow"},session_id="sess-001-c",reservation_id="CTR-D21OUT1",days_ago=10,hours_ago=-0.5),
    activity("MBR-00001","view_reservation",{"reservation_id":"CTR-D21OUT1"},session_id="sess-001-c",reservation_id="CTR-D21OUT1",days_ago=10,hours_ago=-0.7),
    activity("MBR-00001","search",{"location":"MCO","pickup":"2026-09-14","return":"2026-09-17","party_size":2},session_id="sess-001-c",days_ago=10,hours_ago=-1),
    activity("MBR-00001","booking_confirmed",{"reservation_id":"CTR-O2L1OVR","car_class":"Intermediate","total":141.0},session_id="sess-001-c",reservation_id="CTR-O2L1OVR",days_ago=10,hours_ago=-2),

    activity("MBR-00001","login",{"method":"sso","device":"desktop"},session_id="sess-001-d",days_ago=7),
    activity("MBR-00001","chat_session",{"message":"What is the cancellation policy for CTR-A90V34Y?","action":"cancel_preview"},session_id="sess-001-d",reservation_id="CTR-A90V34Y",days_ago=7,hours_ago=-0.3),
    activity("MBR-00001","view_reservation",{"reservation_id":"CTR-A90V34Y"},session_id="sess-001-d",reservation_id="CTR-A90V34Y",days_ago=7,hours_ago=-0.5),
    activity("MBR-00001","booking_cancelled",{"reservation_id":"CTR-A90V34Y","reason":"trip_changed","refund":0.0,"tier":"free"},session_id="sess-001-d",reservation_id="CTR-A90V34Y",days_ago=7,hours_ago=-1),
    activity("MBR-00001","search",{"location":"MCO","pickup":"2026-09-10","return":"2026-09-12","car_class_hint":"Minivan","party_size":6},session_id="sess-001-d",days_ago=7,hours_ago=-1.5),
    activity("MBR-00001","booking_confirmed",{"reservation_id":"CTR-RSKV2GE","car_class":"Minivan","total":138.0},session_id="sess-001-d",reservation_id="CTR-RSKV2GE",days_ago=7,hours_ago=-2),

    activity("MBR-00001","login",{"method":"sso","device":"mobile"},session_id="sess-001-e",days_ago=1),
    activity("MBR-00001","chat_session",{"message":"I need a car at LAX tomorrow morning","action":"show_date_picker"},session_id="sess-001-e",days_ago=1,hours_ago=-0.5),
    activity("MBR-00001","search",{"location":"LAX","pickup":"2026-09-07","return":"2026-09-09","party_size":2},session_id="sess-001-e",days_ago=1,hours_ago=-1),
    activity("MBR-00001","booking_confirmed",{"reservation_id":"CTR-DACTIV1","car_class":"Standard SUV","total":126.0},session_id="sess-001-e",reservation_id="CTR-DACTIV1",days_ago=1,hours_ago=-2),
    activity("MBR-00001","view_reservation",{"reservation_id":"CTR-DACTIV1"},session_id="sess-001-e",reservation_id="CTR-DACTIV1",hours_ago=2),
]

# ── MBR-00002 David Martinez · Gold Star · MCO family trips + car seat ───────
ACTIVITIES += [
    activity("MBR-00002","login",{"method":"sso","device":"desktop"},session_id="sess-002-a",days_ago=20),
    activity("MBR-00002","search",{"location":"MCO","pickup":"2026-09-14","return":"2026-09-16","party_size":5,"extras_requested":["car_seat"]},session_id="sess-002-a",days_ago=20,hours_ago=-1),
    activity("MBR-00002","view_listing",{"car_class":"Minivan","vendor":"Alamo","rate_per_day":69.0,"note":"seats 7 — fits family"},session_id="sess-002-a",days_ago=20,hours_ago=-1.5),
    activity("MBR-00002","view_listing",{"car_class":"Full-Size SUV","vendor":"National","rate_per_day":86.0},session_id="sess-002-a",days_ago=20,hours_ago=-1.7),
    activity("MBR-00002","booking_started",{"car_class":"Minivan","location":"MCO"},session_id="sess-002-a",days_ago=20,hours_ago=-2),
    activity("MBR-00002","booking_confirmed",{"reservation_id":"CTR-E5IRFY0","car_class":"Minivan","total":276.0,"extras":["car_seat"]},session_id="sess-002-a",reservation_id="CTR-E5IRFY0",days_ago=20,hours_ago=-2.5),

    activity("MBR-00002","login",{"method":"sso","device":"mobile"},session_id="sess-002-b",days_ago=3),
    activity("MBR-00002","view_reservation",{"reservation_id":"CTR-E5IRFY0","note":"checked pickup details"},session_id="sess-002-b",reservation_id="CTR-E5IRFY0",days_ago=3,hours_ago=-0.3),
    activity("MBR-00002","chat_session",{"message":"Is the child seat already included or do I need to add it?","action":None,"note":"asked about car_seat perk"},session_id="sess-002-b",reservation_id="CTR-E5IRFY0",days_ago=3,hours_ago=-0.5),
    activity("MBR-00002","search",{"location":"MCO","pickup":"2026-09-14","return":"2026-09-18","party_size":5,"note":"same trip but extended"},session_id="sess-002-b",days_ago=3,hours_ago=-1),
    activity("MBR-00002","booking_confirmed",{"reservation_id":"CTR-XFV8B8Y","car_class":"Minivan","total":276.0},session_id="sess-002-b",reservation_id="CTR-XFV8B8Y",days_ago=3,hours_ago=-2),
]

# ── MBR-00003 Emily Chen · Executive · SEA/LAX road tripper, GPS add-on ──────
ACTIVITIES += [
    activity("MBR-00003","login",{"method":"sso","device":"desktop"},session_id="sess-003-a",days_ago=18),
    activity("MBR-00003","search",{"location":"SEA","pickup":"2026-09-02","return":"2026-09-05","party_size":2,"extras_requested":["gps"]},session_id="sess-003-a",days_ago=18,hours_ago=-1),
    activity("MBR-00003","view_listing",{"car_class":"Full-Size SUV","vendor":"National","rate_per_day":86.0},session_id="sess-003-a",days_ago=18,hours_ago=-1.2),
    activity("MBR-00003","view_listing",{"car_class":"Standard SUV","vendor":"Avis","rate_per_day":63.0},session_id="sess-003-a",days_ago=18,hours_ago=-1.5),
    activity("MBR-00003","chat_session",{"message":"Compare Full-Size SUV vs Standard SUV for a road trip","action":"search_cars"},session_id="sess-003-a",days_ago=18,hours_ago=-2),
    activity("MBR-00003","booking_confirmed",{"reservation_id":"CTR-8ZVVFR8","car_class":"Minivan","total":207.0,"extras":["gps"]},session_id="sess-003-a",reservation_id="CTR-8ZVVFR8",days_ago=18,hours_ago=-2.5),

    activity("MBR-00003","login",{"method":"sso","device":"desktop"},session_id="sess-003-b",days_ago=9),
    activity("MBR-00003","search",{"location":"MCO","pickup":"2026-09-10","return":"2026-09-12","party_size":2},session_id="sess-003-b",days_ago=9,hours_ago=-0.5),
    activity("MBR-00003","view_listing",{"car_class":"Intermediate","vendor":"Enterprise","rate_per_day":47.0},session_id="sess-003-b",days_ago=9,hours_ago=-1),
    activity("MBR-00003","booking_confirmed",{"reservation_id":"CTR-EC08TL0","car_class":"Intermediate","total":94.0},session_id="sess-003-b",reservation_id="CTR-EC08TL0",days_ago=9,hours_ago=-1.5),
    activity("MBR-00003","addon_added",{"reservation_id":"CTR-EC08TL0","addon_type":"gps","charge":23.98,"included":False},session_id="sess-003-b",reservation_id="CTR-EC08TL0",days_ago=9,hours_ago=-2),
    activity("MBR-00003","view_reservation",{"reservation_id":"CTR-EC08TL0"},session_id="sess-003-b",reservation_id="CTR-EC08TL0",days_ago=2),
]

# ── MBR-00004 Robert Patel · Executive · LAS + DEN business travel ────────────
# High savings ($5480), books quickly — business pattern
ACTIVITIES += [
    activity("MBR-00004","login",{"method":"sso","device":"desktop"},session_id="sess-004-a",days_ago=30),
    activity("MBR-00004","search",{"location":"LAS","pickup":"2026-09-08","return":"2026-09-09","party_size":1},session_id="sess-004-a",days_ago=30,hours_ago=-0.3),
    activity("MBR-00004","view_listing",{"car_class":"Full-Size","vendor":"Avis","rate_per_day":54.0},session_id="sess-004-a",days_ago=30,hours_ago=-0.5),
    activity("MBR-00004","booking_confirmed",{"reservation_id":"CTR-7IMBGV9","car_class":"Full-Size","total":54.0},session_id="sess-004-a",reservation_id="CTR-7IMBGV9",days_ago=30,hours_ago=-0.8),

    activity("MBR-00004","login",{"method":"sso","device":"mobile"},session_id="sess-004-b",days_ago=25),
    activity("MBR-00004","search",{"location":"MCO","pickup":"2026-09-01","return":"2026-09-04","party_size":2},session_id="sess-004-b",days_ago=25,hours_ago=-0.3),
    activity("MBR-00004","view_listing",{"car_class":"Full-Size SUV","vendor":"National","rate_per_day":86.0},session_id="sess-004-b",days_ago=25,hours_ago=-0.5),
    activity("MBR-00004","booking_confirmed",{"reservation_id":"CTR-G48V3KO","car_class":"Full-Size SUV","total":344.0},session_id="sess-004-b",reservation_id="CTR-G48V3KO",days_ago=25,hours_ago=-0.8),

    activity("MBR-00004","login",{"method":"sso","device":"desktop"},session_id="sess-004-c",days_ago=5),
    activity("MBR-00004","chat_session",{"message":"Show me my upcoming reservations","action":"list_reservations"},session_id="sess-004-c",days_ago=5,hours_ago=-0.2),
    activity("MBR-00004","view_reservation",{"reservation_id":"CTR-7IMBGV9"},session_id="sess-004-c",reservation_id="CTR-7IMBGV9",days_ago=5,hours_ago=-0.4),
    activity("MBR-00004","search",{"location":"DEN","pickup":"2026-09-20","return":"2026-09-22","party_size":1,"note":"looking ahead"},session_id="sess-004-c",days_ago=5,hours_ago=-1),
]

# ── MBR-00005 Lisa Thompson · Gold Star · Economy, SEA, budget-focused ────────
ACTIVITIES += [
    activity("MBR-00005","login",{"method":"sso","device":"mobile"},session_id="sess-005-a",days_ago=22),
    activity("MBR-00005","search",{"location":"SEA","pickup":"2026-09-01","return":"2026-09-02","party_size":2,"budget_per_day":45},session_id="sess-005-a",days_ago=22,hours_ago=-0.5),
    activity("MBR-00005","view_listing",{"car_class":"Economy","vendor":"Budget","rate_per_day":36.0},session_id="sess-005-a",days_ago=22,hours_ago=-0.8),
    activity("MBR-00005","view_listing",{"car_class":"Compact","vendor":"Alamo","rate_per_day":41.0},session_id="sess-005-a",days_ago=22,hours_ago=-1),
    activity("MBR-00005","chat_session",{"message":"What is the cheapest car in Seattle?","action":"search_cars"},session_id="sess-005-a",days_ago=22,hours_ago=-1.2),

    activity("MBR-00005","login",{"method":"sso","device":"desktop"},session_id="sess-005-b",days_ago=18),
    activity("MBR-00005","search",{"location":"MCO","pickup":"2026-09-01","return":"2026-09-05","party_size":5,"note":"changed destination"},session_id="sess-005-b",days_ago=18,hours_ago=-0.5),
    activity("MBR-00005","view_listing",{"car_class":"Minivan","vendor":"Alamo","rate_per_day":69.0},session_id="sess-005-b",days_ago=18,hours_ago=-1),
    activity("MBR-00005","booking_confirmed",{"reservation_id":"CTR-4UHGRBX","car_class":"Minivan","total":276.0,"note":"booked Minivan despite Economy preference — family trip"},session_id="sess-005-b",reservation_id="CTR-4UHGRBX",days_ago=18,hours_ago=-1.5),

    activity("MBR-00005","login",{"method":"sso","device":"mobile"},session_id="sess-005-c",days_ago=2),
    activity("MBR-00005","view_reservation",{"reservation_id":"CTR-4UHGRBX"},session_id="sess-005-c",reservation_id="CTR-4UHGRBX",days_ago=2,hours_ago=-0.3),
]

# ── MBR-00006 James Wilson · Business · DEN + LAX, Standard SUV ───────────────
ACTIVITIES += [
    activity("MBR-00006","login",{"method":"sso","device":"desktop"},session_id="sess-006-a",days_ago=35),
    activity("MBR-00006","search",{"location":"MCO","pickup":"2026-01-01","return":"2026-01-04","party_size":4},session_id="sess-006-a",days_ago=35,hours_ago=-1),
    activity("MBR-00006","view_listing",{"car_class":"Standard SUV","vendor":"Avis","rate_per_day":63.0},session_id="sess-006-a",days_ago=35,hours_ago=-1.5),
    activity("MBR-00006","view_listing",{"car_class":"Minivan","vendor":"Alamo","rate_per_day":69.0},session_id="sess-006-a",days_ago=35,hours_ago=-1.7),
    activity("MBR-00006","booking_confirmed",{"reservation_id":"CTR-DG2X7K8","car_class":"Minivan","total":276.0},session_id="sess-006-a",reservation_id="CTR-DG2X7K8",days_ago=35,hours_ago=-2),

    activity("MBR-00006","login",{"method":"sso","device":"desktop"},session_id="sess-006-b",days_ago=8),
    activity("MBR-00006","search",{"location":"MCO","pickup":"2026-09-01","return":"2026-09-03","party_size":2},session_id="sess-006-b",days_ago=8,hours_ago=-0.5),
    activity("MBR-00006","booking_confirmed",{"reservation_id":"CTR-TT9PAIV","car_class":"Minivan","total":138.0},session_id="sess-006-b",reservation_id="CTR-TT9PAIV",days_ago=8,hours_ago=-1),

    activity("MBR-00006","login",{"method":"sso","device":"mobile"},session_id="sess-006-c",days_ago=1),
    activity("MBR-00006","chat_session",{"message":"Do I have any active bookings at MCO?","action":"list_reservations"},session_id="sess-006-c",days_ago=1,hours_ago=-0.3),
    activity("MBR-00006","view_reservation",{"reservation_id":"CTR-TT9PAIV"},session_id="sess-006-c",reservation_id="CTR-TT9PAIV",days_ago=1,hours_ago=-0.5),
]

# ── MBR-00007 Maria Garcia · Gold Star · MCO, family ─────────────────────────
ACTIVITIES += [
    activity("MBR-00007","login",{"method":"sso","device":"mobile"},session_id="sess-007-a",days_ago=150),
    activity("MBR-00007","search",{"location":"MCO","pickup":"2026-04-09","return":"2026-04-12","party_size":6},session_id="sess-007-a",days_ago=150,hours_ago=-1),
    activity("MBR-00007","view_listing",{"car_class":"Minivan","vendor":"Enterprise","rate_per_day":69.0},session_id="sess-007-a",days_ago=150,hours_ago=-1.5),
    activity("MBR-00007","booking_confirmed",{"reservation_id":"CTR-EH5B3DE","car_class":"Minivan","total":207.0},session_id="sess-007-a",reservation_id="CTR-EH5B3DE",days_ago=150,hours_ago=-2),

    activity("MBR-00007","login",{"method":"sso","device":"desktop"},session_id="sess-007-b",days_ago=12),
    activity("MBR-00007","search",{"location":"MCO","pickup":"2026-09-11","return":"2026-09-14","party_size":6,"note":"return trip MCO"},session_id="sess-007-b",days_ago=12,hours_ago=-1),
    activity("MBR-00007","view_listing",{"car_class":"Minivan","vendor":"Budget","rate_per_day":69.0},session_id="sess-007-b",days_ago=12,hours_ago=-1.3),
    activity("MBR-00007","view_listing",{"car_class":"Full-Size SUV","vendor":"National","rate_per_day":86.0},session_id="sess-007-b",days_ago=12,hours_ago=-1.5),
    activity("MBR-00007","booking_confirmed",{"reservation_id":"CTR-19CWXKL","car_class":"Minivan","total":207.0},session_id="sess-007-b",reservation_id="CTR-19CWXKL",days_ago=12,hours_ago=-2),

    activity("MBR-00007","login",{"method":"sso","device":"mobile"},session_id="sess-007-c",days_ago=3),
    activity("MBR-00007","view_reservation",{"reservation_id":"CTR-19CWXKL"},session_id="sess-007-c",reservation_id="CTR-19CWXKL",days_ago=3,hours_ago=-0.2),
    activity("MBR-00007","chat_session",{"message":"Can I add a car seat to CTR-19CWXKL?","action":None},session_id="sess-007-c",reservation_id="CTR-19CWXKL",days_ago=3,hours_ago=-0.4),
]

# ── MBR-00008 Kevin Brown · Executive · LAX + LAS, highest saver, GPS user ───
# Longest-tenured member (2014), $7893 lifetime savings. Power user.
ACTIVITIES += [
    activity("MBR-00008","login",{"method":"sso","device":"desktop"},session_id="sess-008-a",days_ago=20),
    activity("MBR-00008","search",{"location":"LAX","pickup":"2026-09-01","return":"2026-09-04","party_size":2,"extras_requested":["gps","roadside_assistance"]},session_id="sess-008-a",days_ago=20,hours_ago=-0.5),
    activity("MBR-00008","view_listing",{"car_class":"Full-Size SUV","vendor":"National","rate_per_day":86.0},session_id="sess-008-a",days_ago=20,hours_ago=-0.7),
    activity("MBR-00008","view_listing",{"car_class":"Luxury","vendor":"National","rate_per_day":104.0},session_id="sess-008-a",days_ago=20,hours_ago=-0.9),
    activity("MBR-00008","chat_session",{"message":"What SUVs are available in LAX with GPS included?","action":"search_cars"},session_id="sess-008-a",days_ago=20,hours_ago=-1),
    activity("MBR-00008","booking_confirmed",{"reservation_id":"CTR-NAVWA5K","car_class":"Full-Size SUV","total":344.0},session_id="sess-008-a",reservation_id="CTR-NAVWA5K",days_ago=20,hours_ago=-1.5),
    activity("MBR-00008","addon_added",{"reservation_id":"CTR-NAVWA5K","addon_type":"gps","charge":35.97,"included":False},session_id="sess-008-a",reservation_id="CTR-NAVWA5K",days_ago=20,hours_ago=-2),

    activity("MBR-00008","login",{"method":"sso","device":"mobile"},session_id="sess-008-b",days_ago=8),
    activity("MBR-00008","search",{"location":"MCO","pickup":"2026-09-01","return":"2026-09-03","party_size":2},session_id="sess-008-b",days_ago=8,hours_ago=-0.3),
    activity("MBR-00008","view_listing",{"car_class":"Intermediate","vendor":"Enterprise","rate_per_day":47.0},session_id="sess-008-b",days_ago=8,hours_ago=-0.5),
    activity("MBR-00008","booking_confirmed",{"reservation_id":"CTR-YKAVTRS","car_class":"Intermediate","total":94.0},session_id="sess-008-b",reservation_id="CTR-YKAVTRS",days_ago=8,hours_ago=-0.8),

    activity("MBR-00008","login",{"method":"sso","device":"desktop"},session_id="sess-008-c",days_ago=2),
    activity("MBR-00008","chat_session",{"message":"My Avis invoice shows $89/day but I booked at $86. Can you help?","action":"request_human_review"},session_id="sess-008-c",reservation_id="CTR-NAVWA5K",days_ago=2,hours_ago=-0.3),
    activity("MBR-00008","dispute_opened",{"reservation_id":"CTR-NAVWA5K","type":"charge_mismatch","delta":9.0,"description":"Vendor invoiced $89/day retail vs confirmed $86/day member rate"},session_id="sess-008-c",reservation_id="CTR-NAVWA5K",days_ago=2,hours_ago=-0.5),
    activity("MBR-00008","view_reservation",{"reservation_id":"CTR-NAVWA5K"},session_id="sess-008-c",reservation_id="CTR-NAVWA5K",days_ago=2,hours_ago=-1),
]


# ── Write to Firestore ────────────────────────────────────────────────────────

def seed():
    col = DB.collection("member_activity")

    # Clear existing activity docs (idempotent re-run)
    existing = list(col.stream())
    print(f"Deleting {len(existing)} existing member_activity docs...")
    for d in existing:
        d.reference.delete()

    # Batch write
    batch = DB.batch()
    count = 0
    for i, event in enumerate(ACTIVITIES):
        ref = col.document(f"ACT-{i+1:04d}")
        batch.set(ref, event)
        count += 1
        if count % 499 == 0:   # Firestore batch limit is 500
            batch.commit()
            batch = DB.batch()

    batch.commit()
    print(f"Seeded {len(ACTIVITIES)} member_activity events across 8 members.")

    # Print summary
    from collections import Counter
    by_member = Counter(a["member_id"] for a in ACTIVITIES)
    by_type = Counter(a["event_type"] for a in ACTIVITIES)
    print("\nEvents by member:")
    for mid, cnt in sorted(by_member.items()): print(f"  {mid}: {cnt}")
    print("\nEvents by type:")
    for etype, cnt in sorted(by_type.items()): print(f"  {etype}: {cnt}")


if __name__ == "__main__":
    seed()
