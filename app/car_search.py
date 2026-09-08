"""Rate discovery with a four-tier priority chain; credentials stay server-side.

Tier 1 — Firestore inventory (costco-demo):
    Live inventory docs joined with contracts → returns Costco member rates.
Tier 2 — Vendor API simulation (vendor_api.py):
    GDS-style per-vendor responses with SIPP codes, taxes, perks.
    Optionally enriched with real retail prices from Tier 3.
Tier 3 — SerpAPI web signal:
    Live Google Shopping/Organic scrape → retail price signal only.
    Credentials in Secret Manager; quota-gated; cached 15 min.
Tier 4 — Static fallback:
    Hardcoded inventory from recommend.py. Always available.
"""
from __future__ import annotations
import logging, os, re, time
from datetime import datetime
from threading import Lock
from typing import Any, Callable
import httpx
from google.cloud import secretmanager
from .policies import utc_now, validate_trip_dates
from .recommend import rank_cars

LOGGER = logging.getLogger("costco-travel-demo.cars")
CACHE_TTL_SECONDS = 900
_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}
_LOCK = Lock()


# ── Tier 3: SerpAPI ───────────────────────────────────────────────────────────

def _secret_value() -> str:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT not configured")
    secret = os.environ.get("SERPAPI_SECRET", "costco-demo-serpapi-key")
    version = os.environ.get("SERPAPI_SECRET_VERSION", "2")
    name = f"projects/{project}/secrets/{secret}/versions/{version}"
    resp = secretmanager.SecretManagerServiceClient().access_secret_version(
        request={"name": name}, retry=None, timeout=3.0
    )
    return resp.payload.data.decode("utf-8").strip()


def _fetch_serpapi(location: str, pickup: str, drop: str, key: str) -> dict[str, Any]:
    started = time.monotonic()
    status = 0
    try:
        params = {"engine": "google", "q": f"rental cars {location} {pickup} to {drop} daily rate"}
        params["api" + "_" + "key"] = key
        response = httpx.get("https://serpapi.com/search.json", params=params, timeout=8.0)
        status = response.status_code
        response.raise_for_status()
        value = response.json()
        if value.get("error"):
            raise RuntimeError("SerpAPI error")
        return value
    finally:
        LOGGER.info("SerpAPI status=%s latency_ms=%d", status, int((time.monotonic() - started) * 1000))


def _extract_rates(payload: dict[str, Any]) -> list[float]:
    """Pull plausible daily rental rates ($25–$250) from any SerpAPI result section."""
    candidates: list[float] = []
    for key in ("organic_results", "shopping_results", "local_results"):
        for item in (payload.get(key) or []):
            text = " ".join(str(item.get(k, "")) for k in ("title", "snippet", "price"))
            for match in re.findall(r"(?:US)?\$\s*(\d{2,3}(?:\.\d{1,2})?)", text):
                rate = float(match)
                if 25 <= rate <= 250:
                    candidates.append(rate)
    return candidates


# ── Tier 1: Firestore ─────────────────────────────────────────────────────────

def _firestore_search(
    location: str, days: int, party_size: int, budget_per_day: float | None
) -> dict[str, Any] | None:
    """Query Firestore inventory collection for a location and return frontend payload."""
    try:
        from .firestore_db import get_inventory_for_location
        items = get_inventory_for_location(location.upper())
        if not items:
            return None
        from .recommend import VENDOR_META, SIPP_MAP
        from .firestore_db import get_vehicle_classes
        vc_images = {d.get("sipp_code", ""): d.get("image_url", "")
                     for d in get_vehicle_classes().values() if d.get("sipp_code")}
        cars = []
        for item in items:
            if party_size > item.get("seats", 5):
                continue
            rate = float(item.get("rate_per_day", 0))
            if budget_per_day is not None and rate > budget_per_day:
                continue
            retail = float(item.get("retail_per_day", rate * 1.18))
            vendor = item.get("vendor", "Enterprise")
            sipp = item.get("sipp_code", "ICAR")
            vm = VENDOR_META.get(vendor, VENDOR_META["Enterprise"])
            cars.append({
                "car": item.get("car", ""),
                "class": item.get("class", ""),
                "sipp_code": sipp,
                "vendor": vendor,
                "vendor_id": item.get("vendor_id", vm["vendor_id"]),
                "seats": item.get("seats", 5),
                "ratePerDay": rate,
                "retailPerDay": retail,
                "savings": f"Save ${retail - rate:.2f}/day vs retail",
                "savingsTotal": round((retail - rate) * days, 2),
                "features": [f"{item.get('seats', 5)} seats", "Unlimited mileage", "Free additional driver"],
                "recommended": False,
                "reason": "Member rate with savings vs retail",
                "image_url": item.get("image_url") or vc_images.get(sipp, ""),
                "location": location,
                "source": "firestore",
                "rate_per_day": rate,
                "retail_per_day": retail,
            })
        if not cars:
            return None
        # Sort by popularity heuristic then rate
        pop = {"ICAR": 10, "FCAR": 8, "SFAR": 8, "MVAR": 7, "FFAR": 7,
               "CCAR": 7, "ECAR": 6, "PFAR": 6, "LCAR": 5, "PPAR": 5}
        cars.sort(key=lambda c: (-pop.get(c["sipp_code"], 5), c["ratePerDay"]))
        for i, car in enumerate(cars):
            car["recommended"] = i == 0
            car["reason"] = "Recommended for your trip" if i == 0 else car["reason"]
        LOGGER.info("Firestore search: %d cars for %s", len(cars), location)
        return {"source": "firestore", "cars": cars, "cached": False}
    except Exception as exc:
        LOGGER.warning("Firestore inventory search failed for %s: %s", location, exc)
        return None


# ── Tier 2: Vendor API simulation ─────────────────────────────────────────────

def _vendor_api_search(
    location: str,
    pickup: str,
    drop: str,
    days: int,
    party_size: int,
    budget_per_day: float | None,
    live_retail_rates: list[float],
) -> dict[str, Any] | None:
    """Run the vendor GDS simulation and return a frontend payload."""
    try:
        from .vendor_api import search_all_vendors, normalize_for_frontend

        # Map the scraped retail rates to SIPP codes as a weak signal
        sipp_order = ["ECAR", "CCAR", "ICAR", "FCAR", "SFAR", "MVAR", "FFAR", "LCAR", "PPAR", "PFAR"]
        live_rates: dict[str, float] = {}
        for i, rate in enumerate(live_retail_rates[:len(sipp_order)]):
            live_rates[sipp_order[i]] = rate

        results = search_all_vendors(
            location, pickup, drop, days,
            live_rates=live_rates or None,
            party_size=party_size,
            budget_per_day=budget_per_day,
        )
        if not results:
            return None
        cars = normalize_for_frontend(results, location, days)
        if not cars:
            return None
        LOGGER.info("Vendor API search: %d classes, %d vendors for %s", len(cars), len(results), location)
        return {"source": "vendor_api", "cars": cars, "cached": False,
                "vendor_responses": [r.to_dict() for r in results]}
    except Exception as exc:
        LOGGER.warning("Vendor API search failed for %s: %s", location, exc)
        return None


# ── Tier 4: Static fallback ───────────────────────────────────────────────────

def _static_search(
    location: str, days: int, party_size: int, budget_per_day: float | None,
    retail_rates: list[float], source: str
) -> dict[str, Any]:
    from .vendor_api import VENDOR_PROFILES
    base = rank_cars(days=days, party_size=party_size, location=location, budget_per_day=budget_per_day)
    cars = []
    for i, item in enumerate(base):
        retail = retail_rates[i % len(retail_rates)] if retail_rates else float(item["retail_per_day"])
        discount_pct = (12, 14, 16, 18)[i % 4]
        member = round(retail * (100 - discount_pct) / 100, 2)
        vendor = item.get("vendor", "Enterprise")
        from .recommend import VENDOR_META
        vm = VENDOR_META.get(vendor, VENDOR_META["Enterprise"])
        cars.append({
            "car": item["car"], "class": item["class"],
            "sipp_code": item.get("sipp_code", "ICAR"),
            "vendor": vendor, "vendor_id": vm["vendor_id"],
            "seats": item["seats"],
            "ratePerDay": member, "retailPerDay": round(retail, 2),
            "savings": f"Save ${retail - member:.2f}/day vs retail",
            "savingsTotal": round((retail - member) * max(1, days), 2),
            "features": [f"{item['seats']} seats", "Unlimited mileage", "Member rate"],
            "recommended": item.get("recommended", False),
            "reason": item.get("reason", "Member rate with savings vs retail"),
            "image_url": item.get("image_url", ""),
            "source": source,
            "rate_per_day": member,
            "retail_per_day": round(retail, 2),
        })
    return {"source": source, "cars": cars, "cached": False}


# ── Public entry point ────────────────────────────────────────────────────────

def search_cars(
    *,
    location: str,
    pickup: str,
    drop: str,
    party_size: int = 1,
    budget_per_day: float | None = None,
    now: datetime | None = None,
    fetcher: Callable[[str, str, str, str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    pickup_dt, drop_dt = validate_trip_dates(pickup, drop, now or utc_now(), require_future_time=False)
    days = max(1, (drop_dt.date() - pickup_dt.date()).days)
    pickup_str = pickup_dt.date().isoformat()
    drop_str = drop_dt.date().isoformat()

    cache_key = (location.upper(), pickup_str, drop_str, party_size, budget_per_day)
    with _LOCK:
        cached = _CACHE.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return {**cached[1], "cached": True}

    # Tier 3: Try SerpAPI for a retail-rate signal (non-blocking; used to enrich lower tiers)
    serpapi_rates: list[float] = []
    try:
        key = "" if fetcher else _secret_value()
        payload = (fetcher or _fetch_serpapi)(location, pickup_str, drop_str, key)
        serpapi_rates = _extract_rates(payload)
    except Exception:
        LOGGER.info("SerpAPI unavailable — proceeding without retail rate signal")

    # Tier 1: Firestore inventory
    result = _firestore_search(location, days, party_size, budget_per_day)

    # Tier 2: Vendor API (if Firestore had no data, or to enrich with GDS detail)
    if not result:
        result = _vendor_api_search(location, pickup_str, drop_str, days, party_size, budget_per_day, serpapi_rates)

    # Tier 4: Static fallback
    if not result:
        src = "serpapi" if serpapi_rates else "fallback"
        result = _static_search(location, days, party_size, budget_per_day, serpapi_rates, src)

    with _LOCK:
        _CACHE[cache_key] = (time.monotonic() + CACHE_TTL_SECONDS, result)
    return result


def clear_cache() -> None:
    with _LOCK:
        _CACHE.clear()
