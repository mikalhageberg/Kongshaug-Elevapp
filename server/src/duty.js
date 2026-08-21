// Ukestjenester på rundgang: kjøkkentjeneste og internatvask.
//
// De to fungerer likt – elevene settes opp én uke av gangen, uken identifiseres
// av mandagsdatoen (se isoWeek.js) – og deler derfor all logikk her. Forskjellen
// er bare hvilken tabell radene ligger i, og hva tjenesten heter for eleven.
//
// `kind` ('kitchen' | 'dorm') er nøkkelen inn i KINDS. Tabellnavnene slås opp
// der og settes aldri sammen fra klientdata, slik at de trygt kan interpoleres
// inn i SQL-en under.

import db from './db.js';
import { currentWeekStart, shiftWeek, weekInfo } from './isoWeek.js';

export const KINDS = {
  kitchen: {
    table: 'kitchen_duties',
    navn: 'Kjøkkentjeneste',
    // Brukes i push-varselet og i OpenAI-ledeteksten ved Excel-import.
    varselTittel: 'Kjøkkentjeneste neste uke',
    ledetekst: 'kjøkkentjeneste',
  },
  dorm: {
    table: 'dorm_duties',
    navn: 'Internatvask',
    varselTittel: 'Internatvask neste uke',
    ledetekst: 'internatvask',
  },
};

export const KIND_KEYS = Object.keys(KINDS);

export function kindOf(kind) {
  const k = KINDS[kind];
  if (!k) throw new Error(`Ukjent tjenestetype: ${kind}`);
  return k;
}

// Elevene som har tjeneste en gitt uke, i navnerekkefølge.
export function dutyStudents(kind, weekStart) {
  const { table } = kindOf(kind);
  return db
    .prepare(
      `SELECT u.id, u.full_name, u.class_name, u.dorm
         FROM ${table} d
         JOIN users u ON u.id = d.user_id
        WHERE d.week_start = ?
        ORDER BY u.full_name COLLATE NOCASE`
    )
    .all(weekStart)
    .map((u) => ({ id: u.id, fullName: u.full_name, className: u.class_name, dorm: u.dorm }));
}

// Én uke med tjenestelisten – formen klientene får servert.
export function dutyWeek(kind, weekStart, today = currentWeekStart()) {
  return {
    ...weekInfo(weekStart),
    isCurrent: weekStart === today,
    students: dutyStudents(kind, weekStart),
  };
}

// Flere uker på rad, fra og med `from`.
export function dutyWeeks(kind, from, count) {
  const today = currentWeekStart();
  return Array.from({ length: count }, (_, i) => dutyWeek(kind, shiftWeek(from, i), today));
}

// Har denne eleven tjeneste i uken som starter `weekStart`?
export function hasDuty(kind, userId, weekStart) {
  const { table } = kindOf(kind);
  return !!db
    .prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND week_start = ?`)
    .get(userId, weekStart);
}

// Bare id-ene – til push-varsling, der navn og klasse ikke trengs. Kun aktive
// elever: en deaktivert konto skal ikke få varsel om en uke den ikke har.
export function dutyUserIds(kind, weekStart) {
  const { table } = kindOf(kind);
  return db
    .prepare(
      `SELECT d.user_id FROM ${table} d
         JOIN users u ON u.id = d.user_id
        WHERE d.week_start = ? AND u.active = 1`
    )
    .all(weekStart)
    .map((r) => r.user_id);
}
