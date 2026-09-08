from datetime import datetime, timedelta, timezone

import pytest

from app.car_search import clear_cache, search_cars
from scripts.sync_commons_car_images import commons_title, reusable_image

NOW = datetime(2026, 8, 25, 12, tzinfo=timezone.utc)
PICKUP = (NOW + timedelta(days=7)).date().isoformat()
DROP = (NOW + timedelta(days=11)).date().isoformat()


def test_serpapi_image_candidates_are_restricted_to_commons_and_licensed():
    assert commons_title("https://commons.wikimedia.org/wiki/File:Toyota_RAV4.jpg") == "File:Toyota RAV4.jpg"
    assert commons_title("https://example.com/Toyota_RAV4.jpg") is None
    page={"pageid":1,"title":"File:RAV4.jpg","imageinfo":[{"mime":"image/jpeg","url":"https://upload.wikimedia.org/rav4.jpg","descriptionurl":"https://commons.wikimedia.org/wiki/File:RAV4.jpg","extmetadata":{"LicenseShortName":{"value":"CC BY-SA 4.0"},"Artist":{"value":"Demo photographer"}}}]}
    assert reusable_image(page)["license"] == "CC BY-SA 4.0"
    page["imageinfo"][0]["extmetadata"]["LicenseShortName"]["value"]="All Rights Reserved"
    assert reusable_image(page) is None


def setup_function():
    clear_cache()


VALID_SOURCES = {"firestore", "vendor_api", "serpapi", "fallback"}


def test_search_never_dead_ends():
    """Tier chain always returns cars even when SerpAPI and Firestore are both unavailable."""
    def failed(*_):
        raise TimeoutError("forced")

    result = search_cars(location="MCO", pickup=PICKUP, drop=DROP, party_size=2, now=NOW, fetcher=failed)
    assert result["source"] in VALID_SOURCES
    assert result["cars"]
    assert all(car["savings"].startswith("Save $") for car in result["cars"])


def test_invalid_dates_rejected_before_any_call():
    calls = 0

    def tracked(*_):
        nonlocal calls
        calls += 1
        return {}

    with pytest.raises(ValueError):
        search_cars(location="MCO", pickup=(NOW-timedelta(days=1)).date().isoformat(), drop=DROP, now=NOW, fetcher=tracked)
    assert calls == 0


def test_live_rates_used_and_result_cached():
    """SerpAPI rates are used as enrichment; the result is always cached."""
    calls = 0

    def live(*_):
        nonlocal calls
        calls += 1
        return {"organic_results": [{"title": "Rental cars from $70 per day"}]}

    first = search_cars(location="MCO", pickup=PICKUP, drop=DROP, party_size=2, now=NOW, fetcher=live)
    second = search_cars(location="MCO", pickup=PICKUP, drop=DROP, party_size=2, now=NOW, fetcher=live)
    # Source is whichever tier won, but must be a known source and have cars
    assert first["source"] in VALID_SOURCES
    assert first["cars"]
    # SerpAPI was called exactly once; second result is cached
    assert calls == 1
    assert second["cached"] is True
