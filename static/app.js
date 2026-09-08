const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sessionId = globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const TERMINAL_ACTIONS = new Set(['cancel_complete', 'change_complete', 'flow_abandoned']);
const ALT_CARS = [
  { car:"Toyota Camry", class:"Intermediate", emoji:"🚙", vendor:"Enterprise", ratePerDay:47, retailPerDay:55, savings:"Save $8/day vs retail", features:["5 seats","Unlimited mileage","Free cancellation"], source:"fallback" },
  { car:"Nissan Versa", class:"Economy", emoji:"🚗", vendor:"Budget", ratePerDay:36, retailPerDay:43, savings:"Save $7/day vs retail", features:["5 seats","Unlimited mileage","Budget value"], source:"fallback" },
  { car:"Kia Soul", class:"Compact", emoji:"🚗", vendor:"Alamo", ratePerDay:41, retailPerDay:49, savings:"Save $8/day vs retail", features:["5 seats","Unlimited mileage","City friendly"], source:"fallback" },
  { car:"Chevrolet Malibu", class:"Full-Size", emoji:"🚘", vendor:"Enterprise", ratePerDay:54, retailPerDay:64, savings:"Save $10/day vs retail", features:["5 seats","Unlimited mileage","Extra comfort"], source:"fallback" },
  { car:"Toyota RAV4", class:"Standard SUV", emoji:"🚙", vendor:"Avis", ratePerDay:63, retailPerDay:74, savings:"Save $11/day vs retail", features:["5 seats","Unlimited mileage","Member rate"], source:"fallback" },
  { car:"Chrysler Pacifica", class:"Minivan", emoji:"🚐", vendor:"Alamo", ratePerDay:69, retailPerDay:82, savings:"Save $13/day vs retail", features:["7 seats","Unlimited mileage","Family value"], source:"fallback" },
  { car:"Chevrolet Tahoe", class:"Full-Size SUV", emoji:"🚙", vendor:"National", ratePerDay:86, retailPerDay:101, savings:"Save $15/day vs retail", features:["7 seats","Unlimited mileage","Road-trip comfort"], source:"fallback" },
  { car:"BMW 5 Series", class:"Luxury", emoji:"🚘", vendor:"National", ratePerDay:104, retailPerDay:124, savings:"Save $20/day vs retail", features:["5 seats","Unlimited mileage","Premium comfort"], source:"fallback" },
  { car:"Ford Mustang", class:"Convertible", emoji:"🏎️", vendor:"Avis", ratePerDay:92, retailPerDay:109, savings:"Save $17/day vs retail", features:["4 seats","Unlimited mileage","Open-air driving"], source:"fallback" },
  { car:"Ford F-150", class:"Pickup", emoji:"🛻", vendor:"Budget", ratePerDay:79, retailPerDay:94, savings:"Save $15/day vs retail", features:["5 seats","Unlimited mileage","Cargo capacity"], source:"fallback" }
];

let RESERVATIONS = relativeFallbackReservations();
let carAttribution = {};
let closingDatePicker = false;
const conversationHistory = [];
const appState = {
  flow: FlowMachine.initial(),
  location: 'MCO',
  partySize: 2,
  confirmCards: new Set(),
  pickerCount: 0,
  summaryCount: 0,
  requestedCar: null
};

function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function addHours(date, hours) { return new Date(date.getTime()+hours*60*60*1000); }
function localDate(value = new Date()) { return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`; }
function localDateAfter(days) { return localDate(addDays(new Date(), days)); }
function localTripIso(value,time='10:00') { const date=new Date(`${value}T${time}:00`),minutes=-date.getTimezoneOffset(),sign=minutes>=0?'+':'-',hours=String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0'),remainder=String(Math.abs(minutes)%60).padStart(2,'0'); return `${value}T${time}:00${sign}${hours}:${remainder}`; }
function money(value) { return `$${Number(value || 0).toFixed(2)}`; }
function titleStatus(value) { const status = String(value || '').toLowerCase(); return status ? status[0].toUpperCase()+status.slice(1) : ''; }
function relativeFallbackReservations() {
  const now = new Date();
  return [
    { id:'CTR-D21OUT1', status:'confirmed', carClass:'Intermediate', location:'MCO', pickupAt:addHours(now,50).toISOString(), dropAt:addHours(now,74).toISOString(), ratePerDay:47, retailPerDay:55, total:47, memberSavings:8 },
    { id:'CTR-D30HRS1', status:'confirmed', carClass:'Full-Size', location:'LAS', pickupAt:addHours(now,30).toISOString(), dropAt:addHours(now,54).toISOString(), ratePerDay:54, retailPerDay:64, total:54, memberSavings:10 }
  ];
}
function normalizeReservation(item) {
  return { id:item.id, status:String(item.status || 'confirmed').toLowerCase(), carClass:item.car_class || item.carClass, location:item.location_code || item.location, pickupAt:item.pickup_at || item.pickupAt, dropAt:item.drop_at || item.dropAt, ratePerDay:item.rate_per_day ?? item.ratePerDay, retailPerDay:item.retail_per_day ?? item.retailPerDay, total:item.total, memberSavings:item.member_savings ?? item.memberSavings, replacementId:item.replacement_id || item.replacementId, originalReservationId:item.original_reservation_id || item.originalReservationId };
}
function reservationById(id) { return RESERVATIONS.find((item) => item.id.toUpperCase() === String(id || '').toUpperCase()); }
function formatTripDate(value) { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(value)); }
function freeDeadline(reservation) { return new Date(new Date(reservation.pickupAt).getTime() - 48*60*60*1000); }

async function api(path, options = {}) {
  const response = await fetch(path, { headers:{'content-type':'application/json',...(options.headers || {})}, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error?.message || `Request failed (${response.status})`);
  return data;
}
function buildSystemPrompt() {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  return `Today's date and time: ${now.toISOString()} (${timezone}).\nNever book, change, or quote a pickup in the past. Same-day new rentals are allowed only when the pickup time is still in the future. If the member asks for a past date, explain and return action show_date_picker.\nDates and times enter through the calendar modal only.\nCurrent reservations: ${JSON.stringify(RESERVATIONS)}\nCurrent flow: ${JSON.stringify(appState.flow)}\nCancelled reservations cannot be changed or re-cancelled.\nAllowed terminal actions: cancel_complete, change_complete, flow_abandoned.`;
}
function parseAgentResponse(value) {
  let parsed = value;
  if (typeof value === 'string') parsed = JSON.parse(value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid agent response');
  return { message:String(parsed.message || 'How can I help with your rental?'), action:typeof parsed.action === 'string' ? parsed.action : null, reservationId:typeof parsed.reservationId === 'string' ? parsed.reservationId : null, datePickerContext:parsed.datePickerContext || null, chips:Array.isArray(parsed.chips) ? parsed.chips.map(String).slice(0,6) : [] };
}

function addMessage(text, who = 'agent', className = '') {
  const row = document.createElement('div'); row.className = `message ${who} ${className}`.trim();
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = text; row.append(bubble);
  $('#messages').append(row); $('#messages').scrollTop = $('#messages').scrollHeight;
}
function addWarning(text) { addMessage(text, 'agent', 'warning-message'); }
function renderReplies(replies = []) {
  if (!replies.length) return;
  const row = document.createElement('div'); row.className = 'quick-replies';
  replies.forEach((reply) => { const button=document.createElement('button'); button.textContent=reply; row.append(button); });
  $('#messages').append(row); $('#messages').scrollTop = $('#messages').scrollHeight;
}
function toast(message) { const element=$('#toast'); element.textContent=message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'),3000); }
function switchView(id) {
  $$('.view').forEach((view) => view.classList.toggle('active',view.id===id));
  $$('.nav-link').forEach((button) => button.classList.toggle('active',button.dataset.view===id));
  if (id==='insights') loadInsights();
  window.scrollTo({top:0,behavior:'smooth'});
}
function workflowContainer() {
  if (appState.flow.type !== 'new') return $('#workflowPanel');
  let element=$('#chatWorkflowPanel');
  if (!element) { element=document.createElement('div'); element.id='chatWorkflowPanel'; element.className='chat-workflow'; $('#messages').append(element); }
  return element;
}
function clearWorkflowPanels() { $('#workflowPanel').innerHTML=''; $('#chatWorkflowPanel')?.remove(); }
function scrollConversation() { if (appState.flow.type==='new') $('#messages').scrollTop=$('#messages').scrollHeight; }
function flowPanel(title, body, actions = '') {
  workflowContainer().innerHTML = `<section class="workflow-panel"><div class="workflow-icon">✓</div><div><div class="eyebrow">PROTECTED WORKFLOW</div><h3>${title}</h3>${body}<div class="workflow-actions">${actions}</div></div></section>`;
  scrollConversation();
}
function humanReviewPanel(reason,status='The current reservation remains CONFIRMED and unchanged.') {
  flowPanel('Human Agent Review Required',`<div class="human-review-notice"><span class="review-pulse"></span><div><strong>Costco Travel specialist on standby</strong><p>${reason}</p><small>Estimated demo response: 5–10 minutes</small></div></div><p>${status}</p>`);
}

function dateMentions(message, now = new Date()) {
  const dates=[]; let found=false; const text=message.toLowerCase();
  const push=(year,month,day)=>{ const date=new Date(year,month-1,day,12,0,0); if (!Number.isNaN(date.getTime())) dates.push(date); found=true; };
  for (const match of message.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) push(+match[1],+match[2],+match[3]);
  for (const match of message.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) { let year=match[3] ? +match[3] : now.getFullYear(); if (year<100) year+=2000; push(year,+match[1],+match[2]); }
  const months={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  const monthPattern=/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/gi;
  for (const match of message.matchAll(monthPattern)) push(match[3] ? +match[3] : now.getFullYear(),months[match[1].toLowerCase()],+match[2]);
  if (/\btomorrow\b/.test(text)) { dates.push(addDays(now,1)); found=true; }
  const weekday=text.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekday) { const target=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(weekday[1]); let delta=(target-now.getDay()+7)%7; if (delta===0) delta=7; dates.push(addDays(now,delta)); found=true; }
  const today = new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0);
  return { found, past:dates.some((date) => date < today), dates };
}
function inferLocation(message) { const text=message.toLowerCase(); if (/orlando|mco/.test(text)) return "MCO"; if (/las vegas|\blas\b/.test(text)) return "LAS"; if (/seattle|sea/.test(text)) return "SEA"; if (/los angeles|lax/.test(text)) return "LAX"; if (/san francisco|sfo/.test(text)) return "SFO"; return appState.location || "MCO"; }
function inferRequestedCar(message) {
  const text=message.toLowerCase();
  const choices=[["Toyota RAV4","Standard SUV"],["Chevrolet Tahoe","Full-Size SUV"],["Chrysler Pacifica","Minivan"],["Toyota Camry","Intermediate"],["Nissan Versa","Economy"],["Kia Soul","Compact"],["Chevrolet Malibu","Full-Size"],["BMW 5 Series","Luxury"],["Ford Mustang","Convertible"],["Ford F-150","Pickup"]];
  const model=choices.find(([car])=>text.includes(car.toLowerCase())); if (model) return {car:model[0],className:model[1]};
  const classes=[["full-size suv","Full-Size SUV"],["standard suv","Standard SUV"],["suv","Standard SUV"],["minivan","Minivan"],["compact","Compact"],["economy","Economy"],["luxury","Luxury"],["convertible","Convertible"],["pickup","Pickup"],["full-size","Full-Size"],["intermediate","Intermediate"]];
  const found=classes.find(([term])=>text.includes(term)); return found?{car:null,className:found[1]}:null;
}
function timeMentions(message) {
  const values=[]; for (const match of message.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)) { let hour=+match[1]%12; if (match[3].toLowerCase()==="pm") hour+=12; const minute=+(match[2] || 0); if (hour<24 && minute<60) values.push(String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0")); } return values;
}
function bookingPrefill(message, mention=dateMentions(message)) {
  if (mention.past || !mention.dates.length) return null; const times=timeMentions(message), pickup=mention.dates[0], drop=mention.dates[1] || addDays(pickup,1);
  return {pickup:localDate(pickup),return:localDate(drop),pickupTime:times[0] || null,dropTime:times[1] || times[0] || null};
}
function reservationDates(reservation) { const pickup=new Date(reservation.pickupAt),drop=new Date(reservation.dropAt); return {pickup:localDate(pickup),return:localDate(drop),pickupTime:String(pickup.getHours()).padStart(2,"0")+":"+String(pickup.getMinutes()).padStart(2,"0"),dropTime:String(drop.getHours()).padStart(2,"0")+":"+String(drop.getMinutes()).padStart(2,"0")}; }
function requestedChangeMode(message) { const dates=/\b(date|dates|pickup|return|time|times)\b/i.test(message),vehicle=/\b(vehicle|car|upgrade|suv|minivan|economy|compact|luxury|convertible|pickup)\b/i.test(message); return dates&&vehicle?"both":dates?"dates":"vehicle"; }
function isKeepIntent(message) { return /\b(keep|never mind|nevermind|actually keep|do not change|don't change|stop|abandon)\b/i.test(message); }
function isFlowRelated(message) { return /\b(confirm|yes|change|cancel|date|car|vehicle|keep|reservation|booking)\b/i.test(message); }

async function callAgent(message) {
  conversationHistory.push({role:'user',content:message});
  const raw = await api('/api/agent/chat',{method:'POST',body:JSON.stringify({message,session_id:sessionId,client_context:buildSystemPrompt(),flow:appState.flow,messages:conversationHistory.slice(-10)})});
  const response=parseAgentResponse(raw);
  conversationHistory.push({role:'assistant',content:response.message});
  addMessage(response.message); renderReplies(response.chips); handleAgentAction(response);
  return response;
}
function handleAgentAction(response) {
  if (TERMINAL_ACTIONS.has(response.action)) return;
  if (response.action==='show_date_picker') {
    if (appState.flow.stage==='idle') appState.flow=FlowMachine.start('new');
    renderDatePicker();
  } else if (response.action==='show_change_flow') {
    if (appState.flow.type==='change' && appState.flow.stage==='awaiting_dates') renderDatePicker();
  } else if (response.action==='show_cancel_confirm' && response.reservationId) {
    startCancel(response.reservationId);
  } else if (response.action==='request_human_review') {
    appState.flow=FlowMachine.advance(appState.flow,'human_review');
  }
}

async function handleSend(text) {
  const input=$("#chatInput"); const message=(text || input.value).trim(); if (!message) return; input.value=""; addMessage(message,"user");
  if (isKeepIntent(message) && appState.flow.stage!=="idle") { await abandonFlow(); return; }
  const id=(message.match(/\bCTR-[A-Z0-9]+\b/i)||[])[0];
  if (/\bcancel\b/i.test(message)) { if (id) await startCancel(id); else openManage(); return; }
  if (/\b(change|modify|update|upgrade)\b/i.test(message)) { if (id) await startChange(id,requestedChangeMode(message),bookingPrefill(message)); else openManage(); return; }
  if (/\bmanage\b/i.test(message)) { openManage(id); return; }
  const mention=dateMentions(message);
  if (mention.found) {
    if (mention.past) addWarning("That date has already passed — please pick today or a future date.");
    else addWarning("Please verify the requested dates and times in the secure calendar before booking.");
    appState.location=inferLocation(message); appState.requestedCar=inferRequestedCar(message); appState.flow=FlowMachine.start("new");
    const prefill=bookingPrefill(message,mention); if (prefill) appState.flow={...appState.flow,newDates:prefill};
    renderDatePicker(); return;
  }
  if (appState.flow.stage!=="idle" && appState.flow.stage!=="complete") {
    if (!isFlowRelated(message)) { await abandonFlow(false); }
    else { addMessage("Please use the visible workflow buttons to continue, or say ‘keep my reservation’ to exit."); return; }
  }
  if (/\b(find|book|rent|rental|car|suv|minivan|economy|compact|luxury|convertible|pickup)\b/i.test(message)) {
    appState.location=inferLocation(message); appState.partySize=/family|minivan/i.test(message)?6:2; appState.requestedCar=inferRequestedCar(message); appState.flow=FlowMachine.start("new"); renderDatePicker(); return;
  }
  try { await callAgent(message); } catch (error) { addMessage("I’m sorry—"+error.message); }
}

function renderSidebar() {
  const active=RESERVATIONS.filter((item) => !item.originalReservationId || item.status!=='cancelled');
  $('#reservationSidebar').innerHTML = active.map((item) => `<button class="sidebar-reservation" data-res-id="${item.id}"><span><strong>${item.id}</strong><small>${item.carClass} · ${item.location}</small></span><i class="status-badge ${item.status}">${titleStatus(item.status)}</i></button>`).join('') || '<p class="sidebar-empty">No demo reservations.</p>';
  $$('.sidebar-reservation').forEach((button) => button.onclick=()=>openManage(button.dataset.resId));
}
async function hydrateReservations() {
  try { RESERVATIONS=(await api('/api/reservations')).map(normalizeReservation); } catch (_) { /* relative fallback remains available */ }
  renderSidebar(); const first=RESERVATIONS.find((item)=>item.status==='confirmed') || RESERVATIONS[0];
  if (first) $('#retrieveForm').elements.reservation_id.value=first.id;
}
function openManage(id) {
  switchView('manage'); if (id) $('#retrieveForm').elements.reservation_id.value=id;
  $('#retrieveForm').requestSubmit();
}
function renderReservation(reservation) {
  const actions=reservation.status==="confirmed" ? "<button class=\"secondary\" id=\"changeVehicle\">Change vehicle</button><button class=\"secondary\" id=\"changeDates\">Change dates</button><button class=\"danger\" id=\"cancelBooking\">Cancel</button>" : "";
  $("#reservationResult").innerHTML=`<article class="reservation-card"><div><h3>${reservation.carClass} <span class="demo-pill">${titleStatus(reservation.status)}</span></h3><div class="reservation-meta"><div><small>RESERVATION</small><strong>${reservation.id}</strong></div><div><small>LOCATION</small><strong>${reservation.location}</strong></div><div><small>PICKUP</small><strong>${formatTripDate(reservation.pickupAt)}</strong></div><div><small>RETURN</small><strong>${formatTripDate(reservation.dropAt)}</strong></div><div><small>MEMBER SAVINGS</small><strong>${money(reservation.memberSavings)}</strong></div><div><small>ESTIMATED TOTAL</small><strong>${money(reservation.total)}</strong></div></div></div><div class="reservation-actions">${actions}</div></article>`;
  $("#changeVehicle")?.addEventListener("click",()=>startChange(reservation.id,"vehicle"));
  $("#changeDates")?.addEventListener("click",()=>startChange(reservation.id,"dates"));
  $("#cancelBooking")?.addEventListener("click",()=>startCancel(reservation.id));
}

async function startChange(resId,mode="vehicle",prefill=null) {
  const reservation=reservationById(resId);
  if (!reservation) { addWarning(`I couldn\x27t find ${resId}.`); return; }
  if (reservation.status==="cancelled") { addWarning(`${resId} is already cancelled. I can help book a new car instead.`); return; }
  try {
    const started=await api(`/api/reservations/${reservation.id}/change/start`,{method:"POST"});
    if (started.requires_human_review) { appState.flow=FlowMachine.advance(FlowMachine.start("change",reservation.id),"human_review",{changeMode:mode}); humanReviewPanel(started.reason); switchView("manage"); return; }
    appState.location=reservation.location; appState.requestedCar=null; appState.flow=FlowMachine.start("change",reservation.id); appState.flow.replacementId=started.replacement.id; appState.flow.changeMode=mode;
    await hydrateReservations(); switchView("manage"); renderReservation(reservationById(reservation.id));
    flowPanel("Change started",`<p>${reservation.id} is on HOLD while you choose a replacement. It has not been cancelled.</p>`);
    if (mode==="vehicle") {
      appState.flow=FlowMachine.advance(appState.flow,"awaiting_car",{newDates:reservationDates(reservation)}); await renderNewOptions();
    } else {
      if (prefill) appState.flow={...appState.flow,newDates:prefill}; renderDatePicker();
    }
  } catch (error) { addWarning(error.message); }
}
async function abandonFlow(announce = true) {
  const flow=appState.flow,flowType=flow.type,resId=flow.resId;
  if (flowType==="change" && resId && reservationById(resId)?.status==="hold") {
    try { await api(`/api/reservations/${resId}/change/abandon`,{method:"POST"}); } catch (_) { /* already restored/terminal */ }
  }
  closingDatePicker=true; if ($("#bookingModal").open) $("#bookingModal").close(); closingDatePicker=false;
  appState.flow=FlowMachine.reset(); appState.requestedCar=null; appState.confirmCards.clear(); await hydrateReservations(); clearWorkflowPanels();
  if (announce) {
    const message=flowType==="change" ? `Your original reservation ${resId} remains confirmed. No replacement was booked.` : flowType==="cancel" ? `Cancellation stopped. Reservation ${resId} remains confirmed.` : "No reservation was created. You can start a new search whenever you are ready.";
    addMessage(message); handleAgentAction({action:"flow_abandoned"});
  }
}

function populateTimeChoices(select) { if (select.options.length) return; for (let minutes=0;minutes<24*60;minutes+=30) { const value=String(Math.floor(minutes/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0"),option=document.createElement("option"); option.value=value; option.textContent=new Date("2000-01-01T"+value+":00").toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}); select.append(option); } }
function setTimeChoice(select,value) { if (!value) return; if (![...select.options].some((option)=>option.value===value)) { const option=document.createElement("option"); option.value=value; option.textContent=value; select.append(option); } select.value=value; }
function configureDateInputs() {
  const form=$("#bookingForm").elements,pickup=form.pickup_date,drop=form.return_date,pickupTime=form.pickup_time,dropTime=form.drop_time,preferred=appState.flow.newDates || {};
  const start=new Date(); start.setMinutes(0,0,0); start.setHours(start.getHours()+2); populateTimeChoices(pickupTime); populateTimeChoices(dropTime);
  pickup.min=localDateAfter(0); pickup.value=preferred.pickup || localDate(start); setTimeChoice(pickupTime,preferred.pickupTime || String(start.getHours()).padStart(2,"0")+":00");
  drop.min=pickup.value; drop.value=preferred.return || localDate(addDays(start,1)); setTimeChoice(dropTime,preferred.dropTime || pickupTime.value);
  $("#selectedRental").textContent=(appState.requestedCar?.car || appState.requestedCar?.className || "Any available vehicle")+" · "+appState.location+". Verify all dates and times before continuing.";
  pickup.onchange=()=>{ drop.min=pickup.value; if (!drop.value || drop.value<pickup.value) drop.value=localDate(addDays(new Date(pickup.value+"T12:00:00"),1)); };
}

function renderDatePicker() {
  if (!FlowMachine.canRenderPicker(appState.flow)) return;
  configureDateInputs(); $('#dateModalTitle').textContent=appState.flow.type==='change'?'Select replacement dates and times':'Select rental dates and times'; $('#dateSubmit').textContent='Use these dates and times';
  appState.flow=FlowMachine.markPickerRendered(appState.flow); appState.pickerCount+=1; $('#bookingResult').innerHTML=''; $('#bookingModal').showModal();
}
async function acceptDates(event) {
  event.preventDefault(); const form=event.currentTarget, pickup=form.elements.pickup_date.value, drop=form.elements.return_date.value, pickupTime=form.elements.pickup_time.value, dropTime=form.elements.drop_time.value;
  const pickupMoment=new Date(`${pickup}T${pickupTime}:00`), dropMoment=new Date(`${drop}T${dropTime}:00`);
  if (pickup<localDateAfter(0) || pickupMoment<=new Date()) { toast('Pickup must be later today or on a future date.'); return; }
  if (dropMoment<=pickupMoment) { toast('Return date and time must follow pickup.'); return; }
  appState.flow=FlowMachine.advance(appState.flow,'dates_selected',{newDates:{pickup,return:drop,pickupTime,dropTime}});
  closingDatePicker=true; $('#bookingModal').close(); closingDatePicker=false;
  if (appState.flow.type==='change') {
    const updated=await api(`/api/reservations/${appState.flow.resId}/change/update`,{method:'POST',body:JSON.stringify({pickup_at:localTripIso(pickup,pickupTime),drop_at:localTripIso(drop,dropTime)})});
    if (updated.requires_human_review) { await api(`/api/reservations/${appState.flow.resId}/change/abandon`,{method:'POST'}); appState.flow=FlowMachine.advance(appState.flow,'human_review'); await hydrateReservations(); humanReviewPanel(updated.reason); return; }
  }
  appState.flow=FlowMachine.advance(appState.flow,'awaiting_car'); switchView(appState.flow.type==='new'?'concierge':'manage'); await renderNewOptions();
}

function renderLoadingCards() { workflowContainer().innerHTML='<section class="workflow-panel"><div class="loading-cards"><i></i><i></i><i></i></div><p>Checking member-priced inventory…</p></section>'; scrollConversation(); }
async function renderNewOptions() {
  renderLoadingCards(); const dates=appState.flow.newDates;
  let payload;
  try { payload=await api(`/api/cars?location=${encodeURIComponent(appState.location)}&pickup=${encodeURIComponent(dates.pickup)}&return=${encodeURIComponent(dates.return)}&party_size=${appState.partySize}`); }
  catch (_) { payload={source:'fallback',cars:ALT_CARS}; }
  let cars=Array.isArray(payload)?payload:(payload.cars || ALT_CARS); const wanted=appState.requestedCar; if (wanted) cars=[...cars].sort((a,b)=>Number(Boolean(b.car===wanted.car || b.class===wanted.className))-Number(Boolean(a.car===wanted.car || a.class===wanted.className))); const source=payload.source || cars[0]?.source || 'fallback';
  const note=source==='fallback'?'<div class="inventory-note">Showing sample inventory while live rates are unavailable.</div>':'';
  const root=workflowContainer(); root.innerHTML=`${note}<div class="rental-cards flow-car-cards"></div>`; const row=$('.flow-car-cards',root);
  cars.forEach((car,index)=>{
    const card=document.createElement('article'); card.className=`rental-card ${index===0?'recommended':''}`;
    const visual=car.image_url?`<img class="car-image" src="${car.image_url}" loading="lazy" alt="${car.car}">`:`<div class="car-emoji">${car.emoji || '🚙'}</div>`;
    const features=(car.features || []).map((feature)=>`✓ ${feature}`).join('<br>');
    card.innerHTML=`${index===0?'<div class="recommend-tag">★ BEST VALUE</div>':''}${visual}<h4>${car.car}</h4><div class="provider">${car.class} · ${car.vendor || 'Rental partner'}</div><div class="rental-price">${money(car.ratePerDay)} <small>/ day member rate</small></div><div class="retail-rate">Retail ${money(car.retailPerDay)}/day</div><div class="saving">${car.savings || `Save ${money(car.retailPerDay-car.ratePerDay)}/day vs retail`}</div><div class="rental-meta">${features}</div><button>Select this car</button>`;
    const image=$("img",card); if (image) image.onerror=()=>image.replaceWith(Object.assign(document.createElement("div"),{className:"car-emoji",textContent:car.emoji || "🚙"}));
    $("button",card).onclick=()=>selectCar(car); row.append(card);
  });
}
async function selectCar(car) {
  appState.flow=FlowMachine.advance(appState.flow,'awaiting_confirm',{newCar:car});
  if (appState.flow.type==='change') {
    const updated=await api(`/api/reservations/${appState.flow.resId}/change/update`,{method:'POST',body:JSON.stringify({car_class:car.class})});
    if (updated.requires_human_review) { await api(`/api/reservations/${appState.flow.resId}/change/abandon`,{method:'POST'}); appState.flow=FlowMachine.advance(appState.flow,'human_review'); await hydrateReservations(); humanReviewPanel(updated.reason); return; }
    appState.flow.delta=updated.delta; appState.flow.deltaPercent=updated.delta_percent; appState.flow.replacementId=updated.replacement.id;
    renderChangeSummary();
  } else renderNewSummary();
}
function renderChangeSummary() {
  if (!FlowMachine.canRenderSummary(appState.flow)) return; appState.flow=FlowMachine.markSummaryRendered(appState.flow); appState.summaryCount+=1;
  const original=reservationById(appState.flow.resId), car=appState.flow.newCar;
  flowPanel('Confirm protected replacement',`<div class="comparison-summary"><div><small>ORIGINAL · HOLD</small><strong>${original.carClass}</strong><span>${formatTripDate(original.pickupAt)} – ${formatTripDate(original.dropAt)}</span></div><b>→</b><div><small>REPLACEMENT · PENDING</small><strong>${car.car}</strong><span>${appState.flow.newDates.pickup} ${appState.flow.newDates.pickupTime} – ${appState.flow.newDates.return} ${appState.flow.newDates.dropTime}</span></div></div><div class="flow-summary"><span>Price delta<strong>${money(appState.flow.delta)}</strong></span><span>Cost change<strong>${Number(appState.flow.deltaPercent).toFixed(1)}%</strong></span><span>Member savings<strong>${car.savings}</strong></span></div><p>The replacement is confirmed first. Only then is the original released.</p>`, '<button class="secondary" id="abandonChange">Keep original</button><button class="primary" id="confirmChange">Confirm change</button>');
  $('#abandonChange').onclick=()=>abandonFlow(); $('#confirmChange').onclick=confirmChange;
}
async function confirmChange() {
  const result=await api(`/api/reservations/${appState.flow.resId}/change/confirm`,{method:'POST'}); await hydrateReservations();
  appState.flow=FlowMachine.advance(appState.flow,'complete',{replacementId:result.replacement.id});
  flowPanel('Change complete',`<p><strong>${result.replacement.id}</strong> is CONFIRMED. The original ${result.original.id} is now CANCELLED.</p>`); addMessage(`Your change is complete. ${result.replacement.id} is confirmed and ${result.original.id} was released.`); handleAgentAction({action:'change_complete'});
}
function renderNewSummary() {
  if (!FlowMachine.canRenderSummary(appState.flow)) return; appState.flow=FlowMachine.markSummaryRendered(appState.flow); appState.summaryCount+=1; const car=appState.flow.newCar;
  const days=Math.max(1,Math.ceil((new Date(localTripIso(appState.flow.newDates.return,appState.flow.newDates.dropTime))-new Date(localTripIso(appState.flow.newDates.pickup,appState.flow.newDates.pickupTime)))/86400000));
  flowPanel('Confirm demo reservation',`<div class="flow-summary"><span>Vehicle<strong>${car.car}</strong></span><span>Member total<strong>${money(car.ratePerDay*days)}</strong></span><span>Member savings<strong>${money((car.retailPerDay-car.ratePerDay)*days)}</strong></span></div><p>${appState.flow.newDates.pickup} ${appState.flow.newDates.pickupTime} – ${appState.flow.newDates.return} ${appState.flow.newDates.dropTime} · ${appState.location}</p>`, '<button class="secondary" id="abandonNew">Start over</button><button class="primary" id="confirmNew">Confirm reservation</button>');
  $('#abandonNew').onclick=()=>abandonFlow(); $('#confirmNew').onclick=confirmNew;
}
async function confirmNew() {
  const car=appState.flow.newCar, dates=appState.flow.newDates;
  const created=await api('/api/reservations',{method:'POST',body:JSON.stringify({car_class:car.class,location_code:appState.location,pickup_at:localTripIso(dates.pickup,dates.pickupTime),drop_at:localTripIso(dates.return,dates.dropTime),pickup_time:dates.pickupTime,drop_time:dates.dropTime})});
  await hydrateReservations(); appState.flow=FlowMachine.advance(appState.flow,'complete',{resId:created.id}); flowPanel('Reservation confirmed',`<p><strong>${created.id}</strong> is CONFIRMED. Estimated member total: ${money(created.total)}; savings: ${money(created.member_savings)}.</p>`); addMessage(`Your demo reservation ${created.id} is confirmed.`);
}

async function startCancel(resId) {
  const reservation=reservationById(resId);
  if (!reservation) { addWarning(`I couldn't find ${resId}.`); return; }
  if (reservation.status==='cancelled') { addWarning(`${reservation.id} is already cancelled. I can help book a new car instead.`); return; }
  if (appState.confirmCards.has(reservation.id)) return;
  const preview=await api(`/api/reservations/${reservation.id}/cancel/preview`,{method:'POST'});
  if (preview.requires_human_review) { appState.flow=FlowMachine.advance(FlowMachine.start('cancel',reservation.id),'human_review'); switchView('manage'); renderReservation(reservation); humanReviewPanel(preview.reason); return; }
  appState.flow=FlowMachine.start('cancel',reservation.id); appState.confirmCards.add(reservation.id); switchView('manage'); renderReservation(reservation); renderCancelConfirm(reservation,preview);
}
function renderCancelConfirm(reservation,preview) {
  if (reservation.status==='cancelled' || $(`[data-cancel-card="${reservation.id}"]`)) return;
  $('#workflowPanel').innerHTML=`<section class="workflow-panel" data-cancel-card="${reservation.id}"><div class="workflow-icon">!</div><div><div class="eyebrow">DOUBLE CONFIRMATION REQUIRED</div><h3>Review cancellation policy</h3><table class="policy-table"><thead><tr><th>Pickup window</th><th>Penalty</th></tr></thead><tbody><tr class="${preview.tier==='free'?'active':''}"><td>48 hours or more</td><td>Free cancellation</td></tr><tr class="${preview.tier==='partial'?'active':''}"><td>24–48 hours</td><td>One-day member rate</td></tr><tr class="${preview.tier==='no_show'?'active':''}"><td>Under 24 hours / no-show</td><td>Full reservation penalty</td></tr></tbody></table><div class="flow-summary"><span>Exact free-cancel deadline<strong>${new Date(preview.free_deadline).toLocaleString()}</strong></span><span>Fee for this reservation<strong>${money(preview.fee)}</strong></span><span>Estimated refund<strong>${money(preview.refund)}</strong></span></div><p>Review the complete schedule above. No cancellation occurs until you press Confirm cancellation.</p><div class="workflow-actions"><button class="secondary" id="keepBooking">Keep reservation</button><button class="danger" id="confirmCancel">Confirm cancellation</button></div></div></section>`;
  $('#keepBooking').onclick=()=>abandonFlow(); $('#confirmCancel').onclick=()=>confirmCancel(reservation,preview);
}
async function confirmCancel(reservation,preview) {
  const local=reservationById(reservation.id); local.status='cancelled'; renderSidebar(); renderReservation(local); $('#workflowPanel').innerHTML='';
  try {
    const result=await api(`/api/reservations/${reservation.id}/cancel/confirm`,{method:'POST'}); await hydrateReservations(); appState.confirmCards.delete(reservation.id); appState.flow=FlowMachine.advance(appState.flow,'complete');
    flowPanel('Cancellation complete',`<p><strong>${result.reservation.id}</strong> is CANCELLED. Estimated refund: ${money(result.refund)}.</p>`); addMessage(`Cancellation confirmed for ${result.reservation.id}.`); handleAgentAction({action:'cancel_complete'});
  } catch (error) { local.status='confirmed'; renderSidebar(); renderReservation(local); flowPanel('Cancellation not completed',`<p>${error.message}</p>`); }
}

async function loadInsights() {
  try { const data=await api('/api/analytics'); const metrics=[['Search completion',`${data.metrics.search_completion_rate}%`],['Booking conversion',`${data.metrics.booking_conversion_rate}%`],['Avg. conversation',`${data.metrics.average_conversation_minutes}m`],['Account creation',`${data.metrics.account_creation_rate}%`],['Modification success',`${data.metrics.modification_success_rate}%`],['Customer satisfaction',`${data.metrics.customer_satisfaction_score}/5`]]; $('#metricGrid').innerHTML=metrics.map(([label,value])=>`<article class="metric-card"><strong>${value}</strong><span>${label}</span><i> · illustrative</i></article>`).join(''); renderBars('#providerChart',data.bookings_by_provider,'provider'); renderBars('#locationChart',data.most_booked_locations,'location'); } catch (error) { toast(error.message); }
}
function renderBars(selector,rows,key) { const max=Math.max(...rows.map((row)=>row.bookings),1); $(selector).innerHTML=rows.map((row)=>`<div class="bar-row"><span>${row[key]}</span><div class="bar-track"><div class="bar" style="width:${row.bookings/max*100}%"></div></div><strong>${row.bookings}</strong></div>`).join(''); }

$$('[data-view]').forEach((button)=>button.addEventListener('click',()=>switchView(button.dataset.view)));
$$('[data-prompt]').forEach((button)=>button.addEventListener('click',()=>{ switchView('concierge'); handleSend(button.dataset.prompt); }));
$('#chatForm').addEventListener('submit',(event)=>{ event.preventDefault(); handleSend(); });
$('#messages').addEventListener('click',(event)=>{ const button=event.target.closest('.quick-replies button'); if (button) handleSend(button.textContent); });
$('#resetChat').onclick=()=>abandonFlow(false).then(()=>{ $('#messages').innerHTML='<div class="message agent"><div class="bubble"><strong>Fresh start.</strong><p>Where are you headed, and what kind of car fits your trip?</p></div></div>'; });
$('#bookingForm').addEventListener('submit',acceptDates);
$('#bookingModal .modal-close').onclick=()=>{ $('#bookingModal').close(); };
$('#bookingModal').addEventListener('close',()=>{ if (!closingDatePicker && appState.flow.stage==='awaiting_dates') abandonFlow(); });
$('#bookingModal').addEventListener('click',(event)=>{ if (event.target===$('#bookingModal')) $('#bookingModal').close(); });
$('#retrieveForm').addEventListener('submit',(event)=>{ event.preventDefault(); const reservation=reservationById(new FormData(event.currentTarget).get('reservation_id')); $('#workflowPanel').innerHTML=''; if (reservation) renderReservation(reservation); else $('#reservationResult').innerHTML='<div class="success-box error-box">Reservation not found.</div>'; });
$('#refreshInsights').onclick=loadInsights;

fetch('/car-image-attribution.json').then((response)=>response.ok?response.json():{}).then((data)=>{carAttribution=data;}).catch(()=>{});
hydrateReservations();
