from datetime import datetime,timedelta,timezone
import pytest
from app.policies import cancellation_review,change_review,penalty_preview,validate_trip_dates
from app.recommend import quote,rank_cars
from app.reservations import MemoryRepository,ReservationError,ReservationService
NOW=datetime(2026,8,24,12,0,tzinfo=timezone.utc)
def reservation(value,hours,car_class="Intermediate",days=4):
    pickup=NOW+timedelta(hours=hours)
    return {"id":value,"status":"CONFIRMED","car_class":car_class,"location_code":"MCO","pickup_at":pickup.isoformat(),"drop_at":(pickup+timedelta(days=days)).isoformat(),"days":days,**quote(car_class,days),"created_at":NOW.isoformat(),"updated_at":NOW.isoformat()}
@pytest.mark.parametrize(("hours","tier","fee"),[(72,"free",0.0),(48,"free",0.0),(47.9,"partial",47.0),(24,"partial",47.0),(23.9,"no_show",188.0)])
def test_penalty_tiers(hours,tier,fee):
    result=penalty_preview(NOW+timedelta(hours=hours),47,188,NOW); assert result["tier"]==tier; assert result["fee"]==fee; assert result["refund"]==188-fee
def test_hitl_triggers():
    assert change_review(NOW+timedelta(hours=47),now=NOW).requires_human_review
    assert change_review(NOW+timedelta(days=4),cost_delta_percent=30.01,now=NOW).requires_human_review
    assert change_review(NOW+timedelta(hours=4),now=NOW).reason.startswith("Same-day")
    assert cancellation_review(NOW+timedelta(hours=23),penalty=20,now=NOW).requires_human_review
    assert cancellation_review(NOW+timedelta(days=4),penalty=100.01,now=NOW).requires_human_review
    assert not cancellation_review(NOW+timedelta(hours=30),penalty=47,now=NOW).requires_human_review
def test_two_phase_ordering():
    repo=MemoryRepository([reservation("CTR-FAR0001",21*24)]); service=ReservationService(repo); started=service.start_change("CTR-FAR0001",NOW); replacement=started["replacement"]["id"]
    assert started["original"]["status"]=="HOLD" and started["replacement"]["status"]=="PENDING" and "cancelled_at" not in started["original"]
    result=service.confirm_change("CTR-FAR0001",NOW+timedelta(minutes=1))
    assert repo.operations==[("replacement",replacement,"CONFIRMED"),("original","CTR-FAR0001","CANCELLED")]
    assert result["replacement"]["status"]=="CONFIRMED" and result["original"]["status"]=="CANCELLED"
    assert result["replacement"]["confirmed_at"]<result["original"]["released_at"]
def test_abandon_restores_original():
    repo=MemoryRepository([reservation("CTR-FAR0002",21*24)]); service=ReservationService(repo); started=service.start_change("CTR-FAR0002",NOW); pending=started["replacement"]["id"]
    result=service.abandon_change("CTR-FAR0002",NOW); assert result["original"]["status"]=="CONFIRMED"; assert repo.get(pending) is None
def test_near_change_hitl_is_untouched():
    original=reservation("CTR-NEAR001",30); repo=MemoryRepository([original]); result=ReservationService(repo).start_change("CTR-NEAR001",NOW)
    assert result["requires_human_review"] is True; assert repo.get("CTR-NEAR001")==original; assert len(repo.list())==1
def test_large_delta_hitl_is_untouched():
    repo=MemoryRepository([reservation("CTR-COST001",21*24,"Economy")]); service=ReservationService(repo); started=service.start_change("CTR-COST001",NOW); before=started["replacement"]
    result=service.update_change("CTR-COST001",{"car_class":"Full-Size SUV"},NOW); assert result["requires_human_review"] is True; assert repo.get(before["id"])==before
def test_cancel_preview_no_change_and_confirm_hitl():
    repo=MemoryRepository([reservation("CTR-CANFAR1",21*24),reservation("CTR-CANNEAR",20)]); service=ReservationService(repo)
    assert service.cancel_preview("CTR-CANFAR1",NOW)["tier"]=="free" and repo.get("CTR-CANFAR1")["status"]=="CONFIRMED"
    with pytest.raises(ReservationError) as caught: service.cancel_confirm("CTR-CANNEAR",NOW)
    assert caught.value.status_code==409 and repo.get("CTR-CANNEAR")["status"]=="CONFIRMED"
def test_group_recommendations():
    results=rank_cars(days=7,party_size=6); assert results[0]["class"] in {"Minivan","Full-Size SUV"}; assert results[0]["reason"]=="Recommended for your trip"; assert all(x["seats"]>=6 and x["savings_per_day"]>0 for x in results)
def test_create_rejects_past_pickup():
    service=ReservationService(MemoryRepository())
    with pytest.raises(ReservationError) as caught:
        service.create({"car_class":"Intermediate","location_code":"MCO","pickup_at":(NOW-timedelta(days=1)).isoformat(),"drop_at":(NOW+timedelta(days=2)).isoformat()},NOW)
    assert caught.value.status_code==422 and "today" in caught.value.detail

def test_create_allows_future_time_today_and_rejects_return_before_pickup():
    service=ReservationService(MemoryRepository())
    today=service.create({"car_class":"Intermediate","location_code":"MCO","pickup_at":(NOW+timedelta(hours=2)).isoformat(),"drop_at":(NOW+timedelta(days=2)).isoformat()},NOW)
    assert today["status"]=="CONFIRMED"
    with pytest.raises(ReservationError) as ordering:
        service.create({"car_class":"Intermediate","location_code":"MCO","pickup_at":(NOW+timedelta(days=2)).isoformat(),"drop_at":(NOW+timedelta(days=1)).isoformat()},NOW)
    assert ordering.value.status_code==422 and "after" in ordering.value.detail

def test_change_rejects_past_pickup_without_mutating_pending():
    repo=MemoryRepository([reservation("CTR-DATEG01",21*24)])
    service=ReservationService(repo); pending=service.start_change("CTR-DATEG01",NOW)["replacement"]
    with pytest.raises(ReservationError) as caught:
        service.update_change("CTR-DATEG01",{"pickup_at":(NOW-timedelta(days=1)).isoformat()},NOW)
    assert caught.value.status_code==422 and repo.get(pending["id"])==pending

def test_same_day_change_routes_to_hitl_without_pending_mutation():
    repo=MemoryRepository([reservation("CTR-SAMEDAY",21*24)])
    service=ReservationService(repo); pending=service.start_change("CTR-SAMEDAY",NOW)["replacement"]
    result=service.update_change("CTR-SAMEDAY",{"pickup_at":(NOW+timedelta(hours=4)).isoformat(),"drop_at":(NOW+timedelta(days=1,hours=4)).isoformat()},NOW)
    assert result["requires_human_review"] is True
    assert result["reason"].startswith("Same-day") and repo.get(pending["id"])==pending

def test_timezone_edge_1159_pm_local():
    local=timezone(timedelta(hours=-7)); now=datetime(2026,8,25,6,59,tzinfo=timezone.utc)
    pickup=datetime(2026,8,25,10,0,tzinfo=local); drop=pickup+timedelta(days=2)
    assert validate_trip_dates(pickup,drop,now)[0].date()==datetime(2026,8,25,tzinfo=timezone.utc).date()
    with pytest.raises(ValueError):
        validate_trip_dates(datetime(2026,8,24,23,59,tzinfo=local),drop,now)
