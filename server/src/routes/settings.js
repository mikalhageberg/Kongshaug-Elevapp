import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getSettings, setSettings, TIME_RE,
  RETENTION_DAYS_MIN, RETENTION_DAYS_MAX, GPS_HOURS_MIN, GPS_HOURS_MAX,
  NOTIFICATION_DAYS_MIN, NOTIFICATION_DAYS_MAX,
  ARCHIVE_WEEKS_MIN, ARCHIVE_WEEKS_MAX,
  QR_BEFORE_MIN, QR_BEFORE_MAX, QR_AFTER_MIN, QR_AFTER_MAX,
  WARMUP_MIN, WARMUP_MAX, PHOTO_PERCENT_MIN, PHOTO_PERCENT_MAX,
  FIRE_DELAY_MIN, FIRE_DELAY_MAX, WATCH_DELAY_MIN, WATCH_DELAY_MAX,
  ADMIN_EDITABLE_SETTINGS,
} from '../settings.js';
import { requireSuperAdmin, isSuperAdmin } from '../permissions.js';
import { isDateString } from '../isoWeek.js';
import { runRetentionNow } from '../retention.js';
import { config } from '../config.js';
import { sendFireListEmail, sendKitchenEmail } from '../mail.js';
import { sendFireListReminder, sendWatchMissingPush } from '../fireReminder.js';
import { sendDutyReminders } from '../dutyReminder.js';

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
    kitchenEmailTime: b.kitchenEmailTime,
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
  if (b.dutyPushEnabled !== undefined) patch.dutyPushEnabled = b.dutyPushEnabled ? 'true' : 'false';
  if (b.watchPushEnabled !== undefined) patch.watchPushEnabled = b.watchPushEnabled ? 'true' : 'false';
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
    notificationRetentionDays: { v: b.notificationRetentionDays, min: NOTIFICATION_DAYS_MIN, max: NOTIFICATION_DAYS_MAX, navn: 'Lagringstid for varsler (dager)' },
    andaktArchiveWeeks: { v: b.andaktArchiveWeeks, min: ARCHIVE_WEEKS_MIN, max: ARCHIVE_WEEKS_MAX, navn: 'Uker i andaktsarkivet' },
    andaktQrOpenBefore: { v: b.andaktQrOpenBefore, min: QR_BEFORE_MIN, max: QR_BEFORE_MAX, navn: 'QR-koden åpner (minutter før fristen)' },
    andaktQrCloseAfter: { v: b.andaktQrCloseAfter, min: QR_AFTER_MIN, max: QR_AFTER_MAX, navn: 'QR-koden stenger (minutter etter fristen)' },
    practiceWarmupMinutes: { v: b.practiceWarmupMinutes, min: WARMUP_MIN, max: WARMUP_MAX, navn: 'Oppvarming (minutter)' },
    fireEmailDelayMinutes: { v: b.fireEmailDelayMinutes, min: FIRE_DELAY_MIN, max: FIRE_DELAY_MAX, navn: 'Forsinkelse på brannliste-e-post (minutter)' },
    watchPushDelayMinutes: { v: b.watchPushDelayMinutes, min: WATCH_DELAY_MIN, max: WATCH_DELAY_MAX, navn: 'Forsinkelse på vaktvarselet (minutter)' },
    practicePhotoPercent: { v: b.practicePhotoPercent, min: PHOTO_PERCENT_MIN, max: PHOTO_PERCENT_MAX, navn: 'Andel økter med bilde (%)' },
  };
  for (const [k, { v, min, max, navn }] of Object.entries(ints)) {
    if (v === undefined) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      return res.status(400).json({ error: `${navn} må være et helt tall mellom ${min} og ${max}.` });
    }
    patch[k] = n;
  }

  // Øvekonkurransens periode. Tomme datoer betyr «ingen konkurranse», og er
  // den eneste måten å slå den av på.
  for (const k of ['practiceStartDate', 'practiceEndDate']) {
    if (b[k] === undefined) continue;
    const v = String(b[k] || '').trim();
    if (v && !isDateString(v)) return res.status(400).json({ error: 'Ugyldig dato for øvekonkurransen. Bruk ÅÅÅÅ-MM-DD.' });
    patch[k] = v;
  }
  const start = patch.practiceStartDate ?? getSettings().practiceStartDate;
  const end = patch.practiceEndDate ?? getSettings().practiceEndDate;
  if (start && end && end < start) {
    return res.status(400).json({ error: 'Sluttdato kan ikke være før startdato.' });
  }

  // Innstillingene på Innstillinger-siden krever superbruker. De som hører til
  // andre sider slipper gjennom, slik at en vanlig administrator kan drifte
  // varsler og øvekonkurransen uten å ha nøkkelen til alt.
  const beskyttet = Object.keys(patch).filter((k) => !ADMIN_EDITABLE_SETTINGS.has(k));
  if (beskyttet.length && !isSuperAdmin(req.auth.sub)) {
    return res.status(403).json({ error: 'Krever superbruker-tilgang for å endre disse innstillingene.' });
  }

  res.json(setSettings(patch));
});

// Send brannlisten på e-post nå (for å teste oppsettet).
router.post('/test-email', requireSuperAdmin, async (req, res) => {
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

// Send vaktvarselet nå (for å teste oppsettet). Går til dem som har tatt
// vakten i kveld – har ingen skannet koden, sier svaret nettopp det.
router.post('/test-watch-push', async (req, res) => {
  try {
    res.json({ ok: true, ...(await sendWatchMissingPush()) });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

// Send tjenestevarselet nå (for å teste oppsettet). Hopper over søndags-
// sjekken planleggeren gjør – varselet gjelder uansett uken som kommer.
router.post('/test-duty-push', async (req, res) => {
  try {
    res.json({ ok: true, ...(await sendDutyReminders()) });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

// Kjør sletting/nulling med én gang, i stedet for å vente på neste døgn.
// Ignorerer av/på-bryteren: admin har trykket bevisst.
router.post('/run-retention', requireSuperAdmin, (req, res) => {
  try {
    res.json({ ok: true, ...runRetentionNow() });
  } catch (ex) {
    res.status(400).json({ error: ex.message });
  }
});

export default router;
