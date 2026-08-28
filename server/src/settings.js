import db from './db.js';
import { config } from './config.js';

export function hhmmToMinutes(s) {
  const [h, m] = String(s).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minutesToHHMM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Gyldig HH:MM (00:00–23:59)
export const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Standardverdier – brukes hvis ingenting er lagret ennå.
const DEFAULTS = {
  andaktDeadline: minutesToHHMM(config.andakt.deadlineMinutes), // f.eks. "08:10"
  andaktWeekdaysOnly: true,        // andakt kun mandag–fredag
  andaktArchiveWeeks: 12,          // hvor mange ukesrapporter arkivet tar vare på
  // Tidsvinduet QR-koden er tilgjengelig i, regnet fra fristen (se andaktWindow.js).
  andaktQrOpenBefore: 30,          // minutter FØR fristen koden dukker opp
  andaktQrCloseAfter: 30,          // minutter ETTER fristen koden stenger
  // Brannliste: tidsvindu om kvelden man kan melde seg til stede. Egne tider for
  // hverdag (søn–tor), fredag og lørdag. Lukketid kan være ≤ åpningstid i helgen
  // (krysser midnatt), se fireWindow.js. Lukketidene arver de gamle «frist»-
  // verdiene for eksisterende installasjoner (se getSettings).
  fireOpenWeekday: '20:00',
  fireCloseWeekday: '23:00',
  fireOpenFriday: '20:00',
  fireCloseFriday: '00:00',
  fireOpenSaturday: '20:00',
  fireCloseSaturday: '00:00',
  fireEmailEnabled: false,         // send brannlisten på e-post automatisk
  fireEmailRecipient: '',          // e-post til ansvarlig lærer
  fireEmailTime: '14:15',          // klokkeslett for automatisk utsending
  kitchenEmailEnabled: false,      // send middagsoversikt til kjøkkenet automatisk
  kitchenEmailRecipient: '',       // e-post til kjøkkenet
  kitchenEmailTime: '13:00',       // klokkeslett for utsending til kjøkkenet
  kitchenEmailFromName: 'Kongshaug Kjøkken', // avsendernavn for middags-e-posten
  kitchenEmailFrom: '',            // valgfri egen avsender-e-post (må være verifisert i Brevo)
  fireReminderPushEnabled: false,  // send push-påminnelse kl 20:00 til elever som ikke har krysset seg av
  dutyPushEnabled: false,          // varsle om kjøkkentjeneste/internatvask søndag kl 18:00
  // Øvekonkurransen. Tom periode = ingen konkurranse satt opp.
  practiceStartDate: '',           // 'YYYY-MM-DD', første dag
  practiceEndDate: '',             // 'YYYY-MM-DD', siste dag (inklusiv)
  practiceWarmupMinutes: 10,       // obligatorisk oppvarming før øvingen
  practicePhotoPercent: 50,        // hvor stor andel av øktene som må dokumenteres
  guestEmailEnabled: false,        // varsle på e-post når en elev melder gjest
  guestEmailRecipient: '',         // e-post som mottar gjesteforespørsler
  // Lagringstid (se retention.js). Standard: historikk slettes etter ett år,
  // GPS-koordinatene nulles allerede etter et døgn.
  retentionEnabled: true,          // slett datert historikk automatisk
  retentionDays: 365,              // hvor lenge historikken beholdes
  gpsRetentionHours: 24,           // hvor lenge koordinatene beholdes
};

// Grenser for lagringstiden. Nedre grense hindrer at et feiltrykk sletter
// inneværende uke; øvre grense holder «for alltid» utenfor rekkevidde.
export const RETENTION_DAYS_MIN = 30;
export const RETENTION_DAYS_MAX = 3650;
export const GPS_HOURS_MIN = 1;
export const GPS_HOURS_MAX = 168;   // en uke
// Andaktsarkivet: hvor mange ukesrapporter som beholdes. Minst én uke – null
// ville gjort arkivet tomt i det du åpnet det. Taket ligger på fem skoleår, og
// den generelle lagringstiden over gjelder uansett som ytre grense.
export const ARCHIVE_WEEKS_MIN = 1;
export const ARCHIVE_WEEKS_MAX = 260;
// Andakts-QR-ens tidsvindu. Taket på tre timer holder «hele dagen» utenfor
// rekkevidde – et vindu som står åpent gjør registreringen verdiløs.
// Åpningen må være minst ett minutt: dukket koden opp først i fristminuttet,
// ville ingen rukket å bli registrert som til stede. Lukkingen kan derimot
// være 0, som er måten å si «ingen slingringsmonn – etter fristen er det fravær».
export const QR_BEFORE_MIN = 1;
export const QR_BEFORE_MAX = 180;
export const QR_AFTER_MIN = 0;
export const QR_AFTER_MAX = 180;
// Oppvarmingen. Null ville gjort den obligatoriske oppvarmingen valgfri i
// praksis; taket hindrer at et feiltrykk låser elevene ute av å øve.
export const WARMUP_MIN = 1;
export const WARMUP_MAX = 60;
// Andelen økter som må dokumenteres. 0 = aldri, 100 = alltid – begge er gyldige
// valg: 100 mens elevene læres opp, 0 hvis skolen dropper dokumentasjonen.
export const PHOTO_PERCENT_MIN = 0;
export const PHOTO_PERCENT_MAX = 100;

// Leser et heltall fra settings-tabellen (alt lagres som tekst der), og faller
// tilbake på standarden hvis verdien mangler eller er ulesbar.
function intOr(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Som intOr, men 0 er en gyldig verdi og ikke «mangler».
function intOrZero(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    andaktDeadline: s.andaktDeadline ?? DEFAULTS.andaktDeadline,
    andaktWeekdaysOnly: s.andaktWeekdaysOnly != null ? s.andaktWeekdaysOnly === 'true' : DEFAULTS.andaktWeekdaysOnly,
    andaktArchiveWeeks: intOr(s.andaktArchiveWeeks, DEFAULTS.andaktArchiveWeeks),
    andaktQrOpenBefore: intOr(s.andaktQrOpenBefore, DEFAULTS.andaktQrOpenBefore),
    andaktQrCloseAfter: intOrZero(s.andaktQrCloseAfter, DEFAULTS.andaktQrCloseAfter),
    // Lukketider arver de gamle fristene (fireDeadline*) for eksisterende
    // installasjoner, så ingen mister sin innstilte kveldsfrist ved oppgradering.
    fireOpenWeekday: s.fireOpenWeekday ?? DEFAULTS.fireOpenWeekday,
    fireCloseWeekday: s.fireCloseWeekday ?? s.fireDeadlineWeekday ?? DEFAULTS.fireCloseWeekday,
    fireOpenFriday: s.fireOpenFriday ?? DEFAULTS.fireOpenFriday,
    fireCloseFriday: s.fireCloseFriday ?? s.fireDeadlineWeekday ?? DEFAULTS.fireCloseFriday,
    fireOpenSaturday: s.fireOpenSaturday ?? DEFAULTS.fireOpenSaturday,
    fireCloseSaturday: s.fireCloseSaturday ?? s.fireDeadlineSaturday ?? DEFAULTS.fireCloseSaturday,
    fireEmailEnabled: s.fireEmailEnabled != null ? s.fireEmailEnabled === 'true' : DEFAULTS.fireEmailEnabled,
    fireEmailRecipient: s.fireEmailRecipient ?? DEFAULTS.fireEmailRecipient,
    fireEmailTime: s.fireEmailTime ?? DEFAULTS.fireEmailTime,
    kitchenEmailEnabled: s.kitchenEmailEnabled != null ? s.kitchenEmailEnabled === 'true' : DEFAULTS.kitchenEmailEnabled,
    kitchenEmailRecipient: s.kitchenEmailRecipient ?? DEFAULTS.kitchenEmailRecipient,
    kitchenEmailTime: s.kitchenEmailTime ?? DEFAULTS.kitchenEmailTime,
    kitchenEmailFromName: s.kitchenEmailFromName ?? DEFAULTS.kitchenEmailFromName,
    kitchenEmailFrom: s.kitchenEmailFrom ?? DEFAULTS.kitchenEmailFrom,
    fireReminderPushEnabled: s.fireReminderPushEnabled != null ? s.fireReminderPushEnabled === 'true' : DEFAULTS.fireReminderPushEnabled,
    dutyPushEnabled: s.dutyPushEnabled != null ? s.dutyPushEnabled === 'true' : DEFAULTS.dutyPushEnabled,
    guestEmailEnabled: s.guestEmailEnabled != null ? s.guestEmailEnabled === 'true' : DEFAULTS.guestEmailEnabled,
    guestEmailRecipient: s.guestEmailRecipient ?? DEFAULTS.guestEmailRecipient,
    retentionEnabled: s.retentionEnabled != null ? s.retentionEnabled === 'true' : DEFAULTS.retentionEnabled,
    retentionDays: intOr(s.retentionDays, DEFAULTS.retentionDays),
    gpsRetentionHours: intOr(s.gpsRetentionHours, DEFAULTS.gpsRetentionHours),
    practiceStartDate: s.practiceStartDate ?? DEFAULTS.practiceStartDate,
    practiceEndDate: s.practiceEndDate ?? DEFAULTS.practiceEndDate,
    practiceWarmupMinutes: intOr(s.practiceWarmupMinutes, DEFAULTS.practiceWarmupMinutes),
    // Egen lesing her: intOr forkaster 0, og 0 % er en gyldig innstilling.
    practicePhotoPercent: Number.isInteger(Number(s.practicePhotoPercent))
      ? Number(s.practicePhotoPercent)
      : DEFAULTS.practicePhotoPercent,
  };
}

export function setSettings(partial) {
  const up = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((obj) => {
    for (const [k, v] of Object.entries(obj)) up.run(k, String(v));
  });
  tx(partial);
  return getSettings();
}

// Intern tilstand for e-postplanleggeren: hvilken dato e-posten sist ble sendt.
// Ligger i samme tabell, men holdes utenfor getSettings() – dette er ikke noe
// admin skal endre. Lagres i databasen, ikke i minnet, slik at en omstart av
// serveren rundt sendetidspunktet ikke fører til at e-posten sendes to ganger.
export function getLastSent(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}
export function setLastSent(key, dateKey) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, dateKey);
}

// Er det andakt i dag? (kun ukedager hvis andaktWeekdaysOnly er på)
export function isAndaktDay(date = new Date(), settings = getSettings()) {
  if (!settings.andaktWeekdaysOnly) return true;
  const d = date.getDay(); // 0 = søndag, 6 = lørdag
  return d >= 1 && d <= 5;
}
