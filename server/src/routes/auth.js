import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { verifyPassword, hashPassword, issueSession, signToken, clearSession, requireAuth } from '../auth.js';

const router = Router();

// Bremser gjettede innlogginger: maks 10 forsøk per 15 min per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'For mange innloggingsforsøk. Prøv igjen om litt.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Brukernavn og passord kreves' });
  }
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(String(username).trim());

  // Samme svar uansett om brukeren finnes eller passordet er feil (unngår lekkasje).
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  }

  const token = issueSession(res, user);
  res.json({
    // token brukes av native app (Bearer). Nettleseren bruker cookien og kan ignorere den.
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      className: user.class_name,
      dorm: user.dorm,
      room: user.room,
      mustChangePassword: !!user.must_change_password,
      authProvider: user.auth_provider || 'local',
    },
  });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// Bytt passord. Brukes både ved påtvunget bytte (første innlogging) og frivillig.
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.sub);
  if (!u || !u.active) return res.status(401).json({ error: 'Ikke innlogget' });

  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Nytt passord må ha minst 8 tegn' });
  }
  // Ved frivillig bytte kreves gjeldende passord. Ved påtvunget bytte er brukeren
  // nettopp autentisert med det midlertidige passordet, så vi hopper over dette.
  if (!u.must_change_password) {
    const ok = currentPassword && (await verifyPassword(currentPassword, u.password_hash));
    if (!ok) return res.status(400).json({ error: 'Feil gjeldende passord' });
  }
  const hash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, u.id);
  res.json({ ok: true });
});

// Hvem er jeg? Brukes av frontendene til å sjekke sesjonen.
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.sub);
  if (!user || !user.active) return res.status(401).json({ error: 'Ikke innlogget' });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      className: user.class_name,
      dorm: user.dorm,
      room: user.room,
      mustChangePassword: !!user.must_change_password,
      authProvider: user.auth_provider || 'local',
    },
  });
});

export default router;
