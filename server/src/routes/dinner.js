import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { todayDate } from '../andaktToken.js';
import { getDinnerReport } from '../kitchenReport.js';
import { currentWeekStart } from '../isoWeek.js';
import { dutyWeek } from '../duty.js';
import { createDutyRouter } from './duty.js';
import { getSettings } from '../settings.js';

const router = Router();
router.use(requireAuth);

// Hjemmeboeren spiser hjemme, hver dag. Statusen følger av merket på brukeren
// i stedet for å måtte meldes inn på nytt hver morgen – samme ordning som på
// brannlisten. Se kitchenReport.js for hvordan kjøkkenets tall regnes.
const erHjemmeboer = (userId) =>
  !!db.prepare("SELECT 1 FROM users WHERE id = ? AND home_dweller = 1").get(userId);
const HJEMMEBOER_MELDING =
  'Du er registrert som hjemmeboer og står som at du ikke spiser på skolen. '
  + 'Gi beskjed til internatleder hvis dette har endret seg.';

// ── ELEV: middagsstatus i dag ────────────────────────────────
router.get('/status', (req, res) => {
  const date = todayDate();
  const homeDweller = erHjemmeboer(req.auth.sub);
  const manual = !!db.prepare('SELECT 1 FROM dinner_optouts WHERE user_id=? AND date=?').get(req.auth.sub, date);
  const period = !!db.prepare('SELECT 1 FROM fire_away_periods WHERE user_id=? AND no_dinner=1 AND ? BETWEEN start_date AND end_date LIMIT 1').get(req.auth.sub, date);
  const optedOut = homeDweller || manual || period;
  // fromPeriod = styrt av noe annet enn dagens valg, og kan ikke slås av her.
  // Hjemmeboeren settes med vilje inn i det samme flagget: appversjonene som er
  // ute i dag kjenner bare dette, og viser da det låste kortet i stedet for en
  // knapp som ville lovet noe den ikke kan holde. Nyere klienter ser på
  // homeDweller først – se app.js.
  // Når går dagens oversikt til kjøkkenet? Appen ber eleven melde seg av før
  // det. null når utsendingen er skrudd av – da finnes det ingen frist.
  const s = getSettings();
  const kitchenEmailAt = s.kitchenEmailEnabled && s.kitchenEmailRecipient ? s.kitchenEmailTime : null;
  res.json({ date, optedOut, fromPeriod: homeDweller || (period && !manual), homeDweller, eating: !optedOut, kitchenEmailAt });
});

// ELEV: meld fra at du IKKE vil ha middag i dag
router.post('/optout', (req, res) => {
  const date = todayDate();
  if (erHjemmeboer(req.auth.sub)) {
    return res.status(403).json({ error: 'home-dweller', message: HJEMMEBOER_MELDING });
  }
  db.prepare('INSERT OR IGNORE INTO dinner_optouts (user_id, date) VALUES (?, ?)').run(req.auth.sub, date);
  res.json({ date, optedOut: true });
});

// ELEV: angre – jeg spiser likevel middag i dag
router.delete('/optout', (req, res) => {
  const date = todayDate();
  if (erHjemmeboer(req.auth.sub)) {
    return res.status(403).json({ error: 'home-dweller', message: HJEMMEBOER_MELDING });
  }
  db.prepare('DELETE FROM dinner_optouts WHERE user_id=? AND date=?').run(req.auth.sub, date);
  res.json({ date, optedOut: false });
});

// ── KJØKKENTJENESTE ──────────────────────────────────────────
// Elevene har kjøkkentjeneste en uke av gangen, på rundgang. Uken identifiseres
// alltid av mandagsdatoen (se isoWeek.js), slik at «hvilken uke er vi i nå»
// regnes ut fra serverens dato og aldri kan sprike mellom klientene.
//
// Selve endepunktene er delt med internatvask, se routes/duty.js. Stien
// beholdes som den er: utrullede app-versjoner kaller /api/dinner/kitchen-duty.
router.use('/kitchen-duty', createDutyRouter('kitchen'));

// ── ADMIN: middagsoversikt for i dag ─────────────────────────
router.get('/overview', requireAdmin, (req, res) => {
  res.json({ ...getDinnerReport(todayDate()), kitchenDuty: dutyWeek('kitchen', currentWeekStart()) });
});

export default router;
