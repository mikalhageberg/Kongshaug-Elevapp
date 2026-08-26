// Oppgavene i internatvasken: opprett, rediger og list ut.
//
// Admin styrer lista; eleven trenger bare å lese sin egen oppgave, og får den
// uansett servert sammen med vaskeuken (se duty.js). GET her er likevel åpen
// for innloggede elever, begrenset til deres eget internat, slik at appen kan
// vise hele internatets oppgaveliste uten en egen adminrolle.

import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { createTask, deleteTask, listTasks, taskById, taskUsage, updateTask } from '../dormTasks.js';

const router = Router();
router.use(requireAuth);

const feil = (res, ex) => res.status(400).json({ error: ex.message || 'Kunne ikke lagre oppgaven.' });

// GET /api/dorm-tasks?dorm=Øvre%20Vestheim
// Admin ser alle oppgaver (også deaktiverte); eleven ser bare de aktive på sitt
// eget internat – lista er ikke hemmelig, men den er heller ikke hennes sak.
router.get('/', (req, res) => {
  if (req.auth.role === 'admin') {
    return res.json({ tasks: listTasks({ dorm: req.query.dorm || null }) });
  }
  const meg = db.prepare('SELECT dorm FROM users WHERE id = ?').get(req.auth.sub);
  if (!meg?.dorm) return res.json({ tasks: [] });
  res.json({ tasks: listTasks({ dorm: meg.dorm, activeOnly: true }) });
});

router.use(requireAdmin);

// POST /api/dorm-tasks – { dorm, title, description?, code? }
// Uten `code` lages den automatisk av internatnavnet: ØVEST1, ØVEST2 …
router.post('/', (req, res) => {
  const dorm = String(req.body?.dorm || '').trim();
  const title = String(req.body?.title || '').trim();
  if (!dorm) return res.status(400).json({ error: 'Velg internat.' });
  if (!title) return res.status(400).json({ error: 'Gi oppgaven et navn.' });
  try {
    res.status(201).json({
      task: createTask({
        dorm,
        title,
        description: String(req.body?.description || '').trim(),
        code: req.body?.code || null,
      }),
    });
  } catch (ex) { feil(res, ex); }
});

// PATCH /api/dorm-tasks/:id – navn, beskrivelse, kode, rekkefølge eller av/på.
router.patch('/:id', (req, res) => {
  try {
    const task = updateTask(Number(req.params.id), req.body || {});
    if (!task) return res.status(404).json({ error: 'Fant ikke oppgaven.' });
    res.json({ task });
  } catch (ex) { feil(res, ex); }
});

// DELETE /api/dorm-tasks/:id – bare oppgaver som aldri har vært satt opp.
// Har oppgaven vært i bruk, ville sletting tatt historikken med seg; da sier vi
// ifra og lar admin deaktivere den i stedet.
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!taskById(id)) return res.status(404).json({ error: 'Fant ikke oppgaven.' });
  if (!deleteTask(id)) {
    const n = taskUsage(id);
    return res.status(409).json({
      error: `Oppgaven er satt opp ${n} ${n === 1 ? 'gang' : 'ganger'} og kan ikke slettes. Deaktiver den i stedet, så blir historikken stående.`,
    });
  }
  res.json({ ok: true });
});

export default router;
