"""Firestore CRUD and protected two-phase reservation workflows."""
import math, os, secrets, string
from copy import deepcopy
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any, Protocol
from google.cloud import firestore
from .events import emit
from .policies import cancellation_review, change_review, parse_datetime, penalty_preview, utc_now, validate_trip_dates
from .recommend import quote, VENDOR_META, SIPP_MAP

# Costco-negotiated add-ons: per_day=0 means included free for members
ADDONS: dict[str, dict] = {
    "extra_driver": {"name": "Additional Driver",      "per_day": 0.00,  "included_for_members": True},
    "gps":          {"name": "GPS Navigation",         "per_day": 12.99, "included_for_members": False},
    "child_seat":   {"name": "Child Safety Seat",      "per_day": 11.99, "included_for_members": False},
    "insurance":    {"name": "Collision Damage Waiver","per_day": 18.99, "included_for_members": False},
    "wifi":         {"name": "In-Car Wi-Fi",           "per_day":  9.99, "included_for_members": False},
    "prepaid_fuel": {"name": "Prepaid Fuel Option",    "per_day":  8.99, "included_for_members": False},
}

def _vendor_confirmation(vendor: str) -> str:
    meta = VENDOR_META.get(vendor, {"conf_prefix": "VN", "conf_len": 7})
    digits = "".join(secrets.choice(string.digits) for _ in range(meta["conf_len"]))
    return f"{meta['conf_prefix']}-{digits}"

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
        vendor=pricing.pop("vendor","Enterprise"); sipp=pricing.pop("sipp_code",SIPP_MAP.get(data["car_class"],"ICAR"))
        vendor_id=pricing.pop("vendor_id",VENDOR_META.get(vendor,{}).get("vendor_id",""))
        vehicle_class_id=pricing.pop("vehicle_class_id",data["car_class"].lower().replace(" ","-"))
        location_code=data["location_code"].upper()
        stamp=current.isoformat()
        member_id=data.get("member_id","MBR-00001")
        value={"id":reservation_id(),"status":"CONFIRMED","location_code":location_code,"car_class":data["car_class"],"vehicle_class_id":vehicle_class_id,"pickup_at":pickup.isoformat(),"drop_at":drop.isoformat(),"pickup_time":data.get("pickup_time"),"drop_time":data.get("drop_time"),"days":days,**pricing,"vendor":vendor,"vendor_id":vendor_id,"vendor_confirmation_id":_vendor_confirmation(vendor),"sipp_code":sipp,"member_id":member_id,"extras":[],"addons":[],"disputes":[],"source":"api","external_id":"","metadata":{},"created_at":stamp,"updated_at":stamp}
        self.repository.create(value); emit("reservation_created",pickup_location=location_code,vehicle_class=value["car_class"],reservation_id=value["id"],amount=value["total"])
        try:
            from .firestore_db import write_audit_event
            write_audit_event("CREATED",value["id"],member_id=member_id,payload={"car_class":data["car_class"],"location":location_code,"vendor":vendor,"vendor_id":vendor_id})
        except Exception: pass
        return value
    def start_change(self,original_id,now:datetime|None=None):
        original=self.get(original_id)
        if original["status"]!="CONFIRMED": raise ReservationError(409,"Only a confirmed reservation can start a change.")
        review=change_review(original["pickup_at"],now=now)
        if review.requires_human_review: return {"requires_human_review":True,"reason":review.reason,"original":original}
        stamp=(now or utc_now()).isoformat(); replacement={**original,"id":reservation_id(),"status":"PENDING","original_reservation_id":original_id,"created_at":stamp,"updated_at":stamp}; replacement.pop("replacement_id",None)
        self.repository.start_change(original_id,replacement,stamp); emit("change_started",pickup_location=replacement["location_code"],vehicle_class=replacement["car_class"],reservation_id=replacement["id"],metadata={"original_reservation_id":original_id})
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
        first=now or utc_now(); second=first+timedelta(microseconds=1); self.repository.confirm_change(original_id,pending["id"],first.isoformat(),second.isoformat()); emit("reservation_modified",pickup_location=pending["location_code"],vehicle_class=pending["car_class"],reservation_id=pending["id"],amount=pending["total"],metadata={"original_reservation_id":original_id})
        return {"replacement":self.get(pending["id"]),"original":self.get(original_id)}
    def abandon_change(self,original_id,now:datetime|None=None):
        original=self.get(original_id)
        if original.get("status")!="HOLD" or not original.get("replacement_id"): raise ReservationError(409,"No pending change exists to abandon.")
        replacement_id=original["replacement_id"]; self.repository.abandon_change(original_id,replacement_id,(now or utc_now()).isoformat()); emit("change_abandoned",reservation_id=original_id,metadata={"deleted_replacement_id":replacement_id})
        return {"original":self.get(original_id),"deleted_replacement_id":replacement_id}
    def cancel_preview(self,value,now:datetime|None=None):
        item=self.get(value); preview=penalty_preview(item["pickup_at"],item["rate_per_day"],item["total"],now); review=cancellation_review(item["pickup_at"],penalty=preview["fee"],now=now)
        return {**preview,"requires_human_review":review.requires_human_review,"reason":review.reason}
    def cancel_confirm(self,value,now:datetime|None=None):
        item=self.get(value)
        if item["status"]!="CONFIRMED": raise ReservationError(409,"Only a confirmed reservation can be cancelled.")
        preview=self.cancel_preview(value,now)
        if preview["requires_human_review"]: raise ReservationError(409,preview["reason"] or "Human review is required.")
        stamp=(now or utc_now()).isoformat(); self.repository.update(value,{"status":"CANCELLED","cancelled_at":stamp,"updated_at":stamp,"cancellation":preview}); result=self.get(value); emit("reservation_cancelled",pickup_location=result["location_code"],vehicle_class=result["car_class"],reservation_id=result["id"],amount=preview["fee"],metadata={"tier":preview["tier"],"refund":preview["refund"]})
        return {"reservation":result,"tier":preview["tier"],"fee":preview["fee"],"refund":preview["refund"]}

    # UC4 — Vehicle Pickup / Check-In
    def checkin(self,value,now:datetime|None=None):
        item=self.get(value)
        if item["status"]!="CONFIRMED": raise ReservationError(409,"Only a CONFIRMED reservation can be checked in.")
        stamp=(now or utc_now()).isoformat(); self.repository.update(value,{"status":"ACTIVE","checked_in_at":stamp,"updated_at":stamp})
        result=self.get(value); emit("rental_checked_in",pickup_location=result.get("location_code"),vehicle_class=result.get("car_class"),reservation_id=value,metadata={"vendor":result.get("vendor"),"vendor_confirmation_id":result.get("vendor_confirmation_id")})
        try:
            from .firestore_db import write_audit_event
            write_audit_event("CHECKED_IN",value,member_id=item.get("member_id"),payload={"vendor":item.get("vendor"),"vendor_id":item.get("vendor_id"),"vendor_confirmation_id":item.get("vendor_confirmation_id")})
        except Exception: pass
        return result

    # UC5 — Extend rental (mid-rental support)
    def extend_rental(self,value,new_drop_at:str,now:datetime|None=None):
        item=self.get(value)
        if item["status"]!="ACTIVE": raise ReservationError(409,"Can only extend an ACTIVE rental.")
        current=now or utc_now()
        try: _,drop=validate_trip_dates(item["pickup_at"],new_drop_at,current,require_future_time=False)
        except ValueError as exc: raise ReservationError(422,str(exc)) from exc
        if drop<=parse_datetime(item["drop_at"]): raise ReservationError(422,"New return date must be after the current return date.")
        days=rental_days(item["pickup_at"],new_drop_at)
        try: pricing=quote(item["car_class"],days)
        except ValueError as exc: raise ReservationError(422,str(exc)) from exc
        pricing.pop("vendor",None); pricing.pop("sipp_code",None)
        stamp=(now or utc_now()).isoformat(); self.repository.update(value,{"drop_at":drop.isoformat(),"days":days,**pricing,"extended_at":stamp,"updated_at":stamp})
        emit("rental_extended",reservation_id=value,pickup_location=item.get("location_code"),vehicle_class=item.get("car_class"),metadata={"new_drop_at":drop.isoformat()})
        return self.get(value)

    # UC6 — Add-On / Upsell Purchase
    def add_addon(self,value,addon_type:str,days:int|None=None,now:datetime|None=None):
        item=self.get(value)
        if item["status"] not in ("CONFIRMED","ACTIVE"): raise ReservationError(409,"Add-ons can only be added to CONFIRMED or ACTIVE reservations.")
        addon_def=ADDONS.get(addon_type)
        if not addon_def: raise ReservationError(422,f"Unknown add-on '{addon_type}'. Available: {', '.join(ADDONS)}")
        addon_days=days or item.get("days",1); included=addon_def["included_for_members"]
        charge=0.0 if included else round(addon_def["per_day"]*addon_days,2)
        record={"type":addon_type,"name":addon_def["name"],"per_day":addon_def["per_day"],"days":addon_days,"charge":charge,"included_for_members":included,"added_at":(now or utc_now()).isoformat(),"billed_by":"costco_travel" if included else "vendor"}
        updated=[x for x in item.get("addons",[]) if x["type"]!=addon_type]+[record]
        self.repository.update(value,{"addons":updated,"updated_at":(now or utc_now()).isoformat()})
        emit("addon_added",reservation_id=value,metadata={"addon_type":addon_type,"charge":charge,"included":included})
        return {"addon":record,"reservation":self.get(value)}

    # UC7 — Vehicle Return / Drop-Off
    def return_vehicle(self,value,fuel_level:str="full",mileage:int|None=None,damage_notes:str|None=None,now:datetime|None=None):
        item=self.get(value)
        if item["status"]!="ACTIVE": raise ReservationError(409,"Can only return an ACTIVE rental.")
        addon_total=round(sum(x.get("charge",0) for x in item.get("addons",[])),2)
        final_invoice={"member_rate_total":item["total"],"addon_total":addon_total,"grand_total":round(item["total"]+addon_total,2),"fuel_level":fuel_level,"mileage":mileage,"damage_notes":damage_notes or "None reported","vendor_confirmation_id":item.get("vendor_confirmation_id"),"sipp_code":item.get("sipp_code")}
        stamp=(now or utc_now()).isoformat(); self.repository.update(value,{"status":"RETURNED","returned_at":stamp,"updated_at":stamp,"fuel_level":fuel_level,"mileage":mileage,"damage_notes":damage_notes,"final_invoice":final_invoice})
        result=self.get(value); emit("rental_returned",reservation_id=value,pickup_location=result.get("location_code"),vehicle_class=result.get("car_class"),amount=final_invoice["grand_total"],metadata={"fuel_level":fuel_level,"vendor":result.get("vendor")})
        try:
            from .firestore_db import write_audit_event
            write_audit_event("RETURNED",value,member_id=item.get("member_id"),payload={"final_invoice":final_invoice,"vendor_id":item.get("vendor_id")})
        except Exception: pass
        return {"reservation":result,"final_invoice":final_invoice}

    # UC8 — Billing Dispute / Post-Rental Support
    def open_dispute(self,value,dispute_type:str,description:str,now:datetime|None=None):
        item=self.get(value)
        if item["status"] not in ("CONFIRMED","ACTIVE","RETURNED"): raise ReservationError(409,"Disputes can only be opened on CONFIRMED, ACTIVE, or RETURNED reservations.")
        dispute_id="DSP-"+"".join(secrets.choice(string.ascii_uppercase+string.digits) for _ in range(6))
        dispute={"id":dispute_id,"type":dispute_type,"description":description,"status":"OPEN","opened_at":(now or utc_now()).isoformat(),"vendor_confirmation_id":item.get("vendor_confirmation_id"),"vendor":item.get("vendor"),"booking_terms":{"rate_per_day":item.get("rate_per_day"),"total":item.get("total"),"addons":item.get("addons",[])},"resolution":None}
        updated_disputes=item.get("disputes",[])+[dispute]; self.repository.update(value,{"disputes":updated_disputes,"updated_at":(now or utc_now()).isoformat()})
        emit("dispute_opened",reservation_id=value,metadata={"dispute_id":dispute_id,"type":dispute_type})
        try:
            from .firestore_db import write_audit_event
            write_audit_event("DISPUTE_OPENED",value,member_id=item.get("member_id"),payload={"dispute_id":dispute_id,"type":dispute_type,"vendor_id":item.get("vendor_id")})
        except Exception: pass
        return {"dispute":dispute,"reservation":self.get(value)}

@lru_cache(maxsize=1)
def service():
    if os.environ.get("RESERVATION_BACKEND", "firestore").lower() == "memory":
        repository = MemoryRepository()
        from .seed import seed
        seed(repository)
        return ReservationService(repository)
    return ReservationService(FirestoreRepository())
