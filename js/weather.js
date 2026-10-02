const API = 'https://api.open-meteo.com/v1/forecast';

// date : "AAAA-MM-JJ" (aujourd'hui jusqu'à J+15)
export async function fetchDay(lat, lon, date) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,'
          + 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code',
    daily: 'sunrise,sunset',
    timezone: 'auto',
    start_date: date,
    end_date: date,
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo : erreur ${res.status}`);
  return res.json();
}

// Extrait l'heure voulue (0-23) sous la forme attendue par scoreSlot().
export function slotAt(data, hour, bearing) {
  const h = data.hourly;
  return {
    temp: h.temperature_2m[hour],
    apparentTemp: h.apparent_temperature[hour],
    precipMm: h.precipitation[hour],
    precipProb: h.precipitation_probability[hour] ?? 0,
    windSpeed: h.wind_speed_10m[hour],
    windDir: h.wind_direction_10m[hour],
    gusts: h.wind_gusts_10m[hour],
    weatherCode: h.weather_code[hour],
    isNight: h.time[hour] < data.daily.sunrise[0] || h.time[hour] > data.daily.sunset[0],
    bearing,
  };
}

// Météo de plusieurs points en un seul appel (Open-Meteo accepte des listes de coordonnées).
export async function fetchPoints(points, date) {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
    hourly: 'precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    timezone: 'auto',
    start_date: date,
    end_date: date,
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo : erreur ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [json];
}