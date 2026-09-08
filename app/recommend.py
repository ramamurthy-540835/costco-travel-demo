"""Vehicle recommendations and pricing — Firestore-backed with static fallback."""
from __future__ import annotations
import logging
from typing import Any

LOGGER = logging.getLogger("costco-travel-demo.recommend")

# SIPP (Standard Interline Passenger Procedures) car category codes
SIPP_MAP: dict[str, str] = {
    "Economy": "ECAR", "Compact": "CCAR", "Intermediate": "ICAR", "Full-Size": "FCAR",
    "Standard SUV": "SFAR", "Minivan": "MVAR", "Full-Size SUV": "FFAR",
    "Luxury": "LCAR", "Convertible": "PPAR", "Pickup": "PFAR",
}

# Vendor confirmation number formats — mirrors real GDS confirmation patterns
VENDOR_META: dict[str, dict] = {
    "Enterprise": {"conf_prefix": "EZ", "conf_len": 7, "api": "EZ-API v4", "code": "ET", "vendor_id": "VND-ENT"},
    "Avis":       {"conf_prefix": "AW", "conf_len": 8, "api": "AV-API v3", "code": "ZI", "vendor_id": "VND-AVS"},
    "Alamo":      {"conf_prefix": "AL", "conf_len": 7, "api": "AL-API v3", "code": "AL", "vendor_id": "VND-ALM"},
    "National":   {"conf_prefix": "NC", "conf_len": 7, "api": "NC-API v2", "code": "ZL", "vendor_id": "VND-NAT"},
    "Budget":     {"conf_prefix": "BU", "conf_len": 8, "api": "BU-API v2", "code": "ZD", "vendor_id": "VND-BDG"},
}

# Static fallback inventory (used when Firestore is unavailable)
_STATIC_INVENTORY = (
    {"car": "Toyota Camry",     "class": "Intermediate",  "seats": 5, "rate_per_day": 47.0,  "retail_per_day": 55.0,  "popularity": 10, "emoji": "🚙", "vendor": "Enterprise"},
    {"car": "Nissan Versa",     "class": "Economy",       "seats": 5, "rate_per_day": 36.0,  "retail_per_day": 43.0,  "popularity": 6,  "emoji": "🚗", "vendor": "Budget"},
    {"car": "Kia Soul",         "class": "Compact",       "seats": 5, "rate_per_day": 41.0,  "retail_per_day": 49.0,  "popularity": 7,  "emoji": "🚗", "vendor": "Alamo"},
    {"car": "Chevrolet Malibu", "class": "Full-Size",     "seats": 5, "rate_per_day": 54.0,  "retail_per_day": 64.0,  "popularity": 8,  "emoji": "🚘", "vendor": "Enterprise"},
    {"car": "Toyota RAV4",      "class": "Standard SUV",  "seats": 5, "rate_per_day": 63.0,  "retail_per_day": 74.0,  "popularity": 8,  "emoji": "🚙", "vendor": "Avis"},
    {"car": "Chrysler Pacifica", "class": "Minivan",      "seats": 7, "rate_per_day": 69.0,  "retail_per_day": 82.0,  "popularity": 7,  "emoji": "🚐", "vendor": "Alamo"},
    {"car": "Chevrolet Tahoe",  "class": "Full-Size SUV", "seats": 7, "rate_per_day": 86.0,  "retail_per_day": 101.0, "popularity": 7,  "emoji": "🚙", "vendor": "National"},
    {"car": "BMW 5 Series",     "class": "Luxury",        "seats": 5, "rate_per_day": 104.0, "retail_per_day": 124.0, "popularity": 5,  "emoji": "🚘", "vendor": "National"},
    {"car": "Ford Mustang",     "class": "Convertible",   "seats": 4, "rate_per_day": 92.0,  "retail_per_day": 109.0, "popularity": 5,  "emoji": "🏎️", "vendor": "Avis"},
    {"car": "Ford F-150",       "class": "Pickup",        "seats": 5, "rate_per_day": 79.0,  "retail_per_day": 94.0,  "popularity": 6,  "emoji": "🛻", "vendor": "Budget"},
)

# Keep INVENTORY accessible for backward-compat imports
INVENTORY = _STATIC_INVENTORY


def slug(value: str) -> str:
    return value.lower().replace(" ", "-")


def _static_car(car_class: str) -> dict | None:
    return next((x for x in _STATIC_INVENTORY if x["class"].lower() == car_class.lower()), None)


def quote(car_class: str, days: int) -> dict[str, Any]:
    """Return pricing for a car class. Reads from Firestore vehicle_classes first, falls back to static."""
    days = max(1, days)

    # Try Firestore vehicle_classes
    try:
        from .firestore_db import get_vehicle_classes, class_label_to_id
        vc_data = get_vehicle_classes()
        class_id = class_label_to_id(car_class)
        vc = vc_data.get(class_id)
        if vc:
            rate = float(vc.get("costco_rate_per_day", 0))
            retail = float(vc.get("retail_rate_per_day", 0))
            # Find matching vendor from static data for confirmation number generation
            static = _static_car(car_class) or {}
            vendor = static.get("vendor", "Enterprise")
            return {
                "rate_per_day": rate,
                "retail_per_day": retail,
                "total": round(rate * days, 2),
                "retail_total": round(retail * days, 2),
                "member_savings": round((retail - rate) * days, 2),
                "vendor": vendor,
                "vendor_id": VENDOR_META.get(vendor, VENDOR_META["Enterprise"])["vendor_id"],
                "vehicle_class_id": class_id,
                "sipp_code": vc.get("sipp_code", SIPP_MAP.get(car_class, "ICAR")),
            }
    except Exception as exc:
        LOGGER.debug("Firestore vehicle_classes unavailable for quote: %s", exc)

    # Static fallback
    car = _static_car(car_class)
    if not car:
        raise ValueError(f"Unsupported car class: {car_class}")
    rate, retail = car["rate_per_day"], car["retail_per_day"]
    vendor = car.get("vendor", "Enterprise")
    return {
        "rate_per_day": rate,
        "retail_per_day": retail,
        "total": round(rate * days, 2),
        "retail_total": round(retail * days, 2),
        "member_savings": round((retail - rate) * days, 2),
        "vendor": vendor,
        "vendor_id": VENDOR_META.get(vendor, VENDOR_META["Enterprise"])["vendor_id"],
        "vehicle_class_id": slug(car_class),
        "sipp_code": SIPP_MAP.get(car_class, "ICAR"),
    }


def vendor_for_class(car_class: str) -> str:
    car = _static_car(car_class)
    return car.get("vendor", "Enterprise") if car else "Enterprise"


def _firestore_rank(*, days: int, party_size: int, location: str, budget_per_day: float | None) -> list[dict[str, Any]] | None:
    """Try to build ranked list from Firestore inventory for a location."""
    try:
        from .firestore_db import get_inventory_for_location
        items = get_inventory_for_location(location.upper())
        if not items:
            return None
        scored = []
        for item in items:
            if party_size > item.get("seats", 5):
                continue
            rate = float(item.get("rate_per_day", 0))
            if budget_per_day is not None and rate > budget_per_day:
                continue
            car_class = item.get("class", "")
            score = {"Intermediate": 10, "Full-Size": 8, "Standard SUV": 8, "Minivan": 7,
                     "Full-Size SUV": 7, "Economy": 6, "Compact": 7, "Pickup": 6,
                     "Luxury": 5, "Convertible": 5}.get(car_class, 5)
            if party_size >= 6 and car_class in {"Minivan", "Full-Size SUV"}: score += 3
            if days >= 7 and car_class in {"Intermediate", "Full-Size", "Standard SUV", "Full-Size SUV", "Minivan", "Luxury"}: score += 2
            if days <= 2 and car_class == "Economy": score += 2
            retail = float(item.get("retail_per_day", rate * 1.18))
            vendor = item.get("vendor", "Enterprise")
            scored.append((score, {
                "car": item.get("car", item.get("vehicle_model", "")),
                "class": car_class,
                "seats": item.get("seats", 5),
                "rate_per_day": rate,
                "retail_per_day": retail,
                "savings_per_day": round(retail - rate, 2),
                "est_total": round(rate * max(1, days), 2),
                "emoji": item.get("emoji", "🚙"),
                "image_url": item.get("image_url", ""),
                "vendor": vendor,
                "vendor_id": item.get("vendor_id", VENDOR_META.get(vendor, {}).get("vendor_id", "")),
                "vehicle_class_id": item.get("vehicle_class_id", slug(car_class)),
                "sipp_code": item.get("sipp_code", SIPP_MAP.get(car_class, "ICAR")),
                "vendor_meta": VENDOR_META.get(vendor, VENDOR_META["Enterprise"]),
                "location": location,
                "source": "firestore",
            }))
        if not scored:
            return None
        scored.sort(key=lambda x: (-x[0], x[1]["rate_per_day"], x[1]["car"]))
        result = [x[1] for x in scored]
        for i, item in enumerate(result):
            item.update(recommended=i == 0, reason="Recommended for your trip" if i == 0 else "Member rate with savings vs retail")
        return result
    except Exception as exc:
        LOGGER.warning("Firestore inventory rank failed for %s: %s", location, exc)
        return None


def rank_cars(*, days: int, party_size: int, location: str = "", budget_per_day: float | None = None) -> list[dict[str, Any]]:
    # Try Firestore inventory first when a location is specified
    if location:
        fs_result = _firestore_rank(days=days, party_size=party_size, location=location, budget_per_day=budget_per_day)
        if fs_result:
            return fs_result

    # Static fallback
    ranked = []
    for source in _STATIC_INVENTORY:
        if party_size > source["seats"] or (budget_per_day is not None and source["rate_per_day"] > budget_per_day):
            continue
        score = float({"Intermediate": 10, "Full-Size": 8, "Standard SUV": 8, "Minivan": 7,
                       "Full-Size SUV": 7, "Economy": 6, "Compact": 7, "Pickup": 6,
                       "Luxury": 5, "Convertible": 5}.get(source["class"], 5))
        if party_size >= 6 and source["class"] in {"Minivan", "Full-Size SUV"}: score += 3
        if days >= 7 and source["class"] in {"Intermediate", "Full-Size", "Standard SUV", "Full-Size SUV", "Minivan", "Luxury"}: score += 2
        if days <= 2 and source["class"] == "Economy": score += 2
        vendor = source.get("vendor", "Enterprise")
        item = dict(source)
        item.update(
            savings_per_day=round(source["retail_per_day"] - source["rate_per_day"], 2),
            est_total=round(source["rate_per_day"] * max(1, days), 2),
            location=location,
            sipp_code=SIPP_MAP.get(source["class"], "ICAR"),
            vendor_id=VENDOR_META.get(vendor, VENDOR_META["Enterprise"])["vendor_id"],
            vehicle_class_id=slug(source["class"]),
            vendor_meta=VENDOR_META.get(vendor, VENDOR_META["Enterprise"]),
            source="fallback",
        )
        item.pop("popularity", None)
        ranked.append((score, item))
    ranked.sort(key=lambda x: (-x[0], x[1]["rate_per_day"], x[1]["car"]))
    result = [x[1] for x in ranked]
    for i, item in enumerate(result):
        item.update(recommended=i == 0, reason="Recommended for your trip" if i == 0 else "Member rate with savings vs retail")
    return result
