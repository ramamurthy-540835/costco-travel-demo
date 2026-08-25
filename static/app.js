const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const sessionId = globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let selectedRental = null;
let pendingRental = null;
let authenticated = true;
let carAttribution = {};
fetch('/car-image-attribution.json').then((response) => response.ok ? response.json() : {}).then((data) => { carAttribution = data; }).catch(() => {});

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json', ...options.headers }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error?.message || 'Something went wrong.');
  return data;
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function switchView(id) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
  if (id === 'insights') loadInsights();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('[data-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

function addMessage(text, who = 'agent') {
  const el = document.createElement('div'); el.className = `message ${who}`;
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = text; el.append(bubble);
  $('#messages').append(el); $('#messages').scrollTop = $('#messages').scrollHeight;
}
function renderReplies(replies = []) {
  if (!replies.length) return;
  const row = document.createElement('div'); row.className = 'quick-replies';
  replies.forEach((reply) => { const button = document.createElement('button'); button.textContent = reply; row.append(button); });
  $('#messages').append(row);
}
function renderCards(cards = [], recommendation) {
  if (!cards.length) return;
  const row = document.createElement('div'); row.className = 'rental-cards';
  cards.forEach((item) => {
    const card = document.createElement('article'); card.className = `rental-card ${item.recommended ? 'recommended' : ''}`;
    const visual = item.image_url ? `<img class="car-image" src="${item.image_url}" loading="lazy" alt="${item.car}">` : '<div class="car-emoji">🚙</div>';
    const credit = carAttribution[item.class.toLowerCase().replaceAll(' ', '-')];
    const attribution = credit && item.image_url ? `<a class="image-credit" href="${credit.source_page}" target="_blank" rel="noopener">Photo: ${credit.artist} · ${credit.license}</a>` : '';
    card.innerHTML = `${item.recommended ? '<div class="recommend-tag">★ BEST VALUE</div>' : ''}${visual}${attribution}<h4>${item.car}</h4><div class="provider">${item.class} · ${item.seats} seats</div><div class="rental-price">$${Number(item.est_total).toFixed(2)} <small>estimated total</small></div><div class="saving">Member savings $${Number(item.savings_per_day).toFixed(2)}/day</div><div class="rental-meta">✓ $${Number(item.rate_per_day).toFixed(2)}/day member rate<br>✓ ${item.reason}</div><button>Select this car</button>`;
    $('button', card).onclick = () => openBooking(item); row.append(card);
  });
  $('#messages').append(row);
}
async function sendMessage(text) {
  const input = $('#chatInput'); const message = text || input.value.trim(); if (!message) return;
  input.value = ''; addMessage(message, 'user');
  const manageMatch = message.match(/\b(?:cancel|modify|change|manage)\s+(CTR-[A-Z0-9]+)/i);
  if (manageMatch) {
    switchView('manage');
    $('#retrieveForm').elements.reservation_id.value = manageMatch[1].toUpperCase();
    $('#retrieveForm').requestSubmit();
    addMessage(`I opened ${manageMatch[1].toUpperCase()} in the protected reservation workspace. Review the details, then choose Change vehicle or Cancel.`);
    return;
  }
  try {
    const response = await api('/api/agent/chat', { method: 'POST', body: JSON.stringify({ session_id: sessionId, message }) });
    addMessage(response.message); renderReplies(response.chips || []);
    if (response.action === 'search_cars' || /find|suv|car in|savings/i.test(message)) {
      const partySize = /family|suv|minivan/i.test(message) ? 6 : 2;
      const cars = await api(`/api/cars?days=4&party_size=${partySize}&location=${encodeURIComponent(message)}`);
      renderCards(cars);
    }
    if (response.action === 'open_auth') setTimeout(() => openModal('auth'), 550);
    if (response.action === 'open_manage') switchView('manage');
  } catch (error) { addMessage(`I’m sorry—${error.message}`); }
}
$('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
$('#messages').addEventListener('click', (e) => { if (e.target.closest('.quick-replies button')) sendMessage(e.target.textContent); });
$$('[data-prompt]').forEach((b) => b.addEventListener('click', () => { switchView('concierge'); sendMessage(b.dataset.prompt); }));
$('#resetChat').onclick = () => { $('#messages').innerHTML = '<div class="message agent"><div class="bubble"><strong>Fresh start.</strong><p>Where are you headed, and what kind of car fits your trip?</p></div></div>'; };

function openModal(name) { $(`#${name}Modal`).showModal(); }
$$('[data-modal]').forEach((b) => b.onclick = () => openModal(b.dataset.modal));
$$('.modal-close').forEach((b) => b.onclick = () => b.closest('dialog').close());
$$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

function localDateAfter(days) {
  const date = new Date(); date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const pickupDate = $('#bookingForm').elements.pickup_date;
const returnDate = $('#bookingForm').elements.return_date;
pickupDate.min = localDateAfter(1); pickupDate.value = localDateAfter(7);
returnDate.min = localDateAfter(2); returnDate.value = localDateAfter(11);
pickupDate.addEventListener('change', () => {
  const minimumReturn = new Date(`${pickupDate.value}T12:00:00`); minimumReturn.setDate(minimumReturn.getDate() + 1);
  const minimum = `${minimumReturn.getFullYear()}-${String(minimumReturn.getMonth() + 1).padStart(2, '0')}-${String(minimumReturn.getDate()).padStart(2, '0')}`;
  returnDate.min = minimum;
  if (!returnDate.value || returnDate.value < minimum) returnDate.value = minimum;
});

function openBooking(rental) {
  showBooking(rental);
}
function resumePendingBooking() { if (pendingRental) { const rental = pendingRental; pendingRental = null; setTimeout(() => showBooking(rental), 180); } }
function showBooking(rental) {
  selectedRental = rental;
  $('#selectedRental').textContent = `${rental.car} · ${rental.class} · $${Number(rental.est_total).toFixed(2)} estimated member price (synthetic demo data)`;
  $('#bookingResult').innerHTML = ''; $('#bookingModal').showModal();
}
$('#bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const input = Object.fromEntries(new FormData(e.target));
  if (input.pickup_date < pickupDate.min || input.return_date < returnDate.min) { toast('Choose future pickup and return dates.'); return; }
  const locationCode = /^[A-Z]{3,8}$/.test(selectedRental.location || '') ? selectedRental.location : 'MCO';
  const payload = { car_class: selectedRental.class, location_code: locationCode, pickup_at: `${input.pickup_date}T10:00:00Z`, drop_at: `${input.return_date}T10:00:00Z` };
  try { const booking = await api('/api/reservations', { method: 'POST', body: JSON.stringify(payload) }); $('#bookingResult').innerHTML = `<div class="success-box"><strong>Reservation confirmed</strong><br>${booking.id} · ${booking.car_class}<br>${booking.pickup_at.slice(0,10)} to ${booking.drop_at.slice(0,10)} · $${Number(booking.total).toFixed(2)}<br>Member savings $${Number(booking.member_savings).toFixed(2)}<br><small>This is a synthetic demo reservation and no payment was taken.</small></div>`; addMessage(`Your demo reservation is confirmed: ${booking.id}. Estimated charges are $${Number(booking.total).toFixed(2)}, including $${Number(booking.member_savings).toFixed(2)} in member savings.`); }
  catch (error) { toast(error.message); }
});

$('#retrieveForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const input = Object.fromEntries(new FormData(e.target));
  try {
    const booking = await api(`/api/reservations/${encodeURIComponent(input.reservation_id)}`);
    $('#workflowPanel').innerHTML = '';
    $('#reservationResult').innerHTML = `<article class="reservation-card"><div><h3>${booking.car_class} <span class="demo-pill">${booking.status}</span></h3><div class="reservation-meta"><div><small>RESERVATION</small><strong>${booking.id}</strong></div><div><small>LOCATION</small><strong>${booking.location_code}</strong></div><div><small>PICKUP</small><strong>${booking.pickup_at.slice(0,10)}</strong></div><div><small>RETURN</small><strong>${booking.drop_at.slice(0,10)}</strong></div><div><small>VEHICLE CLASS</small><strong>${booking.car_class}</strong></div><div><small>ESTIMATED TOTAL</small><strong>$${Number(booking.total).toFixed(2)}</strong></div></div></div><div class="reservation-actions">${booking.status === 'CONFIRMED' ? '<button class="secondary" id="upgradeBooking">Change vehicle</button><button class="danger" id="cancelBooking">Cancel</button>' : ''}</div></article>`;
    if ($('#upgradeBooking')) $('#upgradeBooking').onclick = () => modifyBooking(booking);
    if ($('#cancelBooking')) $('#cancelBooking').onclick = () => cancelBooking(booking);
  } catch (error) { $('#reservationResult').innerHTML = `<div class="success-box" style="border-color:#b21f2d;background:#fff1f1;color:#8d1c27">${error.message}</div>`; }
});
function flowPanel(title, body, actions = '') {
  $('#workflowPanel').innerHTML = `<section class="workflow-panel"><div class="workflow-icon">✓</div><div><div class="eyebrow">PROTECTED WORKFLOW</div><h3>${title}</h3>${body}<div class="workflow-actions">${actions}</div></div></section>`;
  $('#workflowPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function modifyBooking(booking) {
  const options = ['Economy','Intermediate','Full-Size','Standard SUV','Full-Size SUV','Minivan'].filter((value) => value !== booking.car_class);
  flowPanel('Choose a replacement vehicle', `<p>Your original reservation remains confirmed until you preview a change.</p><label>New vehicle class<select id="changeClass">${options.map((value) => `<option>${value}</option>`).join('')}</select></label>`, '<button class="secondary" id="closeFlow">Keep original</button><button class="primary" id="previewChange">Preview change</button>');
  $('#closeFlow').onclick = () => { $('#workflowPanel').innerHTML = ''; };
  $('#previewChange').onclick = () => previewChange(booking, $('#changeClass').value);
}
async function previewChange(booking, carClass) {
  try {
    const started = await api(`/api/reservations/${booking.id}/change/start`, { method: 'POST' });
    if (started.requires_human_review) { flowPanel('Specialist review required', `<p>${started.reason}</p><p>No reservation state was changed.</p>`); return; }
    const updated = await api(`/api/reservations/${booking.id}/change/update`, { method: 'POST', body: JSON.stringify({ car_class: carClass }) });
    if (updated.requires_human_review) {
      await api(`/api/reservations/${booking.id}/change/abandon`, { method: 'POST' });
      flowPanel('Specialist review required', `<p>${updated.reason}</p><p>Your original reservation was restored to CONFIRMED.</p>`); return;
    }
    const sign = updated.delta >= 0 ? '+' : '−';
    flowPanel('Confirm your protected change', `<div class="flow-summary"><span>New class<strong>${updated.replacement.car_class}</strong></span><span>Price difference<strong>${sign}$${Math.abs(Number(updated.delta)).toFixed(2)}</strong></span><span>Total change<strong>${Number(updated.delta_percent).toFixed(1)}%</strong></span></div><p>The replacement will be confirmed first. Only then will the original reservation be released.</p>`, '<button class="secondary" id="abandonChange">Keep original</button><button class="primary" id="confirmChange">Confirm replacement</button>');
    $('#abandonChange').onclick = async () => { await api(`/api/reservations/${booking.id}/change/abandon`, { method: 'POST' }); toast('Original reservation restored.'); $('#retrieveForm').requestSubmit(); };
    $('#confirmChange').onclick = async () => { const result = await api(`/api/reservations/${booking.id}/change/confirm`, { method: 'POST' }); toast(`Replacement ${result.replacement.id} confirmed.`); $('#retrieveForm').elements.reservation_id.value = result.replacement.id; $('#retrieveForm').requestSubmit(); };
  } catch (error) { flowPanel('Unable to preview this change', `<p>${error.message}</p>`); }
}
async function cancelBooking(booking) {
  try {
    const preview = await api(`/api/reservations/${booking.id}/cancel/preview`, { method: 'POST' });
    if (preview.requires_human_review) { flowPanel('Specialist review required', `<p>${preview.reason}</p><p>No reservation state was changed.</p>`); return; }
    flowPanel('Review cancellation', `<div class="flow-summary"><span>Penalty tier<strong>${preview.tier.replace('_',' ')}</strong></span><span>Cancellation fee<strong>$${Number(preview.fee).toFixed(2)}</strong></span><span>Estimated refund<strong>$${Number(preview.refund).toFixed(2)}</strong></span></div><p>Free-cancellation deadline: ${new Date(preview.free_deadline).toLocaleString()}.</p>`, '<button class="secondary" id="keepBooking">Keep reservation</button><button class="danger" id="confirmCancel">Confirm cancellation</button>');
    $('#keepBooking').onclick = () => { $('#workflowPanel').innerHTML = ''; toast('Reservation kept confirmed.'); };
    $('#confirmCancel').onclick = async () => { const result = await api(`/api/reservations/${booking.id}/cancel/confirm`, { method: 'POST' }); flowPanel('Cancellation confirmed', `<p>${result.reservation.id} is CANCELLED. Estimated refund: <strong>$${Number(result.refund).toFixed(2)}</strong>.</p>`); setTimeout(() => $('#retrieveForm').requestSubmit(), 900); };
  } catch (error) { flowPanel('Unable to preview cancellation', `<p>${error.message}</p>`); }
}

async function loadInsights() {
  try {
    const data = await api('/api/analytics'); const metrics = [
      ['Search completion', `${data.metrics.search_completion_rate}%`], ['Booking conversion', `${data.metrics.booking_conversion_rate}%`],
      ['Avg. conversation', `${data.metrics.average_conversation_minutes}m`], ['Account creation', `${data.metrics.account_creation_rate}%`],
      ['Modification success', `${data.metrics.modification_success_rate}%`], ['Customer satisfaction', `${data.metrics.customer_satisfaction_score}/5`]
    ];
    $('#metricGrid').innerHTML = metrics.map(([label, value]) => `<article class="metric-card"><strong>${value}</strong><span>${label}</span><i> · illustrative</i></article>`).join('');
    renderBars('#providerChart', data.bookings_by_provider, 'provider'); renderBars('#locationChart', data.most_booked_locations, 'location');
  } catch (error) { toast(error.message); }
}
function renderBars(selector, rows, key) {
  const max = Math.max(...rows.map((r) => r.bookings), 1);
  $(selector).innerHTML = rows.map((r) => `<div class="bar-row"><span>${r[key]}</span><div class="bar-track"><div class="bar" style="width:${r.bookings / max * 100}%"></div></div><strong>${r.bookings}</strong></div>`).join('');
}
$('#refreshInsights').onclick = loadInsights;
