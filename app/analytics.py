"""BigQuery-backed demo insights with an explicit static fallback."""
import logging, os, time
from threading import Lock
from typing import Any
from google.cloud import bigquery

LOGGER=logging.getLogger("costco-travel-demo.analytics")
CACHE_TTL_SECONDS=300
_CACHE:dict[str,tuple[float,dict[str,Any]]]={}
_LOCK=Lock()

# Metrics without a live event source yet (conversation minutes, CSAT, search completion,
# account creation, modification success) stay synthetic until those events are captured.
STATIC_METRICS={"search_completion_rate":94,"booking_conversion_rate":18,"average_conversation_minutes":3.8,"account_creation_rate":27,"modification_success_rate":96,"customer_satisfaction_score":4.7}
STATIC_PROVIDERS=[{"provider":"Enterprise","bookings":248},{"provider":"Avis","bookings":221},{"provider":"Alamo","bookings":205},{"provider":"Budget","bookings":184},{"provider":"National","bookings":142}]
STATIC_LOCATIONS=[{"location":"Orlando","bookings":146},{"location":"Las Vegas","bookings":131},{"location":"Los Angeles","bookings":118},{"location":"Seattle","bookings":104},{"location":"Denver","bookings":97}]

def static_snapshot()->dict[str,Any]:
    return {"metrics":dict(STATIC_METRICS),"bookings_by_provider":[dict(x) for x in STATIC_PROVIDERS],"most_booked_locations":[dict(x) for x in STATIC_LOCATIONS],"demo_data":True,"source":"static"}

def _dataset(client)->str: return f"{client.project}.{os.environ.get('BQ_DATASET','costco_travel_ai')}"

def _rows(client,sql:str)->list[dict[str,Any]]: return [dict(row) for row in client.query(sql).result(timeout=15.0)]

def _load_bigquery()->dict[str,Any]|None:
    try:
        client=bigquery.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT")); dataset=_dataset(client)
        funnel=_rows(client,f"SELECT SUM(completed_searches) searches,SUM(bookings) bookings,SUM(accounts_created) accounts,SUM(successful_modifications) modifications FROM `{dataset}.daily_funnel`")
        providers=_rows(client,f"SELECT provider,bookings FROM `{dataset}.bookings_by_provider` WHERE provider IS NOT NULL ORDER BY bookings DESC LIMIT 5")
        locations=_rows(client,f"SELECT location,bookings FROM `{dataset}.most_booked_locations` WHERE location IS NOT NULL ORDER BY bookings DESC LIMIT 5")
    except Exception as exc:
        LOGGER.warning("BigQuery insights unavailable; serving static snapshot: %s",exc); return None
    totals=funnel[0] if funnel else {}
    searches=int(totals.get("searches") or 0); bookings=int(totals.get("bookings") or 0)
    if not searches and not bookings:
        LOGGER.info("BigQuery insights are empty; serving static snapshot"); return None
    result=static_snapshot()
    if searches: result["metrics"]["booking_conversion_rate"]=round(bookings/searches*100,1)
    if providers: result["bookings_by_provider"]=[{"provider":x["provider"],"bookings":int(x["bookings"])} for x in providers]
    if locations: result["most_booked_locations"]=[{"location":x["location"],"bookings":int(x["bookings"])} for x in locations]
    result.update(demo_data=False,source="bigquery",totals={"completed_searches":searches,"bookings":bookings,"accounts_created":int(totals.get("accounts") or 0),"successful_modifications":int(totals.get("modifications") or 0)},static_metric_keys=["search_completion_rate","average_conversation_minutes","account_creation_rate","modification_success_rate","customer_satisfaction_score"])
    return result

def insights()->dict[str,Any]:
    if os.environ.get("BQ_ENABLED","false").lower()!="true": return static_snapshot()
    with _LOCK:
        cached=_CACHE.get("insights")
        if cached and cached[0]>time.monotonic(): return cached[1]
    result=_load_bigquery() or static_snapshot()
    with _LOCK: _CACHE["insights"]=(time.monotonic()+CACHE_TTL_SECONDS,result)
    return result

def clear_cache()->None:
    with _LOCK: _CACHE.clear()
