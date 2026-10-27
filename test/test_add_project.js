// add-project.js — "Add project" form: pin-drop location + save to Supabase
// Needs in the HTML (in this order):
//   Mapbox GL JS <script> and <link> in <head>
//   <script type="module" src="add-project.js"></script> before </body>
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ---- EDIT THESE ----
const SUPABASE_URL = 'https://qtbysadfbkootuscgsri.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1aGgWjC2uWsKk6AAw6uuKA_AhKzLEQN';   // Project Settings > API (public "anon" key)
const TABLE = 'Test Table';                     // your table name
const FORM_SELECTOR = '#add-project-form';    // id of your <form>
const STATUS_SELECTOR = '#form-status';       // optional element for messages

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZW1tZXR0eW91bmciLCJhIjoiY21rNGI3Y3Z4MDV3ZjNrcHk2MXFrYTlpeSJ9.nhnMjjZj_o1eyXtp_Y8Svw'; // same public token the map uses
const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';
const START_CENTER = [-79.3832, 43.6532];     // [lng, lat] — Toronto
const START_ZOOM = 10;

const LOCATION_FIELD = 'municipality';        // name="" (and id) of the city input
const LAT_COLUMN = 'lat';                     // your table's latitude column
const LNG_COLUMN = 'long';                    // your table's longitude column
const SEARCH_SELECTOR = '#address';           // Address input (saved as address, also used to place the pin)
const START_FIELD = 'project_start_date';
const END_FIELD = 'project_end_date';
const CLIENT_TYPE_FIELD = 'client_type';      // existing values are offered as suggestions

// Checkbox groups (several boxes sharing one name, e.g. project_type):
// true  -> saved as one text value, "Urban Design, Master Planning"
// false -> saved as an array, for a Postgres text[] column
const JOIN_GROUPS = true;
// --------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const form = document.querySelector(FORM_SELECTOR);
const statusEl = document.querySelector(STATUS_SELECTOR);
const coordsEl = document.querySelector('#pin-coords');
const findBtn = document.querySelector('#find-address');
const findStatusEl = document.querySelector('#find-status');

// ---------- Form -> row ----------
// Turns every named input into { column_name: value }.
// Each input's name="" must match a column name in the table exactly.
export function formToRow(formEl) {
  const row = {};
  const cbCount = {};
  for (const el of formEl.elements) {
    if (el.type === 'checkbox' && el.name) cbCount[el.name] = (cbCount[el.name] || 0) + 1;
  }
  for (const el of formEl.elements) {
    if (!el.name || el.disabled || ['submit', 'button', 'reset'].includes(el.type)) continue;
    if (el.type === 'checkbox') {
      if (cbCount[el.name] > 1) {                       // group -> list of checked values
        row[el.name] ??= [];
        if (el.checked) row[el.name].push(el.value);
      } else {
        row[el.name] = el.checked;                      // single box -> true/false
      }
      continue;
    }
    if (el.type === 'radio') { if (el.checked) row[el.name] = el.value; continue; }
    const v = (el.value ?? '').trim();
    if (v === '') row[el.name] = null;                 // blank -> NULL (or DB default)
    else if (el.type === 'number') row[el.name] = Number(v);
    else row[el.name] = v;
  }
  for (const [k, val] of Object.entries(row)) {
    if (Array.isArray(val)) row[k] = val.length === 0 ? null : (JOIN_GROUPS ? val.join(', ') : val);
  }
  return row;
}

// ---------- Pin-drop map ----------
let pin = null;        // { lng, lat } once placed
let map = null;
let marker = null;

// city: pass it when already known (e.g. from Find address) to skip the reverse lookup
function setPin(lng, lat, city) {
  pin = { lng: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)) };
  if (coordsEl) coordsEl.textContent = `Pin: ${pin.lat}, ${pin.lng} (lat, lng)`;
  if (city !== undefined) setCity(city); else scheduleCityLookup();
  if (!map) return;
  if (!marker) {
    marker = new mapboxgl.Marker({ draggable: true }).setLngLat([lng, lat]).addTo(map);
    marker.on('dragend', () => { const p = marker.getLngLat(); setPin(p.lng, p.lat); });
  } else {
    marker.setLngLat([lng, lat]);
  }
}

function clearPin() {
  pin = null;
  clearTimeout(cityTimer);
  const cityInput = form?.elements[LOCATION_FIELD];
  if (cityInput) cityInput.placeholder = '';
  if (marker) { marker.remove(); marker = null; }
  if (coordsEl) coordsEl.textContent = 'No pin placed yet.';
}

if (typeof mapboxgl !== 'undefined' && document.querySelector('#pin-map')) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({ container: 'pin-map', style: MAP_STYLE, center: START_CENTER, zoom: START_ZOOM });
  map.addControl(new mapboxgl.NavigationControl());
  map.on('click', (e) => setPin(e.lngLat.lng, e.lngLat.lat));
} else {
  console.warn('Mapbox GL JS not loaded or #pin-map missing — pin drop disabled.');
}

// ---------- "Find address" backup (Nominatim / OpenStreetMap) ----------
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/
// Button-click only (no autocomplete), max 1 request/second, attribution shown on page,
// and don't search addresses of confidential projects.
const NOMINATIM = 'https://nominatim.openstreetmap.org';
let lastNominatimCall = 0;                     // shared timer keeps ALL calls ≥1s apart

async function nominatim(path, params) {
  const wait = lastNominatimCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimCall = Date.now();
  const res = await fetch(`${NOMINATIM}/${path}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`Nominatim request failed (HTTP ${res.status})`);
  return res.json();
}

// Picks the city-level name from a Nominatim address object
export function cityFromAddress(a = {}) {
  return a.city || a.town || a.village || a.municipality || a.hamlet || a.county || '';
}

export async function findAddress(query) {
  const results = await nominatim('search', { q: query, format: 'jsonv2', limit: '1', addressdetails: '1' });
  if (!results.length) throw new Error(`No match for "${query}". Try adding city/country, or place the pin by hand.`);
  const r = results[0];
  return { lat: Number(r.lat), lng: Number(r.lon), label: r.display_name, city: cityFromAddress(r.address) };
}

// Coordinates -> { city, address } (zoom=18 = building-level detail; still includes city)
export async function placeAt(lat, lng) {
  const r = await nominatim('reverse', { lat, lon: lng, format: 'jsonv2', zoom: '18', addressdetails: '1' });
  return { city: cityFromAddress(r.address), address: streetFromAddress(r.address) };
}

// "65 Front Street West, Toronto" (or "Bay Street, Toronto" if no house number)
export function streetFromAddress(a = {}) {
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const city = cityFromAddress(a);
  return street ? [street, city].filter(Boolean).join(', ') : '';
}

// Only fills the address if it's empty or was filled by the pin, never over typed text
const addressInput = document.querySelector(SEARCH_SELECTOR);
addressInput?.addEventListener('input', () => delete addressInput.dataset.auto);
function setAddressFromPin(addr) {
  if (!addressInput || !addr) return;
  if (addressInput.value.trim() === '' || addressInput.dataset.auto) {
    addressInput.value = addr;
    addressInput.dataset.auto = '1';
  }
}

function setCity(city) {
  const input = form?.elements[LOCATION_FIELD];
  if (input) input.value = city;
  toggleToronto();                                 // value set by code doesn't fire 'input'
}

// Waits until the pin stops moving, then looks up the city once
let cityTimer = null;
function scheduleCityLookup() {
  clearTimeout(cityTimer);
  setCity('');
  const input = form?.elements[LOCATION_FIELD];
  if (input) input.placeholder = 'Looking up city…';
  cityTimer = setTimeout(async () => {
    const at = pin;
    try {
      const { city, address } = await placeAt(at.lat, at.lng);
      if (pin === at) { setCity(city); setAddressFromPin(address); }
      if (input && !city) input.placeholder = 'No city found — type it in';
    } catch (err) {
      console.error(err);
      if (input) input.placeholder = 'City lookup failed — type it in';
    }
  }, 800);
}

// Enter in the Address box places the pin instead of submitting the form
document.querySelector(SEARCH_SELECTOR)?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); if (findBtn && !findBtn.disabled) findBtn.click(); }
});

if (findBtn) {
  findBtn.addEventListener('click', async () => {
    const query = (document.querySelector(SEARCH_SELECTOR)?.value ?? '').trim();
    if (!query) { findStatusEl.textContent = 'Type an address first.'; return; }
    findBtn.disabled = true;
    findStatusEl.textContent = 'Searching…';
    try {
      const { lat, lng, label, city } = await findAddress(query);
      setPin(lng, lat, city);
      if (map) map.flyTo({ center: [lng, lat], zoom: 16 });
      findStatusEl.textContent = `Found: ${label}. Drag the pin if it's not exactly on the site (the address stays as typed).`;
    } catch (err) {
      findStatusEl.textContent = err.message;
    } finally {
      setTimeout(() => { findBtn.disabled = false; }, 1100);   // stay under 1 request/second
    }
  });
}

// ---------- Client Type suggestions (from values already in the table) ----------
export async function loadClientTypes() {
  const list = document.querySelector('#client-type-options');
  if (!list) return;
  const { data, error } = await supabase.from(TABLE).select(CLIENT_TYPE_FIELD);
  if (error) { console.warn('Could not load client types:', error.message); return; }
  const values = [...new Set(data.map((r) => r[CLIENT_TYPE_FIELD]).filter(Boolean))].sort();
  list.replaceChildren(...values.map((v) => Object.assign(document.createElement('option'), { value: v })));
}
loadClientTypes();

// Returns an error message, or '' if the dates are fine
export function checkDates(row) {
  const start = row[START_FIELD], end = row[END_FIELD];
  if (start && end && end < start) return 'Project End Date is before the Start Date.';   // YYYY-MM-DD compares correctly as text
  return '';
}

// ---------- Submit ----------
function showStatus(msg, isError = false) {
  if (!statusEl) { if (isError) alert(msg); return; }
  statusEl.textContent = msg;
  statusEl.style.color = isError ? 'crimson' : 'green';
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();                                 // stop page reload
    if (!pin) { showStatus('Place a pin on the map (or use Find address) before submitting.', true); return; }

    const btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const row = formToRow(form);

      const typedType = row[CLIENT_TYPE_FIELD];
      if (typedType) {
        const existing = [...document.querySelectorAll('#client-type-options option')].map(o => o.value);
        row[CLIENT_TYPE_FIELD] = existing.find(v => v.trim().toLowerCase() === typedType.toLowerCase()) ?? typedType;
      }

      const dateProblem = checkDates(row);
      if (dateProblem) throw new Error(dateProblem);
      row[LAT_COLUMN] = pin.lat;
      row[LNG_COLUMN] = pin.lng;

      showStatus('Saving…');
      const { error } = await supabase.from(TABLE).insert(row);
      if (error) throw new Error(`Could not save: ${error.message}`);

      loadClientTypes();

      showStatus('Project added.');
      form.reset();
      clearPin();
      if (findStatusEl) findStatusEl.textContent = '';
    } catch (err) {
      console.error(err);
      showStatus(err.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
} else {
  console.warn(`No form found for selector ${FORM_SELECTOR}`);
}

const loc = form?.elements[LOCATION_FIELD];         // city input
const tor = document.getElementById("toronto-fields");

function toggleToronto() {
  if (!loc || !tor) return;
  const isToronto = loc.value.trim().toLowerCase().startsWith("toronto");
  tor.hidden = !isToronto;
  tor.disabled = !isToronto;
}
loc?.addEventListener("input", toggleToronto);
toggleToronto();