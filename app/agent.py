"""Swappable Vertex agent adapter, currently Gemini through ADC."""
import json, os, re
from datetime import datetime
from functools import lru_cache
from typing import Any
from google import genai
from google.genai import types
from .policies import cancellation_schedule

MODEL=os.environ.get("AGENT_MODEL","gemini-3-flash-preview")

@lru_cache(maxsize=1)
def _client():
    return genai.Client(vertexai=True,project=os.environ.get("GOOGLE_CLOUD_PROJECT"),location=os.environ.get("VERTEX_LOCATION","global"))

def _member_context(member_id:str|None)->dict[str,Any]:
    if not member_id: return {}
    try:
        from .firestore_db import get_member, get_member_activity_summary
        member=get_member(member_id) or {}
        summary=get_member_activity_summary(member_id)
        return {"member":{"id":member_id,"name":f"{member.get('first_name','')} {member.get('last_name','')}".strip(),"tier":member.get("membership_tier",""),"status":member.get("status",""),"preferences":member.get("preferences",{}),"member_since":member.get("member_since",""),"lifetime_savings_usd":member.get("lifetime_savings_usd",0)},"activity_summary":summary}
    except Exception:
        return {}

def build_system_prompt(reservations:list[dict[str,Any]],inventory:list[dict[str,Any]],flow:dict[str,Any]|None=None,sabre_context:dict[str,Any]|None=None,member_id:str|None=None)->str:
    now=datetime.now().astimezone()
    member_ctx=_member_context(member_id or "MBR-00001")
    return f'''You are the Costco Travel car reservation concierge for a demo member presumed authenticated by Costco SSO.
Today's date and time: {now.isoformat()} ({now.tzname() or "local"}).
Return raw JSON only with keys message, action, reservationId, chips. action and reservationId may be null.
Never collect login or membership credentials, card numbers, or income data. Never promise income, returns, availability, or a transaction outcome.
Chat never mutates state. A change requires start, update, and explicit confirm. Cancellation requires preview then explicit confirm. Human review cannot be overridden.
Never book, change, or quote a pickup in the past. Same-day new rentals are allowed only when their pickup time is still in the future. If the member asks for a past date, explain and return action show_date_picker.
Dates and times enter through the calendar modal only. Never accept free-text dates as booking dates.
A CANCELLED reservation cannot be changed or re-cancelled; offer to book a new car instead.
Member profile & activity: {json.dumps(member_ctx,default=str,separators=(",",":"))}
Use the member profile to personalize suggestions — reference their preferred locations, car class, past searches, and lifetime savings. If they have active disputes, acknowledge them proactively.
Current flow: {json.dumps(flow or {},default=str,separators=(",",":"))}
Sabre Developer Hub documentation context: {json.dumps(sabre_context or {},default=str,separators=(",",":"))[:8000]}
Sabre MCP context is documentation only. Never claim it performed live shopping, booking, ticketing, or servicing.
Live reservations: {json.dumps(reservations,default=str,separators=(",",":"))}
Inventory: {json.dumps(inventory,default=str,separators=(",",":"))}
Cancellation policy: {json.dumps(cancellation_schedule(),separators=(",",":"))}
Allowed actions: list_reservations, search_cars, show_date_picker, show_change_flow, show_cancel_confirm, request_human_review, cancel_complete, change_complete, flow_abandoned, null. Never re-emit a start/confirm action after a flow is complete.'''

def _shape(value:dict[str,Any])->dict[str,Any]:
    return {"message":str(value.get("message") or "How can I help with your rental reservation?"),"action":value.get("action") if isinstance(value.get("action"),str) else None,"reservationId":value.get("reservationId") if isinstance(value.get("reservationId"),str) else None,"datePickerContext":value.get("datePickerContext"),"chips":[str(x) for x in value.get("chips",[]) if isinstance(x,(str,int,float))][:6]}

def agent_reply(system:str,messages:list[dict[str,str]])->dict[str,Any]:
    contents=[types.Content(role="user" if x.get("role")=="user" else "model",parts=[types.Part(text=x.get("content",""))]) for x in messages]
    response=_client().models.generate_content(model=MODEL,contents=contents,config=types.GenerateContentConfig(system_instruction=system,response_mime_type="application/json"))
    raw=re.sub(r"^```(?:json)?\s*|\s*```$","",(response.text or "").strip(),flags=re.I); parsed=json.loads(raw)
    if not isinstance(parsed,dict): raise ValueError("Agent response was not an object")
    return _shape(parsed)

def fallback_reply(message:str,reservations:list[dict[str,Any]])->dict[str,Any]:
    text=message.lower()
    if "reservation" in text or "booking" in text:
        active=[x for x in reservations if x.get("status")!="CANCELLED"]; summary=", ".join(f"{x['id']} ({x['status']})" for x in active) or "no active demo reservations"
        return _shape({"message":f"Your demo reservations are: {summary}.","action":"list_reservations","chips":["Change a reservation","Preview cancellation","Find a car"]})
    if "cancel" in text: return _shape({"message":"I can preview the cancellation fee first. Confirmation is a separate step.","action":"cancel_preview","chips":["Show my reservations"]})
    if "change" in text or "modify" in text: return _shape({"message":"Choose a reservation to start a protected two-phase change.","action":"start_change","chips":["Show my reservations"]})
    return _shape({"message":"I can find a car or help manage a demo reservation.","chips":["Show my reservations","Find a car","Cancellation policy"]})
