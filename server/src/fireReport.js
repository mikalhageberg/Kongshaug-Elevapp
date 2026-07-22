import db from './db.js';
import { todayDate } from './andaktToken.js';
import { config } from './config.js';

// Bygg brannliste-oversikten for en gitt natt (night_date = dagen natten begynner).
// Samme struktur som /api/firelist/overview.
export function getFireOverview(nightDate = todayDate()) {
  const students = db
    .prepare(
      `SELECT u.id, u.full_name, u.dorm, u.room, f.status, f.checked_at
       FROM users u
       LEFT JOIN fire_checkins f
         ON f.user_id = u.id AND f.night_date = ?
       WHERE u.role = 'student' AND u.active = 1
       ORDER BY u.dorm COLLATE NOCASE, CAST(u.room AS INTEGER), u.full_name COLLATE NOCASE`
    )
    .all(nightDate);

  const scheduledAway = new Set(
    db.prepare('SELECT DISTINCT user_id FROM fire_away_periods WHERE ? BETWEEN start_date AND end_date').all(nightDate).map((r) => r.user_id)
  );

  const dorms = {};
  let present = 0, away = 0, missing = 0;
  for (const s of students) {
    const key = s.dorm || 'Uten internat';
    (dorms[key] ||= { dorm: key, total: 0, present: 0, students: [] });
    dorms[key].total++;
    const status = s.status || (scheduledAway.has(s.id) ? 'away' : 'missing');
    if (status === 'present') { dorms[key].present++; present++; }
    else if (status === 'away') away++;
    else missing++;
    dorms[key].students.push({ id: s.id, fullName: s.full_name, room: s.room, status, checkedAt: s.checked_at });
  }

  return {
    nightDate,
    total: students.length,
    present,
    away,
    missing,
    dorms: Object.values(dorms),
  };
}

// Hvilken natt skal rapporteres når jobben kjører nå?
// Før kl. 18 rapporteres natten som nettopp er ferdig («natt til i dag»); fra
// kl. 18 rapporteres kveldens kommende natt («natt til i morgen»).
// Klokkeslettet regnes i skolens tidssone – serveren kjører UTC i drift, så
// getHours() ville flyttet grensen to timer om sommeren.
export function reportNightDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.school.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const hour = Number(get('hour'));

  // Dagens dato i skolens tidssone, som UTC-midnatt så dag-aritmetikk er trygg.
  const d = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
  if (hour < 18) d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' -> 'natt til <neste dag>' i lesbar norsk form.
const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
export function nightLabel(nightDate) {
  const [y, m, d] = nightDate.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${WEEKDAYS[next.getDay()]} ${next.getDate()}. ${MONTHS[next.getMonth()]} ${next.getFullYear()}`;
}
export function formatCheckedAt(iso) {
  if (!iso) return '';
  const dt = new Date(iso.replace(' ', 'T') + 'Z');
  return dt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
}
