// Øvekonkurransen: elevens timer og admins oversikt.

import express, { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  competitionState, startSession, pauseSession, resumeSession, stopSession,
  finishSession, discardSession, savePhoto,
  pendingSession, mySessions, myTotalSeconds, leaderboard, sessionsFor,
  photoDir, SORTS,
} from '../practice.js';

const router = Router();
router.use(requireAuth);

// ── ELEV ─────────────────────────────────────────────────────

// Alt appen trenger for å tegne øveskjermen i ett kall.
router.get('/status', (req, res) => {
  const comp = competitionState();
  res.json({
    competition: { configured: comp.configured, active: comp.active, startDate: comp.startDate, endDate: comp.endDate },
    warmupSeconds: comp.warmupSeconds,
    pending: pendingSession(req.auth.sub),
    totalSeconds: myTotalSeconds(req.auth.sub, comp),
    sessions: mySessions(req.auth.sub),
  });
});

// Start en økt (eller hent fram den som allerede pågår).
router.post('/start', (req, res) => {
  const comp = competitionState();
  if (!comp.active) {
    return res.status(403).json({ error: comp.configured ? 'Konkurransen er ikke åpen nå.' : 'Ingen øvekonkurranse er satt opp.' });
  }
  res.status(201).json({ session: startSession(req.auth.sub) });
});

// Pause og fortsett. Tiden står stille mens økten er pauset.
router.post('/:id/pause', (req, res) => {
  try { res.json({ session: pauseSession(req.auth.sub, Number(req.params.id)) }); }
  catch (ex) { res.status(400).json({ error: ex.message }); }
});

router.post('/:id/resume', (req, res) => {
  try { res.json({ session: resumeSession(req.auth.sub, Number(req.params.id)) }); }
  catch (ex) { res.status(400).json({ error: ex.message }); }
});

// Stopp klokken. Økten registreres ikke ennå – dokumentasjonsbildet kan tas
// etterpå uten at tiden løper videre.
router.post('/:id/stop', (req, res) => {
  try {
    res.json({ session: stopSession(req.auth.sub, Number(req.params.id)) });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

// Last opp dokumentasjonsbildet. Sendes som base64 med Content-Type
// «application/base64»: React Native har ingen pålitelig måte å sende rå bytes
// på, og den globale JSON-parseren (100 kB) skal ikke se på bildedata.
router.post('/:id/photo', express.raw({ type: 'application/base64', limit: '8mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Tomt bilde.' });
  const bytes = Buffer.from(req.body.toString('utf8'), 'base64');
  if (!bytes.length) return res.status(400).json({ error: 'Kunne ikke lese bildet.' });
  try {
    savePhoto(req.auth.sub, Number(req.params.id), bytes);
    res.status(201).json({ ok: true });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

// Registrer økten.
router.post('/:id/finish', (req, res) => {
  const comp = competitionState();
  if (!comp.active) return res.status(403).json({ error: 'Konkurransen er ikke åpen nå.' });
  try {
    res.json({ session: finishSession(req.auth.sub, Number(req.params.id)) });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

// Avbryt en pågående økt uten å registrere den.
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM practice_sessions WHERE id = ? AND user_id = ? AND ended_at IS NULL')
    .get(Number(req.params.id), req.auth.sub);
  if (!row) return res.status(404).json({ error: 'Fant ingen pågående økt.' });
  discardSession(row.id);
  res.json({ ok: true });
});

// ── BILDE ────────────────────────────────────────────────────
// Admin ser alle; eleven ser bare sine egne.
router.get('/sessions/:id/photo', (req, res) => {
  const row = db.prepare('SELECT user_id, photo_filename FROM practice_sessions WHERE id = ?').get(Number(req.params.id));
  if (!row?.photo_filename) return res.status(404).json({ error: 'Fant ikke bildet' });
  if (req.auth.role !== 'admin' && row.user_id !== req.auth.sub) {
    return res.status(403).json({ error: 'Ingen tilgang' });
  }
  const file = path.join(photoDir, row.photo_filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Fant ikke bildet' });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
});

// ── ADMIN ────────────────────────────────────────────────────

// Stillingen. ?sort=time|class|instrument
router.get('/leaderboard', requireAdmin, (req, res) => {
  const comp = competitionState();
  const sort = SORTS[req.query.sort] ? req.query.sort : 'time';
  const rows = leaderboard(sort, comp);
  res.json({
    competition: comp,
    sort,
    students: rows,
    totalSeconds: rows.reduce((n, r) => n + r.totalSeconds, 0),
  });
});

// Øktene til én elev, med lenke til dokumentasjonsbildet.
router.get('/sessions/:userId', requireAdmin, (req, res) => {
  const u = db.prepare("SELECT id, full_name, class_name, instrument FROM users WHERE id = ?").get(Number(req.params.userId));
  if (!u) return res.status(404).json({ error: 'Fant ikke eleven' });
  res.json({
    student: { id: u.id, fullName: u.full_name, className: u.class_name, instrument: u.instrument },
    sessions: sessionsFor(u.id),
  });
});

// Admin kan slette en økt som åpenbart ikke stemmer.
router.delete('/sessions/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM practice_sessions WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Fant ikke økten' });
  discardSession(row.id);
  res.json({ ok: true });
});

export default router;
