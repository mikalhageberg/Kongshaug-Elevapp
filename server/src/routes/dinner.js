import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { todayDate } from '../andaktToken.js';
import { getDinnerReport } from '../kitchenReport.js';
import { currentWeekStart, isDateString, shiftWeek, weekInfo, weekStartOf } from '../isoWeek.js';
import { dutyWeek, dutyWeeks, hasDuty } from '../kitchenDuty.js';

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

// ── KJØKKENTJENESTE ──────────────────────────────────────────
// Elevene har kjøkkentjeneste en uke av gangen, på rundgang. Uken identifiseres
// alltid av mandagsdatoen (se isoWeek.js), slik at «hvilken uke er vi i nå»
// regnes ut fra serverens dato og aldri kan sprike mellom klientene.

// ELEV + ADMIN: hvem har tjeneste. ?from=YYYY-MM-DD (blir rundet til mandag)
// og ?weeks=N (1–26) styrer utsnittet. Uten parametre: uken vi er i nå.
router.get('/kitchen-duty', (req, res) => {
  const from = isDateString(req.query.from) ? weekStartOf(req.query.from) : currentWeekStart();
  const weeks = Math.min(26, Math.max(1, Number(req.query.weeks) || 1));
  res.json({ currentWeek: weekInfo(currentWeekStart()), weeks: dutyWeeks(from, weeks) });
});

// ELEV: min egen tjeneste – denne uken og neste. Hjemskjermen bruker denne.
router.get('/kitchen-duty/me', (req, res) => {
  const thisWeek = currentWeekStart();
  const nextWeek = shiftWeek(thisWeek, 1);
  res.json({
    thisWeek: hasDuty(req.auth.sub, thisWeek) ? dutyWeek(thisWeek) : null,
    nextWeek: hasDuty(req.auth.sub, nextWeek) ? dutyWeek(nextWeek) : null,
  });
});

// ADMIN: sett elevene som har tjeneste en uke. Legger til uten å fjerne andre.
// body: { weekStart, userIds: [1,2] }
router.post('/kitchen-duty', requireAdmin, (req, res) => {
  const { weekStart, userIds } = req.body || {};
  if (!isDateString(weekStart)) return res.status(400).json({ error: 'Ugyldig uke' });
  const week = weekStartOf(weekStart);

  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number))]
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return res.status(400).json({ error: 'Ingen elever valgt' });

  const ph = ids.map(() => '?').join(',');
  const valid = db
    .prepare(`SELECT id FROM users WHERE id IN (${ph}) AND role = 'student' AND active = 1`)
    .all(...ids)
    .map((r) => r.id);
  if (!valid.length) return res.status(400).json({ error: 'Fant ingen aktive elever å legge til' });

  const insert = db.prepare('INSERT OR IGNORE INTO kitchen_duties (user_id, week_start) VALUES (?, ?)');
  db.transaction(() => { for (const id of valid) insert.run(id, week); })();

  res.status(201).json({ week: dutyWeek(week) });
});

// ADMIN: fjern én elev fra en uke.
router.delete('/kitchen-duty/:weekStart/:userId', requireAdmin, (req, res) => {
  const { weekStart, userId } = req.params;
  if (!isDateString(weekStart)) return res.status(400).json({ error: 'Ugyldig uke' });
  const week = weekStartOf(weekStart);
  db.prepare('DELETE FROM kitchen_duties WHERE user_id = ? AND week_start = ?').run(Number(userId), week);
  res.json({ week: dutyWeek(week) });
});

// ── ADMIN: middagsoversikt for i dag ─────────────────────────
router.get('/overview', requireAdmin, (req, res) => {
  res.json({ ...getDinnerReport(todayDate()), kitchenDuty: dutyWeek(currentWeekStart()) });
});

export default router;
