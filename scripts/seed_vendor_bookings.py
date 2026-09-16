"""Seed realistic mock bookings across all 4 vendors (Alamo, Avis, Budget, Enterprise).

Creates reservations in both the `reservations` and `vendor_bookings` collections
so the Costco Travel platform and vendor dashboards both show the data.

Run: GOOGLE_CLOUD_PROJECT=ctoteam FIRESTORE_DATABASE=costco-demo python3 -m scripts.seed_vendor_bookings
"""
from __future__ import annotations
import os, sys, secrets, string
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.cloud import firestore

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "ctoteam")
DATABASE = os.environ.get("FIRESTORE_DATABASE", "costco-demo")
COSTCO_CONTRACT = "COSTCO-CMR-2024"

db = firestore.Client(project=PROJECT, database=DATABASE)

VENDORS = {
    "Alamo":      {"vendor_id": "VND-ALM", "gds_code": "AL", "conf_prefix": "AL", "conf_len": 7, "api_version": "AL-API v3"},
    "Avis":       {"vendor_id": "VND-AVS", "gds_code": "ZI", "conf_prefix": "AW", "conf_len": 8, "api_version": "AV-API v3"},
    "Budget":     {"vendor_id": "VND-BDG", "gds_code": "ZD", "conf_prefix": "BU", "conf_len": 8, "api_version": "BU-API v2"},
    "Enterprise": {"vendor_id": "VND-ENT", "gds_code": "ET", "conf_prefix": "EZ", "conf_len": 7, "api_version": "EZ-API v4"},
}

MEMBERS = [
    {"id": "MBR-00001", "name": "Sarah Johnson"},
    {"id": "MBR-00002", "name": "David Chen"},
    {"id": "MBR-00003", "name": "Emily Rodriguez"},
    {"id": "MBR-00004", "name": "Robert Kim"},
    {"id": "MBR-00005", "name": "Lisa Thompson"},
    {"id": "MBR-00006", "name": "James Wilson"},
    {"id": "MBR-00007", "name": "Maria Garcia"},
    {"id": "MBR-00008", "name": "Kevin Patel"},
]

CARS = [
    {"class": "Economy",      "sipp": "ECAR", "model": "Nissan Versa",       "rate": 36.0,  "retail": 43.0},
    {"class": "Compact",      "sipp": "CCAR", "model": "Kia Soul",           "rate": 41.0,  "retail": 49.0},
    {"class": "Intermediate", "sipp": "ICAR", "model": "Toyota Camry",       "rate": 47.0,  "retail": 55.0},
    {"class": "Full-Size",    "sipp": "FCAR", "model": "Chevrolet Malibu",   "rate": 54.0,  "retail": 64.0},
    {"class": "Standard SUV", "sipp": "SFAR", "model": "Toyota RAV4",        "rate": 63.0,  "retail": 74.0},
    {"class": "Full-Size SUV","sipp": "FFAR", "model": "Chevrolet Tahoe",    "rate": 86.0,  "retail": 101.0},
    {"class": "Minivan",      "sipp": "MVAR", "model": "Chrysler Pacifica",  "rate": 69.0,  "retail": 82.0},
    {"class": "Luxury",       "sipp": "LCAR", "model": "BMW 5 Series",       "rate": 104.0, "retail": 124.0},
    {"class": "Convertible",  "sipp": "PPAR", "model": "Ford Mustang",       "rate": 92.0,  "retail": 109.0},
    {"class": "Pickup",       "sipp": "PFAR", "model": "Ford F-150",         "rate": 79.0,  "retail": 94.0},
]

LOCATIONS = ["SEA", "LAX", "MCO", "LAS", "DEN", "JFK"]

def _conf(prefix: str, length: int) -> str:
    return f"{prefix}-{''.join(secrets.choice(string.digits) for _ in range(length))}"

def _res_id() -> str:
    return "CTR-" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(7))

now = datetime.now(timezone.utc)

# 20 bookings spread across 4 vendors, various statuses/locations/cars/members
MOCK_BOOKINGS = [
    # ── Alamo (5 bookings) ──
    {"vendor": "Alamo",      "member": 0, "car": 2, "loc": "SEA", "status": "CONFIRMED", "days": 3, "offset_days": 5},
    {"vendor": "Alamo",      "member": 2, "car": 4, "loc": "LAX", "status": "ACTIVE",    "days": 4, "offset_days": -1, "checked_in": True},
    {"vendor": "Alamo",      "member": 4, "car": 0, "loc": "DEN", "status": "RETURNED",  "days": 2, "offset_days": -5},
    {"vendor": "Alamo",      "member": 6, "car": 6, "loc": "MCO", "status": "CONFIRMED", "days": 5, "offset_days": 8},
    {"vendor": "Alamo",      "member": 1, "car": 8, "loc": "LAS", "status": "CANCELLED", "days": 3, "offset_days": -3},

    # ── Avis (5 bookings) ──
    {"vendor": "Avis",       "member": 1, "car": 3, "loc": "SEA", "status": "CONFIRMED", "days": 2, "offset_days": 3},
    {"vendor": "Avis",       "member": 3, "car": 7, "loc": "JFK", "status": "ACTIVE",    "days": 5, "offset_days": -2, "checked_in": True},
    {"vendor": "Avis",       "member": 5, "car": 1, "loc": "MCO", "status": "RETURNED",  "days": 7, "offset_days": -10},
    {"vendor": "Avis",       "member": 7, "car": 5, "loc": "LAX", "status": "CONFIRMED", "days": 3, "offset_days": 10},
    {"vendor": "Avis",       "member": 0, "car": 9, "loc": "DEN", "status": "ACTIVE",    "days": 2, "offset_days": -1, "checked_in": True},

    # ── Budget (5 bookings) ──
    {"vendor": "Budget",     "member": 2, "car": 0, "loc": "SEA", "status": "CONFIRMED", "days": 4, "offset_days": 7},
    {"vendor": "Budget",     "member": 4, "car": 3, "loc": "LAS", "status": "ACTIVE",    "days": 3, "offset_days": -1, "checked_in": True},
    {"vendor": "Budget",     "member": 6, "car": 5, "loc": "MCO", "status": "RETURNED",  "days": 5, "offset_days": -8},
    {"vendor": "Budget",     "member": 0, "car": 2, "loc": "JFK", "status": "CANCELLED", "days": 2, "offset_days": -4},
    {"vendor": "Budget",     "member": 3, "car": 8, "loc": "LAX", "status": "CONFIRMED", "days": 6, "offset_days": 12},

    # ── Enterprise (5 bookings) ──
    {"vendor": "Enterprise", "member": 3, "car": 4, "loc": "SEA", "status": "CONFIRMED", "days": 3, "offset_days": 4},
    {"vendor": "Enterprise", "member": 5, "car": 6, "loc": "DEN", "status": "ACTIVE",    "days": 4, "offset_days": -1, "checked_in": True},
    {"vendor": "Enterprise", "member": 7, "car": 1, "loc": "LAS", "status": "RETURNED",  "days": 2, "offset_days": -6},
    {"vendor": "Enterprise", "member": 1, "car": 7, "loc": "MCO", "status": "CONFIRMED", "days": 5, "offset_days": 9},
    {"vendor": "Enterprise", "member": 2, "car": 9, "loc": "JFK", "status": "CANCELLED", "days": 3, "offset_days": -7},
]


def seed_booking(b: dict) -> tuple[str, str]:
    """Create one reservation + one vendor_booking. Returns (res_id, vb_id)."""
    vendor_name = b["vendor"]
    vp = VENDORS[vendor_name]
    member = MEMBERS[b["member"]]
    car = CARS[b["car"]]
    loc = b["loc"]
    status = b["status"]
    days = b["days"]

    pickup = now + timedelta(days=b["offset_days"], hours=10)
    drop = pickup + timedelta(days=days)
    total = round(car["rate"] * days, 2)
    retail_total = round(car["retail"] * days, 2)

    vendor_conf = _conf(vp["conf_prefix"], vp["conf_len"])
    res_id = _res_id()
    created_at = (pickup - timedelta(days=max(3, abs(b["offset_days"]) + 2))).isoformat()

    addons = []
    disputes = []
    extra_fields = {}

    if status == "ACTIVE" and b.get("checked_in"):
        extra_fields["checked_in_at"] = pickup.isoformat()
    if status == "RETURNED":
        extra_fields["returned_at"] = drop.isoformat()
        extra_fields["fuel_level"] = "full"
        extra_fields["mileage"] = secrets.randbelow(800) + 100
        extra_fields["final_invoice"] = {
            "member_rate_total": total,
            "addon_total": 0,
            "grand_total": total,
            "fuel_level": "full",
            "mileage": extra_fields["mileage"],
            "damage_notes": "None reported",
        }
    if status == "CANCELLED":
        extra_fields["cancelled_at"] = created_at

    # ── Write to reservations collection ──
    res_doc = {
        "status": status,
        "source": "demo-vendor-seed",
        "car_class": car["class"],
        "vehicle_class_id": car["class"].lower().replace(" ", "-"),
        "location_code": loc,
        "pickup_at": pickup.isoformat(),
        "drop_at": drop.isoformat(),
        "pickup_time": "10:00",
        "drop_time": "10:00",
        "days": days,
        "rate_per_day": car["rate"],
        "retail_per_day": car["retail"],
        "total": total,
        "retail_total": retail_total,
        "savings": round(retail_total - total, 2),
        "vendor": vendor_name,
        "vendor_id": vp["vendor_id"],
        "vendor_confirmation_id": vendor_conf,
        "sipp_code": car["sipp"],
        "member_id": member["id"],
        "extras": [],
        "addons": addons,
        "disputes": disputes,
        "external_id": "",
        "metadata": {},
        "demo": True,
        "demo_schedule": "vendor-seed-v1",
        "created_at": created_at,
        "updated_at": now.isoformat(),
        **extra_fields,
    }
    db.collection("reservations").document(res_id).set(res_doc)

    # ── Write to vendor_bookings collection ──
    vb_id = f"VB-{vp['conf_prefix']}-{''.join(secrets.choice(string.digits) for _ in range(7))}"
    events = [{"action": "BOOKING_RECEIVED", "timestamp": created_at, "channel": "costco_travel"}]
    if status == "ACTIVE":
        events.append({"action": "STATUS_ACTIVE", "timestamp": pickup.isoformat(), "channel": "costco_travel"})
    elif status == "RETURNED":
        events.append({"action": "STATUS_ACTIVE", "timestamp": pickup.isoformat(), "channel": "costco_travel"})
        events.append({"action": "STATUS_RETURNED", "timestamp": drop.isoformat(), "channel": "costco_travel"})
    elif status == "CANCELLED":
        events.append({"action": "STATUS_CANCELLED", "timestamp": created_at, "channel": "costco_travel"})

    vb_doc = {
        "vendor_id": vp["vendor_id"],
        "vendor_name": vendor_name,
        "vendor_confirmation_id": vendor_conf,
        "costco_reservation_id": res_id,
        "status": status,
        "member_id": member["id"],
        "member_name": member["name"],
        "sipp_code": car["sipp"],
        "vehicle_class": car["class"],
        "vehicle_model": car["model"],
        "location_code": loc,
        "pickup_at": pickup.isoformat(),
        "drop_at": drop.isoformat(),
        "days": days,
        "vendor_rate": car["rate"],
        "vendor_total": total,
        "contract_code": COSTCO_CONTRACT,
        "channel": "costco_travel",
        "addons": addons,
        "disputes": disputes,
        "fuel_level": extra_fields.get("fuel_level"),
        "mileage": extra_fields.get("mileage"),
        "damage_notes": extra_fields.get("final_invoice", {}).get("damage_notes") if status == "RETURNED" else None,
        "gds_code": vp["gds_code"],
        "api_version": vp["api_version"],
        "created_at": created_at,
        "updated_at": now.isoformat(),
        "events": events,
    }
    db.collection("vendor_bookings").document(vb_id).set(vb_doc)

    return res_id, vb_id


def main():
    print(f"Seeding {len(MOCK_BOOKINGS)} bookings across 4 vendors...\n")
    results = {"Alamo": [], "Avis": [], "Budget": [], "Enterprise": []}

    for b in MOCK_BOOKINGS:
        res_id, vb_id = seed_booking(b)
        member = MEMBERS[b["member"]]
        car = CARS[b["car"]]
        vendor = b["vendor"]
        results[vendor].append(vb_id)
        print(f"  {vendor:12s} | {b['status']:10s} | {b['loc']} | {car['class']:14s} | {member['name']:18s} | res={res_id} vb={vb_id}")

    print(f"\n{'='*90}")
    print(f"SUMMARY")
    print(f"{'='*90}")
    for vendor, ids in results.items():
        print(f"  {vendor:12s}: {len(ids)} bookings")

    # Verify by reading back from both collections
    print(f"\n--- Verification ---")
    res_count = len(list(db.collection("reservations").where("demo_schedule", "==", "vendor-seed-v1").stream()))
    print(f"  reservations  collection: {res_count} vendor-seed docs")

    for vendor_name, vp in VENDORS.items():
        vb_count = len(list(db.collection("vendor_bookings").where("vendor_id", "==", vp["vendor_id"]).stream()))
        print(f"  vendor_bookings [{vp['vendor_id']}]: {vb_count} docs ({vendor_name})")

    print(f"\nDone. Both collections populated.")


if __name__ == "__main__":
    main()
