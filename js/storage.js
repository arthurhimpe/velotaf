const KEY = 'velotaf.trip';

export function loadTrip() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function saveTrip(trip) {
  try { localStorage.setItem(KEY, JSON.stringify(trip)); } catch { /* stockage indisponible */ }
}