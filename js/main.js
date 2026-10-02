import { fetchDay, slotAt, fetchPoints } from './weather.js';
import { scoreSlot, combine, verdict } from './score.js';
import { bearing, sampleRoute } from './geo.js';
import { searchAddress, reverseGeocode } from './geocode.js';
import { loadTrip, saveTrip } from './storage.js';
import { getBikeRoute } from './routing.js';
import { initMap, drawLeg, setRadar, resizeMap } from './map.js';

const $ = (id) => document.getElementById(id);

// --- Dates ------------------------------------------------------------------
// AAAA-MM-JJ en heure LOCALE (toISOString() donnerait l'heure UTC, donc parfois la veille)
function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Le sélecteur de jour va d'aujourd'hui à J+15 (limite des prévisions Open-Meteo)
function setupDayField() {
  const today = new Date();
  const max = new Date(today);
  max.setDate(max.getDate() + 15);
  $('day').min = toISODate(today);
  $('day').max = toISODate(max);
  $('day').value = toISODate(today);
}

function dayNote(date) {
  const at = (iso) => new Date(`${iso}T12:00:00`);
  const label = at(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const diff = Math.round((at(date) - at(toISODate(new Date()))) / 86400000);
  return diff > 3 ? `${label} · prévisions peu fiables à plus de 3 jours` : label;
}

// --- Champ d'adresse avec suggestions ---------------------------------------
function setupAddressField(input, datalist) {
  let place = null;
  let known = new Map();
  let timer;

  input.addEventListener('input', () => {
    place = known.get(input.value) ?? null;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const results = await searchAddress(input.value);
        if (!results.length) return;
        known = new Map(results.map((r) => [r.label, r]));
        datalist.replaceChildren(...results.map((r) => {
          const opt = document.createElement('option');
          opt.value = r.label;
          return opt;
        }));
        place = known.get(input.value) ?? place;
      } catch { /* on ignore : l'utilisateur pourra réessayer */ }
    }, 300);
  });

  return {
    get: () => place,
    set: (p) => { place = p; known.set(p.label, p); input.value = p.label; },
  };
}

function hourOf(time) {
  const [h, m] = time.split(':').map(Number);
  return Math.min(23, Math.round(h + m / 60));
}

function showError(msg) {
  $('error').hidden = !msg;
  $('error').textContent = msg ?? '';
}

// --- Carte ------------------------------------------------------------------
let currentTrip = null;
let routeCache = { key: null, route: null };
const legCache = new Map();

async function showMap(trip, leg) {
  const tripKey = `${trip.from.lat},${trip.from.lon};${trip.to.lat},${trip.to.lon}`;
  if (routeCache.key !== tripKey) {
    routeCache = { key: tripKey, route: await getBikeRoute(trip.from, trip.to) };
    legCache.clear();
  }
  const { route } = routeCache;
  // Au retour, on repasse par le même chemin dans l'autre sens
  const coords = leg === 'back' ? [...route.coords].reverse() : route.coords;

  // La météo dépend du jour : il fait partie de la clé de cache
  const legKey = `${leg}|${trip.day}`;
  if (!legCache.has(legKey)) {
    const { samples } = sampleRoute(coords, 6);
    legCache.set(legKey, { samples, weather: await fetchPoints(samples, trip.day) });
  }
  if (trip !== currentTrip) return;   // un calcul plus récent a pris le relais

  const { samples, weather } = legCache.get(legKey);
  const time = leg === 'back' ? trip.backTime : trip.outTime;
  drawLeg(coords, samples, weather, hourOf(time));
  $('route-info').textContent =
    `${route.distanceKm.toFixed(1)} km · environ ${Math.round(route.durationMin)} min`;
}

async function refreshMap() {
  if (!currentTrip) return;
  try {
    await showMap(currentTrip, $('map-leg').value);
    $('map-error').hidden = true;
  } catch (err) {
    $('map-error').hidden = false;
    $('map-error').textContent = `Carte indisponible : ${err.message}`;
  }
}

$('map-leg').addEventListener('change', refreshMap);
function applyRadar(on) {
  $('map').classList.toggle('radar-off', !on);   // masque l'explication du radar dans la légende
  setRadar(on).catch((err) => {
    $('map-error').hidden = false;
    $('map-error').textContent = `Radar indisponible : ${err.message}`;
  });
}

$('radar-toggle').addEventListener('change', (e) => applyRadar(e.target.checked));

// Légende de la carte : afficher / masquer (le choix est mémorisé)
const LEGEND_KEY = 'velotaf.legend';

function applyLegend(visible) {
  $('map').classList.toggle('legend-hidden', !visible);
  $('legend-toggle').checked = visible;
}

let legendVisible = true;
try { legendVisible = localStorage.getItem(LEGEND_KEY) !== 'hidden'; } catch { /* stockage indisponible */ }
applyLegend(legendVisible);

$('legend-toggle').addEventListener('change', (e) => {
  applyLegend(e.target.checked);
  try { localStorage.setItem(LEGEND_KEY, e.target.checked ? 'shown' : 'hidden'); } catch { /* ignoré */ }
});

// Plein écran de la carte (en CSS : fonctionne aussi sur iPhone)
function setMapFull(on) {
  $('map-cell').classList.toggle('map-full', on);
  document.body.classList.toggle('no-scroll', on);
  $('fs-icon').textContent = on ? '✕' : '⛶';
  $('fs-label').textContent = on ? 'Quitter' : 'Plein écran';
  $('fullscreen-btn').title = on ? 'Quitter le plein écran' : 'Plein écran';
  $('fullscreen-btn').setAttribute('aria-pressed', String(on));
  resizeMap();
}

$('fullscreen-btn').addEventListener('click', () => {
  setMapFull(!$('map-cell').classList.contains('map-full'));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('map-cell').classList.contains('map-full')) setMapFull(false);
});

// Mobile : afficher / masquer le détail du trajet
$('details-toggle').addEventListener('click', () => {
  const open = $('result-cell').classList.toggle('details-open');
  $('details-toggle').setAttribute('aria-expanded', String(open));
  $('details-toggle').textContent = open ? 'Masquer les détails ▴' : 'Voir les détails ▾';
});

// --- Calcul et affichage du score -------------------------------------------
// Une mini-carte par trajet : score en pastille colorée, puis quatre indicateurs
function legItem(label, time, slot, res) {
  const li = document.createElement('li');
  li.className = 'leg';

  const head = document.createElement('div');
  head.className = 'leg-head';
  const title = document.createElement('strong');
  title.textContent = `${label} · ${time}`;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = res.score;
  badge.style.background = `hsl(${res.score * 1.2}, 70%, 42%)`;
  head.append(title, badge);

  const chips = document.createElement('div');
  chips.className = 'chips';
  const wind = res.head >= 0 ? `vent de face ${res.head} km/h` : `vent de dos ${-res.head} km/h`;
  for (const text of [
    `🌡️ ${Math.round(slot.apparentTemp)}°C ressentis`,
    `🌧️ pluie ${slot.precipProb}%`,
    `💨 ${wind}`,
    `rafales ${Math.round(slot.gusts)} km/h`,
  ]) {
    const chip = document.createElement('span');
    chip.textContent = text;
    chips.append(chip);
  }

  li.append(head, chips);
  return li;
}

let runId = 0;   // évite qu'un ancien calcul, plus lent, écrase un calcul plus récent

async function run(trip) {
  const id = ++runId;
  showError(null);
  $('verdict').textContent = 'Calcul en cours…';
  try {
    const cap = bearing(trip.from.lat, trip.from.lon, trip.to.lat, trip.to.lon);
    const data = await fetchDay(trip.from.lat, trip.from.lon, trip.day);
    if (id !== runId) return;

    const outSlot = slotAt(data, hourOf(trip.outTime), cap);
    const backSlot = slotAt(data, hourOf(trip.backTime), (cap + 180) % 360);
    const out = scoreSlot(outSlot);
    const back = scoreSlot(backSlot);
    const total = combine(out.score, back.score);

    $('score').textContent = total;
    $('gauge').style.setProperty('--p', total);   // remplissage de l'anneau
    $('verdict').textContent = verdict(total);
    $('day-note').textContent = dayNote(trip.day);
    document.documentElement.style.setProperty('--c', `hsl(${total * 1.2}, 70%, 42%)`);

    $('details').replaceChildren(
      legItem('Aller', trip.outTime, outSlot, out),
      legItem('Retour', trip.backTime, backSlot, back),
    );

    currentTrip = trip;
    refreshMap();   // la carte se charge en parallèle, sans bloquer le score
  } catch (err) {
    if (id !== runId) return;
    $('score').textContent = '--';
    $('gauge').style.setProperty('--p', 0);
    $('verdict').textContent = 'Impossible de calculer le score';
    document.documentElement.style.removeProperty('--c');
    showError(err.message);
  }
}

// --- Démarrage --------------------------------------------------------------
initMap();
applyRadar($('radar-toggle').checked);   // radar affiché dès l'ouverture
setupDayField();
const fromField = setupAddressField($('from'), $('from-list'));
const toField = setupAddressField($('to'), $('to-list'));

// Lit le formulaire, mémorise le trajet (sans le jour) et lance le calcul.
// showMissing : afficher un message si le formulaire est incomplet.
function submitTrip(showMissing) {
  if (!fromField.get() || !toField.get()) {
    if (showMissing) showError('Choisis une adresse dans la liste de suggestions, pour le départ et pour l\'arrivée.');
    return;
  }
  if (!$('day').value) {
    if (showMissing) showError('Choisis un jour.');
    return;
  }
  const trip = {
    from: fromField.get(),
    to: toField.get(),
    outTime: $('out-time').value,
    backTime: $('back-time').value,
    day: $('day').value,
  };
  const { day, ...toSave } = trip;   // le jour n'est pas mémorisé : on repart d'aujourd'hui
  saveTrip(toSave);
  run(trip);
}

$('trip-form').addEventListener('submit', (e) => { e.preventDefault(); submitTrip(true); });

// Changer le jour ou une heure relance le calcul directement
['day', 'out-time', 'back-time'].forEach((id) => $(id).addEventListener('change', () => submitTrip(false)));

// Bouton "ma position" : GPS → adresse → champ de départ
$('locate').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('La géolocalisation n\'est pas disponible sur ce navigateur.');
    return;
  }
  const btn = $('locate');
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      fromField.set(place);
      showError(null);
      btn.disabled = false;
      submitTrip(false);   // si l'arrivée est déjà renseignée, le score se met à jour
    },
    (err) => {
      btn.disabled = false;
      showError(err.code === err.PERMISSION_DENIED
        ? 'Localisation refusée : autorise-la dans les réglages du navigateur (icône à gauche de la barre d\'adresse).'
        : 'Position introuvable pour le moment, réessaie ou saisis l\'adresse.');
    },
    { timeout: 10000 },
  );
});

const saved = loadTrip();
if (saved) {
  fromField.set(saved.from);
  toField.set(saved.to);
  $('out-time').value = saved.outTime;
  $('back-time').value = saved.backTime;
  run({ ...saved, day: $('day').value });
}