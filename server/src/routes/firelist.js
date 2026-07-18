import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { isOnCampus } from '../geo.js';
import { todayDate } from '../andaktToken.js';
import { fireDeadlineForDay } from '../settings.js';
import { getFireOverview } from '../fireReport.js';
import { config } from '../config.js';

// Sant kun for den ene, navngitte App/Play Store-reviewer-kontoen (om satt).
// Se config.appReview – tomt = alltid false, altså av som standard.
// Case-ufølsom sammenligning (brukernavn er alltid små bokstaver i praksis,
// men sammenlign trygt uansett).
function isReviewAccount(auth) {
  return !!config.appReview.bypassUsername
    && String(auth?.username || '').toLowerCase() === config.appReview.bypassUsername;
}

const router = Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
// Er brukeren planlagt borte (via en periode) en gitt natt?
function isScheduledAway(userId, night) {
  return !!db.prepare(
    'SELECT 1 FROM fire_away_periods WHERE user_id = ? AND ? BETWEEN start_date AND end_date LIMIT 1'
  ).get(userId, night);
}

// ── ELEV: meld deg til stede på brannlisten i kveld ──────────
router.post('/checkin', (req, res) => {
  const { lat, lng } = req.body || {};
  const reviewBypass = isReviewAccount(req.auth);
  if (reviewBypass) console.warn(`[app-review-bypass] brannliste-innsjekk uten GPS-sjekk for «${req.auth.username}»`);
  const campus = reviewBypass ? { ok: true, distance: 0 } : isOnCampus(Number(lat), Number(lng));
  if (!campus.ok) {
    return res.status(403).json({
      error: 'offsite',
      message: 'Du er ikke på skolens område. Kan ikke melde deg til stede herfra.',
      distance: campus.distance,
    });
  }
  const night = todayDate();
  // Overskriver også en tidligere "borte"-melding hvis eleven likevel er på skolen.
  db.prepare(
    `INSERT INTO fire_checkins (user_id, night_date, status, lat, lng)
     VALUES (@uid, @night, 'present', @lat, @lng)
     ON CONFLICT(user_id, night_date)
       DO UPDATE SET status = 'present', checked_at = datetime('now'), lat = @lat, lng = @lng`
  ).run({ uid: req.auth.sub, night, lat: Number(lat), lng: Number(lng) });

  const row = db
    .prepare('SELECT checked_at FROM fire_checkins WHERE user_id = ? AND night_date = ?')
    .get(req.auth.sub, night);
  res.json({ status: 'present', nightDate: night, checkedAt: row.checked_at });
});

// ── ELEV: meld at du IKKE er på skolen i natt (ingen GPS-krav) ──
router.post('/away', (req, res) => {
  const night = todayDate();
  db.prepare(
    `INSERT INTO fire_checkins (user_id, night_date, status, lat, lng)
     VALUES (@uid, @night, 'away', NULL, NULL)
     ON CONFLICT(user_id, night_date)
       DO UPDATE SET status = 'away', checked_at = datetime('now'), lat = NULL, lng = NULL`
  ).run({ uid: req.auth.sub, night });

  // Valgfritt: meld også av middag for i dag.
  const { noDinner } = req.body || {};
  if (noDinner === true) db.prepare('INSERT OR IGNORE INTO dinner_optouts (user_id, date) VALUES (?, ?)').run(req.auth.sub, night);
  else if (noDinner === false) db.prepare('DELETE FROM dinner_optouts WHERE user_id = ? AND date = ?').run(req.auth.sub, night);

  const row = db
    .prepare('SELECT checked_at FROM fire_checkins WHERE user_id = ? AND night_date = ?')
    .get(req.auth.sub, night);
  res.json({ status: 'away', nightDate: night, checkedAt: row.checked_at, noDinner: noDinner === true });
});

// ── ELEV: min status i kveld ─────────────────────────────────
router.get('/status', (req, res) => {
  const night = todayDate();
  const row = db
    .prepare('SELECT status, checked_at FROM fire_checkins WHERE user_id = ? AND night_date = ?')
    .get(req.auth.sub, night);
  // Uten egen registrering i kveld: en planlagt fravær-periode gir "borte".
  let status = row?.status || null;
  let scheduled = false;
  if (!row && isScheduledAway(req.auth.sub, night)) { status = 'away'; scheduled = true; }
  const noDinner = !!db.prepare('SELECT 1 FROM dinner_optouts WHERE user_id=? AND date=?').get(req.auth.sub, night);
  res.json({
    nightDate: night,
    status,                          // 'present' | 'away' | null
    scheduled,                       // true = borte pga. planlagt periode
    noDinner,                        // meldt av middag i dag
    checkedIn: status === 'present',
    checkedAt: row?.checked_at || null,
    deadline: fireDeadlineForDay(),
  });
});

// ── ELEV: planlagt fravær (perioder) ─────────────────────────
// Liste over kommende/pågående perioder for eleven.
router.get('/away-periods', (req, res) => {
  const today = todayDate();
  const rows = db
    .prepare('SELECT id, start_date, end_date, no_dinner FROM fire_away_periods WHERE user_id = ? AND end_date >= ? ORDER BY start_date')
    .all(req.auth.sub, today);
  res.json({ periods: rows.map((r) => ({ id: r.id, startDate: r.start_date, endDate: r.end_date, noDinner: !!r.no_dinner })) });
});

// Legg til en periode (én dag = samme fra/til).
router.post('/away-period', (req, res) => {
  let { startDate, endDate, noDinner } = req.body || {};
  endDate = endDate || startDate;
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return res.status(400).json({ error: 'Ugyldig dato. Bruk formatet ÅÅÅÅ-MM-DD.' });
  }
  if (endDate < startDate) return res.status(400).json({ error: 'Sluttdato kan ikke være før startdato.' });
  const info = db
    .prepare('INSERT INTO fire_away_periods (user_id, start_date, end_date, no_dinner) VALUES (?, ?, ?, ?)')
    .run(req.auth.sub, startDate, endDate, noDinner ? 1 : 0);
  const r = db.prepare('SELECT id, start_date, end_date, no_dinner FROM fire_away_periods WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ period: { id: r.id, startDate: r.start_date, endDate: r.end_date, noDinner: !!r.no_dinner } });
});

// Slett en periode (kun sin egen).
router.delete('/away-period/:id', (req, res) => {
  const info = db.prepare('DELETE FROM fire_away_periods WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.auth.sub);
  if (!info.changes) return res.status(404).json({ error: 'Fant ikke perioden' });
  res.json({ ok: true });
});

// ── ADMIN: sett en elevs status manuelt (f.eks. mistet telefon) ──
// body: { userId, status: 'present' | 'away' | 'clear' }. Ingen GPS-krav.
router.post('/admin-checkin', requireAdmin, (req, res) => {
  const uid = Number(req.body?.userId);
  const status = req.body?.status;
  const u = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(uid);
  if (!u) return res.status(404).json({ error: 'Fant ikke eleven' });
  const night = todayDate();

  if (status === 'clear') {
    db.prepare('DELETE FROM fire_checkins WHERE user_id = ? AND night_date = ?').run(uid, night);
    return res.json({ ok: true, status: 'cleared' });
  }
  if (status !== 'present' && status !== 'away') {
    return res.status(400).json({ error: 'Ugyldig status' });
  }
  db.prepare(
    `INSERT INTO fire_checkins (user_id, night_date, status, lat, lng)
     VALUES (?, ?, ?, NULL, NULL)
     ON CONFLICT(user_id, night_date)
       DO UPDATE SET status = excluded.status, checked_at = datetime('now'), lat = NULL, lng = NULL`
  ).run(uid, night, status);
  res.json({ ok: true, status });
});

// ── ADMIN: oversikt over kveldens brannliste, gruppert på internat ──
router.get('/overview', requireAdmin, (req, res) => {
  res.json(getFireOverview(todayDate()));
});

export default router;
