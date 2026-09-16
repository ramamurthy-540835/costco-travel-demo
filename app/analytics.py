"""BigQuery-backed demo insights with an explicit static fallback."""
import logging, os, time
from threading import Lock
from typing import Any
from google.cloud import bigquery

LOGGER=logging.getLogger("costco-travel-demo.analytics")
CACHE_TTL_SECONDS=300
_CACHE:dict[str,tuple[float,dict[str,Any]]]={}
_LOCK=Lock()

STATIC_METRICS={"search_completion_rate":94,"booking_conversion_rate":18,"average_conversation_minutes":3.8,"account_creation_rate":27,"modification_success_rate":96,"customer_satisfaction_score":4.7}
STATIC_PROVIDERS=[{"provider":"Enterprise","bookings":287,"revenue":18430.50,"active_rentals":42},{"provider":"Avis","bookings":254,"revenue":16280.00,"active_rentals":38},{"provider":"Alamo","bookings":231,"revenue":13860.00,"active_rentals":31},{"provider":"Budget","bookings":198,"revenue":11880.00,"active_rentals":27}]
STATIC_LOCATIONS=[{"location":"Orlando (MCO)","bookings":178,"revenue":10680.00},{"location":"Las Vegas (LAS)","bookings":156,"revenue":9360.00},{"location":"Los Angeles (LAX)","bookings":143,"revenue":8580.00},{"location":"Seattle (SEA)","bookings":129,"revenue":7740.00},{"location":"Denver (DEN)","bookings":112,"revenue":6720.00},{"location":"New York (JFK)","bookings":98,"revenue":6860.00}]

def static_snapshot()->dict[str,Any]:
    return {"metrics":dict(STATIC_METRICS),"bookings_by_provider":[dict(x) for x in STATIC_PROVIDERS],"most_booked_locations":[dict(x) for x in STATIC_LOCATIONS],"demo_data":True,"source":"static"}

def _dataset(client)->str: return f"{client.project}.{os.environ.get('BQ_DATASET','costco_travel_ai')}"

def _rows(client,sql:str)->list[dict[str,Any]]: return [dict(row) for row in client.query(sql).result(timeout=15.0)]

def _load_bigquery()->dict[str,Any]|None:
    try:
        client=bigquery.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT")); dataset=_dataset(client)
        funnel=_rows(client,f"SELECT SUM(completed_searches) searches,SUM(bookings) bookings,SUM(accounts_created) accounts,SUM(successful_modifications) modifications FROM `{dataset}.daily_funnel`")
        providers=_rows(client,f"SELECT provider,bookings,revenue,active_rentals FROM `{dataset}.bookings_by_provider` WHERE provider IS NOT NULL ORDER BY bookings DESC LIMIT 5")
        locations=_rows(client,f"SELECT location,bookings,revenue FROM `{dataset}.most_booked_locations` WHERE location IS NOT NULL ORDER BY bookings DESC LIMIT 6")
    except Exception as exc:
        LOGGER.warning("BigQuery insights unavailable; serving static snapshot: %s",exc); return None
    totals=funnel[0] if funnel else {}
    searches=int(totals.get("searches") or 0); bookings=int(totals.get("bookings") or 0)
    if not searches and not bookings:
        LOGGER.info("BigQuery insights are empty; serving static snapshot"); return None
    result=static_snapshot()
    if searches: result["metrics"]["booking_conversion_rate"]=round(bookings/searches*100,1)
    if providers: result["bookings_by_provider"]=[{"provider":x["provider"],"bookings":int(x["bookings"]),"revenue":float(x.get("revenue") or 0),"active_rentals":int(x.get("active_rentals") or 0)} for x in providers]
    if locations: result["most_booked_locations"]=[{"location":x["location"],"bookings":int(x["bookings"]),"revenue":float(x.get("revenue") or 0)} for x in locations]
    result.update(demo_data=False,source="bigquery",totals={"completed_searches":searches,"bookings":bookings,"accounts_created":int(totals.get("accounts") or 0),"successful_modifications":int(totals.get("modifications") or 0)},static_metric_keys=["search_completion_rate","average_conversation_minutes","account_creation_rate","modification_success_rate","customer_satisfaction_score"])
    return result

def _load_daily_trend()->list[dict[str,Any]]|None:
    try:
        client=bigquery.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT")); dataset=_dataset(client)
        return _rows(client,f"SELECT date,completed_searches,bookings,accounts_created,successful_modifications FROM `{dataset}.daily_funnel` ORDER BY date DESC LIMIT 30")
    except Exception as exc:
        LOGGER.warning("BigQuery daily trend unavailable: %s",exc); return None

def _load_event_breakdown()->list[dict[str,Any]]|None:
    try:
        client=bigquery.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT")); dataset=_dataset(client)
        return _rows(client,f"SELECT event_type,COUNT(*) count FROM `{dataset}.conversation_events` GROUP BY event_type ORDER BY count DESC")
    except Exception as exc:
        LOGGER.warning("BigQuery event breakdown unavailable: %s",exc); return None

def insights()->dict[str,Any]:
    if os.environ.get("BQ_ENABLED","false").lower()!="true": return static_snapshot()
    with _LOCK:
        cached=_CACHE.get("insights")
        if cached and cached[0]>time.monotonic(): return cached[1]
    result=_load_bigquery() or static_snapshot()
    result["daily_trend"]=_load_daily_trend() or []
    result["event_breakdown"]=_load_event_breakdown() or []
    with _LOCK: _CACHE["insights"]=(time.monotonic()+CACHE_TTL_SECONDS,result)
    return result

def clear_cache()->None:
    with _LOCK: _CACHE.clear()
