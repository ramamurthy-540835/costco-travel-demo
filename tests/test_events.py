from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import events
from app.main import app
from app.policies import utc_now
from app.reservations import MemoryRepository, ReservationService

SCHEMA_FIELDS = {"event_id", "session_id", "event_type", "event_timestamp", "pickup_location", "provider", "vehicle_class", "reservation_id", "member_tier", "amount", "latency_ms", "success", "metadata"}
FORBIDDEN_FRAGMENTS = ("email", "phone", "name", "password", "payload", "member_number")


@pytest.fixture
def captured(monkeypatch):
    rows = []
    monkeypatch.setenv("BQ_ENABLED", "true")
    monkeypatch.setattr(events, "_insert", rows.append)
    return rows


def reservation_input(days_out: int = 21):
    pickup = utc_now() + timedelta(days=days_out)
    return {"car_class": "Intermediate", "location_code": "mco", "pickup_at": pickup.isoformat(), "drop_at": (pickup + timedelta(days=4)).isoformat(), "pickup_time": None, "drop_time": None}


def test_disabled_writer_emits_nothing(monkeypatch):
    rows = []
    monkeypatch.setenv("BQ_ENABLED", "false")
    monkeypatch.setattr(events, "_insert", rows.append)
    assert events.emit("rental_search") is False
    assert rows == []


def test_rows_match_conversation_events_schema_and_stay_pii_free(captured):
    service = ReservationService(MemoryRepository())
    created = service.create(reservation_input())
    assert [row["event_type"] for row in captured] == ["reservation_created"]
    row = captured[0]
    assert set(row) == SCHEMA_FIELDS
    assert row["reservation_id"] == created["id"]
    assert row["pickup_location"] == "MCO"
    assert row["vehicle_class"] == "Intermediate"
    assert row["amount"] == created["total"]
    assert row["success"] is True
    assert not any(fragment in key for key in row for fragment in FORBIDDEN_FRAGMENTS)


def test_change_flow_emits_started_then_modified(captured):
    service = ReservationService(MemoryRepository())
    created = service.create(reservation_input())
    service.start_change(created["id"])
    service.confirm_change(created["id"])
    assert [row["event_type"] for row in captured] == ["reservation_created", "change_started", "reservation_modified"]


def test_cancel_emits_reservation_cancelled(captured):
    service = ReservationService(MemoryRepository())
    created = service.create(reservation_input())
    service.cancel_confirm(created["id"])
    assert [row["event_type"] for row in captured] == ["reservation_created", "reservation_cancelled"]
    assert captured[-1]["reservation_id"] == created["id"]


def test_cars_endpoint_emits_rental_search(captured):
    with TestClient(app) as client:
        assert client.get("/api/cars", params={"days": 3, "location": "mco"}).status_code == 200
    searches = [row for row in captured if row["event_type"] == "rental_search"]
    assert len(searches) == 1
    assert searches[0]["pickup_location"] == "MCO"
    assert searches[0]["success"] is True
    assert isinstance(searches[0]["latency_ms"], int)


def test_insert_failure_is_counted_not_raised(monkeypatch):
    monkeypatch.setenv("BQ_ENABLED", "true")

    def boom(_row):
        raise RuntimeError("stream unavailable")

    monkeypatch.setattr(events, "_insert", boom)
    before = events.failure_count()
    assert events.emit("rental_search") is False
    assert events.failure_count() == before + 1
