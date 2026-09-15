"""Vendor-side booking mirror — syncs Costco Travel reservations to vendor_bookings collection.

When a booking is created/modified/cancelled on the Costco Travel platform, a mirror
record is written to the vendor_bookings collection representing the vendor's view.
Each vendor dashboard reads from this collection to show their bookings.
"""
from __future__ import annotations
import logging, secrets, string
from typing import Any
from .vendor_api import VENDOR_PROFILES, VEHICLE_CLASSES, COSTCO_CONTRACT

LOGGER = logging.getLogger("costco-travel-demo.vendor_portal")

SIPP_TO_MODEL = {vc["sipp"]: vc["example"] for vc in VEHICLE_CLASSES}
SIPP_TO_CLASS = {vc["sipp"]: vc["class"] for vc in VEHICLE_CLASSES}


def _vendor_booking_id(vendor_prefix: str) -> str:
    digits = "".join(secrets.choice(string.digits) for _ in range(7))
    return f"VB-{vendor_prefix}-{digits}"


def sync_booking_to_vendor(reservation: dict[str, Any]) -> dict[str, Any] | None:
    """Write or update a vendor_bookings record mirroring a Costco reservation."""
    from .firestore_db import _db, get_member
    from .policies import utc_now

    vendor_name = reservation.get("vendor", "")
    profile = VENDOR_PROFILES.get(vendor_name)
    if not profile:
        LOGGER.warning("Unknown vendor %s — skipping vendor sync", vendor_name)
        return None

    vendor_id = profile["vendor_id"]
    costco_res_id = reservation.get("id", "")
    stamp = utc_now().isoformat()

    member = None
    member_id = reservation.get("member_id", "")
    try:
        member = get_member(member_id)
    except Exception:
        pass
    member_name = f"{member.get('first_name','')} {member.get('last_name','')}".strip() if member else "Costco Member"

    sipp = reservation.get("sipp_code", "ICAR")
    doc = {
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "vendor_confirmation_id": reservation.get("vendor_confirmation_id", ""),
        "costco_reservation_id": costco_res_id,
        "status": reservation.get("status", "CONFIRMED"),
        "member_id": member_id,
        "member_name": member_name,
        "sipp_code": sipp,
        "vehicle_class": reservation.get("car_class", SIPP_TO_CLASS.get(sipp, "Intermediate")),
        "vehicle_model": SIPP_TO_MODEL.get(sipp, "Sedan"),
        "location_code": reservation.get("location_code", ""),
        "pickup_at": reservation.get("pickup_at", ""),
        "drop_at": reservation.get("drop_at", ""),
        "days": reservation.get("days", 1),
        "vendor_rate": reservation.get("rate_per_day", 0),
        "vendor_total": reservation.get("total", 0),
        "contract_code": COSTCO_CONTRACT,
        "channel": "costco_travel",
        "addons": reservation.get("addons", []),
        "disputes": reservation.get("disputes", []),
        "fuel_level": reservation.get("fuel_level"),
        "mileage": reservation.get("mileage"),
        "damage_notes": reservation.get("damage_notes"),
        "gds_code": profile["gds_code"],
        "api_version": profile["api_version"],
        "updated_at": stamp,
    }

    try:
        db = _db()
        col = db.collection("vendor_bookings")
        existing = list(
            col.where("costco_reservation_id", "==", costco_res_id)
            .where("vendor_id", "==", vendor_id)
            .limit(1)
            .stream()
        )
        if existing:
            doc_ref = existing[0].reference
            event = {
                "action": f"STATUS_{reservation.get('status', 'UPDATED')}",
                "timestamp": stamp,
                "channel": "costco_travel",
            }
            old_data = existing[0].to_dict()
            events = old_data.get("events", [])
            events.append(event)
            doc["events"] = events
            doc_ref.update(doc)
            doc["id"] = doc_ref.id
            LOGGER.info("Updated vendor booking %s for %s/%s", doc_ref.id, vendor_name, costco_res_id)
        else:
            doc["created_at"] = stamp
            doc["events"] = [{
                "action": "BOOKING_RECEIVED",
                "timestamp": stamp,
                "channel": "costco_travel",
            }]
            booking_id = _vendor_booking_id(profile["conf_prefix"])
            col.document(booking_id).set(doc)
            doc["id"] = booking_id
            LOGGER.info("Created vendor booking %s for %s/%s", booking_id, vendor_name, costco_res_id)

        return doc
    except Exception as exc:
        LOGGER.warning("vendor_bookings sync failed for %s/%s: %s", vendor_name, costco_res_id, exc)
        return None


def get_vendor_bookings(vendor_id: str, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Return bookings for a vendor, optionally filtered by status."""
    from .firestore_db import _db
    try:
        q = _db().collection("vendor_bookings").where("vendor_id", "==", vendor_id)
        if status:
            q = q.where("status", "==", status)
        docs = list(q.limit(limit).stream())
        results = [{"id": d.id, **d.to_dict()} for d in docs]
        results.sort(key=lambda x: x.get("pickup_at", ""), reverse=True)
        return results
    except Exception as exc:
        LOGGER.warning("vendor_bookings query failed for %s: %s", vendor_id, exc)
        return []


def get_vendor_booking(booking_id: str) -> dict[str, Any] | None:
    """Return a single vendor booking by ID."""
    from .firestore_db import _db
    try:
        doc = _db().collection("vendor_bookings").document(booking_id).get()
        if doc.exists:
            return {"id": doc.id, **doc.to_dict()}
    except Exception as exc:
        LOGGER.warning("vendor_booking lookup failed for %s: %s", booking_id, exc)
    return None


def get_all_vendor_bookings(limit: int = 100) -> list[dict[str, Any]]:
    """Return all vendor bookings across all vendors."""
    from .firestore_db import _db
    try:
        docs = list(_db().collection("vendor_bookings").limit(limit).stream())
        results = [{"id": d.id, **d.to_dict()} for d in docs]
        results.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return results
    except Exception as exc:
        LOGGER.warning("vendor_bookings query all failed: %s", exc)
        return []


def get_vendor_dashboard(vendor_id: str) -> dict[str, Any]:
    """Return dashboard stats for a vendor."""
    bookings = get_vendor_bookings(vendor_id, limit=200)
    from collections import Counter
    status_counts = Counter(b["status"] for b in bookings)
    total_revenue = sum(b.get("vendor_total", 0) for b in bookings)
    active_count = status_counts.get("ACTIVE", 0) + status_counts.get("CONFIRMED", 0)
    location_counts = Counter(b.get("location_code", "") for b in bookings)
    class_counts = Counter(b.get("vehicle_class", "") for b in bookings)
    profile = {k: v for k, v in VENDOR_PROFILES.items() if v["vendor_id"] == vendor_id}
    vendor_name = list(profile.keys())[0] if profile else vendor_id

    return {
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "total_bookings": len(bookings),
        "active_reservations": active_count,
        "status_breakdown": dict(status_counts),
        "total_revenue": round(total_revenue, 2),
        "top_locations": dict(location_counts.most_common(5)),
        "top_vehicle_classes": dict(class_counts.most_common(5)),
        "recent_bookings": bookings[:10],
        "open_disputes": sum(1 for b in bookings if b.get("disputes")),
    }
