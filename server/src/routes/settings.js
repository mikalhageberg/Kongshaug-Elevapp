import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getSettings, setSettings, TIME_RE,
  RETENTION_DAYS_MIN, RETENTION_DAYS_MAX, GPS_HOURS_MIN, GPS_HOURS_MAX,
} from '../settings.js';
import { runRetentionNow } from '../retention.js';
import { config } from '../config.js';
import { sendFireListEmail, sendKitchenEmail } from '../mail.js';
import { sendFireListReminder } from '../fireReminder.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', (req, res) => {
  // Ta med om Brevo-nøkkelen er satt (så frontenden kan vise status).
  res.json({ ...getSettings(), mailConfigured: config.mail.enabled && !!config.mail.from });
});

router.put('/', (req, res) => {
  const b = req.body || {};
  const patch = {};

  const times = {
    andaktDeadline: b.andaktDeadline,
    fireOpenWeekday: b.fireOpenWeekday, fireCloseWeekday: b.fireCloseWeekday,
    fireOpenFriday: b.fireOpenFriday, fireCloseFriday: b.fireCloseFriday,
    fireOpenSaturday: b.fireOpenSaturday, fireCloseSaturday: b.fireCloseSaturday,
    fireEmailTime: b.fireEmailTime, kitchenEmailTime: b.kitchenEmailTime,
  };
  for (const [k, v] of Object.entries(times)) {
    if (v === undefined) continue;
    if (!TIME_RE.test(v)) return res.status(400).json({ error: `Ugyldig tidspunkt (${k}). Bruk formatet TT:MM.` });
    patch[k] = v;
  }
  if (b.andaktWeekdaysOnly !== undefined) patch.andaktWeekdaysOnly = b.andaktWeekdaysOnly ? 'true' : 'false';
  if (b.fireEmailEnabled !== undefined) patch.fireEmailEnabled = b.fireEmailEnabled ? 'true' : 'false';
  if (b.kitchenEmailEnabled !== undefined) patch.kitchenEmailEnabled = b.kitchenEmailEnabled ? 'true' : 'false';
  if (b.fireReminderPushEnabled !== undefined) patch.fireReminderPushEnabled = b.fireReminderPushEnabled ? 'true' : 'false';
  if (b.guestEmailEnabled !== undefined) patch.guestEmailEnabled = b.guestEmailEnabled ? 'true' : 'false';
  for (const k of ['fireEmailRecipient', 'kitchenEmailRecipient', 'kitchenEmailFrom', 'guestEmailRecipient']) {
    if (b[k] === undefined) continue;
    const r = String(b[k]).trim();
    if (r && !EMAIL_RE.test(r)) return res.status(400).json({ error: 'Ugyldig e-postadresse.' });
    patch[k] = r;
  }
  if (b.kitchenEmailFromName !== undefined) patch.kitchenEmailFromName = String(b.kitchenEmailFromName).trim().slice(0, 60);

  // Lagringstid. Heltall innenfor grensene – utenfor er sannsynligvis en
  // skrivefeil, og en feil her sletter data.
  if (b.retentionEnabled !== undefined) patch.retentionEnabled = b.retentionEnabled ? 'true' : 'false';
  const ints = {
    retentionDays: { v: b.retentionDays, min: RETENTION_DAYS_MIN, max: RETENTION_DAYS_MAX, navn: 'Lagringstid (dager)' },
    gpsRetentionHours: { v: b.gpsRetentionHours, min: GPS_HOURS_MIN, max: GPS_HOURS_MAX, navn: 'Lagringstid for GPS (timer)' },
  };
  for (const [k, { v, min, max, navn }] of Object.entries(ints)) {
    if (v === undefined) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      return res.status(400).json({ error: `${navn} må være et helt tall mellom ${min} og ${max}.` });
    }
    patch[k] = n;
  }

  res.json(setSettings(patch));
});

// Send brannlisten på e-post nå (for å teste oppsettet).
router.post('/test-email', async (req, res) => {
  try {
    const result = await sendFireListEmail();
    res.json({ ok: true, ...result });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

// Send middagsoversikten til kjøkkenet nå (for å teste oppsettet).
router.post('/test-kitchen-email', async (req, res) => {
  try {
    const result = await sendKitchenEmail();
    res.json({ ok: true, ...result });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

// Send brannliste-påminnelsen nå (for å teste oppsettet).
router.post('/test-push-reminder', async (req, res) => {
  try {
    const result = await sendFireListReminder();
    res.json({ ok: true, ...result });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

// Kjør sletting/nulling med én gang, i stedet for å vente på neste døgn.
// Ignorerer av/på-bryteren: admin har trykket bevisst.
router.post('/run-retention', (req, res) => {
  try {
    res.json({ ok: true, ...runRetentionNow() });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

export default router;
