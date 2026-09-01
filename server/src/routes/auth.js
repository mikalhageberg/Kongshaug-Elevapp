import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { verifyPassword, hashPassword, issueSession, signToken, clearSession, requireAuth, isAppReviewUser, normalizeUsername } from '../auth.js';
import { isSuperAdmin, superadminCount } from '../permissions.js';

const router = Router();

// Bremser gjettede innlogginger: maks 10 forsøk per 15 min per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'For mange innloggingsforsøk. Prøv igjen om litt.' },
});

// Kontoopplysningene frontendene får. `effectiveRole` er rollen sesjonen
// faktisk har akkurat nå – den er lik user.role for alle andre enn
// reviewer-kontoen, som kan bytte modus (se /review-mode under).
function userPayload(user, effectiveRole = user.role) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: effectiveRole,
    className: user.class_name,
    dorm: user.dorm,
    room: user.room,
    mustChangePassword: !!user.must_change_password,
    authProvider: user.auth_provider || 'local',
    // Superbruker-tilgang leses fra databasen, ikke fra tokenet - se
    // permissions.js. superadminSetUp forteller om noen i det hele tatt er
    // utpekt; er svaret nei, har alle administratorer full tilgang inntil
    // videre, og admin viser en påminnelse om å utpeke noen.
    //
    // Merk at dette bevisst følger user.role og ikke effectiveRole:
    // reviewer-kontoen låner adminrollen, men skal aldri låne superbruker
    // med den.
    superadmin: user.role === 'admin' && isSuperAdmin(user.id),
    superadminSetUp: superadminCount() > 0,
    // true kun for App/Play Store-reviewer-kontoen: appen tilbyr da
    // registrering uten QR-skanning (reviewer har ingen storskjerm å skanne),
    // og viser velgeren mellom elev- og adminmodus.
    appReviewBypass: isAppReviewUser(user.username),
  };
}

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Brukernavn og passord kreves' });
  }
  // Normaliseres i JS, ikke bare via COLLATE NOCASE – se normalizeUsername.
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(normalizeUsername(username));

  // Samme svar uansett om brukeren finnes eller passordet er feil (unngår lekkasje).
  if (!user || !user.active) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  }

  // Mobilappen sender client:'native' og får et langlevet Bearer-token (den er
  // låst bak Face ID/kode ved hver åpning). Nettleseren får en 12-timers cookie.
  //
  // Også administratorer kan logge inn i appen nå – brannvakten trenger
  // brannlisten i lomma. Men de får en kortere sesjon enn elevene, og appen gir
  // dem ingenting før de har skannet kveldens vakt-QR (se fireWatch.js).
  // Levetiden settes av signToken ut fra rollen, ikke av client-feltet, som
  // kommer fra klienten og kan forfalskes.
  const isNative = String(req.body?.client || '') === 'native';
  const token = isNative ? signToken(user, { native: true }) : issueSession(res, user);

  // Innlogging starter alltid i kontoens egen rolle. Reviewer-kontoen bytter
  // eventuelt modus etterpå, gjennom /review-mode.
  res.json({
    // token brukes av native app (Bearer). Nettleseren bruker cookien og kan ignorere den.
    token,
    user: userPayload(user),
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
  res.json({ user: userPayload(user, effectiveRole(user, req.auth)) });
});

// Hvilken rolle har denne sesjonen? For alle andre enn reviewer-kontoen er
// svaret rollen i databasen, og ingenting annet: tokenet får aldri bestemme at
// noen er administrator. Bare den ene, navngitte reviewer-kontoen kan ha et
// token med en annen rolle enn raden sin – og bare fordi /review-mode under
// har utstedt det.
function effectiveRole(user, auth) {
  if (!isAppReviewUser(user.username)) return user.role;
  return auth?.role === 'admin' ? 'admin' : 'student';
}

// ── Elevmodus / adminmodus for App Store-reviewer ────────────
// Appen er to apper i én: elevene får brannliste, andakt, middag og internat,
// mens brannvakten får sin egen, smalere vaktapp. En reviewer hos Apple eller
// Google har én testkonto, og ville ellers bare sett den ene halvdelen – den
// andre ville framstått som en skjult funksjon.
//
// Derfor kan KUN reviewer-kontoen be om et token med den andre rollen.
// Sperren er den samme som for GPS- og QR-unntakene: uten
// APPLE_REVIEW_USERNAME satt er isAppReviewUser alltid usann, og da finnes
// ikke denne muligheten for noen som helst.
//
// ⚠ Adminmodus er ekte administrator-tilgang, ikke en demo: kontoen når hele
// skolens elevregister gjennom admin-API-et så lenge miljøvariabelen står på.
// Den skal fjernes igjen straks appen er godkjent – se APP-STORE-REVIEW-NOTES.md.
router.post('/review-mode', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth.sub);
  if (!user || !user.active) return res.status(401).json({ error: 'Ikke innlogget' });
  if (!isAppReviewUser(user.username)) {
    return res.status(403).json({ error: 'Krever administrator-tilgang' });
  }
  const mode = req.body?.mode;
  if (mode !== 'admin' && mode !== 'student') {
    return res.status(400).json({ error: 'Ugyldig modus' });
  }
  // Samme skille som ved innlogging: appen bærer et Bearer-token, nettleseren
  // en cookie. Begge må skiftes ut, ellers gjelder den gamle rollen videre.
  const isNative = !!req.auth.native;
  const token = isNative
    ? signToken(user, { native: true, role: mode })
    : issueSession(res, user, { role: mode });

  res.json({ token, user: userPayload(user, mode) });
});

export default router;
