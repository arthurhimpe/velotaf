const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Décompose le vent par rapport au sens de marche.
// windFromDeg = direction D'OÙ vient le vent (convention Open-Meteo).
// head > 0 : vent de face, head < 0 : vent de dos.
export function windComponents(speedKmh, windFromDeg, bearingDeg) {
  const angle = ((windFromDeg - bearingDeg) * Math.PI) / 180;
  return { head: speedKmh * Math.cos(angle), cross: Math.abs(speedKmh * Math.sin(angle)) };
}

// Score 0-100 d'un créneau (aller OU retour).
export function scoreSlot(s) {
  const { head } = windComponents(s.windSpeed, s.windDir, s.bearing);
  const feel = s.apparentTemp;

  const penalties = {
    rain: clamp(0.20 * s.precipProb + 15 * s.precipMm, 0, 45),
    temp: clamp(feel < 12 ? 2.5 * (12 - feel) : feel > 24 ? 3 * (feel - 24) : 0, 0, 35),
    headwind: clamp(head - 10, 0, 30),
    gusts: s.gusts > 50 ? 15 : 0,
    night: s.isNight ? 10 : 0,
  };

  let score = 100 - Object.values(penalties).reduce((a, b) => a + b, 0);

  // Règles éliminatoires
  if (s.temp <= 1 && s.precipMm > 0) score = Math.min(score, 20); // verglas
  if (s.weatherCode >= 95) score = Math.min(score, 10);           // orage
  if (s.gusts > 70) score = Math.min(score, 15);                  // rafales

  return { score: Math.round(clamp(score, 0, 100)), penalties, head: Math.round(head) };
}

// Le pire trajet pèse plus lourd : une belle matinée ne compense pas un retour sous l'orage.
export function combine(a, b) {
  return Math.round(0.7 * Math.min(a, b) + 0.3 * Math.max(a, b));
}

export function verdict(score) {
  if (score >= 80) return 'Fonce !';
  if (score >= 60) return 'Sans souci';
  if (score >= 40) return 'Prévois de l\'équipement';
  if (score >= 20) return 'Bof…';
  return 'Déconseillé';
}