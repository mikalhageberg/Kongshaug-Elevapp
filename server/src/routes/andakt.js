import { Router } from 'express';
import QRCode from 'qrcode';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { isOnCampus } from '../geo.js';
import { config } from '../config.js';
import { getSettings, hhmmToMinutes, isAndaktDay } from '../settings.js';
import {
  todayDate,
  currentToken,
  verifyToken,
  getOrCreateSession,
  rotateSecret,
} from '../andaktToken.js';

const router = Router();
router.use(requireAuth);

function minutesNow(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

// ── ELEV: registrer oppmøte ved å sende skannet QR-token + GPS ──
router.post('/checkin', (req, res) => {
  const { token, lat, lng } = req.body || {};

  const settings = getSettings();
  if (!isAndaktDay(new Date(), settings)) {
    return res.status(400).json({ error: 'no_andakt', message: 'Det er ikke andakt i dag.' });
  }

  const campus = isOnCampus(Number(lat), Number(lng));
  if (!campus.ok) {
    return res.status(403).json({
      error: 'offsite',
      message: 'Du er ikke på skolens område. Du må være på Kongshaug for å registrere oppmøte.',
    });
  }

  const check = verifyToken(token);
  if (!check.ok) {
    return res.status(400).json({
      error: check.reason, // 'expired' | 'invalid'
      message:
        check.reason === 'expired'
          ? 'QR-koden er ikke gyldig lenger. Skann koden som vises på storskjermen akkurat nå.'
          : 'QR-koden er ikke gyldig. Skann koden på storskjermen.',
    });
  }

  const date = todayDate();
  const status = minutesNow() > hhmmToMinutes(settings.andaktDeadline) ? 'late' : 'present';

  db.prepare(
    `INSERT INTO andakt_checkins (user_id, session_date, status, lat, lng)
     VALUES (@uid, @date, @status, @lat, @lng)
     ON CONFLICT(user_id, session_date) DO NOTHING`
  ).run({ uid: req.auth.sub, date, status, lat: Number(lat), lng: Number(lng) });

  const row = db
    .prepare('SELECT status, checked_at FROM andakt_checkins WHERE user_id = ? AND session_date = ?')
    .get(req.auth.sub, date);

  res.json({ status: row.status, sessionDate: date, checkedAt: row.checked_at });
});

// ── ELEV: min andakts-status i dag ───────────────────────────
router.get('/status', (req, res) => {
  const date = todayDate();
  const row = db
    .prepare('SELECT status, checked_at FROM andakt_checkins WHERE user_id = ? AND session_date = ?')
    .get(req.auth.sub, date);
  res.json({
    sessionDate: date,
    andaktToday: isAndaktDay(),
    registered: !!row,
    status: row?.status || null,
    checkedAt: row?.checked_at || null,
  });
});

// ── ADMIN: gjeldende QR (roterende token) som PNG-dataURL + antall ──
router.get('/qr', requireAuth, requireAdmin, async (req, res) => {
  const date = todayDate();
  getOrCreateSession(date);
  const token = currentToken(date);
  const dataUrl = await QRCode.toDataURL(token, { margin: 1, width: 512, errorCorrectionLevel: 'M' });
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM andakt_checkins WHERE session_date = ?')
    .get(date).n;
  res.json({
    sessionDate: date,
    qr: dataUrl,
    // Klienten henter dette på nytt hvert par sekund; koden roterer i takt.
    refreshMs: Math.min(config.andakt.qrTtlSeconds, 15) * 1000,
    count,
    deadline: config.andakt.deadlineMinutes,
  });
});

// ── ADMIN: ugyldiggjør alle tidligere koder for dagen ────────
router.post('/rotate', requireAuth, requireAdmin, (req, res) => {
  rotateSecret(todayDate());
  res.json({ ok: true });
});

// ── ADMIN: sett en elevs andakts-status manuelt (f.eks. mistet telefon) ──
// body: { userId, status: 'present' | 'late' | 'clear' }
router.post('/admin-checkin', requireAuth, requireAdmin, (req, res) => {
  const uid = Number(req.body?.userId);
  const status = req.body?.status;
  const u = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(uid);
  if (!u) return res.status(404).json({ error: 'Fant ikke eleven' });
  const date = todayDate();

  if (status === 'clear') {
    db.prepare('DELETE FROM andakt_checkins WHERE user_id = ? AND session_date = ?').run(uid, date);
    return res.json({ ok: true, status: 'cleared' });
  }
  if (status !== 'present' && status !== 'late') {
    return res.status(400).json({ error: 'Ugyldig status' });
  }
  db.prepare(
    `INSERT INTO andakt_checkins (user_id, session_date, status, lat, lng)
     VALUES (?, ?, ?, NULL, NULL)
     ON CONFLICT(user_id, session_date)
       DO UPDATE SET status = excluded.status, checked_at = datetime('now'), lat = NULL, lng = NULL`
  ).run(uid, date, status);
  res.json({ ok: true, status });
});

// Hvor mange minutter etter fristen ble et oppmøte registrert (Europe/Oslo)?
function lateMinutesFor(checkedAt, deadlineMin) {
  if (!checkedAt) return null;
  const dt = new Date(String(checkedAt).replace(' ', 'T') + 'Z');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(dt);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  const diff = h * 60 + m - deadlineMin;
  return diff > 0 ? diff : 0;
}

// Oppmøte + fravær for én gitt dato. Delt mellom dagens sanntidsliste og
// ukeeksporten, slik at de to alltid regner likt.
function daySummary(date) {
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

// ── ADMIN: sanntidsliste over registrert oppmøte i dag ───────
router.get('/checkins', requireAuth, requireAdmin, (req, res) => {
  const summary = daySummary(todayDate());
  const totalStudents = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role='student' AND active=1")
    .get().n;
  res.json({
    ...summary,
    count: summary.checkins.length,
    totalStudents,
    absent: summary.absentList.length,
  });
});

// ── ADMIN: hele uken (mandag–søndag) som daglige oppsummeringer ──
// Brukes til å eksportere én samlet fil for uken i stedet for én per dag.
// ?date=YYYY-MM-DD velger hvilken uke (default: uken rundt i dag).
router.get('/week', requireAuth, requireAdmin, (req, res) => {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : todayDate();
  const [y, m, d] = anchor.split('-').map(Number);
  const anchorDate = new Date(y, m - 1, d, 12);
  // Mandag = start på uken (getDay(): 0=søndag..6=lørdag).
  const mondayOffset = (anchorDate.getDay() + 6) % 7;
  const monday = new Date(anchorDate);
  monday.setDate(anchorDate.getDate() - mondayOffset);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    days.push(daySummary(todayDate(dt)));
  }

  res.json({
    weekStart: days[0].sessionDate,
    weekEnd: days[6].sessionDate,
    days,
  });
});

export default router;
