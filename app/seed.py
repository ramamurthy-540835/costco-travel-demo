"""Idempotent relative-date Firestore demo seed — linked to members, vendors, vehicle_classes."""
from datetime import timedelta
from .policies import utc_now
from .recommend import quote, SIPP_MAP, VENDOR_META
from .reservations import FirestoreRepository, _vendor_confirmation

DEMO_FAR_ID = "CTR-D21OUT1"
DEMO_NEAR_ID = "CTR-D30HRS1"
DEMO_ACTIVE_ID = "CTR-DACTIV1"

# Canonical demo member/vendor IDs from the costco-demo Firestore collections
DEMO_MEMBER_ID = "MBR-00001"   # Sarah Johnson, Executive, Active
VENDOR_ENT_ID = "VND-ENT"      # Enterprise
VENDOR_AVS_ID = "VND-AVS"      # Avis


def _pricing(car_class: str, days: int) -> dict:
    p = quote(car_class, days)
    vendor = p.pop("vendor", "Enterprise")
    sipp = p.pop("sipp_code", SIPP_MAP.get(car_class, "ICAR"))
    vendor_id = p.pop("vendor_id", VENDOR_META.get(vendor, {}).get("vendor_id", ""))
    vehicle_class_id = p.pop("vehicle_class_id", car_class.lower().replace(" ", "-"))
    return p, vendor, sipp, vendor_id, vehicle_class_id


def _base(identity, status, car_class, location, pickup, days, vendor, sipp, vendor_id, vehicle_class_id, pricing, stamp) -> dict:
    return {
        "id": identity, "status": status, "source": "demo",
        "car_class": car_class, "vehicle_class_id": vehicle_class_id,
        "location_code": location,
        "pickup_at": pickup.isoformat(),
        "drop_at": (pickup + timedelta(days=days)).isoformat(),
        "pickup_time": pickup.strftime("%H:%M"),
        "drop_time": pickup.strftime("%H:%M"),
        "days": days,
        **pricing,
        "vendor": vendor, "vendor_id": vendor_id,
        "vendor_confirmation_id": _vendor_confirmation(vendor),
        "sipp_code": sipp,
        "member_id": DEMO_MEMBER_ID,
        "extras": [], "addons": [], "disputes": [],
        "external_id": "", "metadata": {},
        "demo": True, "demo_schedule": "v4-linked",
        "created_at": stamp, "updated_at": stamp,
    }


def freshen_stale(repository=None) -> list[str]:
    """Move any CONFIRMED reservation whose pickup_at is in the past to a future date.
    Preserves duration, vendor, member linkage, and all other fields.
    Called automatically by seed() so dates never go stale between demo sessions.
    """
    repo = repository or FirestoreRepository()
    now = utc_now()
    refreshed = []
    for item in repo.list():
        if item.get("status") != "CONFIRMED":
            continue
        pickup_str = item.get("pickup_at", "")
        if not pickup_str or pickup_str > now.isoformat():
            continue  # future or unknown — skip
        # Push pickup forward so it lands 3–14 days from now, preserving duration
        days = max(1, min(item.get("days", 1), 7))  # cap at 7 for demo clarity
        # Deterministic offset based on reservation ID to spread them out
        offset_days = 3 + (abs(hash(item["id"])) % 12)
        new_pickup = now + timedelta(days=offset_days, hours=10)
        new_drop = new_pickup + timedelta(days=days)
        car_class = item.get("car_class", "Intermediate")
        try:
            pricing, vendor, sipp, vendor_id, vcid = _pricing(car_class, days)
        except Exception:
            pricing, vendor, sipp, vendor_id, vcid = {}, item.get("vendor", "Enterprise"), item.get("sipp_code", "ICAR"), item.get("vendor_id", ""), item.get("vehicle_class_id", "")
        repo.update(item["id"], {
            "pickup_at": new_pickup.isoformat(),
            "drop_at": new_drop.isoformat(),
            "pickup_time": new_pickup.strftime("%H:%M"),
            "drop_time": new_drop.strftime("%H:%M"),
            "days": days,
            **pricing,
            "updated_at": now.isoformat(),
            "demo_schedule": "v4-relative",
        })
        refreshed.append(item["id"])
    return refreshed


def seed(repository=None):
    repo = repository or FirestoreRepository()
    now = utc_now()
    created = []

    # Freshen any stale CONFIRMED reservations first
    stale = freshen_stale(repo)
    if stale:
        import logging
        logging.getLogger("costco-travel-demo.seed").info("Refreshed %d stale reservations: %s", len(stale), stale)

    # CTR-D21OUT1 — upcoming, 50h from now, Intermediate, MCO, Enterprise
    far_pickup = now + timedelta(hours=50)
    pricing, vendor, sipp, vendor_id, vcid = _pricing("Intermediate", 1)
    existing = repo.get(DEMO_FAR_ID)
    if not (existing and existing.get("demo_schedule") == "v4-linked" and existing.get("pickup_at", "") > now.isoformat()):
        stamp = now.isoformat()
        base = _base(DEMO_FAR_ID, "CONFIRMED", "Intermediate", "MCO", far_pickup, 1, vendor, sipp, VENDOR_ENT_ID, vcid, pricing, stamp)
        if existing:
            base.pop("id"); repo.update(DEMO_FAR_ID, base)
        else:
            repo.create(base)
        created.append(DEMO_FAR_ID)

    # CTR-D30HRS1 — upcoming, 30h from now, Full-Size, LAS, Avis
    near_pickup = now + timedelta(hours=30)
    pricing, vendor, sipp, vendor_id, vcid = _pricing("Full-Size", 1)
    existing = repo.get(DEMO_NEAR_ID)
    if not (existing and existing.get("demo_schedule") == "v4-linked" and existing.get("pickup_at", "") > now.isoformat()):
        stamp = now.isoformat()
        base = _base(DEMO_NEAR_ID, "CONFIRMED", "Full-Size", "LAS", near_pickup, 1, vendor, sipp, VENDOR_AVS_ID, vcid, pricing, stamp)
        if existing:
            base.pop("id"); repo.update(DEMO_NEAR_ID, base)
        else:
            repo.create(base)
        created.append(DEMO_NEAR_ID)

    # CTR-DACTIV1 — already ACTIVE, Toyota RAV4, LAX, Avis (UC4-UC7 demo)
    active_pickup = now - timedelta(hours=2)
    pricing, vendor, sipp, vendor_id, vcid = _pricing("Standard SUV", 2)
    existing = repo.get(DEMO_ACTIVE_ID)
    if not (existing and existing.get("status") == "ACTIVE" and existing.get("demo_schedule") == "v4-linked"):
        stamp = now.isoformat()
        base = _base(DEMO_ACTIVE_ID, "ACTIVE", "Standard SUV", "LAX", active_pickup, 2, vendor, sipp, VENDOR_AVS_ID, vcid, pricing, stamp)
        base["checked_in_at"] = active_pickup.isoformat()
        base["drop_at"] = (active_pickup + timedelta(days=2)).isoformat()
        if existing:
            base.pop("id"); repo.update(DEMO_ACTIVE_ID, base)
        else:
            repo.create(base)
        created.append(DEMO_ACTIVE_ID)

    return created


if __name__ == "__main__":
    print({"created": seed()})
