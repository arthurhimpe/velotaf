// Cap (0-360°, 0 = nord, 90 = est) du point 1 vers le point 2.
export function bearing(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLon = rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2))
          - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Distance en km entre deux points (formule de haversine)
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
          + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Choisit `count` points régulièrement répartis le long du tracé.
// Chaque point reçoit : idx (position dans coords), km parcourus, cap local.
export function sampleRoute(coords, count = 6) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + distanceKm(...coords[i - 1], ...coords[i]));
  }
  const total = cum[cum.length - 1];

  const idxs = new Set();
  for (let k = 0; k < count; k++) {
    const target = k === count - 1 ? total : (total * k) / (count - 1);
    idxs.add(cum.findIndex((c) => c >= target));
  }
  const samples = [...idxs].sort((a, b) => a - b)
    .map((i) => ({ idx: i, lat: coords[i][0], lon: coords[i][1], km: cum[i] }));

  // Cap local = direction vers le point suivant (ou depuis le précédent pour le dernier)
  samples.forEach((s, j) => {
    const next = samples[j + 1];
    const prev = samples[j - 1];
    s.bearing = next ? bearing(s.lat, s.lon, next.lat, next.lon)
              : prev ? bearing(prev.lat, prev.lon, s.lat, s.lon)
              : 0;
  });
  return { samples, totalKm: total };
}