// Lagringsbegrensning: rydder bort data som ikke lenger trengs.
//
// To jobber, med hvert sitt formål:
//
//  1. GPS-nulling. Koordinatene har bare verdi i det øyeblikket de sendes inn –
//     de brukes til å avgjøre om eleven faktisk er på skolens område, og leses
//     aldri igjen etterpå. Etter noen timer nulles de, mens statusen (til stede
//     / borte / for sent) blir stående. Det er statusen brannsikkerheten
//     trenger, ikke hvor eleven sto.
//
//  2. Sletting etter lagringstiden. Datert historikk eldre enn den fastsatte
//     perioden (standard ett skoleår) slettes for godt. Skolen setter perioden
//     selv under Innstillinger.
//
// Nullingen kjøres hver 15. minutt, slettingen én gang i døgnet. Ingenting her
// er tidskritisk: et døgn uten kjøring (nedetid) tas igjen ved neste kjøring.

import db from './db.js';
import { getSettings, getLastSent, setLastSent } from './settings.js';
import { zonedNow } from './emailScheduler.js';

const TICK_INTERVAL_MS = 15 * 60 * 1000;
// Hvilken dato slettejobben sist kjørte. Ligger i settings-tabellen på samme
// måte som e-postplanleggerens «sist sendt», så en omstart ikke gir dobbelt løp.
const LAST_RUN_KEY = 'retentionLastRun';

// Tabellene med datert historikk, og hvilken kolonne som avgjør alderen.
// Sluttdatoen brukes der raden dekker et spenn – en periode som fortsatt løper
// skal ikke slettes fordi den startet for lenge siden.
const EXPIRING = [
  ['fire_checkins', 'night_date', 'brannliste'],
  ['andakt_checkins', 'session_date', 'andakt'],
  ['fire_away_periods', 'end_date', 'planlagt fravær'],
  ['dinner_optouts', 'date', 'middagsavmelding'],
  ['fire_guests', 'end_date', 'gjester'],
  ['kitchen_duties', 'week_start', 'kjøkkentjeneste'],
  ['andakt_sessions', 'session_date', 'andakts-økter'],
];

function positiveInt(value, navn) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Ugyldig ${navn}: ${value}`);
  return n;
}

// Nuller lat/lng på registreringer eldre enn `hours` timer. Statusen og
// tidspunktet blir stående – det er bare stedet som forsvinner.
export function scrubCoordinates(hours) {
  const cutoff = `-${positiveInt(hours, 'antall timer')} hours`;
  const scrub = (table) =>
    db
      .prepare(
        `UPDATE ${table} SET lat = NULL, lng = NULL
          WHERE (lat IS NOT NULL OR lng IS NOT NULL)
            AND checked_at < datetime('now', ?)`
      )
      .run(cutoff).changes;
  return db.transaction(() => ({ fire: scrub('fire_checkins'), andakt: scrub('andakt_checkins') }))();
}

// Sletter all datert historikk eldre enn `days` dager. Alt eller ingenting.
export function deleteExpired(days) {
  const cutoff = `-${positiveInt(days, 'antall dager')} days`;
  return db.transaction(() => {
    const perTabell = {};
    let total = 0;
    for (const [table, column, label] of EXPIRING) {
      const n = db.prepare(`DELETE FROM ${table} WHERE ${column} < date('now', ?)`).run(cutoff).changes;
      if (n) perTabell[label] = n;
      total += n;
    }
    return { total, perTabell };
  })();
}

// Kort, lesbar oppsummering til loggen: «brannliste 12, andakt 9».
export function summarize(perTabell) {
  return Object.entries(perTabell).map(([k, n]) => `${k} ${n}`).join(', ');
}

// Ett gjennomløp. Nullingen skjer hver gang, slettingen bare første gang i døgnet.
export function runRetention(now = zonedNow(), log = console) {
  const s = getSettings();

  const scrubbed = scrubCoordinates(s.gpsRetentionHours);
  if (scrubbed.fire || scrubbed.andakt) {
    log.log(`  🧹 GPS-koordinater nullet · brannliste ${scrubbed.fire}, andakt ${scrubbed.andakt}`);
  }

  if (!s.retentionEnabled) return { scrubbed, deleted: null };
  if (getLastSent(LAST_RUN_KEY) === now.dateKey) return { scrubbed, deleted: null };

  const deleted = deleteExpired(s.retentionDays);
  // Merkes som kjørt FØRST etter at slettingen faktisk gikk gjennom – feiler
  // den, prøver vi igjen ved neste tick i stedet for å hoppe over døgnet.
  setLastSent(LAST_RUN_KEY, now.dateKey);
  if (deleted.total) {
    log.log(`  🧹 Slettet ${deleted.total} rader eldre enn ${s.retentionDays} dager · ${summarize(deleted.perTabell)}`);
  }
  return { scrubbed, deleted };
}

// Kjør begge jobbene med én gang, uavhengig av døgn-sperren og av/på-bryteren.
// Brukes av «Kjør sletting nå» i admin.
export function runRetentionNow() {
  const s = getSettings();
  const scrubbed = scrubCoordinates(s.gpsRetentionHours);
  const deleted = deleteExpired(s.retentionDays);
  setLastSent(LAST_RUN_KEY, zonedNow().dateKey);
  return { scrubbed, deleted, retentionDays: s.retentionDays, gpsRetentionHours: s.gpsRetentionHours };
}

export function startRetentionScheduler() {
  const s = getSettings();
  const slettes = s.retentionEnabled
    ? `historikk slettes etter ${s.retentionDays} dager`
    : 'automatisk sletting er AV';
  console.log(`  🧹 Datarydding startet · GPS nulles etter ${s.gpsRetentionHours} timer · ${slettes}`);
  const tick = () => {
    try { runRetention(); } catch (ex) { console.error(`  🧹 Datarydding feilet: ${ex.message}`); }
  };
  tick();
  setInterval(tick, TICK_INTERVAL_MS);
}
