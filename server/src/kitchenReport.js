import db from './db.js';
import { todayDate } from './andaktToken.js';

// Hvem "meldt av" middag på en gitt dato = per-dag avmelding, en planlagt
// fraværsperiode som dekker dagen og er merket "vil ikke ha middag", ELLER at
// eleven er hjemmeboer. Hjemmeboeren spiser hjemme hver dag, og skal slippe å
// melde seg av på nytt hver morgen – på samme måte som hun står permanent som
// «hjemme» på brannlisten. Se fireReport.js.
export function dinnerOptedOutSet(date = todayDate()) {
  const manual = db.prepare('SELECT user_id FROM dinner_optouts WHERE date = ?').all(date).map((r) => r.user_id);
  const period = db.prepare('SELECT DISTINCT user_id FROM fire_away_periods WHERE no_dinner = 1 AND ? BETWEEN start_date AND end_date').all(date).map((r) => r.user_id);
  const home = db.prepare("SELECT id FROM users WHERE role = 'student' AND home_dweller = 1").all().map((r) => r.id);
  return new Set([...manual, ...period, ...home]);
}

// Hvem spiser middag i dag? Eleven spiser med mindre de har meldt seg av middag.
export function getDinnerReport(date = todayDate()) {
  const alle = db
    .prepare("SELECT id, full_name, class_name, dorm, home_dweller FROM users WHERE role='student' AND active=1 ORDER BY full_name COLLATE NOCASE")
    .all();

  // Hjemmeboerne holdes utenfor tallene, ikke bare trukket fra. Sto de i
  // «spiser ikke i dag», ville de samme fem navnene stått der hver eneste dag
  // og druknet dem kjøkkenet faktisk må merke seg – de som er borte nettopp i
  // dag. Antallet blir med som en egen opplysning, så 91 av 96 lar seg forklare.
  const students = alle.filter((s) => !s.home_dweller);
  const homeCount = alle.length - students.length;

  const optedOut = dinnerOptedOutSet(date);

  let eating = 0;
  const notEating = [];
  for (const s of students) {
    // Klasse og internat blir med: kjøkkenet lagrer ingen allergiopplysninger
    // i appen (se db.js), så de må kjenne igjen eleven på navnet. Med to som
    // heter det samme er navnet alene ikke nok.
    if (optedOut.has(s.id)) {
      notEating.push({ name: s.full_name, className: s.class_name, dorm: s.dorm });
      continue;
    }
    eating++;
  }

  return { date, total: students.length, eating, notEating, homeCount };
}
