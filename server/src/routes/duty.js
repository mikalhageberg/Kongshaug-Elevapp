// Ukestjeneste-endepunktene, delt mellom kjøkkentjeneste og internatvask.
//
// Én ruter-fabrikk som monteres to steder (se dinner.js og index.js), slik at
// de to tjenestene ikke kan komme i utakt. Kjøkkentjenesten beholder sin gamle
// sti /api/dinner/kitchen-duty – den ligger i utrullede app-versjoner, og en
// flytting ville brutt dem. Internatvask er ny og ligger på /api/dorm-duty.

import express, { Router } from 'express';
import db from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin, verifyPassword } from '../auth.js';
import { currentWeekStart, isDateString, shiftWeek, weekInfo, weekStartOf } from '../isoWeek.js';
import { dutyById, dutyWeek, dutyWeeks, hasDuty, kindOf, signDuty, unsignDuty } from '../duty.js';
import { listTasks, taskById } from '../dormTasks.js';
import { readXlsxGrid } from '../xlsxReader.js';
import { parseDutyXlsx, parseDutyTemplate } from '../dutyParser.js';

export function createDutyRouter(kind) {
  const { navn, ledetekst, hasTasks } = kindOf(kind);
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
    // Internatvask kan settes opp med en bestemt oppgave; uten den blir raden
    // stående som en vaskeuke uten oppgave, slik alle rader var før.
    const taskId = hasTasks && req.body?.taskId ? Number(req.body.taskId) : null;
    if (taskId && !taskById(taskId)) return res.status(400).json({ error: 'Fant ikke oppgaven' });

    const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number))]
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return res.status(400).json({ error: 'Ingen elever valgt' });

    const ph = ids.map(() => '?').join(',');
    const valid = db
      .prepare(`SELECT id FROM users WHERE id IN (${ph}) AND role = 'student' AND active = 1`)
      .all(...ids)
      .map((r) => r.id);
    if (!valid.length) return res.status(400).json({ error: 'Fant ingen aktive elever å legge til' });

    const insert = hasTasks
      ? db.prepare(`INSERT OR IGNORE INTO ${kindOf(kind).table} (user_id, week_start, task_id) VALUES (?, ?, ?)`)
      : db.prepare(`INSERT OR IGNORE INTO ${kindOf(kind).table} (user_id, week_start) VALUES (?, ?)`);
    db.transaction(() => {
      for (const id of valid) hasTasks ? insert.run(id, week, taskId) : insert.run(id, week);
    })();

    res.status(201).json({ week: dutyWeek(kind, week) });
  });

  // ADMIN: last opp et Excel-ark med turnus og returner en FORHÅNDSVISNING
  // (uke → treff/ikke-funnet). Skriver ikke til databasen.
  //
  // To måter å tolke arket på, styrt av ?mode (samme valg som elevlista):
  //   mal (standard) – arket følger skolens faste mal (Uke/Navn/Startdato).
  //        Tolkes lokalt, ingen OpenAI, ingenting sendes ut av skolen.
  //   ai            – vilkårlig ark: OpenAI leser ut uker og navn. Elevlista
  //        sendes ikke; navnene kobles mot elevene lokalt. Se dutyParser.js.
  router.post('/parse', requireAdmin, express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).json({ error: 'Tom fil.' });
    const useAi = req.query.mode === 'ai';
    if (useAi && !config.openai.enabled) return res.status(400).json({ error: 'OpenAI er ikke satt opp (mangler OPENAI_API_KEY). Bruk malen i stedet.' });
    try {
      const { rows } = readXlsxGrid(buf);
      // dorm er med fordi malen sjekker at oppgavekoden hører til elevens eget internat.
      const students = db.prepare("SELECT id, full_name, dorm FROM users WHERE role = 'student' AND active = 1").all();
      // Oppgavekoder leses bare fra malen: OpenAI-veien tolker vilkårlige ark,
      // og der finnes kodene sjelden. De radene blir vaskeuker uten oppgave.
      // Også deaktiverte oppgaver sendes med, så en kode som finnes kan få en
      // presis feilmelding i stedet for «ukjent kode».
      const tasks = hasTasks ? listTasks() : null;
      res.json(useAi
        ? await parseDutyXlsx(rows, students, ledetekst)
        : parseDutyTemplate(rows, students, { tasks }));
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
    const insert = hasTasks
      ? db.prepare(`INSERT OR IGNORE INTO ${kindOf(kind).table} (user_id, week_start, task_id) VALUES (?, ?, ?)`)
      : db.prepare(`INSERT OR IGNORE INTO ${kindOf(kind).table} (user_id, week_start) VALUES (?, ?)`);
    // Gyldige oppgave-id-er slås opp én gang, så en id fra klienten aldri
    // havner i basen uten å finnes.
    const gyldigeOppgaver = new Set(hasTasks ? listTasks().map((t) => t.id) : []);
    const affected = new Set();
    db.transaction(() => {
      for (const w of weeks) {
        if (!isDateString(w?.weekStart)) continue;
        const week = weekStartOf(w.weekStart);
        // To former: `items` med oppgave per elev (fra malen), eller `userIds`
        // uten oppgave (kjøkkentjeneste, og internatvask lest med OpenAI).
        const rader = Array.isArray(w.items)
          ? w.items.map((it) => ({ userId: Number(it?.userId), taskId: Number(it?.taskId) || null }))
          : (Array.isArray(w.userIds) ? w.userIds : []).map((id) => ({ userId: Number(id), taskId: null }));
        const ids = [...new Set(rader.map((r) => r.userId))].filter((n) => Number.isInteger(n) && n > 0);
        if (!ids.length) continue;
        const ph = ids.map(() => '?').join(',');
        const valid = new Set(db
          .prepare(`SELECT id FROM users WHERE id IN (${ph}) AND role = 'student' AND active = 1`)
          .all(...ids).map((r) => r.id));
        let lagt = 0;
        for (const rad of rader) {
          if (!valid.has(rad.userId)) continue;
          const taskId = hasTasks && rad.taskId && gyldigeOppgaver.has(rad.taskId) ? rad.taskId : null;
          hasTasks ? insert.run(rad.userId, week, taskId) : insert.run(rad.userId, week);
          lagt++;
        }
        if (lagt) affected.add(week);
      }
    })();
    res.status(201).json({ weeks: [...affected].sort().map((w) => dutyWeek(kind, w)) });
  });

  // ── Signering (bare internatvask) ──────────────────────────
  //
  // Eleven kvitterer for at oppgaven er gjort. Tre måter, og alle tre lagres
  // slik at oversikten viser hvordan det ble signert:
  //
  //   biometri – Face ID/fingeravtrykk i mobilappen. Låsingen skjer på elevens
  //              egen telefon, så serveren kan ikke etterprøve den; den lagrer
  //              at appen bekreftet en biometrisk låsing. Det er en kvittering,
  //              ikke et bevis – hensikten er forpliktelsen, ikke sikring.
  //   passord  – nettleseren, der Face ID ikke finnes. Passordet kontrolleres
  //              mot elevens egen hash, så denne veien er faktisk verifisert.
  //   admin    – en administrator signerte på vegne av eleven (elev uten
  //              telefon, glemt signering). Hvem det var, lagres.
  if (hasTasks) {
    router.post('/duties/:id/sign', async (req, res) => {
      const duty = dutyById(kind, Number(req.params.id));
      if (!duty) return res.status(404).json({ error: 'Fant ikke oppgaven.' });
      if (duty.doneAt) return res.status(409).json({ error: 'Oppgaven er allerede signert.' });

      const erAdmin = req.auth.role === 'admin';
      const erMin = duty.userId === req.auth.sub;
      if (!erAdmin && !erMin) return res.status(403).json({ error: 'Du kan bare signere dine egne oppgaver.' });
      // Ingen kan signere for en uke som ikke har begynt.
      if (!erAdmin && duty.weekStart > currentWeekStart()) {
        return res.status(400).json({ error: 'Uken har ikke begynt ennå.' });
      }

      let method = 'admin';
      if (!erAdmin) {
        method = req.body?.method === 'biometri' ? 'biometri' : 'passord';
        if (method === 'passord') {
          const bruker = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.auth.sub);
          const ok = bruker && await verifyPassword(String(req.body?.password || ''), bruker.password_hash);
          if (!ok) return res.status(401).json({ error: 'Feil passord.' });
        }
      }
      signDuty(kind, duty.id, { method, byUserId: req.auth.sub });
      res.json({ week: dutyWeek(kind, duty.weekStart) });
    });

    // ADMIN: angre en signatur (feiltrykk, eller jobben var ikke gjort likevel).
    router.delete('/duties/:id/sign', requireAdmin, (req, res) => {
      const duty = dutyById(kind, Number(req.params.id));
      if (!duty) return res.status(404).json({ error: 'Fant ikke oppgaven.' });
      unsignDuty(kind, duty.id);
      res.json({ week: dutyWeek(kind, duty.weekStart) });
    });
  }

  // ADMIN: fjern én oppsatt rad (én elev på én oppgave i én uke).
  router.delete('/duties/:id', requireAdmin, (req, res) => {
    const duty = dutyById(kind, Number(req.params.id));
    if (!duty) return res.status(404).json({ error: 'Fant ikke raden.' });
    db.prepare(`DELETE FROM ${kindOf(kind).table} WHERE id = ?`).run(duty.id);
    res.json({ week: dutyWeek(kind, duty.weekStart) });
  });

  // ADMIN: fjern én elev fra en uke (alle oppgavene hennes den uken).
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
