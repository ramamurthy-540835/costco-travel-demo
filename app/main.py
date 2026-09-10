"""Same-origin FastAPI service."""
import logging, os, time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .analytics import insights
from .car_search import search_cars
from .events import emit
from .agent import MODEL,agent_reply,build_system_prompt,fallback_reply
from .images import image_url
from .policies import cancellation_schedule
from .recommend import rank_cars
from .reservations import ReservationError,ReservationService,service
from .seed import seed
from .sabre_mcp import SabreMcpError,search_documentation

logging.basicConfig(level=logging.INFO); LOGGER=logging.getLogger("costco-travel-demo"); STATIC_DIR=Path(__file__).resolve().parent.parent/"static"
class ChatInput(BaseModel):
    message:str=Field(min_length=1,max_length=4000)
    session_id:str=Field(min_length=1,max_length=200)
    client_context:str|None=None
    flow:dict|None=None
    messages:list[dict[str,str]]=Field(default_factory=list)
    member_id:str|None=Field(default=None,max_length=20)
class ReservationInput(BaseModel):
    car_class:str; location_code:str=Field(min_length=3,max_length=8); pickup_at:str; drop_at:str; pickup_time:str|None=None; drop_time:str|None=None
class ChangeInput(BaseModel):
    car_class:str|None=None; pickup_at:str|None=None; drop_at:str|None=None
class AddonInput(BaseModel):
    addon_type:str=Field(min_length=2,max_length=40); days:int|None=Field(default=None,ge=1,le=90)
class ExtendInput(BaseModel):
    new_drop_at:str=Field(min_length=8,max_length=40)
class ReturnInput(BaseModel):
    fuel_level:str="full"; mileage:int|None=Field(default=None,ge=0,le=999999); damage_notes:str|None=Field(default=None,max_length=2000)
class DisputeInput(BaseModel):
    dispute_type:str=Field(min_length=3,max_length=60); description:str=Field(min_length=10,max_length=2000)
def reservation_service(): return service()

@asynccontextmanager
async def lifespan(_):
    if os.environ.get("SEED_DEMO","true").lower()=="true" and os.environ.get("RESERVATION_BACKEND","firestore").lower()!="memory":
        try: LOGGER.info("Demo seed result: %s",seed())
        except Exception as exc: LOGGER.warning("Demo seeding unavailable: %s",exc)
    yield

app=FastAPI(title="Costco Travel Demo",version="1.0.0",lifespan=lifespan)
@app.exception_handler(ReservationError)
async def reservation_error(_:Request,exc:ReservationError): return JSONResponse(status_code=exc.status_code,content={"detail":exc.detail})
@app.get("/api/health")
def health(): return {"status":"ok","service":"costco-travel-demo","auth":"adc","model":MODEL}
@app.post("/api/agent/chat")
def chat(body:ChatInput,reservations:Annotated[ReservationService,Depends(reservation_service)]):
    try: live=reservations.list()
    except Exception: live=[]
    sabre_context=None
    if "sabre" in body.message.lower():
        try: sabre_context=search_documentation(body.message)
        except SabreMcpError: LOGGER.warning("Sabre documentation MCP unavailable")
    member_id=body.member_id or "MBR-00001"  # injected by SSO; fallback to demo member
    inventory=rank_cars(days=4,party_size=2); system=build_system_prompt(live,inventory,body.flow,sabre_context,member_id=member_id)
    history=body.messages[-10:] if body.messages else [{"role":"user","content":body.message}]
    try:
        result=agent_reply(system,history)
        try:
            from .firestore_db import write_member_activity
            write_member_activity(member_id,"chat_session",{"message":body.message[:200],"action":result.get("action")},session_id=body.session_id,source="agent_chat")
        except Exception: pass
        return result
    except Exception as exc:
        LOGGER.warning("Vertex reply unavailable for session %s: %s",body.session_id,exc)
        return fallback_reply(body.message,live)
@app.get("/api/reservations")
def list_reservations(reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.list()
@app.get("/api/reservations/{reservation_id}")
def get_reservation(reservation_id:str,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.get(reservation_id)
@app.post("/api/reservations",status_code=201)
def create_reservation(body:ReservationInput,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.create(body.model_dump())
@app.post("/api/reservations/{reservation_id}/change/start")
def start_change(reservation_id:str,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.start_change(reservation_id)
@app.post("/api/reservations/{reservation_id}/change/update")
def update_change(reservation_id:str,body:ChangeInput,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.update_change(reservation_id,body.model_dump())
@app.post("/api/reservations/{reservation_id}/change/confirm")
def confirm_change(reservation_id:str,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.confirm_change(reservation_id)
@app.post("/api/reservations/{reservation_id}/change/abandon")
def abandon_change(reservation_id:str,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.abandon_change(reservation_id)
@app.post("/api/reservations/{reservation_id}/cancel/preview")
def cancel_preview(reservation_id:str,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.cancel_preview(reservation_id)
@app.post("/api/reservations/{reservation_id}/cancel/confirm")
def cancel_confirm(reservation_id:str,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.cancel_confirm(reservation_id)
@app.post("/api/reservations/{reservation_id}/checkin")
def checkin(reservation_id:str,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.checkin(reservation_id)
@app.post("/api/reservations/{reservation_id}/addons")
def add_addon(reservation_id:str,body:AddonInput,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.add_addon(reservation_id,body.addon_type,body.days)
@app.post("/api/reservations/{reservation_id}/extend")
def extend_rental(reservation_id:str,body:ExtendInput,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.extend_rental(reservation_id,body.new_drop_at)
@app.post("/api/reservations/{reservation_id}/return")
def return_vehicle(reservation_id:str,body:ReturnInput,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.return_vehicle(reservation_id,body.fuel_level,body.mileage,body.damage_notes)
@app.post("/api/reservations/{reservation_id}/dispute")
def open_dispute(reservation_id:str,body:DisputeInput,reservations:Annotated[ReservationService,Depends(reservation_service)]): return reservations.open_dispute(reservation_id,body.dispute_type,body.description)
@app.get("/api/addons")
def list_addons(): from .reservations import ADDONS; return {"addons":[{"type":k,**v} for k,v in ADDONS.items()]}
@app.get("/api/members/{member_id}")
def get_member(member_id:str):
    from .firestore_db import get_member
    m=get_member(member_id)
    if not m: raise HTTPException(status_code=404,detail="Member not found.")
    return m
@app.get("/api/members")
def list_members(membership_number:str|None=None,status:str|None=None):
    from .firestore_db import _db,get_member_by_number
    if membership_number: m=get_member_by_number(membership_number); return m if m else {}
    try:
        q=_db().collection("members")
        if status: q=q.where("status","==",status.lower())
        return [{"id":d.id,**d.to_dict()} for d in q.limit(50).stream()]
    except Exception as exc: raise HTTPException(status_code=502,detail=str(exc))
@app.get("/api/vendors")
def list_vendors():
    from .firestore_db import get_vendors
    return [{"id":k,**v} for k,v in get_vendors().items() if v.get("costco_partner")]
@app.get("/api/locations")
def list_locations():
    from .firestore_db import get_locations
    return [{"code":k,**v} for k,v in get_locations().items() if v.get("active",True)]
@app.get("/api/inventory")
def get_inventory(location:str=Query(min_length=2,max_length=5)):
    from .firestore_db import get_inventory_for_location
    items=get_inventory_for_location(location.upper())
    if not items: raise HTTPException(status_code=404,detail=f"No inventory found for location {location.upper()}")
    return {"location":location.upper(),"count":len(items),"inventory":items}
@app.get("/api/members/{member_id}/activity")
def get_member_activity(member_id:str,limit:Annotated[int,Query(ge=1,le=100)]=20):
    from .firestore_db import get_member_activity as _gma
    return {"member_id":member_id,"events":_gma(member_id,limit=limit)}
@app.get("/api/members/{member_id}/activity/summary")
def get_member_activity_summary(member_id:str):
    from .firestore_db import get_member_activity_summary
    return {"member_id":member_id,"summary":get_member_activity_summary(member_id)}
@app.get("/api/cars")
def cars(days:Annotated[int,Query(ge=1,le=60)]=1,party_size:Annotated[int,Query(ge=1,le=12)]=1,location:str="",budget_per_day:Annotated[float|None,Query(gt=0)]=None,pickup:str|None=None,return_at:Annotated[str|None,Query(alias="return")]=None):
    started=time.monotonic(); pickup_location=location.upper() or None
    def latency(): return int((time.monotonic()-started)*1000)
    def _norm(item:dict)->dict:
        """Ensure every car item has camelCase fields the frontend expects, regardless of source."""
        item["ratePerDay"]   = item.get("ratePerDay")   or item.get("rate_per_day",   0)
        item["retailPerDay"] = item.get("retailPerDay") or item.get("retail_per_day", 0)
        item["savings"]      = item.get("savings") or f"Save ${round(item['retailPerDay']-item['ratePerDay'],2):.2f}/day vs retail"
        item["image_url"]    = item.get("image_url") or image_url(item.get("class",""))
        return item
    try:
        if pickup or return_at:
            if not pickup or not return_at: raise ReservationError(422,"pickup and return are both required.")
            try: live=search_cars(location=location,pickup=pickup,drop=return_at,party_size=party_size,budget_per_day=budget_per_day)
            except ValueError as exc: raise ReservationError(422,str(exc)) from exc
            live.pop("vendor_responses",None)  # strip large GDS payload before sending to browser
            live["cars"]=[_norm(c) for c in live.get("cars",[])]
            emit("rental_search",pickup_location=pickup_location,latency_ms=latency(),metadata={"source":live["source"],"cached":live.get("cached",False)})
            return live
        # No dates: wrap rank_cars in {source,cars} and normalise field names
        result=rank_cars(days=days,party_size=party_size,location=location,budget_per_day=budget_per_day)
        emit("rental_search",pickup_location=pickup_location,latency_ms=latency(),metadata={"source":"sample"})
        return {"source":"sample","cached":False,"cars":[_norm(c) for c in result]}
    except ReservationError:
        emit("rental_search",pickup_location=pickup_location,latency_ms=latency(),success=False,metadata={"error":"validation"})
        raise
@app.get("/api/policies/cancellation")
def policies(reservations:Annotated[ReservationService,Depends(reservation_service)]):
    deadlines=[]
    for item in reservations.list():
        try: deadlines.append({"reservation_id":item["id"],"free_deadline":reservations.cancel_preview(item["id"])["free_deadline"]})
        except Exception: continue
    return {"schedule":cancellation_schedule(),"reservations":deadlines}
@app.get("/api/sabre/docs/search")
def sabre_docs_search(q:Annotated[str,Query(min_length=2,max_length=500)]):
    try: result=search_documentation(q)
    except SabreMcpError as exc: raise HTTPException(status_code=502,detail=str(exc)) from exc
    return {"source":"sabre-developer-hub-mcp","query":q,"result":result}

@app.get("/api/analytics")
def analytics(): return insights()

app.mount("/static",StaticFiles(directory=STATIC_DIR),name="static")
@app.get("/",include_in_schema=False)
def index(): return FileResponse(STATIC_DIR/"costco-travel-agent-v3.html")
@app.get("/{asset_path:path}",include_in_schema=False)
def asset(asset_path:str):
    candidate=(STATIC_DIR/asset_path).resolve()
    if STATIC_DIR.resolve() not in candidate.parents or not candidate.is_file(): return FileResponse(STATIC_DIR/"index.html")
    return FileResponse(candidate)
