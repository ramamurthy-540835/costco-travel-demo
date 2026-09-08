"""Cached reads from the structured costco-demo Firestore collections.

Collections: members, vendors, locations, vehicle_classes, inventory, contracts, audit_events.
All collection reads are cached at startup; write_audit_event always hits Firestore live.
"""
from __future__ import annotations
import logging, os
from functools import lru_cache
from typing import Any
from google.cloud import firestore

LOGGER = logging.getLogger("costco-travel-demo.db")


@lru_cache(maxsize=1)
def _db() -> firestore.Client:
    return firestore.Client(
        project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
        database=os.environ.get("FIRESTORE_DATABASE", "(default)"),
    )


def _stream(collection: str) -> dict[str, dict]:
    try:
        return {d.id: d.to_dict() for d in _db().collection(collection).stream()}
    except Exception as exc:
        LOGGER.warning("Firestore collection %s unavailable: %s", collection, exc)
        return {}


@lru_cache(maxsize=1)
def get_vehicle_classes() -> dict[str, dict]:
    """{ 'intermediate': {label, sipp_code, seats, costco_rate_per_day, image_url, ...} }"""
    return _stream("vehicle_classes")


@lru_cache(maxsize=1)
def get_vendors() -> dict[str, dict]:
    """{ 'VND-ENT': {name, code, gds_code, costco_partner, ...} }"""
    return _stream("vendors")


@lru_cache(maxsize=1)
def get_locations() -> dict[str, dict]:
    """{ 'MCO': {city, state, airport_name, timezone, ...} }"""
    return _stream("locations")


@lru_cache(maxsize=1)
def get_contracts() -> dict[str, dict]:
    """{ 'CON-MCO-ENT': {vendor_id, location_code, discount_pct, status, ...} }"""
    return _stream("contracts")


# ── vendor helpers ───────────────────────────────────────────────────────────

def vendor_name_to_id(name: str) -> str | None:
    """'Enterprise' → 'VND-ENT'"""
    for vid, vdata in get_vendors().items():
        if vdata.get("name", "").lower() == name.lower():
            return vid
    return None


def vendor_id_to_name(vendor_id: str) -> str:
    """'VND-ENT' → 'Enterprise'"""
    return get_vendors().get(vendor_id, {}).get("name", vendor_id)


def vendor_id_for_class(car_class: str, location_code: str) -> str | None:
    """Return the VND-xxx ID for the contract that covers this class+location."""
    class_id = class_label_to_id(car_class)
    for contract_id, c in get_contracts().items():
        if c.get("location_code") == location_code and c.get("status") == "active":
            return c.get("vendor_id")
    return None


# ── vehicle-class helpers ─────────────────────────────────────────────────────

def class_label_to_id(label: str) -> str:
    """'Full-Size SUV' → 'full-size-suv'"""
    return label.lower().replace(" ", "-").replace("_", "-")


def class_id_to_label(class_id: str) -> str:
    """'full-size-suv' → 'Full-Size SUV' (from Firestore or fallback)"""
    vc = get_vehicle_classes().get(class_id)
    if vc:
        return vc.get("label", class_id)
    return class_id.replace("-", " ").title()


# ── inventory ─────────────────────────────────────────────────────────────────

def get_inventory_for_location(location_code: str) -> list[dict[str, Any]]:
    """Return available inventory items for a location, enriched with vendor/class data."""
    try:
        docs = _db().collection("inventory") \
            .where("location_code", "==", location_code) \
            .stream()
        vendors = get_vendors()
        vehicle_classes = get_vehicle_classes()
        result = []
        for d in docs:
            data = d.to_dict()
            vid = data.get("vendor_id", "")
            cid = data.get("vehicle_class_id", "")
            vc = vehicle_classes.get(cid, {})
            vendor = vendors.get(vid, {})
            result.append({
                "id": d.id,
                "vendor_id": vid,
                "vendor": vendor.get("name", vid),
                "vehicle_class_id": cid,
                "class": vc.get("label", cid),
                "car": data.get("vehicle_model", vc.get("example_model", "")),
                "seats": data.get("seats", vc.get("seats", 5)),
                "sipp_code": vc.get("sipp_code", "ICAR"),
                "emoji": vc.get("emoji", "🚙"),
                "image_url": vc.get("image_url", ""),
                "rate_per_day": float(data.get("costco_rate_per_day", 0)),
                "retail_per_day": float(data.get("retail_rate_per_day", 0)),
                "available": data.get("available", True),
                "location_code": location_code,
            })
        return result
    except Exception as exc:
        LOGGER.warning("Firestore inventory query failed for %s: %s", location_code, exc)
        return []


# ── member lookup ─────────────────────────────────────────────────────────────

def get_member(member_id: str) -> dict[str, Any] | None:
    """Look up member by Firestore document ID (e.g. 'MBR-00001')."""
    try:
        doc = _db().collection("members").document(member_id).get()
        if doc.exists:
            return {"id": doc.id, **doc.to_dict()}
    except Exception as exc:
        LOGGER.warning("Member lookup failed for %s: %s", member_id, exc)
    return None


def get_member_by_number(membership_number: str) -> dict[str, Any] | None:
    """Look up member by membership_number field (e.g. '110023847')."""
    try:
        results = list(
            _db().collection("members")
            .where("membership_number", "==", membership_number)
            .limit(1)
            .stream()
        )
        if results:
            doc = results[0]
            return {"id": doc.id, **doc.to_dict()}
    except Exception as exc:
        LOGGER.warning("Member lookup by number failed for %s: %s", membership_number, exc)
    return None


# ── member activity timeline ─────────────────────────────────────────────────

def get_member_activity(member_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """Return the most recent activity events for a member, newest first.
    Falls back to unordered query if the composite index is still building.
    """
    try:
        docs = list(
            _db().collection("member_activity")
            .where("member_id", "==", member_id)
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
        return [{"id": d.id, **d.to_dict()} for d in docs]
    except Exception:
        pass  # index may still be building — fall back to unordered
    try:
        docs = list(
            _db().collection("member_activity")
            .where("member_id", "==", member_id)
            .limit(limit)
            .stream()
        )
        items = [{"id": d.id, **d.to_dict()} for d in docs]
        items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return items
    except Exception as exc:
        LOGGER.warning("member_activity query failed for %s: %s", member_id, exc)
        return []


def get_member_activity_summary(member_id: str) -> dict[str, Any]:
    """Return a summary of member activity useful for AI agent context."""
    events = get_member_activity(member_id, limit=50)
    events = [e for e in events if e.get("event_type")]  # guard against malformed docs
    if not events:
        return {}
    from collections import Counter
    type_counts = Counter(e["event_type"] for e in events)
    searches = [e["payload"] for e in events if e["event_type"] == "search"]
    locations_searched = list(dict.fromkeys(s.get("location","") for s in searches if s.get("location")))
    chats = [e for e in events if e["event_type"] == "chat_session"]
    recent_reservations = list(dict.fromkeys(
        e["reservation_id"] for e in events if e.get("reservation_id")
    ))[:5]
    disputes = [e for e in events if e["event_type"] == "dispute_opened"]
    return {
        "total_events": len(events),
        "event_counts": dict(type_counts),
        "recent_locations_searched": locations_searched[:5],
        "recent_reservation_ids": recent_reservations,
        "chat_sessions": len(chats),
        "active_disputes": len(disputes),
        "last_activity": events[0]["timestamp"] if events else None,
        "last_event_type": events[0]["event_type"] if events else None,
    }


def write_member_activity(
    member_id: str,
    event_type: str,
    payload: dict,
    *,
    session_id: str = "api",
    source: str = "api",
    reservation_id: str | None = None,
) -> None:
    """Append an event to member_activity. Best-effort."""
    from .policies import utc_now
    try:
        _db().collection("member_activity").add({
            "member_id": member_id,
            "event_type": event_type,
            "timestamp": utc_now().isoformat(),
            "session_id": session_id,
            "source": source,
            "reservation_id": reservation_id,
            "payload": payload,
        })
    except Exception as exc:
        LOGGER.warning("member_activity write failed (%s, %s): %s", member_id, event_type, exc)


# ── audit events ──────────────────────────────────────────────────────────────

def write_audit_event(
    action: str,
    reservation_id: str,
    *,
    member_id: str | None = None,
    payload: dict | None = None,
    actor: str = "agent",
    session_id: str = "api",
) -> None:
    """Write a record to the audit_events collection. Best-effort — never raises."""
    from .policies import utc_now
    try:
        _db().collection("audit_events").add({
            "action": action,
            "reservation_id": reservation_id,
            "member_id": member_id or "",
            "actor": actor,
            "session_id": session_id,
            "timestamp": utc_now().isoformat(),
            "payload": payload or {},
        })
    except Exception as exc:
        LOGGER.warning("audit_events write failed (action=%s, res=%s): %s", action, reservation_id, exc)
