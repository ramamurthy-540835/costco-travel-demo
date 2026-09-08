"""Simulated vendor GDS adapter — mirrors real rental-industry API response shapes.

Priority chain used by car_search.py:
  1. Firestore inventory (costco-demo) + contract discount  ← primary
  2. This module (vendor simulation)                        ← secondary / enrichment
  3. SerpAPI web scrape                                     ← tertiary rate signal
  4. Static fallback                                        ← always-available floor

Each vendor adapter returns GDS-style availability payloads with SIPP codes,
taxes, surcharges, and Costco contract rate codes — the same fields a real
Sabre/Amadeus/Travelport connection would return.
"""
from __future__ import annotations
import logging, time
from dataclasses import dataclass, field
from typing import Any

LOGGER = logging.getLogger("costco-travel-demo.vendor_api")

# ── Contract constants ────────────────────────────────────────────────────────
COSTCO_CONTRACT = "COSTCO-CMR-2024"
COSTCO_PERKS = ["free_additional_driver", "unlimited_mileage", "young_driver_waived", "free_cancellation_48h"]

# Airport/location surcharges by code (realistic US airport fee structure)
AIRPORT_SURCHARGES: dict[str, float] = {
    "LAX": 11.11, "MCO": 6.50, "LAS": 10.00,
    "SEA": 8.75,  "DEN": 7.20, "JFK": 13.50,
}

# Vendor-specific metadata — mirrors real GDS vendor codes and API versioning
VENDOR_PROFILES: dict[str, dict] = {
    "Enterprise": {
        "vendor_id": "VND-ENT", "gds_code": "ET", "conf_prefix": "EZ", "conf_len": 7,
        "api_version": "EZ-API v4", "api_host": "api.enterprise.com",
        "response_time_ms": (120, 280),   # (min, max) simulated latency band
        "tax_rate_pct": 12.5,
        "surcharge_multiplier": 1.08,
    },
    "Avis": {
        "vendor_id": "VND-AVS", "gds_code": "ZI", "conf_prefix": "AW", "conf_len": 8,
        "api_version": "AV-API v3", "api_host": "api.avis.com",
        "response_time_ms": (95, 210),
        "tax_rate_pct": 11.9,
        "surcharge_multiplier": 1.07,
    },
    "Alamo": {
        "vendor_id": "VND-ALM", "gds_code": "AL", "conf_prefix": "AL", "conf_len": 7,
        "api_version": "AL-API v3", "api_host": "api.alamo.com",
        "response_time_ms": (80, 190),
        "tax_rate_pct": 12.0,
        "surcharge_multiplier": 1.06,
    },
    "National": {
        "vendor_id": "VND-NAT", "gds_code": "ZL", "conf_prefix": "NC", "conf_len": 7,
        "api_version": "NC-API v2", "api_host": "api.nationalcar.com",
        "response_time_ms": (110, 250),
        "tax_rate_pct": 12.2,
        "surcharge_multiplier": 1.09,
    },
    "Budget": {
        "vendor_id": "VND-BDG", "gds_code": "ZD", "conf_prefix": "BU", "conf_len": 8,
        "api_version": "BU-API v2", "api_host": "api.budget.com",
        "response_time_ms": (75, 170),
        "tax_rate_pct": 11.5,
        "surcharge_multiplier": 1.05,
    },
}

# Class → SIPP mapping + default retail/member rates per vendor tier
# Rates are per-day in USD, reflecting real-world order-of-magnitude pricing
VEHICLE_CLASSES: list[dict] = [
    {"class": "Economy",      "sipp": "ECAR", "seats": 5, "retail": 43.0,  "member": 36.0,  "luggage": "1L+1S", "example": "Nissan Versa"},
    {"class": "Compact",      "sipp": "CCAR", "seats": 5, "retail": 49.0,  "member": 41.0,  "luggage": "1L+2S", "example": "Kia Soul"},
    {"class": "Intermediate", "sipp": "ICAR", "seats": 5, "retail": 55.0,  "member": 47.0,  "luggage": "2L",    "example": "Toyota Camry"},
    {"class": "Full-Size",    "sipp": "FCAR", "seats": 5, "retail": 64.0,  "member": 54.0,  "luggage": "2L+1S", "example": "Chevrolet Malibu"},
    {"class": "Standard SUV", "sipp": "SFAR", "seats": 5, "retail": 74.0,  "member": 63.0,  "luggage": "2L+2S", "example": "Toyota RAV4"},
    {"class": "Minivan",      "sipp": "MVAR", "seats": 7, "retail": 82.0,  "member": 69.0,  "luggage": "3L+2S", "example": "Chrysler Pacifica"},
    {"class": "Full-Size SUV","sipp": "FFAR", "seats": 7, "retail": 101.0, "member": 86.0,  "luggage": "4L",    "example": "Chevrolet Tahoe"},
    {"class": "Luxury",       "sipp": "LCAR", "seats": 5, "retail": 124.0, "member": 104.0, "luggage": "2L",    "example": "BMW 5 Series"},
    {"class": "Convertible",  "sipp": "PPAR", "seats": 4, "retail": 109.0, "member": 92.0,  "luggage": "1L",    "example": "Ford Mustang"},
    {"class": "Pickup",       "sipp": "PFAR", "seats": 5, "retail": 94.0,  "member": 79.0,  "luggage": "bed",   "example": "Ford F-150"},
]


@dataclass
class VendorAvailability:
    vendor: str
    vendor_id: str
    gds_code: str
    api_version: str
    location_code: str
    pickup_date: str
    return_date: str
    days: int
    cars: list[dict]
    latency_ms: int
    source: str = "vendor_api"
    contract_code: str = COSTCO_CONTRACT

    def to_dict(self) -> dict[str, Any]:
        return {
            "vendor": self.vendor,
            "vendor_id": self.vendor_id,
            "gds_code": self.gds_code,
            "api_version": self.api_version,
            "location_code": self.location_code,
            "pickup_date": self.pickup_date,
            "return_date": self.return_date,
            "days": self.days,
            "contract_code": self.contract_code,
            "costco_perks": COSTCO_PERKS,
            "cars": self.cars,
            "latency_ms": self.latency_ms,
            "source": self.source,
        }


def _build_car_payload(
    vc: dict,
    vendor: str,
    profile: dict,
    location_code: str,
    days: int,
    live_retail: float | None = None,
) -> dict[str, Any]:
    """Build a single GDS-style car availability record."""
    retail = live_retail if live_retail and 25 <= live_retail <= 300 else vc["retail"]
    # Costco negotiated discount: fixed member rate from contract
    member = vc["member"]
    airport_fee = AIRPORT_SURCHARGES.get(location_code.upper(), 5.50)
    tax_rate = profile["tax_rate_pct"] / 100
    # Per-day taxes & surcharges (on retail, before Costco discount)
    taxes = [
        {"type": "airport_concession_fee", "amount": round(airport_fee, 2)},
        {"type": "vehicle_license_fee",    "amount": 2.00},
        {"type": "state_sales_tax",        "amount": round(retail * 0.065, 2)},
        {"type": "tourism_surcharge",      "amount": 1.25},
    ]
    tax_total_per_day = sum(t["amount"] for t in taxes)
    return {
        # Vehicle
        "sipp_code": vc["sipp"],
        "class": vc["class"],
        "example_model": vc["example"],
        "seats": vc["seats"],
        "luggage_capacity": vc["luggage"],
        # Rates (all per-day, USD)
        "rates": {
            "retail_per_day": round(retail, 2),
            "costco_member_per_day": round(member, 2),
            "taxes_and_fees_per_day": round(tax_total_per_day, 2),
            "tax_breakdown": taxes,
            "estimated_total_member": round((member + tax_total_per_day) * days, 2),
            "estimated_total_retail": round((retail + tax_total_per_day) * days, 2),
            "currency": "USD",
        },
        "costco_savings_per_day": round(retail - member, 2),
        "costco_savings_total": round((retail - member) * days, 2),
        "rate_code": COSTCO_CONTRACT,
        "costco_negotiated": True,
        "perks": COSTCO_PERKS,
        "availability": "available",
        "units_available": max(1, (hash(f"{vendor}{vc['sipp']}{location_code}") % 8) + 2),
    }


def search_vendor(
    vendor_name: str,
    location_code: str,
    pickup_date: str,
    return_date: str,
    days: int,
    *,
    live_rates: dict[str, float] | None = None,
    party_size: int = 1,
    budget_per_day: float | None = None,
) -> VendorAvailability | None:
    """Simulate a GDS availability + rate request to a single vendor.

    live_rates: optional {sipp_code: retail_rate} from SerpAPI or Firestore,
                used to override the static retail rate for realism.
    """
    profile = VENDOR_PROFILES.get(vendor_name)
    if not profile:
        return None

    started = time.monotonic()

    cars = []
    for vc in VEHICLE_CLASSES:
        if party_size > vc["seats"]:
            continue
        if budget_per_day is not None and vc["member"] > budget_per_day:
            continue
        live_retail = live_rates.get(vc["sipp"]) if live_rates else None
        car = _build_car_payload(vc, vendor_name, profile, location_code, days, live_retail)
        cars.append(car)

    latency_ms = int((time.monotonic() - started) * 1000)

    return VendorAvailability(
        vendor=vendor_name,
        vendor_id=profile["vendor_id"],
        gds_code=profile["gds_code"],
        api_version=profile["api_version"],
        location_code=location_code.upper(),
        pickup_date=pickup_date,
        return_date=return_date,
        days=days,
        cars=cars,
        latency_ms=latency_ms,
    )


def search_all_vendors(
    location_code: str,
    pickup_date: str,
    return_date: str,
    days: int,
    *,
    live_rates: dict[str, float] | None = None,
    party_size: int = 1,
    budget_per_day: float | None = None,
) -> list[VendorAvailability]:
    """Query all Costco-partner vendors in parallel (simulated) and return results."""
    results = []
    for vendor_name in VENDOR_PROFILES:
        result = search_vendor(
            vendor_name, location_code, pickup_date, return_date, days,
            live_rates=live_rates, party_size=party_size, budget_per_day=budget_per_day,
        )
        if result:
            results.append(result)
    LOGGER.info("Vendor search: %d vendors responded for %s %s→%s", len(results), location_code, pickup_date, return_date)
    return results


def best_per_class(
    vendor_results: list[VendorAvailability],
) -> list[dict[str, Any]]:
    """Return the best (lowest member rate) offer per SIPP class across all vendors,
    with vendor name attached — mirrors how Costco Travel presents results."""
    by_class: dict[str, dict] = {}
    for vr in vendor_results:
        for car in vr.cars:
            sipp = car["sipp_code"]
            rate = car["rates"]["costco_member_per_day"]
            if sipp not in by_class or rate < by_class[sipp]["rates"]["costco_member_per_day"]:
                by_class[sipp] = {**car, "vendor": vr.vendor, "vendor_id": vr.vendor_id, "gds_code": vr.gds_code}
    return list(by_class.values())


def normalize_for_frontend(
    vendor_results: list[VendorAvailability],
    location: str,
    days: int,
) -> list[dict[str, Any]]:
    """Convert vendor GDS payloads into the flat list the /api/cars frontend expects."""
    from .recommend import VENDOR_META, SIPP_MAP
    try:
        from .firestore_db import get_vehicle_classes
        vc_images = {d["sipp_code"]: d.get("image_url", "") for d in get_vehicle_classes().values() if d.get("sipp_code")}
    except Exception:
        vc_images = {}

    best = best_per_class(vendor_results)
    # Sort: bigger party classes first, then by member rate
    popularity = {"ICAR": 10, "FCAR": 8, "SFAR": 8, "MVAR": 7, "FFAR": 7,
                  "CCAR": 7, "ECAR": 6, "PFAR": 6, "LCAR": 5, "PPAR": 5}
    best.sort(key=lambda c: (-popularity.get(c["sipp_code"], 5), c["rates"]["costco_member_per_day"]))

    result = []
    for i, car in enumerate(best):
        r = car["rates"]
        vendor = car.get("vendor", "Enterprise")
        vm = VENDOR_META.get(vendor, VENDOR_META["Enterprise"])
        result.append({
            "car": car["example_model"],
            "class": car["class"],
            "sipp_code": car["sipp_code"],
            "vendor": vendor,
            "vendor_id": car.get("vendor_id", vm["vendor_id"]),
            "seats": car["seats"],
            "ratePerDay": r["costco_member_per_day"],
            "retailPerDay": r["retail_per_day"],
            "taxesPerDay": r["taxes_and_fees_per_day"],
            "estimatedTotal": r["estimated_total_member"],
            "savings": f"Save ${car['costco_savings_per_day']:.2f}/day vs retail",
            "savingsTotal": car["costco_savings_total"],
            "features": [
                f"{car['seats']} seats",
                "Unlimited mileage",
                "Free additional driver",
                f"Luggage: {car['luggage_capacity']}",
            ],
            "perks": car["perks"],
            "recommended": i == 0,
            "reason": "Recommended for your trip" if i == 0 else "Member rate with savings vs retail",
            "image_url": vc_images.get(car["sipp_code"], ""),
            "location": location,
            "source": "vendor_api",
            "contract": COSTCO_CONTRACT,
            "rate_per_day": r["costco_member_per_day"],
            "retail_per_day": r["retail_per_day"],
        })
    return result
