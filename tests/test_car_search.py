from datetime import datetime, timedelta, timezone

import pytest

from app.car_search import clear_cache, search_cars

NOW = datetime(2026, 8, 25, 12, tzinfo=timezone.utc)
PICKUP = (NOW + timedelta(days=7)).date().isoformat()
DROP = (NOW + timedelta(days=11)).date().isoformat()


def setup_function():
    clear_cache()


def test_serpapi_fallback_never_dead_ends():
    def failed(*_):
        raise TimeoutError("forced")

    result = search_cars(location="MCO", pickup=PICKUP, drop=DROP, party_size=2, now=NOW, fetcher=failed)
    assert result["source"] == "fallback"
    assert result["cars"] and all(car["savings"].startswith("Save $") for car in result["cars"])


def test_invalid_dates_rejected_before_serpapi_call():
    calls = 0

    def tracked(*_):
        nonlocal calls
        calls += 1
        return {}

    with pytest.raises(ValueError):
        search_cars(location="MCO", pickup=(NOW-timedelta(days=1)).date().isoformat(), drop=DROP, now=NOW, fetcher=tracked)
    assert calls == 0


def test_live_rates_are_normalized_and_cached():
    calls = 0

    def live(*_):
        nonlocal calls
        calls += 1
        return {"organic_results": [{"title": "Rental cars from $70 per day"}]}

    first = search_cars(location="MCO", pickup=PICKUP, drop=DROP, party_size=2, now=NOW, fetcher=live)
    second = search_cars(location="MCO", pickup=PICKUP, drop=DROP, party_size=2, now=NOW, fetcher=live)
    assert first["source"] == "serpapi" and first["cars"][0]["retailPerDay"] == 70
    assert second["cached"] is True and calls == 1
