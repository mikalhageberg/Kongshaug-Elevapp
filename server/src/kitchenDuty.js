import db from './db.js';
import { currentWeekStart, shiftWeek, weekInfo } from './isoWeek.js';

// Elevene som har kjøkkentjeneste en gitt uke, i navnerekkefølge.
export function dutyStudents(weekStart) {
  return db
    .prepare(
      `SELECT u.id, u.full_name, u.class_name, u.dorm
         FROM kitchen_duties d
         JOIN users u ON u.id = d.user_id
        WHERE d.week_start = ?
        ORDER BY u.full_name COLLATE NOCASE`
    )
    .all(weekStart)
    .map((u) => ({ id: u.id, fullName: u.full_name, className: u.class_name, dorm: u.dorm }));
}

// Én uke med tjenestelisten – formen klientene får servert.
export function dutyWeek(weekStart, today = currentWeekStart()) {
  return {
    ...weekInfo(weekStart),
    isCurrent: weekStart === today,
    students: dutyStudents(weekStart),
  };
}

// Flere uker på rad, fra og med `from`.
export function dutyWeeks(from, count) {
  const today = currentWeekStart();
  return Array.from({ length: count }, (_, i) => dutyWeek(shiftWeek(from, i), today));
}

// Har denne eleven tjeneste i uken som starter `weekStart`?
export function hasDuty(userId, weekStart) {
  return !!db
    .prepare('SELECT 1 FROM kitchen_duties WHERE user_id = ? AND week_start = ?')
    .get(userId, weekStart);
}
