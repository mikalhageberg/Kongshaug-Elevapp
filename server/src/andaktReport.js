// Selve innholdet i andakts-rapporten: hvem som var borte, og hvem som kom for
// sent. Bor her – ikke i ruten – fordi tre steder trenger nøyaktig det samme
// regnestykket: dagens sanntidsliste, «eksporter denne uken», og arkivet som
// fryser hver ferdige uke. Regnet de ulikt, ville arkivet vist andre tall enn
// skjermen gjorde den dagen det gjaldt.

import db from './db.js';
import { getSettings, hhmmToMinutes, isAndaktDay } from './settings.js';
import { weekInfo } from './isoWeek.js';

// Hvor mange minutter etter fristen ble et oppmøte registrert (skolens tidssone)?
export function lateMinutesFor(checkedAt, deadlineMin) {
  if (!checkedAt) return null;
  const dt = new Date(String(checkedAt).replace(' ', 'T') + 'Z');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(dt);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  const diff = h * 60 + m - deadlineMin;
  return diff > 0 ? diff : 0;
}

// 'YYYY-MM-DD' + n dager. Lokal tid, som resten av dato-regningen vår.
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Oppmøte + fravær for én gitt dato.
export function daySummary(date) {
  const rows = db
    .prepare(
      `SELECT u.id, u.full_name, u.class_name, u.dorm, u.room, a.status, a.checked_at
       FROM andakt_checkins a
       JOIN users u ON u.id = a.user_id
       WHERE a.session_date = ?
       ORDER BY a.checked_at DESC`
    )
    .all(date);
  const deadlineMin = hhmmToMinutes(getSettings().andaktDeadline);

  // Elever som IKKE har registrert oppmøte denne dagen = fravær på andakt.
  // På dager uten andakt (f.eks. helg) er det ingen fravær.
  const [y, m, d] = date.split('-').map(Number);
  const andaktDay = isAndaktDay(new Date(y, m - 1, d, 12));
  const absentRows = andaktDay
    ? db
        .prepare(
          `SELECT u.id, u.full_name, u.class_name, u.dorm, u.room
           FROM users u
           WHERE u.role = 'student' AND u.active = 1
             AND u.id NOT IN (SELECT user_id FROM andakt_checkins WHERE session_date = ?)
           ORDER BY u.full_name COLLATE NOCASE`
        )
        .all(date)
    : [];

  return {
    sessionDate: date,
    andaktToday: andaktDay,
    checkins: rows.map((r) => ({
      id: r.id, fullName: r.full_name, className: r.class_name, dorm: r.dorm, room: r.room,
      status: r.status, checkedAt: r.checked_at,
      minutesLate: r.status === 'late' ? lateMinutesFor(r.checked_at, deadlineMin) : null,
    })),
    absentList: absentRows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      className: r.class_name,
      dorm: r.dorm,
      room: r.room,
    })),
  };
}

// Rapportformen for én dag: bare det ukesrapporten faktisk viser – fravær og
// for sent. De som møtte i tide er utenfor rapporten, og lagres ikke i arkivet.
export function dayReport(date) {
  const s = daySummary(date);
  return {
    sessionDate: s.sessionDate,
    andaktToday: s.andaktToday,
    absentList: s.absentList,
    lateList: s.checkins.filter((c) => c.status === 'late'),
  };
}

// Hele uken (mandag–søndag) som én rapport. weekStart er mandagsdatoen.
export function weekReport(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(dayReport(addDays(weekStart, i)));
  return {
    ...weekInfo(weekStart),
    days,
    absentCount: days.reduce((n, d) => n + d.absentList.length, 0),
    lateCount: days.reduce((n, d) => n + d.lateList.length, 0),
  };
}

// Ble det registrert oppmøte i det hele tatt denne uken? Brukes av arkivet:
// en uke uten en eneste registrering er ferie eller tiden før appen ble tatt i
// bruk, og en «rapport» der alle står som fraværende sier ingenting.
export function weekHasCheckins(weekStart) {
  const n = db
    .prepare('SELECT COUNT(*) AS n FROM andakt_checkins WHERE session_date BETWEEN ? AND ?')
    .get(weekStart, addDays(weekStart, 6)).n;
  return n > 0;
}
