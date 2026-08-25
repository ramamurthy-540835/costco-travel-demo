from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app, reservation_service
from app.policies import utc_now
from app.recommend import quote
from app.reservations import MemoryRepository, ReservationService


def demo_reservation(identity: str, days_out: int = 21):
    now = utc_now()
    pickup = now + timedelta(days=days_out)
    return {
        "id": identity,
        "status": "CONFIRMED",
        "car_class": "Intermediate",
        "location_code": "MCO",
        "pickup_at": pickup.isoformat(),
        "drop_at": (pickup + timedelta(days=4)).isoformat(),
        "days": 4,
        **quote("Intermediate", 4),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("RESERVATION_BACKEND", "memory")
    service = ReservationService(MemoryRepository([demo_reservation("CTR-APIFAR1")]))
    app.dependency_overrides[reservation_service] = lambda: service
    with TestClient(app) as client:
        yield client, service
    app.dependency_overrides.clear()


def test_http_create_rejects_previous_day(api):
    client, _ = api
    now = utc_now()
    response = client.post("/api/reservations", json={"car_class":"Intermediate","location_code":"MCO","pickup_at":(now-timedelta(days=1)).isoformat(),"drop_at":(now+timedelta(days=2)).isoformat()})
    assert response.status_code == 422

def test_http_create_allows_future_time_today(api):
    client, _ = api
    now = utc_now()
    response = client.post("/api/reservations", json={"car_class":"Intermediate","location_code":"MCO","pickup_at":(now+timedelta(hours=2)).isoformat(),"drop_at":(now+timedelta(days=1,hours=2)).isoformat()})
    assert response.status_code == 201
    assert response.json()["status"] == "CONFIRMED"


def test_http_change_rejects_previous_day(api):
    client, service = api
    started = client.post("/api/reservations/CTR-APIFAR1/change/start")
    assert started.status_code == 200
    pending = started.json()["replacement"]
    now = utc_now()
    response = client.post("/api/reservations/CTR-APIFAR1/change/update", json={"pickup_at":(now-timedelta(days=1)).isoformat()})
    assert response.status_code == 422
    assert service.get(pending["id"])["status"] == "PENDING"


def test_http_change_completes_replacement_first(api):
    client, service = api
    started = client.post("/api/reservations/CTR-APIFAR1/change/start").json()
    replacement = started["replacement"]["id"]
    updated = client.post("/api/reservations/CTR-APIFAR1/change/update", json={"car_class":"Full-Size"})
    assert updated.status_code == 200
    completed = client.post("/api/reservations/CTR-APIFAR1/change/confirm").json()
    assert completed["replacement"]["status"] == "CONFIRMED"
    assert completed["original"]["status"] == "CANCELLED"
    assert service.repository.operations == [("replacement", replacement, "CONFIRMED"), ("original", "CTR-APIFAR1", "CANCELLED")]


def test_http_cancel_requires_preview_then_confirm(api):
    client, _ = api
    preview = client.post("/api/reservations/CTR-APIFAR1/cancel/preview")
    assert preview.status_code == 200 and preview.json()["fee"] == 0
    confirmed = client.post("/api/reservations/CTR-APIFAR1/cancel/confirm")
    assert confirmed.status_code == 200 and confirmed.json()["reservation"]["status"] == "CANCELLED"
    assert client.post("/api/reservations/CTR-APIFAR1/cancel/confirm").status_code == 409
