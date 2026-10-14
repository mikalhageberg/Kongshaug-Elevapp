// Prikkesystemet. Se demerits.js for hvem som får se og gjøre hva.

import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin, requireAdminOrReviewDemo, isAppReviewUser } from '../auth.js';
import { isSuperAdmin, requireSuperAdmin } from '../permissions.js';
import { hasActiveWatch } from '../fireWatch.js';
import {
  DEMERIT_CATEGORIES, parseDemerit, addDemerit, deleteDemerit, demeritsFor, demeritTotals,
} from '../demerits.js';

const router = Router();
router.use(requireAuth);

// Kategoriene. Åpen for alle innloggede: eleven ser de samme navnene i sin
// egen oversikt, og lista er skolens regler – ikke noe hemmelig.
router.get('/categories', (req, res) => {
  res.json({ categories: DEMERIT_CATEGORIES });
});

// ELEV: egne prikker, med begrunnelse – men ikke hvem som ga dem.
router.get('/me', (req, res) => {
  res.json(demeritsFor(req.auth.sub));
});

// Tildel prikker. Superbrukere kan alltid; ellers må man ha kveldens vakt.
// Svaret inneholder bevisst ingen sum: vakten skal ikke kunne lese av hvor
// mange prikker eleven har fra før.
router.post('/', requireAdminOrReviewDemo, (req, res) => {
  const uid = Number(req.body?.userId);
  // Reviewer-kontoens demo-vakt ser bare seg selv på lista, og kan bare gi
  // prikker til seg selv (se requireAdminOrReviewDemo i auth.js).
  if (req.reviewDemo && uid !== req.auth.sub) return res.status(404).json({ error: 'Fant ikke eleven' });
  const kan = req.reviewDemo || isSuperAdmin(req.auth.sub) || hasActiveWatch(req.auth.sub) || isAppReviewUser(req.auth.username);
  if (!kan) {
    return res.status(403).json({ error: 'no-watch', message: 'Bare superbrukere og den som har vakten kan tildele prikker.' });
  }
  const elev = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student' AND active = 1").get(uid);
  if (!elev && !req.reviewDemo) return res.status(404).json({ error: 'Fant ikke eleven' });

  let d;
  try { d = parseDemerit(req.body || {}); }
  catch (ex) { return res.status(400).json({ error: ex.message }); }
  const id = addDemerit(uid, req.auth.sub, d);
  res.status(201).json({ ok: true, id, points: d.points, categoryLabel: d.categoryLabel });
});

// ── SUPERBRUKER ──────────────────────────────────────────────
router.use(requireAdmin, requireSuperAdmin);

// Alle aktive elever med summen sin.
router.get('/students', (req, res) => {
  res.json({ students: demeritTotals() });
});

// Én elevs historikk, med hvem som ga prikkene.
router.get('/students/:id', (req, res) => {
  const uid = Number(req.params.id);
  const u = db.prepare("SELECT id, full_name, class_name, dorm, room FROM users WHERE id = ? AND role = 'student'").get(uid);
  if (!u) return res.status(404).json({ error: 'Fant ikke eleven' });
  res.json({
    student: { id: u.id, fullName: u.full_name, className: u.class_name, dorm: u.dorm, room: u.room },
    ...demeritsFor(uid, { withGiver: true }),
  });
});

// Fjern en tildeling som ble feil.
router.delete('/:id', (req, res) => {
  if (!deleteDemerit(Number(req.params.id))) return res.status(404).json({ error: 'Fant ikke tildelingen' });
  res.json({ ok: true });
});

export default router;
