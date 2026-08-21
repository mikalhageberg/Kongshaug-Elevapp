// Ukestjeneste-endepunktene, delt mellom kjøkkentjeneste og internatvask.
//
// Én ruter-fabrikk som monteres to steder (se dinner.js og index.js), slik at
// de to tjenestene ikke kan komme i utakt. Kjøkkentjenesten beholder sin gamle
// sti /api/dinner/kitchen-duty – den ligger i utrullede app-versjoner, og en
// flytting ville brutt dem. Internatvask er ny og ligger på /api/dorm-duty.

import express, { Router } from 'express';
import db from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { currentWeekStart, isDateString, shiftWeek, weekInfo, weekStartOf } from '../isoWeek.js';
import { dutyWeek, dutyWeeks, hasDuty, kindOf } from '../duty.js';
import { readXlsxGrid } from '../xlsxReader.js';
import { parseDutyXlsx } from '../dutyParser.js';

export function createDutyRouter(kind) {
  const { navn, ledetekst } = kindOf(kind);
  const router = Router();
  router.use(requireAuth);

  // ELEV + ADMIN: hvem har tjeneste. ?from=YYYY-MM-DD (blir rundet til mandag)
  // og ?weeks=N (1–26) styrer utsnittet. Uten parametre: uken vi er i nå.
  router.get('/', (req, res) => {
    const from = isDateString(req.query.from) ? weekStartOf(req.query.from) : currentWeekStart();
    const weeks = Math.min(26, Math.max(1, Number(req.query.weeks) || 1));
    res.json({ currentWeek: weekInfo(currentWeekStart()), weeks: dutyWeeks(kind, from, weeks) });
  });

  // ELEV: min egen tjeneste – denne uken og neste. Hjemskjermen bruker denne.
  router.get('/me', (req, res) => {
    const thisWeek = currentWeekStart();
    const nextWeek = shiftWeek(thisWeek, 1);
    res.json({
      thisWeek: hasDuty(kind, req.auth.sub, thisWeek) ? dutyWeek(kind, thisWeek) : null,
      nextWeek: hasDuty(kind, req.auth.sub, nextWeek) ? dutyWeek(kind, nextWeek) : null,
    });
  });

  // ADMIN: sett elevene som har tjeneste en uke. Legger til uten å fjerne andre.
  // body: { weekStart, userIds: [1,2] }
  router.post('/', requireAdmin, (req, res) => {
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

    const insert = db.prepare(`INSERT OR IGNORE INTO ${kindOf(kind).table} (user_id, week_start) VALUES (?, ?)`);
    db.transaction(() => { for (const id of valid) insert.run(id, week); })();

    res.status(201).json({ week: dutyWeek(kind, week) });
  });

  // ADMIN: last opp et Excel-ark med turnus, tolk det med OpenAI og returner en
  // FORHÅNDSVISNING (uke → treff/ikke-funnet). Skriver ikke til databasen.
  router.post('/parse', requireAdmin, express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).json({ error: 'Tom fil.' });
    if (!config.openai.enabled) return res.status(400).json({ error: 'OpenAI er ikke satt opp (mangler OPENAI_API_KEY).' });
    try {
      const { rows } = readXlsxGrid(buf);
      const students = db.prepare("SELECT id, full_name FROM users WHERE role = 'student' AND active = 1").all();
      res.json(await parseDutyXlsx(rows, students, ledetekst));
    } catch (ex) {
      res.status(400).json({ error: ex.message || 'Kunne ikke lese filen.' });
    }
  });

  // ADMIN: sett tjeneste for mange uker på én gang (fra Excel-import). Atomisk,
  // additivt og idempotent (UNIQUE(user_id, week_start)). Speiler valideringen i
  // POST / over.
  router.post('/bulk', requireAdmin, (req, res) => {
    const weeks = Array.isArray(req.body?.weeks) ? req.body.weeks : [];
    if (!weeks.length) return res.status(400).json({ error: 'Ingen uker å legge til' });
    const insert = db.prepare(`INSERT OR IGNORE INTO ${kindOf(kind).table} (user_id, week_start) VALUES (?, ?)`);
    const affected = new Set();
    db.transaction(() => {
      for (const w of weeks) {
        if (!isDateString(w?.weekStart)) continue;
        const week = weekStartOf(w.weekStart);
        const ids = [...new Set((Array.isArray(w.userIds) ? w.userIds : []).map(Number))]
          .filter((n) => Number.isInteger(n) && n > 0);
        if (!ids.length) continue;
        const ph = ids.map(() => '?').join(',');
        const valid = db
          .prepare(`SELECT id FROM users WHERE id IN (${ph}) AND role = 'student' AND active = 1`)
          .all(...ids).map((r) => r.id);
        for (const id of valid) insert.run(id, week);
        if (valid.length) affected.add(week);
      }
    })();
    res.status(201).json({ weeks: [...affected].sort().map((w) => dutyWeek(kind, w)) });
  });

  // ADMIN: fjern én elev fra en uke.
  router.delete('/:weekStart/:userId', requireAdmin, (req, res) => {
    const { weekStart, userId } = req.params;
    if (!isDateString(weekStart)) return res.status(400).json({ error: 'Ugyldig uke' });
    const week = weekStartOf(weekStart);
    db.prepare(`DELETE FROM ${kindOf(kind).table} WHERE user_id = ? AND week_start = ?`)
      .run(Number(userId), week);
    res.json({ week: dutyWeek(kind, week) });
  });

  // Brukes av frontenden til overskrifter, så teksten står ett sted.
  router.get('/meta', (req, res) => res.json({ kind, navn }));

  return router;
}

export default createDutyRouter;
