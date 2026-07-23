import { Router } from 'express';
import { Expo } from 'expo-server-sdk';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { sendExpoPush } from '../pushSend.js';

const router = Router();
router.use(requireAuth);

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
  res.json(await sendExpoPush(rows.map((r) => r.token), { title, body }));
});

export default router;
