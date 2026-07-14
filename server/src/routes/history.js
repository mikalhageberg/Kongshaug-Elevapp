import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { todayDate } from '../andaktToken.js';

const router = Router();
router.use(requireAuth);

// ELEV: min oversikt – siste ~14 dager med brann- og andakts-status.
router.get('/', (req, res) => {
  const uid = req.auth.sub;
  const days = 14;

  const fire = db
    .prepare(
      `SELECT night_date AS d, checked_at FROM fire_checkins
       WHERE user_id = ? AND night_date >= date('now', ?)`
    )
    .all(uid, `-${days} days`);
  const andakt = db
    .prepare(
      `SELECT session_date AS d, status FROM andakt_checkins
       WHERE user_id = ? AND session_date >= date('now', ?)`
    )
    .all(uid, `-${days} days`);

  const fireByDate = Object.fromEntries(fire.map((r) => [r.d, r.checked_at]));
  const andaktByDate = Object.fromEntries(andakt.map((r) => [r.d, r.status]));

  const today = new Date();
  const rows = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    const key = todayDate(dt);
    rows.push({
      date: key,
      fire: fireByDate[key] ? 'present' : 'none',
      andakt: andaktByDate[key] || 'none', // 'present' | 'late' | 'none'
    });
  }

  // "For sent" på andakt denne måneden teller som en enkel indikator på skjermen.
  // Reelt fravær (dager helt uten registrering) avhenger av skolens timeplan/kalender.
  const monthLate = db
    .prepare(
      `SELECT COUNT(*) AS n FROM andakt_checkins
       WHERE user_id = ? AND status = 'late'
         AND session_date >= date('now','start of month')`
    )
    .get(uid).n;

  res.json({ days: rows, monthLate });
});

export default router;
