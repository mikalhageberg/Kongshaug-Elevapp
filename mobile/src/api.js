import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import Constants from 'expo-constants';

// ── Finn adressen til backend ────────────────────────────────
// 1) Hvis extra.apiUrl er satt i app.json, brukes den (f.eks. i drift).
// 2) Ellers utledes dev-maskinens IP fra Metro-verten, slik at appen på
//    telefonen når serveren på PC-en uten at du må skrive inn IP manuelt.
function resolveBaseUrl() {
  const override = Constants.expoConfig?.extra?.apiUrl;
  if (override) return override.replace(/\/$/, '');
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    '';
  const host = String(hostUri).split(':')[0];
  if (host) return `http://${host}:3000`;
  return 'http://localhost:3000';
}

export const BASE_URL = resolveBaseUrl();

// ── Token-lagring (sikkert på enheten) ───────────────────────
let token = null;
export async function loadToken() {
  token = await SecureStore.getItemAsync('kongshaug_token');
  return token;
}
export async function setToken(t) {
  token = t || null;
  if (t) await SecureStore.setItemAsync('kongshaug_token', t);
  else await SecureStore.deleteItemAsync('kongshaug_token');
}

// ── Fetch-hjelper ────────────────────────────────────────────
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* tomt */ }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || 'Noe gikk galt');
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }
  return data;
}

// Full URL til en fil-endepunkt med token som query (så den kan åpnes direkte
// i nettleseren/PDF-visningen på telefonen).
export function fileUrl(path) {
  const sep = path.includes('?') ? '&' : '?';
  return `${BASE_URL}${path}${token ? `${sep}token=${encodeURIComponent(token)}` : ''}`;
}

// ── Posisjon ─────────────────────────────────────────────────
export async function getPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Du må gi appen tilgang til posisjon');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

// Sjekk mot skolens område. Returnerer { ok, distance } (meter).
export async function checkOnCampus(coords) {
  return api('/api/geo/check', { method: 'POST', body: coords });
}

// Hent posisjon OG sjekk om den er ved skolen i én operasjon.
// Returnerer { coords, ok, distance }.
export async function getPositionOnCampus() {
  const coords = await getPosition();
  const status = await checkOnCampus(coords);
  return { coords, ...status };
}
