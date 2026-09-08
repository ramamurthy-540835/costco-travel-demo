"""Typed BigQuery writer for costco_travel_ai.conversation_events.

Only the allowlisted typed fields below ever reach BigQuery. Never add names, emails,
phones, member numbers, or raw reservation payloads: analytics must stay PII-free.
"""
import json, logging, os, uuid
from typing import Any
from google.cloud import bigquery
from .policies import utc_now

LOGGER=logging.getLogger("costco-travel-demo.events")
_FAILURES=0

def _table(client)->str: return f"{client.project}.{os.environ.get('BQ_DATASET','costco_travel_ai')}.conversation_events"

def _insert(row:dict[str,Any])->None:
    client=bigquery.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT"))
    errors=client.insert_rows_json(_table(client),[row])
    if errors: raise RuntimeError(str(errors))

def emit(event_type:str,*,session_id:str|None=None,pickup_location:str|None=None,provider:str|None=None,vehicle_class:str|None=None,reservation_id:str|None=None,member_tier:str|None=None,amount:float|None=None,latency_ms:int|None=None,success:bool=True,metadata:dict[str,Any]|None=None)->bool:
    if os.environ.get("BQ_ENABLED","false").lower()!="true": return False
    global _FAILURES
    row={"event_id":str(uuid.uuid4()),"session_id":session_id,"event_type":event_type,"event_timestamp":utc_now().isoformat(),"pickup_location":pickup_location,"provider":provider,"vehicle_class":vehicle_class,"reservation_id":reservation_id,"member_tier":member_tier,"amount":amount,"latency_ms":latency_ms,"success":success,"metadata":json.dumps(metadata,default=str) if metadata else None}
    try:
        _insert(row); return True
    except Exception as exc:
        _FAILURES+=1; LOGGER.warning("conversation_events insert failed (%d total failures): %s",_FAILURES,exc); return False

def failure_count()->int: return _FAILURES
