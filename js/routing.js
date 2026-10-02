const API = 'https://routing.openstreetmap.de/routed-bike/route/v1/driving';

// Renvoie { coords: [[lat, lon], ...], distanceKm, durationMin }
export async function getBikeRoute(from, to) {
  const url = `${API}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Itinéraire : erreur ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('Aucun itinéraire vélo trouvé');
  const r = json.routes[0];
  return {
    coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]), // GeoJSON → [lat, lon] pour Leaflet
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
  };
}