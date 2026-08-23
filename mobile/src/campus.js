import * as SecureStore from 'expo-secure-store';

// Skolens område – lokalt på telefonen.
//
// Tidligere sendte appen koordinaten til /api/geo/check for hver skjerm som
// skulle vise GPS-status. Det er en ren avstandsberegning, så vi gjør den her
// i stedet: ingen nettverksrundtur, og statusen virker uten dekning.
//
// Dette er kun for VISNING. Selve registreringen valideres uansett på nytt av
// serveren (routes/firelist.js og routes/andakt.js), så verdiene her er ikke
// en sikkerhetsgrense – de kan trygt ligge i appen.
//
// Fallbacken må holdes lik standardverdiene i server/src/config.js. Skolen kan
// overstyre dem med SCHOOL_LAT/SCHOOL_LNG/SCHOOL_RADIUS_METERS i drift, og da
// henter appen den gjeldende verdien fra /api/geo/campus ved innlogging og
// cacher den – slik at en flytting ikke krever ny app-versjon.
const FALLBACK = { lat: 60.18023, lng: 5.42007, radiusMeters: 200 };
const STORE_KEY = 'kongshaug_campus';

let campus = FALLBACK;
let loaded = false; // har vi noe annet enn fallbacken?

export function getCampus() {
  return campus;
}

// Vet vi hvor skolen faktisk er, eller står vi på fallbacken? Er svaret nei,
// bør statusen vente på serveren – ellers kan første oppstart etter en
// installasjon vise «du er ikke ved skolen» fordi appen måler mot feil punkt.
export function isCampusLoaded() {
  return loaded;
}

// Godta bare verdier som gir mening. En ødelagt cache (eller et uventet svar)
// skal falle tilbake til fallbacken, ikke gi «du er 6000 km unna skolen».
function valid(c) {
  const { lat, lng, radiusMeters } = c || {};
  return (
    Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180 &&
    Number.isFinite(radiusMeters) && radiusMeters >= 10 && radiusMeters <= 5000
  );
}

// Ta i bruk (og lagre) et område hentet fra serveren.
export async function setCampus(next) {
  const c = {
    lat: Number(next?.lat),
    lng: Number(next?.lng),
    radiusMeters: Number(next?.radiusMeters),
  };
  if (!valid(c)) return false;
  campus = c;
  loaded = true;
  try { await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(c)); } catch { /* cache er valgfri */ }
  return true;
}

// Les det cachede området ved oppstart, før serveren er spurt.
export async function loadCachedCampus() {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return campus;
    const c = JSON.parse(raw);
    if (valid(c)) { campus = c; loaded = true; }
  } catch { /* beholder fallbacken */ }
  return campus;
}

// Avstand i meter mellom to koordinater (haversine).
// Samme formel som server/src/geo.js – de må gi samme svar.
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

// Er koordinaten innenfor skolens område? Returnerer { ok, distance }.
export function isOnCampus(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, distance: null };
  }
  const distance = distanceMeters(lat, lng, campus.lat, campus.lng);
  return { ok: distance <= campus.radiusMeters, distance: Math.round(distance) };
}
