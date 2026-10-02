import { windComponents } from './score.js';

let map, routeLayer, radarLayer;

export function initMap() {
  if (map) return;
  map = L.map('map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© les contributeurs d\'OpenStreetMap',
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map);
    // Légende posée sur la carte (bas gauche)
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML =
        '<i style="background:#d32f2f"></i>Vent de face fort<br>'
      + '<i style="background:#f57c00"></i>Vent de face modéré<br>'
      + '<i style="background:#1976d2"></i>Vent de travers<br>'
      + '<i style="background:#2e7d32"></i>Vent de dos<br>'
      + 'Flèche : sens du vent (km/h)<br>'
      + 'Cercle bleu : pluie <b>prévue</b>'
      + '<div class="radar-info">'
      +   '<i class="radar-scale"></i>Zones bleues à jaunes : pluie <b>observée</b> en ce moment, du faible au fort'
      + '</div>';
    return div;
  };
  legend.addTo(map);
  map.setView([46.6, 2.5], 5);
}

// Couleur selon la composante de face du vent (km/h)
const windColor = (head) =>
  head > 15 ? '#d32f2f' : head > 5 ? '#f57c00' : head < -5 ? '#2e7d32' : '#1976d2';

function windIcon(dirFrom, speed) {
  const rot = (dirFrom + 180) % 360; // la flèche indique où le vent VA, pas d'où il vient
  return L.divIcon({
    className: 'wind-icon',
    html: `<span class="wind-arrow" style="transform: rotate(${rot}deg)">↑</span><b>${Math.round(speed)}</b>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

// coords : [[lat, lon], ...] ; samples : points échantillonnés ; weather : réponses Open-Meteo (même ordre)
export function drawLeg(coords, samples, weather, hour) {
  initMap();
  map.invalidateSize();
  routeLayer.clearLayers();

  samples.forEach((s, j) => {
    const h = weather[j].hourly;
    const speed = h.wind_speed_10m[hour];
    const dir = h.wind_direction_10m[hour];
    const gusts = h.wind_gusts_10m[hour];
    const mm = h.precipitation[hour];
    const prob = h.precipitation_probability[hour] ?? 0;
    const { head } = windComponents(speed, dir, s.bearing);

    // Tronçon jusqu'au point suivant, coloré selon le vent
    const end = samples[j + 1] ? samples[j + 1].idx : s.idx;
    const segment = coords.slice(s.idx, end + 1);
    if (segment.length > 1) {
      L.polyline(segment, { color: windColor(head), weight: 6, opacity: 0.9 }).addTo(routeLayer);
    }

    // Cercle de pluie (taille selon l'intensité)
    if (mm >= 0.1) {
      L.circleMarker([s.lat, s.lon], {
        radius: 10 + 6 * Math.min(mm, 3),
        color: '#1565c0', fillColor: '#42a5f5', fillOpacity: 0.45, weight: 1,
      }).addTo(routeLayer);
    }

    // Flèche de vent + infobulle
    L.marker([s.lat, s.lon], { icon: windIcon(dir, speed) })
      .bindTooltip(
        `km ${s.km.toFixed(1)} · vent ${Math.round(speed)} km/h (rafales ${Math.round(gusts)}) `
        + `· ${head > 0 ? 'de face' : 'de dos'} ${Math.abs(Math.round(head))} km/h · pluie ${mm} mm (${prob}%)`
      )
      .addTo(routeLayer);
  });

  map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
}

// Radar de pluie observé (2 dernières heures, zoom natif max 7)
export async function setRadar(enabled) {
  initMap();
  if (radarLayer) { map.removeLayer(radarLayer); radarLayer = null; }
  if (!enabled) return;
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!res.ok) throw new Error(`Radar : erreur ${res.status}`);
  const json = await res.json();
  const last = json.radar.past[json.radar.past.length - 1];
  radarLayer = L.tileLayer(`${json.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`, {
    opacity: 0.6,
    maxNativeZoom: 7,   // au-delà, Leaflet agrandit les tuiles (image floue mais visible)
    maxZoom: 19,
    attribution: 'Radar © RainViewer',
  }).addTo(map);
}

// À appeler quand la taille du conteneur change (passage en plein écran, par exemple)
export function resizeMap() {
  if (map) map.invalidateSize();
}