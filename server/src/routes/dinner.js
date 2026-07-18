import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { todayDate } from '../andaktToken.js';
import { getDinnerReport } from '../kitchenReport.js';

const router = Router();
router.use(requireAuth);

// ── ELEV: middagsstatus i dag ────────────────────────────────
router.get('/status', (req, res) => {
  const date = todayDate();
  const manual = !!db.prepare('SELECT 1 FROM dinner_optouts WHERE user_id=? AND date=?').get(req.auth.sub, date);
  const period = !!db.prepare('SELECT 1 FROM fire_away_periods WHERE user_id=? AND no_dinner=1 AND ? BETWEEN start_date AND end_date LIMIT 1').get(req.auth.sub, date);
  const optedOut = manual || period;
  // fromPeriod = styrt av en planlagt periode (kan ikke endres per dag i middagsfanen)
  res.json({ date, optedOut, fromPeriod: period && !manual, eating: !optedOut });
});

// ELEV: meld fra at du IKKE vil ha middag i dag
router.post('/optout', (req, res) => {
  const date = todayDate();
  db.prepare('INSERT OR IGNORE INTO dinner_optouts (user_id, date) VALUES (?, ?)').run(req.auth.sub, date);
  res.json({ date, optedOut: true });
});

// ELEV: angre – jeg spiser likevel middag i dag
router.delete('/optout', (req, res) => {
  const date = todayDate();
  db.prepare('DELETE FROM dinner_optouts WHERE user_id=? AND date=?').run(req.auth.sub, date);
  res.json({ date, optedOut: false });
});

// ── ADMIN: middagsoversikt for i dag ─────────────────────────
router.get('/overview', requireAdmin, (req, res) => {
  res.json(getDinnerReport(todayDate()));
});

export default router;
