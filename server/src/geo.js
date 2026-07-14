import { config } from './config.js';

// Avstand i meter mellom to koordinater (haversine).
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // jordas radius i meter
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Er koordinaten innenfor skolens område?
// Returnerer { ok, distance }.
export function isOnCampus(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, distance: null };
  }
  const distance = distanceMeters(lat, lng, config.school.lat, config.school.lng);
  return { ok: distance <= config.school.radiusMeters, distance: Math.round(distance) };
}
