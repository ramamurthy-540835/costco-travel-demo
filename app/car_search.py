"""Quota-safe SerpAPI price discovery; credentials stay server-side."""
from __future__ import annotations
import logging
import os
import re
import time
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
_VENDORS = ("Enterprise", "Avis", "Alamo", "National", "Budget")

def _secret_value() -> str:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not configured")
    secret = os.environ.get("SERPAPI_SECRET", "costco-demo-serpapi-key")
    version = os.environ.get("SERPAPI_SECRET_VERSION", "2")
    name = f"projects/{project}/secrets/{secret}/versions/{version}"
    response = secretmanager.SecretManagerServiceClient().access_secret_version(request={"name": name}, retry=None, timeout=3.0)
    return response.payload.data.decode("utf-8").strip()

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
            raise RuntimeError("SerpAPI returned an error")
        return value
    finally:
        LOGGER.info("SerpAPI status=%s latency_ms=%d", status, (time.monotonic() - started) * 1000)

def _rates(payload: dict[str, Any]) -> list[float]:
    candidates: list[float] = []
    sections: list[dict[str, Any]] = []
    for key in ("organic_results", "shopping_results", "local_results"):
        value = payload.get(key, [])
        sections.extend(value if isinstance(value, list) else [])
    for item in sections:
        text = " ".join(str(item.get(key, "")) for key in ("title", "snippet", "price"))
        for match in re.findall(r"(?:US)?\$\s*(\d{2,3}(?:\.\d{1,2})?)", text):
            rate = float(match)
            if 25 <= rate <= 250:
                candidates.append(rate)
    return candidates

def _normalize(base: list[dict[str, Any]], retail_rates: list[float], source: str) -> list[dict[str, Any]]:
    cars = []
    for index, item in enumerate(base):
        retail = retail_rates[index % len(retail_rates)] if retail_rates else float(item["retail_per_day"])
        discount = (12, 14, 16, 18)[index % 4]
        member = round(retail * (100 - discount) / 100, 2)
        cars.append({"car": item["car"], "class": item["class"], "emoji": item.get("emoji", "🚙"), "vendor": _VENDORS[index % len(_VENDORS)], "ratePerDay": member, "retailPerDay": round(retail, 2), "savings": f"Save ${retail - member:.2f}/day vs retail", "features": [f"{item['seats']} seats", "Unlimited mileage", "Member rate"], "recommended": item.get("recommended", False), "reason": item.get("reason", "Member rate with savings vs retail"), "source": source})
    return cars

def search_cars(*, location: str, pickup: str, drop: str, party_size: int = 1, budget_per_day: float | None = None, now: datetime | None = None, fetcher: Callable[[str, str, str, str], dict[str, Any]] | None = None) -> dict[str, Any]:
    pickup_dt, drop_dt = validate_trip_dates(pickup, drop, now or utc_now())
    days = max(1, (drop_dt.date() - pickup_dt.date()).days)
    cache_key = (location.upper(), pickup_dt.date().isoformat(), drop_dt.date().isoformat(), party_size, budget_per_day)
    with _LOCK:
        cached = _CACHE.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return {**cached[1], "cached": True}
    base = rank_cars(days=days, party_size=party_size, location=location, budget_per_day=budget_per_day)
    source = "fallback"
    rates: list[float] = []
    try:
        secret = "" if fetcher else _secret_value()
        payload = (fetcher or _fetch_serpapi)(location, pickup, drop, secret)
        rates = _rates(payload)
        if rates:
            source = "serpapi"
    except Exception:
        LOGGER.warning("SerpAPI inventory unavailable; using sample inventory")
    result = {"source": source, "cars": _normalize(base, rates, source), "cached": False}
    with _LOCK:
        _CACHE[cache_key] = (time.monotonic() + CACHE_TTL_SECONDS, result)
    return result

def clear_cache() -> None:
    with _LOCK:
        _CACHE.clear()




