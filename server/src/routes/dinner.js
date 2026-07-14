import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { todayDate } from '../andaktToken.js';
import { getDinnerReport, parseAllergies, COMMON_ALLERGIES } from '../kitchenReport.js';

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

// ── ELEV: mine allergier ─────────────────────────────────────
router.get('/allergies', (req, res) => {
  const u = db.prepare('SELECT allergies FROM users WHERE id=?').get(req.auth.sub);
  res.json({ allergies: parseAllergies(u?.allergies), common: COMMON_ALLERGIES });
});

router.put('/allergies', (req, res) => {
  const raw = Array.isArray(req.body?.allergies) ? req.body.allergies : [];
  // Rens: strenger, trim, unike, maks lengde/antall.
  const seen = new Set();
  const clean = [];
  for (const a of raw) {
    const s = String(a || '').trim().slice(0, 60);
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); clean.push(s); }
    if (clean.length >= 30) break;
  }
  db.prepare('UPDATE users SET allergies=? WHERE id=?').run(JSON.stringify(clean), req.auth.sub);
  res.json({ allergies: clean });
});

// ── ADMIN: middagsoversikt for i dag ─────────────────────────
router.get('/overview', requireAdmin, (req, res) => {
  res.json(getDinnerReport(todayDate()));
});

export default router;
