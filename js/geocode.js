const API = 'https://data.geopf.fr/geocodage/search/';

// Renvoie jusqu'à 5 propositions : [{ label, lat, lon }]
export async function searchAddress(query) {
  if (query.trim().length < 3) return [];
  const params = new URLSearchParams({ q: query, limit: 5 });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Géocodage : erreur ${res.status}`);
  const json = await res.json();
  return json.features.map((f) => ({
    label: f.properties.label,
    lon: f.geometry.coordinates[0], // GeoJSON : [longitude, latitude]
    lat: f.geometry.coordinates[1],
  }));
}

const REVERSE = 'https://data.geopf.fr/geocodage/reverse';

// Coordonnées GPS → adresse lisible. Les coordonnées gardées sont celles du GPS.
// Si le service ne répond pas, on se rabat sur un libellé "Ma position".
export async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({ lon, lat, index: 'address', limit: 1 });
    const res = await fetch(`${REVERSE}?${params}`);
    if (!res.ok) throw new Error('reverse');
    const json = await res.json();
    const label = json.features?.[0]?.properties?.label;
    if (label) return { label, lat, lon };
  } catch { /* repli ci-dessous */ }
  return { label: `Ma position (${lat.toFixed(4)}, ${lon.toFixed(4)})`, lat, lon };
}