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
  const ensureDorm = (name) => (dorms[name] ||= { dorm: name, total: 0, present: 0, students: [], guests: [] });
  let present = 0, away = 0, missing = 0;
  for (const s of students) {
    const key = s.dorm || 'Uten internat';
    const dorm = ensureDorm(key);
    dorm.total++;
    const status = s.status || (scheduledAway.has(s.id) ? 'away' : 'missing');
    if (status === 'present') { dorm.present++; present++; }
    else if (status === 'away') away++;
    else missing++;
    dorm.students.push({ id: s.id, fullName: s.full_name, room: s.room, status, checkedAt: s.checked_at });
  }

  // Godkjente gjester som sover på internatet denne natten. De listes i internatet
  // de sover i (g.dorm), merket «Gjest hos [vert]». Verten kan bo i et annet internat.
  const guests = db
    .prepare(
      `SELECT g.id, g.guest_name, g.dorm, g.host_user_id, u.full_name AS host_name, u.dorm AS host_dorm
         FROM fire_guests g
         JOIN users u ON u.id = g.host_user_id
        WHERE g.status = 'approved' AND ? BETWEEN g.start_date AND g.end_date
        ORDER BY g.guest_name COLLATE NOCASE`
    )
    .all(nightDate);
  for (const g of guests) {
    const dorm = ensureDorm(g.dorm || 'Uten internat');
    dorm.guests.push({ id: g.id, name: g.guest_name, hostId: g.host_user_id, hostName: g.host_name, hostDorm: g.host_dorm || null });
  }

  return {
    nightDate,
    total: students.length,
    present,
    away,
    missing,
    guestCount: guests.length,
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
