"""Firestore CRUD and protected two-phase reservation workflows."""
import math, os, secrets, string
from copy import deepcopy
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any, Protocol
from google.cloud import bigquery, firestore
from .policies import cancellation_review, change_review, parse_datetime, penalty_preview, utc_now, validate_trip_dates
from .recommend import quote

class ReservationError(Exception):
    def __init__(self,status_code:int,detail:str): super().__init__(detail); self.status_code=status_code; self.detail=detail

class Repository(Protocol):
    def list(self)->list[dict[str,Any]]: ...
    def get(self,value:str)->dict[str,Any]|None: ...
    def create(self,value:dict[str,Any])->None: ...
    def update(self,value:str,changes:dict[str,Any])->None: ...
    def start_change(self,original_id:str,replacement:dict[str,Any],stamp:str)->None: ...
    def confirm_change(self,original_id:str,replacement_id:str,confirmed_at:str,released_at:str)->None: ...
    def abandon_change(self,original_id:str,replacement_id:str,stamp:str)->None: ...

class FirestoreRepository:
    def __init__(self):
        self.client=firestore.Client(
            project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
            database=os.environ.get("FIRESTORE_DATABASE","(default)"),
        )
        self.collection=self.client.collection("reservations")
    @staticmethod
    def _value(snapshot):
        if not snapshot.exists: return None
        value=snapshot.to_dict(); value["id"]=snapshot.id; return value
    def list(self): return [self._value(x) for x in self.collection.stream()]
    def get(self,value): return self._value(self.collection.document(value).get())
    def create(self,value):
        payload=dict(value); identity=payload.pop("id"); self.collection.document(identity).create(payload)
    def update(self,value,changes): self.collection.document(value).update(changes)
    def start_change(self,original_id,replacement,stamp):
        transaction=self.client.transaction(); original=self.collection.document(original_id); pending=self.collection.document(replacement["id"])
        @firestore.transactional
        def apply(transaction):
            snapshot=original.get(transaction=transaction)
            if not snapshot.exists or snapshot.to_dict().get("status")!="CONFIRMED": raise ReservationError(409,"Reservation is no longer eligible for change.")
            transaction.update(original,{"status":"HOLD","replacement_id":replacement["id"],"held_at":stamp,"updated_at":stamp})
            payload=dict(replacement); payload.pop("id"); transaction.create(pending,payload)
        apply(transaction)
    def confirm_change(self,original_id,replacement_id,confirmed_at,released_at):
        transaction=self.client.transaction(); original=self.collection.document(original_id); pending=self.collection.document(replacement_id)
        @firestore.transactional
        def apply(transaction):
            old=original.get(transaction=transaction); new=pending.get(transaction=transaction)
            if not old.exists or not new.exists or old.to_dict().get("status")!="HOLD" or new.to_dict().get("status")!="PENDING": raise ReservationError(409,"Change is no longer confirmable.")
            transaction.update(pending,{"status":"CONFIRMED","confirmed_at":confirmed_at,"updated_at":confirmed_at})
            transaction.update(original,{"status":"CANCELLED","released_at":released_at,"updated_at":released_at})
        apply(transaction)
    def abandon_change(self,original_id,replacement_id,stamp):
        transaction=self.client.transaction(); original=self.collection.document(original_id); pending=self.collection.document(replacement_id)
        @firestore.transactional
        def apply(transaction):
            old=original.get(transaction=transaction); new=pending.get(transaction=transaction)
            if not old.exists or not new.exists or old.to_dict().get("status")!="HOLD" or new.to_dict().get("status")!="PENDING": raise ReservationError(409,"Change is no longer abandonable.")
            transaction.delete(pending); transaction.update(original,{"status":"CONFIRMED","replacement_id":firestore.DELETE_FIELD,"restored_at":stamp,"updated_at":stamp})
        apply(transaction)

class MemoryRepository:
    def __init__(self,values=None): self.values={x["id"]:deepcopy(x) for x in (values or [])}; self.operations=[]
    def list(self): return [deepcopy(x) for x in self.values.values()]
    def get(self,value):
        item=self.values.get(value); return deepcopy(item) if item else None
    def create(self,value): self.values[value["id"]]=deepcopy(value)
    def update(self,value,changes): self.values[value].update(deepcopy(changes))
    def start_change(self,original_id,replacement,stamp):
        if self.values[original_id]["status"]!="CONFIRMED": raise ReservationError(409,"Reservation is no longer eligible for change.")
        self.values[original_id].update(status="HOLD",replacement_id=replacement["id"],held_at=stamp,updated_at=stamp); self.values[replacement["id"]]=deepcopy(replacement)
    def confirm_change(self,original_id,replacement_id,confirmed_at,released_at):
        if self.values[original_id]["status"]!="HOLD" or self.values[replacement_id]["status"]!="PENDING": raise ReservationError(409,"Change is no longer confirmable.")
        self.values[replacement_id].update(status="CONFIRMED",confirmed_at=confirmed_at,updated_at=confirmed_at); self.operations.append(("replacement",replacement_id,"CONFIRMED"))
        self.values[original_id].update(status="CANCELLED",released_at=released_at,updated_at=released_at); self.operations.append(("original",original_id,"CANCELLED"))
    def abandon_change(self,original_id,replacement_id,stamp):
        if self.values[original_id]["status"]!="HOLD" or self.values[replacement_id]["status"]!="PENDING": raise ReservationError(409,"Change is no longer abandonable.")
        self.values.pop(replacement_id); self.values[original_id].update(status="CONFIRMED",restored_at=stamp,updated_at=stamp); self.values[original_id].pop("replacement_id",None)

def reservation_id(): return "CTR-"+"".join(secrets.choice(string.ascii_uppercase+string.digits) for _ in range(7))
def rental_days(pickup,drop):
    seconds=(parse_datetime(drop)-parse_datetime(pickup)).total_seconds()
    if seconds<=0: raise ReservationError(422,"drop_at must be after pickup_at.")
    return max(1,math.ceil(seconds/86400))

class ReservationService:
    def __init__(self,repository:Repository): self.repository=repository
    def list(self): return sorted(self.repository.list(),key=lambda x:x.get("created_at",""),reverse=True)
    def get(self,value):
        result=self.repository.get(value)
        if result is None: raise ReservationError(404,"Reservation not found.")
        return result
    def create(self,data,now:datetime|None=None):
        current=now or utc_now()
        try: pickup,drop=validate_trip_dates(data["pickup_at"],data["drop_at"],current)
        except ValueError as exc: raise ReservationError(422,str(exc)) from exc
        days=rental_days(data["pickup_at"],data["drop_at"])
        try: pricing=quote(data["car_class"],days)
        except ValueError as exc: raise ReservationError(422,str(exc)) from exc
        stamp=current.isoformat(); value={"id":reservation_id(),"status":"CONFIRMED","location_code":data["location_code"].upper(),"car_class":data["car_class"],"pickup_at":pickup.isoformat(),"drop_at":drop.isoformat(),"pickup_time":data.get("pickup_time"),"drop_time":data.get("drop_time"),"days":days,**pricing,"created_at":stamp,"updated_at":stamp}
        self.repository.create(value); self._event("booking",value); return value
    def start_change(self,original_id,now:datetime|None=None):
        original=self.get(original_id)
        if original["status"]!="CONFIRMED": raise ReservationError(409,"Only a confirmed reservation can start a change.")
        review=change_review(original["pickup_at"],now=now)
        if review.requires_human_review: return {"requires_human_review":True,"reason":review.reason,"original":original}
        stamp=(now or utc_now()).isoformat(); replacement={**original,"id":reservation_id(),"status":"PENDING","original_reservation_id":original_id,"created_at":stamp,"updated_at":stamp}; replacement.pop("replacement_id",None)
        self.repository.start_change(original_id,replacement,stamp); self._event("change_started",replacement)
        return {"requires_human_review":False,"reason":None,"original":self.get(original_id),"replacement":self.get(replacement["id"])}
    def update_change(self,original_id,changes,now:datetime|None=None):
        original=self.get(original_id)
        if original.get("status")!="HOLD" or not original.get("replacement_id"): raise ReservationError(409,"No pending change exists for this reservation.")
        pending=self.get(original["replacement_id"]); proposed={**pending,**{k:v for k,v in changes.items() if v is not None}}
        try: pickup,drop=validate_trip_dates(proposed["pickup_at"],proposed["drop_at"],now or utc_now())
        except ValueError as exc: raise ReservationError(422,str(exc)) from exc
        proposed.update(pickup_at=pickup.isoformat(),drop_at=drop.isoformat()); days=rental_days(proposed["pickup_at"],proposed["drop_at"])
        try: pricing=quote(proposed["car_class"],days)
        except ValueError as exc: raise ReservationError(422,str(exc)) from exc
        delta=round(pricing["total"]-original["total"],2); percent=round(delta/original["total"]*100,2) if original["total"] else 0
        review=change_review(proposed["pickup_at"],cost_delta_percent=percent,now=now)
        if review.requires_human_review: return {"requires_human_review":True,"reason":review.reason,"replacement":pending,"delta":delta,"delta_percent":percent}
        update={k:proposed[k] for k in ("car_class","pickup_at","drop_at")}; update.update(days=days,**pricing,updated_at=(now or utc_now()).isoformat()); self.repository.update(pending["id"],update)
        return {"requires_human_review":False,"reason":None,"replacement":self.get(pending["id"]),"delta":delta,"delta_percent":percent}
    def confirm_change(self,original_id,now:datetime|None=None):
        original=self.get(original_id)
        if original.get("status")!="HOLD" or not original.get("replacement_id"): raise ReservationError(409,"No pending change exists for confirmation.")
        pending=self.get(original["replacement_id"])
        if pending["status"]!="PENDING": raise ReservationError(409,"Replacement is not pending.")
        first=now or utc_now(); second=first+timedelta(microseconds=1); self.repository.confirm_change(original_id,pending["id"],first.isoformat(),second.isoformat()); self._event("change_confirmed",pending)
        return {"replacement":self.get(pending["id"]),"original":self.get(original_id)}
    def abandon_change(self,original_id,now:datetime|None=None):
        original=self.get(original_id)
        if original.get("status")!="HOLD" or not original.get("replacement_id"): raise ReservationError(409,"No pending change exists to abandon.")
        replacement_id=original["replacement_id"]; self.repository.abandon_change(original_id,replacement_id,(now or utc_now()).isoformat()); self._event("change_abandoned",original)
        return {"original":self.get(original_id),"deleted_replacement_id":replacement_id}
    def cancel_preview(self,value,now:datetime|None=None):
        item=self.get(value); preview=penalty_preview(item["pickup_at"],item["rate_per_day"],item["total"],now); review=cancellation_review(item["pickup_at"],penalty=preview["fee"],now=now)
        return {**preview,"requires_human_review":review.requires_human_review,"reason":review.reason}
    def cancel_confirm(self,value,now:datetime|None=None):
        item=self.get(value)
        if item["status"]!="CONFIRMED": raise ReservationError(409,"Only a confirmed reservation can be cancelled.")
        preview=self.cancel_preview(value,now)
        if preview["requires_human_review"]: raise ReservationError(409,preview["reason"] or "Human review is required.")
        stamp=(now or utc_now()).isoformat(); self.repository.update(value,{"status":"CANCELLED","cancelled_at":stamp,"updated_at":stamp,"cancellation":preview}); result=self.get(value); self._event("cancel",result)
        return {"reservation":result,"tier":preview["tier"],"fee":preview["fee"],"refund":preview["refund"]}
    @staticmethod
    def _event(event_type,value):
        if os.environ.get("BQ_ENABLED","false").lower()!="true": return
        try:
            client=bigquery.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT")); client.insert_rows_json(f"{client.project}.costco_demo.events",[{"event_type":event_type,"reservation_id":value.get("id"),"event_timestamp":utc_now().isoformat(),"payload":value}])
        except Exception: return

@lru_cache(maxsize=1)
def service():
    if os.environ.get("RESERVATION_BACKEND", "firestore").lower() == "memory":
        repository = MemoryRepository()
        from .seed import seed
        seed(repository)
        return ReservationService(repository)
    return ReservationService(FirestoreRepository())
