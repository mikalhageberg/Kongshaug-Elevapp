import db from './db.js';
import { todayDate } from './andaktToken.js';

// Vanlige allergier/hensyn (brukes i nedtrekkslisten i appen).
export const COMMON_ALLERGIES = [
  'Gluten', 'Laktose', 'Melk', 'Egg', 'Nøtter', 'Peanøtter', 'Soya',
  'Fisk', 'Skalldyr', 'Skjell', 'Sesam', 'Selleri', 'Sennep', 'Sulfitt',
  'Vegetar', 'Vegansk',
];

export function parseAllergies(json) {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [];
  } catch { return []; }
}

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
    .prepare("SELECT id, full_name, class_name, dorm, allergies FROM users WHERE role='student' AND active=1 ORDER BY full_name COLLATE NOCASE")
    .all();

  const optedOut = dinnerOptedOutSet(date);

  let eating = 0;
  const notEating = [];
  const allergyMap = new Map();

  for (const s of students) {
    if (optedOut.has(s.id)) { notEating.push({ name: s.full_name }); continue; }
    eating++;
    for (const a of parseAllergies(s.allergies)) {
      if (!allergyMap.has(a)) allergyMap.set(a, []);
      allergyMap.get(a).push(s.full_name);
    }
  }

  const allergyGroups = [...allergyMap.entries()]
    .map(([allergy, names]) => ({ allergy, count: names.length, students: names }))
    .sort((a, b) => b.count - a.count || a.allergy.localeCompare(b.allergy, 'nb'));

  return { date, total: students.length, eating, notEating, allergyGroups };
}
