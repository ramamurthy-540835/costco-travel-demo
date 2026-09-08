import pytest
from fastapi.testclient import TestClient

from app import analytics
from app.main import app

FRONTEND_METRIC_KEYS={"search_completion_rate","booking_conversion_rate","average_conversation_minutes","account_creation_rate","modification_success_rate","customer_satisfaction_score"}


@pytest.fixture(autouse=True)
def reset_cache():
    analytics.clear_cache()
    yield
    analytics.clear_cache()


def test_analytics_disabled_serves_static_snapshot(monkeypatch):
    monkeypatch.setenv("BQ_ENABLED", "false")
    with TestClient(app) as client:
        data = client.get("/api/analytics").json()
    assert data["demo_data"] is True
    assert data["source"] == "static"
    assert FRONTEND_METRIC_KEYS <= set(data["metrics"])
    assert data["bookings_by_provider"] and data["most_booked_locations"]


def test_analytics_enabled_serves_bigquery_rows(monkeypatch):
    monkeypatch.setenv("BQ_ENABLED", "true")
    live = analytics.static_snapshot()
    live.update(demo_data=False, source="bigquery")
    live["metrics"]["booking_conversion_rate"] = 21.5
    live["bookings_by_provider"] = [{"provider": "Avis", "bookings": 3}]
    monkeypatch.setattr(analytics, "_load_bigquery", lambda: live)
    with TestClient(app) as client:
        data = client.get("/api/analytics").json()
    assert data["demo_data"] is False
    assert data["source"] == "bigquery"
    assert data["metrics"]["booking_conversion_rate"] == 21.5
    assert data["bookings_by_provider"] == [{"provider": "Avis", "bookings": 3}]


def test_analytics_falls_back_when_bigquery_unavailable(monkeypatch):
    monkeypatch.setenv("BQ_ENABLED", "true")
    monkeypatch.setattr(analytics, "_load_bigquery", lambda: None)
    with TestClient(app) as client:
        data = client.get("/api/analytics").json()
    assert data["demo_data"] is True
    assert data["source"] == "static"
    assert FRONTEND_METRIC_KEYS <= set(data["metrics"])


def test_analytics_caches_live_result(monkeypatch):
    monkeypatch.setenv("BQ_ENABLED", "true")
    calls = []

    def loader():
        calls.append(1)
        live = analytics.static_snapshot()
        live.update(demo_data=False, source="bigquery")
        return live

    monkeypatch.setattr(analytics, "_load_bigquery", loader)
    with TestClient(app) as client:
        client.get("/api/analytics")
        client.get("/api/analytics")
    assert len(calls) == 1
