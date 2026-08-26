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
    // Oppgaver med kode og signatur finnes bare for internatvask (se dormTasks.js).
    hasTasks: false,
  },
  dorm: {
    table: 'dorm_duties',
    navn: 'Internatvask',
    varselTittel: 'Internatvask neste uke',
    ledetekst: 'internatvask',
    hasTasks: true,
  },
};

export const KIND_KEYS = Object.keys(KINDS);

export function kindOf(kind) {
  const k = KINDS[kind];
  if (!k) throw new Error(`Ukjent tjenestetype: ${kind}`);
  return k;
}

// Én oppsatt tjeneste, slik klientene får den servert.
//
// `dutyId` er raden – den signeres. `id` er fortsatt elevens id, slik klientene
// alltid har lest den. Internatvask kan ha en oppgave og en signatur; for
// kjøkkentjeneste er begge null, så begge tjenestene har samme form.
const publicDuty = (r) => ({
  dutyId: r.duty_id,
  id: r.id,
  fullName: r.full_name,
  className: r.class_name,
  dorm: r.dorm,
  task: r.task_id
    ? { id: r.task_id, code: r.task_code, title: r.task_title, description: r.task_description }
    : null,
  done: r.done_at
    ? { at: r.done_at, method: r.done_method, by: r.done_by_name || null }
    : null,
});

// Tjenestene en gitt uke. Én rad per elev – og for internatvask én rad per
// elev PER oppgave, så samme elev kan stå oppført to ganger med hver sin
// oppgave. Sortert etter oppgavens rekkefølge på lista, så uken leses ovenfra
// og ned slik den gjør på papiret.
export function dutyStudents(kind, weekStart) {
  const { table, hasTasks } = kindOf(kind);
  if (!hasTasks) {
    return db
      .prepare(
        `SELECT d.id AS duty_id, u.id, u.full_name, u.class_name, u.dorm
           FROM ${table} d
           JOIN users u ON u.id = d.user_id
          WHERE d.week_start = ?
          ORDER BY u.full_name COLLATE NOCASE`
      )
      .all(weekStart)
      .map(publicDuty);
  }
  return db
    .prepare(
      `SELECT d.id AS duty_id, u.id, u.full_name, u.class_name, u.dorm,
              d.done_at, d.done_method, s.full_name AS done_by_name,
              t.id AS task_id, t.code AS task_code, t.title AS task_title,
              t.description AS task_description, t.sort_order AS task_sort
         FROM ${table} d
         JOIN users u ON u.id = d.user_id
    LEFT JOIN dorm_tasks t ON t.id = d.task_id
    LEFT JOIN users s ON s.id = d.done_by_user_id
        WHERE d.week_start = ?
        ORDER BY t.sort_order IS NULL, t.sort_order, t.id, u.full_name COLLATE NOCASE`
    )
    .all(weekStart)
    .map(publicDuty);
}

// Én oppsatt tjeneste med alt signaturen trenger: hvem den tilhører, hvilken
// uke, og om den alt er signert. Brukes av signerings-endepunktene.
export function dutyById(kind, dutyId) {
  const { table, hasTasks } = kindOf(kind);
  const rad = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(dutyId);
  if (!rad) return null;
  return {
    id: rad.id,
    userId: rad.user_id,
    weekStart: rad.week_start,
    taskId: hasTasks ? rad.task_id : null,
    doneAt: hasTasks ? rad.done_at : null,
    doneMethod: hasTasks ? rad.done_method : null,
  };
}

// Signer (eller fjern signaturen på) en oppsatt oppgave.
//   method – 'biometri' (Face ID i appen), 'passord' (nettleseren) eller 'admin'
//   byUserId – hvem som signerte; eleven selv, eller administratoren som gjorde det for henne
export function signDuty(kind, dutyId, { method, byUserId }) {
  const { table } = kindOf(kind);
  db.prepare(
    `UPDATE ${table} SET done_at = datetime('now'), done_method = ?, done_by_user_id = ? WHERE id = ?`
  ).run(method, byUserId, dutyId);
}

export function unsignDuty(kind, dutyId) {
  const { table } = kindOf(kind);
  db.prepare(
    `UPDATE ${table} SET done_at = NULL, done_method = NULL, done_by_user_id = NULL WHERE id = ?`
  ).run(dutyId);
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
      // DISTINCT: internatvask kan ha flere oppgaver på samme elev samme uke,
      // og da skal hun ha ett varsel, ikke ett per oppgave.
      `SELECT DISTINCT d.user_id FROM ${table} d
         JOIN users u ON u.id = d.user_id
        WHERE d.week_start = ? AND u.active = 1`
    )
    .all(weekStart)
    .map((r) => r.user_id);
}
