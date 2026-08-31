// Brannvakten: administratoren som har vakten en gitt natt.
//
// En administrator som logger inn i mobilappen får ikke brannlisten av
// innloggingen alene. Hun må i tillegg skanne dagens vakt-QR, som bare henger
// på adminsiden. Da vet systemet hvem som faktisk har vakten i kveld, og
// varselet om hvem som mangler kan gå til henne – ikke til alle som en gang
// har hatt appen installert.
//
// Vakten gjelder ÉN natt og må tas på nytt neste dag. Det er hele poenget med
// at koden skifter fra dag til dag: en gammel skjermdump gir ingen tilgang.

import crypto from 'node:crypto';
import db from './db.js';
import { osloParts } from './fireWindow.js';

// Klokkeslettet vakten går over til neste natt. Vakten skal ikke miste
// brannlisten midt i et opprop kl. 00:30, så natten «varer» til det lysner –
// den er uansett over lenge før noen tar den neste kveld.
export const WATCH_HANDOVER_HOUR = 6;

// Dagen før, som 'YYYY-MM-DD'. Regnes i UTC fra dato-delene, så en
// sommertidsovergang ikke flytter datoen.
function dayBefore({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

// Hvilken natt har vakten akkurat nå? Fram til kl. 06 hører man fortsatt til
// natten som gikk.
//
// Bevisst uavhengig av innsjekksvinduet i fireWindow.js: vinduet styrer når
// ELEVENE kan melde seg til stede, mens vakten har natten hel – også timene
// etter at vinduet stengte, som er nettopp når hun leter etter dem som mangler.
export function watchNightDate(now = new Date()) {
  const t = osloParts(now);
  return t.minutes < WATCH_HANDOVER_HOUR * 60 ? dayBefore(t) : t.dateKey;
}

// ── Dagens kode ──────────────────────────────────────────────
// Én hemmelighet per natt, som andakts-QR-en. Til forskjell fra den roterer
// ikke denne på sekundet: vakt-QR-en henger på adminsiden hele kvelden, og
// skal kunne skannes når vakten kommer på jobb. Det den beskytter mot er at
// gårsdagens kode fortsatt virker i dag.

export function getOrCreateWatchDay(nightDate = watchNightDate()) {
  let row = db.prepare('SELECT * FROM fire_watch_days WHERE night_date = ?').get(nightDate);
  if (!row) {
    db.prepare('INSERT INTO fire_watch_days (night_date, secret) VALUES (?, ?)')
      .run(nightDate, crypto.randomBytes(32).toString('hex'));
    row = db.prepare('SELECT * FROM fire_watch_days WHERE night_date = ?').get(nightDate);
  }
  return row;
}

// Ny hemmelighet for natten – gjør alle tidligere koder ubrukelige med én gang.
// Brukes hvis koden har kommet på avveie (avfotografert, delt videre).
export function rotateWatchSecret(nightDate = watchNightDate()) {
  getOrCreateWatchDay(nightDate);
  db.prepare('UPDATE fire_watch_days SET secret = ? WHERE night_date = ?')
    .run(crypto.randomBytes(32).toString('hex'), nightDate);
  return getOrCreateWatchDay(nightDate);
}

function sign(secret, nightDate) {
  return crypto.createHmac('sha256', secret).update(`vakt:${nightDate}`).digest('base64url').slice(0, 24);
}

// Innholdet i QR-koden: "VAKT1.<natt>.<signatur>"
export function currentWatchToken(nightDate = watchNightDate()) {
  const day = getOrCreateWatchDay(nightDate);
  return `VAKT1.${nightDate}.${sign(day.secret, nightDate)}`;
}

// Validerer en skannet kode. Returnerer { ok, reason, nightDate }.
export function verifyWatchToken(token, now = new Date()) {
  if (typeof token !== 'string') return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'VAKT1') return { ok: false, reason: 'invalid' };
  const [, nightDate, sig] = parts;

  const day = db.prepare('SELECT * FROM fire_watch_days WHERE night_date = ?').get(nightDate);
  if (!day) return { ok: false, reason: 'invalid' };

  // Koden må gjelde natten vi er inne i nå. Dette er det som gjør at gårsdagens
  // skjermdump ikke virker – sjekken av signaturen alene ville sluppet den inn.
  if (nightDate !== watchNightDate(now)) return { ok: false, reason: 'expired', nightDate };

  const expected = sign(day.secret, nightDate);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };
  return { ok: true, nightDate };
}

// ── Vaktlista ────────────────────────────────────────────────

// Registrer denne administratoren som vakt for natten. Flere kan ha vakt
// sammen – da får de begge varselet.
export function takeWatch(userId, nightDate = watchNightDate()) {
  db.prepare(
    `INSERT INTO fire_watch_shifts (user_id, night_date) VALUES (?, ?)
     ON CONFLICT(user_id, night_date) DO NOTHING`
  ).run(userId, nightDate);
  return db.prepare('SELECT * FROM fire_watch_shifts WHERE user_id = ? AND night_date = ?').get(userId, nightDate);
}

export function releaseWatch(userId, nightDate = watchNightDate()) {
  return db.prepare('DELETE FROM fire_watch_shifts WHERE user_id = ? AND night_date = ?')
    .run(userId, nightDate).changes > 0;
}

export function hasActiveWatch(userId, now = new Date()) {
  return !!db.prepare('SELECT 1 FROM fire_watch_shifts WHERE user_id = ? AND night_date = ?')
    .get(userId, watchNightDate(now));
}

// Hvem har vakt denne natten? Brukes både av adminsiden (som viser vaktlista
// under QR-koden) og av push-varselet (som bare går til disse).
export function watchers(nightDate = watchNightDate()) {
  return db.prepare(
    `SELECT s.user_id AS id, s.registered_at, u.full_name, u.username
       FROM fire_watch_shifts s JOIN users u ON u.id = s.user_id
      WHERE s.night_date = ? AND u.active = 1
      ORDER BY s.registered_at`
  ).all(nightDate).map((r) => ({
    id: r.id, fullName: r.full_name, username: r.username, registeredAt: r.registered_at,
  }));
}
