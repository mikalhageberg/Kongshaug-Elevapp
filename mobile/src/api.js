import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { getCampus, setCampus, isOnCampus, isCampusLoaded } from './campus';

// ── Finn adressen til backend ────────────────────────────────
// 1) Hvis extra.apiUrl er satt i app.json, brukes den (f.eks. i drift).
// 2) Ellers utledes dev-maskinens IP fra Metro-verten, slik at appen på
//    telefonen når serveren på PC-en uten at du må skrive inn IP manuelt.
function resolveBaseUrl() {
  const override = Constants.expoConfig?.extra?.apiUrl;
  if (override) {
    const url = String(override).trim().replace(/\/$/, '');
    // Tåler at apiUrl er satt uten protokoll («vert.example.com»): fetch krever
    // en absolutt URL, så vi antar https når skjema mangler.
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
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

// ── Nettverk ─────────────────────────────────────────────────
//
// Android-telefonene på skolen mister kontakten med serveren ofte nok til at
// det merkes: et wifi uten fungerende rute ut, et bytte mellom wifi og
// mobildata, eller en forbindelse som døde mens appen lå stille. Uten
// tidsavbrudd og gjenforsøk ble ett slikt blaff umiddelbart til «Network
// request failed» i ansiktet på eleven.
//
// Derfor: alle kall får en frist, og de som trygt kan sendes to ganger får ett
// stille forsøk til. Feiler det likevel, sier meldingen hva telefonen mente om
// nettet sitt – det er den opplysningen som skiller «skolens wifi er nede» fra
// «serveren er nede».

const REQUEST_TIMEOUT_MS = 15 * 1000;
const UPLOAD_TIMEOUT_MS = 60 * 1000;   // bilder er store og trenger lengre snor
const RETRY_DELAY_MS = 500;

// POST-kall som tåler å komme fram to ganger. Alle tre skriver med ON CONFLICT
// på (bruker, dato), så et duplikat gir samme rad – se routes/firelist.js og
// routes/andakt.js. Andre POST-kall (gjest, øving) står bevisst ikke her: der
// ville et gjenforsøk kunne lage en ekstra registrering.
const IDEMPOTENTE_POST = [
  '/api/firelist/checkin',
  '/api/firelist/away',
  '/api/andakt/checkin',
];

function kanGjenforsøkes(method, path) {
  if (method === 'GET') return true;
  return method === 'POST' && IDEMPOTENTE_POST.includes(path.split('?')[0]);
}

// Hva telefonen selv mener om nettet sitt, i klartekst. Dette er hele grunnen
// til at expo-network er med: uten det er «fikk ikke kontakt» like taust for
// deg som for eleven.
async function nettstatus() {
  try {
    const s = await Network.getNetworkStateAsync();
    if (s.isConnected === false) return 'uten nett';
    const type = { WIFI: 'wifi', CELLULAR: 'mobildata', NONE: 'uten nett' }[s.type]
      || String(s.type || 'ukjent nett').toLowerCase();
    return s.isInternetReachable === false ? `${type}, uten internett` : type;
  } catch {
    return 'ukjent nett';
  }
}

// Ett forsøk, med frist. Kaster en feil merket .network når det er nettet som
// svikter – til forskjell fra en HTTP-feilkode, som betyr at serveren svarte.
async function fetchEnGang(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (ex) {
    const err = new Error(ex?.name === 'AbortError' ? 'tidsavbrudd' : (ex?.message || 'nettverksfeil'));
    err.network = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function nettverksfeil(ex, forsøk, msBrukt) {
  const nett = await nettstatus();
  const err = new Error(`Fikk ikke kontakt med serveren (${nett}). Prøv igjen.`);
  err.code = 'network';
  err.network = { grunn: ex.message, nett, forsøk, msBrukt };
  return err;
}

async function hent(url, options, { timeoutMs = REQUEST_TIMEOUT_MS, retry = false } = {}) {
  const start = Date.now();
  for (let forsøk = 1; ; forsøk++) {
    try {
      return await fetchEnGang(url, options, timeoutMs);
    } catch (ex) {
      if (!ex.network) throw ex;
      // Ett stille forsøk til – de fleste blaffene varer kortere enn pausen.
      if (!retry || forsøk >= 2) throw await nettverksfeil(ex, forsøk, Date.now() - start);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

// Last opp et bilde som base64. React Native har ingen pålitelig måte å sende
// rå bytes på, så bildet går som base64-tekst med en egen Content-Type –
// serveren dekoder. Den globale JSON-parseren (100 kB) rører den ikke.
// Ikke gjenforsøkt: en opplasting som kom halvveis fram skal ikke sendes om
// igjen på egen hånd.
export async function uploadBase64(path, base64) {
  const res = await hent(BASE_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/base64',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: base64,
  }, { timeoutMs: UPLOAD_TIMEOUT_MS });
  let data = null;
  try { data = await res.json(); } catch { /* tomt */ }
  if (!res.ok) throw new Error(data?.error || 'Kunne ikke laste opp bildet');
  return data;
}

// ── Fetch-hjelper ────────────────────────────────────────────
export async function api(path, { method = 'GET', body } = {}) {
  const res = await hent(BASE_URL + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }, { retry: kanGjenforsøkes(method, path) });
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
//
// GPS er den trege delen av en innsjekk: en kald høypresisjons-fix tar
// sekunder, verre innendørs. Derfor to skilte veier:
//
//  · VISNING (banneret på Hjem/Brannliste/Andakt) skal svare raskt. Den viser
//    siste kjente posisjon med én gang hvis den er fersk nok, og oppdaterer
//    seg selv når den presise fiksen lander. Fiksen deles mellom skjermene, så
//    man ikke betaler for en ny hver gang eleven bytter fane.
//
//  · REGISTRERING henter alltid en fersk posisjon i det eleven trykker. Den
//    gjenbruker aldri et cachet punkt: koordinaten som sendes inn skal være
//    der eleven er NÅ, ikke der telefonen var da skjermen ble åpnet.

const FIX_TTL_MS = 60 * 1000;          // hvor lenge en fix deles mellom skjermene
const LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000;  // eldre enn dette gjetter vi ikke på
const LAST_KNOWN_ACCURACY_M = 100;     // og upresise punkter dropper vi også
const EDGE_MARGIN_M = 50;              // «nær grensen» – da trengs det presisjon
const FIX_TIMEOUT_MS = 12 * 1000;      // heller en tydelig feil enn å henge
const PRECISE_TIMEOUT_MS = 6 * 1000;   // ekstrarunden for presisjon får kortere snor

// Hvor gammelt et punkt får være før telefonen må regne ut et nytt.
//
// Uten dette tvinger Android fram en helt fersk beregning hver gang: expo-
// location setter maxUpdateAge til intervallet for nøyaktigheten – 3 sekunder
// for Balanced, 2 for High (se LocationHelpers.kt). En stillestående telefon
// innendørs klarer ofte ikke det, og kallet henger eller svarer «current
// location is unavailable». Det var derfor posisjonen virket nøyaktig én gang
// etter at tillatelsen ble gitt: akkurat da fantes det et punkt som var yngre
// enn tre sekunder.
//
// timeInterval styrer den grensen. Med den satt svarer telefonen med punktet
// den allerede har, og regner bare ut et nytt når det er for gammelt.
// Grensene er satt slik at de er trygge, ikke slik at de er strengest mulig.
// Et punkt fra det siste minuttet er «her, nå» – man rekker under hundre meter
// til fots – og ligger uansett langt unna det gamle skolepunktet en elev
// hjemme kunne hatt liggende fra i går. Strengere enn dette gjør bare at
// registreringen feiler for en telefon som står stille innendørs.
const VISNING_MAX_ALDER_MS = 60 * 1000;         // banneret
const INNSJEKK_MAX_ALDER_MS = 60 * 1000;        // registrering
const INNSJEKK_NØD_ALDER_MS = 2 * 60 * 1000;    // siste utvei ved registrering
const NØD_MAX_ALDER_MS = 5 * 60 * 1000;         // siste utvei for visningen

let cachedFix = null; // { coords, accuracy, at }

function toFix(pos) {
  return {
    coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
    accuracy: pos.coords.accuracy ?? null,
    at: pos.timestamp || Date.now(),
  };
}

function withTimeout(promise, ms, message = 'Fikk ikke posisjon. Prøv igjen.') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// Be om tilgang bare når vi faktisk mangler den – å spørre systemet på nytt
// hver gang koster tid selv når svaret er ja for lengst.
async function ensurePermission() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') return;
  const asked = await Location.requestForegroundPermissionsAsync();
  if (asked.status !== 'granted') throw new Error('Du må gi appen tilgang til posisjon');
}

// Er svaret så nær grensen at usikkerheten i fiksen alene kan avgjøre det?
// Da – og bare da – er det verdt å vente på en høypresisjons-fix.
function nearEdge(fix) {
  const { distance } = isOnCampus(fix.coords.lat, fix.coords.lng);
  if (distance == null) return true;
  const margin = Math.max(fix.accuracy || 0, EDGE_MARGIN_M);
  return Math.abs(distance - getCampus().radiusMeters) <= margin;
}

// Et punkt vi kan vise umiddelbart – eller null hvis vi ikke har noe godt nok.
// Aldri brukt til registrering.
async function quickFix() {
  if (cachedFix && Date.now() - cachedFix.at < FIX_TTL_MS) return cachedFix;
  const last = await Location.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
    requiredAccuracy: LAST_KNOWN_ACCURACY_M,
  }).catch(() => null);
  return last ? toFix(last) : null;
}

// En fersk fix. Balanced (~100 m) holder til å avgjøre de aller fleste
// tilfellene mot en radius på et par hundre meter, og virker langt bedre
// innendørs enn ren GPS. Vi eskalerer til High kun når svaret står og vipper.
async function freshFix(maxAlderMs) {
  const balanced = toFix(await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: maxAlderMs }),
    FIX_TIMEOUT_MS));
  let fix = balanced;
  if (nearEdge(balanced)) {
    // Et forsøk, ikke et krav: kommer ikke det presise punktet raskt, er det
    // vi alt har bedre enn en mislykket registrering. QR-koden på andakt
    // utløper mens vi venter.
    fix = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: maxAlderMs }),
      PRECISE_TIMEOUT_MS)
      .then(toFix)
      .catch(() => balanced);
  }
  cachedFix = fix;
  return fix;
}

// Feilene fra Android og iOS er engelske og tekniske («Current location is
// unavailable...»). Eleven skal se noe forståelig, mens den rå teksten blir
// med som detalj så du kan se hva som faktisk skjedde.
function posisjonsfeil(ex) {
  const rå = ex?.message || '';
  // Vår egen tekst om manglende tillatelse skal stå som den er.
  if (/tilgang/i.test(rå)) return ex;
  const err = new Error('Fikk ikke posisjon fra telefonen. Sjekk at stedstjenester er på, og prøv igjen.');
  err.code = 'nogps';
  err.detail = rå;
  return err;
}

function statusOf(fix, provisional, stale = false) {
  const { ok, distance } = isOnCampus(fix.coords.lat, fix.coords.lng);
  return { coords: fix.coords, ok, distance, provisional, stale };
}

// Hent skolens område fra serveren og cache det lokalt. Kalles ved innlogging;
// feiler den, står appen igjen med forrige cache eller fallbacken.
let campusPending = null;
export function refreshCampus() {
  campusPending = (async () => {
    try { await setCampus(await api('/api/geo/campus')); } catch { /* beholder cachen */ }
    return getCampus();
  })();
  return campusPending;
}

// Har vi aldri sett skolens virkelige område – første oppstart etter en
// installasjon – er det verdt å vente noen sekunder på serveren før vi måler.
// Å svare feil er verre enn å bruke et øyeblikk ekstra; men henger nettet,
// måler vi heller mot fallbacken enn å la banneret stå tomt.
async function campusReady() {
  if (isCampusLoaded()) return;
  await withTimeout(campusPending || refreshCampus(), 4000, 'tidsavbrudd').catch(() => {});
}

// Status til VISNING. Kaller onUpdate med et foreløpig svar (provisional: true)
// hvis telefonen alt har et ferskt punkt, og deretter én gang til med det
// endelige. Feiler den, kommer { error }. Returnerer en avbryt-funksjon, så en
// skjerm som forlates ikke oppdaterer state etter unmount.
export function resolveCampusStatus(onUpdate) {
  let cancelled = false;
  const emit = (s) => { if (!cancelled) onUpdate(s); };
  (async () => {
    try {
      await campusReady();
      await ensurePermission();
      const quick = await quickFix();
      if (quick) emit(statusOf(quick, true));
      emit(statusOf(await freshFix(VISNING_MAX_ALDER_MS), false));
    } catch (ex) {
      // Fikk vi ikke noe ferskt, er et gammelt punkt bedre enn en feilmelding
      // i banneret – men det merkes som gammelt, og blir aldri et grønt «GPS
      // OK». Har vi ingenting i det hele tatt, sier vi fra.
      const nød = await Location.getLastKnownPositionAsync({ maxAge: NØD_MAX_ALDER_MS }).catch(() => null);
      if (nød) emit(statusOf(toFix(nød), false, true));
      else emit({ error: posisjonsfeil(ex).message, provisional: false });
    }
  })();
  return () => { cancelled = true; };
}

// Fersk posisjon til REGISTRERING. Går alltid utenom cachen.
export async function getFreshPosition() {
  await campusReady();
  await ensurePermission();
  try {
    return (await freshFix(INNSJEKK_MAX_ALDER_MS)).coords;
  } catch (ex) {
    // Siste utvei: et punkt fra de siste par minuttene. En telefon som står
    // stille innendørs klarer ikke alltid å regne ut noe nytt i det hele tatt,
    // og da er alternativet at eleven ikke får registrert seg. To minutter er
    // kort nok til at det fortsatt er der eleven står – og altfor kort til at
    // gårsdagens skolepunkt kan snike seg inn. Finnes ikke engang det, skal
    // registreringen feile.
    const nød = await Location.getLastKnownPositionAsync({ maxAge: INNSJEKK_NØD_ALDER_MS }).catch(() => null);
    if (!nød) throw posisjonsfeil(ex);
    const fix = toFix(nød);
    cachedFix = fix;
    return fix.coords;
  }
}
