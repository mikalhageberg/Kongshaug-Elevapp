import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin, isAppReviewUser } from '../auth.js';
import { isOnCampus } from '../geo.js';
import { todayDate } from '../andaktToken.js';
import { fireWindowNow, currentNightDate } from '../fireWindow.js';
import { getFireOverview } from '../fireReport.js';

// Lagre koordinat kun når det faktisk er et tall – ellers NULL. Hindrer at
// NaN havner i databasen når klienten sender manglende/ugyldig posisjon.
const coordOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

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
  const reviewBypass = isAppReviewUser(req.auth?.username);
  if (reviewBypass) console.warn(`[app-review-bypass] brannliste-innsjekk uten vindu-/GPS-sjekk for «${req.auth.username}»`);

  // Tidsvindu: til stede kan bare meldes i kveldens vindu. App-review-kontoen
  // hopper over (den kan verken være på skolen eller treffe vinduet).
  const win = fireWindowNow();
  if (!win.isOpen && !reviewBypass) {
    return res.status(403).json({
      error: 'closed',
      message: win.state === 'before'
        ? `Registreringen åpner kl. ${win.opensAt}.`
        : `Registreringen stengte kl. ${win.closesAt}.`,
      windowState: win.state, opensAt: win.opensAt, closesAt: win.closesAt,
    });
  }

  const campus = reviewBypass ? { ok: true, distance: 0 } : isOnCampus(Number(lat), Number(lng));
  if (!campus.ok) {
    return res.status(403).json({
      error: 'offsite',
      message: 'Du er ikke på skolens område. Kan ikke melde deg til stede herfra.',
      distance: campus.distance,
    });
  }
  const night = win.nightDate ?? currentNightDate();
  // Overskriver også en tidligere "borte"-melding hvis eleven likevel er på skolen.
  db.prepare(
    `INSERT INTO fire_checkins (user_id, night_date, status, lat, lng)
     VALUES (@uid, @night, 'present', @lat, @lng)
     ON CONFLICT(user_id, night_date)
       DO UPDATE SET status = 'present', checked_at = datetime('now'), lat = @lat, lng = @lng`
  ).run({ uid: req.auth.sub, night, lat: coordOrNull(lat), lng: coordOrNull(lng) });

  const row = db
    .prepare('SELECT checked_at FROM fire_checkins WHERE user_id = ? AND night_date = ?')
    .get(req.auth.sub, night);
  res.json({ status: 'present', nightDate: night, checkedAt: row.checked_at });
});

// ── ELEV: meld at du IKKE er på skolen i natt (ingen GPS- eller vindu-krav) ──
// Kan meldes når som helst – vinduet gjelder bare tilstedeværelse.
router.post('/away', (req, res) => {
  const night = currentNightDate();
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
  const night = currentNightDate();
  const win = fireWindowNow();
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
    // Vinduet for å melde seg til stede: klienten viser nedtelling / stengt.
    window: { isOpen: win.isOpen, state: win.state, opensAt: win.opensAt, closesAt: win.closesAt },
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
  // Admin kan overstyre når som helst – ikke bundet av kveldsvinduet.
  const night = currentNightDate();

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
  res.json(getFireOverview(currentNightDate()));
});

// ── GJESTER ──────────────────────────────────────────────────
// En elev (host) har en gjest som sover i et internat et datospenn. Godkjente
// gjester føres på brannlisten hver natt i spennet. Admin legger til godkjente
// gjester direkte; elever sender forespørsler som venter på godkjenning.

const guestPublic = (g) => ({
  id: g.id,
  guestName: g.guest_name,
  dorm: g.dorm,
  startDate: g.start_date,
  endDate: g.end_date,
  status: g.status,
  createdBy: g.created_by,
  hostId: g.host_user_id,
  hostName: g.host_name,
  hostDorm: g.host_dorm,
});

// Felles validering av gjeste-felt. Returnerer { error } eller { value }.
function parseGuest(body) {
  const guestName = String(body?.guestName || '').trim().slice(0, 80);
  const dorm = String(body?.dorm || '').trim().slice(0, 60);
  let { startDate, endDate } = body || {};
  endDate = endDate || startDate;
  if (!guestName) return { error: 'Gjestens navn kreves.' };
  if (!dorm) return { error: 'Velg hvilket internat gjesten sover i.' };
  if (!isValidDate(startDate) || !isValidDate(endDate)) return { error: 'Ugyldig dato.' };
  if (endDate < startDate) return { error: 'Sluttdato kan ikke være før startdato.' };
  return { value: { guestName, dorm, startDate, endDate } };
}

const GUEST_SELECT =
  `SELECT g.*, u.full_name AS host_name, u.dorm AS host_dorm
     FROM fire_guests g JOIN users u ON u.id = g.host_user_id`;

// ADMIN: alle gjester – ventende forespørsler + kommende/pågående godkjente.
router.get('/guests', requireAdmin, (req, res) => {
  const today = todayDate();
  const pending = db.prepare(`${GUEST_SELECT} WHERE g.status = 'pending' ORDER BY g.start_date`).all();
  const upcoming = db.prepare(`${GUEST_SELECT} WHERE g.status = 'approved' AND g.end_date >= ? ORDER BY g.start_date`).all(today);
  res.json({ pending: pending.map(guestPublic), upcoming: upcoming.map(guestPublic) });
});

// ADMIN: legg til en godkjent gjest for en elev.
router.post('/guests', requireAdmin, (req, res) => {
  const { error, value } = parseGuest(req.body);
  if (error) return res.status(400).json({ error });
  const hostId = Number(req.body?.hostUserId);
  const host = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student' AND active = 1").get(hostId);
  if (!host) return res.status(400).json({ error: 'Fant ingen aktiv elev som vert.' });
  const info = db.prepare(
    `INSERT INTO fire_guests (host_user_id, guest_name, dorm, start_date, end_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'approved', 'admin')`
  ).run(hostId, value.guestName, value.dorm, value.startDate, value.endDate);
  const g = db.prepare(`${GUEST_SELECT} WHERE g.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ guest: guestPublic(g) });
});

// ADMIN: godkjenn en ventende forespørsel.
router.post('/guests/:id/approve', requireAdmin, (req, res) => {
  const info = db.prepare("UPDATE fire_guests SET status = 'approved' WHERE id = ? AND status = 'pending'").run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Fant ikke forespørselen' });
  const g = db.prepare(`${GUEST_SELECT} WHERE g.id = ?`).get(Number(req.params.id));
  res.json({ guest: guestPublic(g) });
});

// ADMIN: slett/avvis en gjest (uansett status).
router.delete('/guests/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM fire_guests WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Fant ikke gjesten' });
  res.json({ ok: true });
});

// ELEV: mine gjester (ventende + godkjente, kommende/pågående).
router.get('/guests/me', (req, res) => {
  const today = todayDate();
  const rows = db.prepare(
    `${GUEST_SELECT} WHERE g.host_user_id = ? AND g.end_date >= ? ORDER BY g.start_date`
  ).all(req.auth.sub, today);
  res.json({ guests: rows.map(guestPublic) });
});

// ELEV: be om å få registrere en gjest – havner som 'pending' hos admin.
router.post('/guests/request', (req, res) => {
  const { error, value } = parseGuest(req.body);
  if (error) return res.status(400).json({ error });
  const info = db.prepare(
    `INSERT INTO fire_guests (host_user_id, guest_name, dorm, start_date, end_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'pending', 'student')`
  ).run(req.auth.sub, value.guestName, value.dorm, value.startDate, value.endDate);
  const g = db.prepare(`${GUEST_SELECT} WHERE g.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ guest: guestPublic(g) });
});

// ELEV: trekk tilbake / slett egen gjest (kun sin egen).
router.delete('/guests/me/:id', (req, res) => {
  const info = db.prepare('DELETE FROM fire_guests WHERE id = ? AND host_user_id = ?').run(Number(req.params.id), req.auth.sub);
  if (!info.changes) return res.status(404).json({ error: 'Fant ikke gjesten' });
  res.json({ ok: true });
});

export default router;
