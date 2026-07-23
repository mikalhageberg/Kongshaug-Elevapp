import { Router } from 'express';
import { Expo } from 'expo-server-sdk';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAuth);
const expo = new Expo();

// ELEV/ADMIN: registrer denne enhetens Expo push-token (etter innlogging).
router.post('/register', (req, res) => {
  const { token, platform } = req.body || {};
  if (!Expo.isExpoPushToken(token)) return res.status(400).json({ error: 'Ugyldig push-token' });
  if (!['ios', 'android'].includes(platform)) return res.status(400).json({ error: 'Ugyldig plattform' });
  db.prepare(`
    INSERT INTO push_tokens (user_id, token, platform, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, updated_at = datetime('now')
  `).run(req.auth.sub, token, platform);
  res.status(201).json({ ok: true });
});

// Avregistrer ved utlogging, slik at enheten ikke lenger mottar varsler.
router.delete('/register', (req, res) => {
  const { token } = req.body || {};
  if (token) db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(token, req.auth.sub);
  res.json({ ok: true });
});

// ADMIN: send et varsel (tittel + tekst) til ALLE registrerte enheter.
router.post('/broadcast', requireAdmin, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!title || !body) return res.status(400).json({ error: 'Tittel og tekst kreves' });

  const rows = db.prepare('SELECT token FROM push_tokens').all();
  if (!rows.length) return res.json({ sent: 0, failed: 0 });

  const messages = rows.map((r) => ({ to: r.token, title, body, sound: 'default' }));
  const chunks = expo.chunkPushNotifications(messages);
  const badTokens = [];
  let sent = 0;

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error') {
          if (ticket.details?.error === 'DeviceNotRegistered') badTokens.push(chunk[i].to);
        } else {
          sent++;
        }
      });
    } catch {
      // Hele chunken feilet (f.eks. nettverksfeil) – hopp over, ikke stopp resten.
    }
  }

  if (badTokens.length) {
    const ph = badTokens.map(() => '?').join(',');
    db.prepare(`DELETE FROM push_tokens WHERE token IN (${ph})`).run(...badTokens);
  }

  res.json({ sent, failed: rows.length - sent });
});

export default router;
