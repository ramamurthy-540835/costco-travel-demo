"""Same-origin FastAPI service."""
import logging, os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from fastapi import Depends, FastAPI, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .agent import MODEL,agent_reply,build_system_prompt,fallback_reply
from .images import image_url
from .policies import cancellation_schedule
from .recommend import rank_cars
from .reservations import ReservationError,ReservationService,service
from .seed import seed

logging.basicConfig(level=logging.INFO); LOGGER=logging.getLogger("costco-travel-demo"); STATIC_DIR=Path(__file__).resolve().parent.parent/"static"
class ChatInput(BaseModel):
    message:str=Field(min_length=1,max_length=4000)
    session_id:str=Field(min_length=1,max_length=200)
class ReservationInput(BaseModel):
    car_class:str; location_code:str=Field(min_length=3,max_length=8); pickup_at:str; drop_at:str; pickup_time:str|None=None; drop_time:str|None=None
class ChangeInput(BaseModel):
    car_class:str|None=None; pickup_at:str|None=None; drop_at:str|None=None
def reservation_service(): return service()

@asynccontextmanager
async def lifespan(_):
    if os.environ.get("SEED_DEMO","true").lower()=="true":
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
    inventory=rank_cars(days=4,party_size=2); system=build_system_prompt(live,inventory)
    try: return agent_reply(system,[{"role":"user","content":body.message}])
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
@app.get("/api/cars")
def cars(days:Annotated[int,Query(ge=1,le=60)]=1,party_size:Annotated[int,Query(ge=1,le=12)]=1,location:str="",budget_per_day:Annotated[float|None,Query(gt=0)]=None):
    result=rank_cars(days=days,party_size=party_size,location=location,budget_per_day=budget_per_day)
    for item in result: item["image_url"]=image_url(item["class"])
    return result
@app.get("/api/policies/cancellation")
def policies(reservations:Annotated[ReservationService,Depends(reservation_service)]):
    deadlines=[]
    for item in reservations.list():
        try: deadlines.append({"reservation_id":item["id"],"free_deadline":reservations.cancel_preview(item["id"])["free_deadline"]})
        except Exception: continue
    return {"schedule":cancellation_schedule(),"reservations":deadlines}
@app.get("/api/analytics")
def analytics():
    return {"metrics":{"search_completion_rate":94,"booking_conversion_rate":18,"average_conversation_minutes":3.8,"account_creation_rate":27,"modification_success_rate":96,"customer_satisfaction_score":4.7},"bookings_by_provider":[{"provider":"Enterprise","bookings":248},{"provider":"Avis","bookings":221},{"provider":"Alamo","bookings":205},{"provider":"Budget","bookings":184},{"provider":"National","bookings":142}],"most_booked_locations":[{"location":"Orlando","bookings":146},{"location":"Las Vegas","bookings":131},{"location":"Los Angeles","bookings":118},{"location":"Seattle","bookings":104},{"location":"Denver","bookings":97}],"demo_data":True}

app.mount("/static",StaticFiles(directory=STATIC_DIR),name="static")
@app.get("/",include_in_schema=False)
def index(): return FileResponse(STATIC_DIR/"index.html")
@app.get("/{asset_path:path}",include_in_schema=False)
def asset(asset_path:str):
    candidate=(STATIC_DIR/asset_path).resolve()
    if STATIC_DIR.resolve() not in candidate.parents or not candidate.is_file(): return FileResponse(STATIC_DIR/"index.html")
    return FileResponse(candidate)
