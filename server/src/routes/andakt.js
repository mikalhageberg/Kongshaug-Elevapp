import { Router } from 'express';
import QRCode from 'qrcode';
import db from '../db.js';
import { requireAuth, requireAdmin, isAppReviewUser } from '../auth.js';
import { isOnCampus } from '../geo.js';
import { config } from '../config.js';
import { getSettings, hhmmToMinutes, isAndaktDay } from '../settings.js';
import { osloParts } from '../fireWindow.js';
import { andaktWindow } from '../andaktWindow.js';
import {
  todayDate,
  currentToken,
  verifyToken,
  getOrCreateSession,
  rotateSecret,
} from '../andaktToken.js';
import { daySummary, weekReport } from '../andaktReport.js';
import { listArchive, getArchivedWeek, refreshArchive } from '../andaktArchive.js';
import { weekStartOf, isDateString } from '../isoWeek.js';

const router = Router();
router.use(requireAuth);

// Lagre koordinat kun når det faktisk er et tall – ellers NULL. Hindrer at
// NaN havner i databasen når klienten sender manglende/ugyldig posisjon
// (f.eks. reviewer-kontoen, som registrerer uten QR og uten GPS).
const coordOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ── ELEV: registrer oppmøte ved å sende skannet QR-token + GPS ──
router.post('/checkin', (req, res) => {
  const { token, lat, lng } = req.body || {};

  const settings = getSettings();
  if (!isAndaktDay(new Date(), settings)) {
    return res.status(400).json({ error: 'no_andakt', message: 'Det er ikke andakt i dag.' });
  }

  const reviewBypass = isAppReviewUser(req.auth?.username);
  if (reviewBypass) console.warn(`[app-review-bypass] andakt-innsjekk uten GPS/QR/tidsvindu for «${req.auth.username}»`);

  // QR-en er bare tilgjengelig ±30 min rundt fristen. Reviewer-kontoen har ingen
  // storskjerm og kan testes når som helst, så den hopper over vindu-sjekken.
  const win = andaktWindow(new Date(), settings);
  if (!reviewBypass && !win.open) {
    return res.status(400).json({
      error: 'closed',
      message: win.state === 'before'
        ? `Andakts-registreringen åpner kl. ${win.opensAt}.`
        : win.state === 'after'
          ? 'Andakten er over for i dag.'
          : 'Det er ikke andakt i dag.',
    });
  }

  const campus = reviewBypass ? { ok: true, distance: 0 } : isOnCampus(Number(lat), Number(lng));
  if (!campus.ok) {
    return res.status(403).json({
      error: 'offsite',
      message: 'Du er ikke på skolens område. Du må være på Kongshaug for å registrere oppmøte.',
    });
  }

  // Reviewer-kontoen har ingen storskjerm å skanne fra, så QR-tokenet
  // sjekkes ikke for den – ellers uendret (må fortsatt være riktig dag/tid).
  const check = reviewBypass ? { ok: true } : verifyToken(token);
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
  // Til stede vs. for sent regnes i skolens tidssone (samme som vinduet over).
  const status = osloParts().minutes > hhmmToMinutes(settings.andaktDeadline) ? 'late' : 'present';

  db.prepare(
    `INSERT INTO andakt_checkins (user_id, session_date, status, lat, lng)
     VALUES (@uid, @date, @status, @lat, @lng)
     ON CONFLICT(user_id, session_date) DO NOTHING`
  ).run({ uid: req.auth.sub, date, status, lat: coordOrNull(lat), lng: coordOrNull(lng) });

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
  const win = andaktWindow();
  res.json({
    sessionDate: date,
    andaktToday: isAndaktDay(),
    registered: !!row,
    status: row?.status || null,
    checkedAt: row?.checked_at || null,
    // Tidsvindu for QR-registrering, så appen kan vise «åpner kl. …» / «over».
    qrOpen: win.open,
    qrState: win.state,
    opensAt: win.opensAt || null,
    closesAt: win.closesAt || null,
    deadline: win.deadline,
  });
});

// ── ADMIN: gjeldende QR (roterende token) som PNG-dataURL + antall ──
router.get('/qr', requireAuth, requireAdmin, async (req, res) => {
  const date = todayDate();
  const win = andaktWindow();
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM andakt_checkins WHERE session_date = ?')
    .get(date).n;

  // Klienten henter dette på nytt hvert par sekund; koden roterer i takt, og
  // vinduet flipper automatisk til/fra QR når det åpner/stenger.
  const refreshMs = Math.min(config.andakt.qrTtlSeconds, 15) * 1000;

  // Utenfor tidsvinduet: ingen QR, bare tilstanden så klienten kan forklare når.
  if (!win.open) {
    return res.json({ sessionDate: date, open: false, state: win.state, opensAt: win.opensAt, closesAt: win.closesAt, deadline: win.deadline, refreshMs, count });
  }

  getOrCreateSession(date);
  const token = currentToken(date);
  const dataUrl = await QRCode.toDataURL(token, { margin: 1, width: 512, errorCorrectionLevel: 'M' });
  res.json({
    sessionDate: date,
    open: true,
    state: 'open',
    qr: dataUrl,
    opensAt: win.opensAt,
    closesAt: win.closesAt,
    deadline: win.deadline,
    refreshMs,
    count,
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

// ── ADMIN: hele uken (mandag–søndag) som én rapport ──────────
// Brukes til å eksportere én samlet fil for uken i stedet for én per dag.
// ?date=YYYY-MM-DD velger hvilken uke (default: uken rundt i dag).
router.get('/week', requireAuth, requireAdmin, (req, res) => {
  const anchor = isDateString(req.query.date) ? String(req.query.date) : todayDate();
  res.json(weekReport(weekStartOf(anchor)));
});

// ── ADMIN: arkivet over ferdige ukesrapporter ────────────────
// Listen fylles og ryddes før den leses, slik at den alltid stemmer med
// innstillingen – også rett etter at antall uker er endret.
router.get('/archive', requireAuth, requireAdmin, (req, res) => {
  const weeks = getSettings().andaktArchiveWeeks;
  refreshArchive(weeks);
  res.json({ weeks, currentWeekStart: weekStartOf(todayDate()), reports: listArchive() });
});

// Hele den arkiverte rapporten for én uke (mandagsdatoen er nøkkelen).
router.get('/archive/:weekStart', requireAuth, requireAdmin, (req, res) => {
  const ws = String(req.params.weekStart);
  if (!isDateString(ws)) return res.status(400).json({ error: 'Ugyldig ukedato. Bruk ÅÅÅÅ-MM-DD.' });
  const rapport = getArchivedWeek(weekStartOf(ws));
  if (!rapport) return res.status(404).json({ error: 'Uken ligger ikke i arkivet.' });
  res.json(rapport);
});

export default router;
