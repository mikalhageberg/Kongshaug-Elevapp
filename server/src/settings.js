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
};

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    andaktDeadline: s.andaktDeadline ?? DEFAULTS.andaktDeadline,
    andaktWeekdaysOnly: s.andaktWeekdaysOnly != null ? s.andaktWeekdaysOnly === 'true' : DEFAULTS.andaktWeekdaysOnly,
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
