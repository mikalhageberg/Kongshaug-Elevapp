import db from './db.js';
import { todayDate } from './andaktToken.js';

// Hvem "meldt av" middag på en gitt dato = per-dag avmelding ELLER en planlagt
// fraværsperiode som dekker dagen og er merket "vil ikke ha middag".
export function dinnerOptedOutSet(date = todayDate()) {
  const manual = db.prepare('SELECT user_id FROM dinner_optouts WHERE date = ?').all(date).map((r) => r.user_id);
  const period = db.prepare('SELECT DISTINCT user_id FROM fire_away_periods WHERE no_dinner = 1 AND ? BETWEEN start_date AND end_date').all(date).map((r) => r.user_id);
  return new Set([...manual, ...period]);
}

// Hvem spiser middag i dag? Eleven spiser med mindre de har meldt seg av middag.
export function getDinnerReport(date = todayDate()) {
  const students = db
    .prepare("SELECT id, full_name, class_name, dorm FROM users WHERE role='student' AND active=1 ORDER BY full_name COLLATE NOCASE")
    .all();

  const optedOut = dinnerOptedOutSet(date);

  let eating = 0;
  const notEating = [];
  for (const s of students) {
    if (optedOut.has(s.id)) { notEating.push({ name: s.full_name }); continue; }
    eating++;
  }

  return { date, total: students.length, eating, notEating };
}
