import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

const COOKIE_NAME = 'kongshaug_session';
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Brukernavn kan inneholde norske tegn (bjørn.åsen). Da må vi normalisere selv:
//  · SQLite sin COLLATE NOCASE folder KUN A–Z, så «BJØRN.ÅSEN» ville ellers
//    ikke funnet «bjørn.åsen» ved innlogging. Vi gjør derfor små bokstaver i JS,
//    som håndterer Unicode riktig.
//  · «å» kan skrives både som ett tegn (U+00E5) og som «a» + ring (U+0061 U+030A).
//    De ser like ut, men er ulike bytes. NFC gjør dem til samme form, slik at
//    lagring og oppslag alltid stemmer overens.
// MÅ brukes både når brukernavn lagres og når det slås opp.
export function normalizeUsername(s) {
  return String(s || '').trim().toLowerCase().normalize('NFC');
}

// Er dette den ene, navngitte App/Play Store-reviewer-kontoen? Se
// config.appReview – tom miljøvariabel = alltid false, altså av som standard.
// Case-ufølsom: brukernavn lagres alltid med små bokstaver.
export function isAppReviewUser(username) {
  return !!config.appReview.bypassUsername
    && String(username || '').toLowerCase() === config.appReview.bypassUsername;
}

// native = mobilappen (Bearer-token, låst bak Face ID/kode ved hver åpning) og
// får derfor lang levetid. Nettleseren får 12 timer – den kan ikke låses.
//
// Administratorer får en kortere app-sesjon enn elevene: kontoen ser hele
// skolens brannliste, og telefonens lås er det eneste som står mellom en
// mistet telefon og den. `native` bæres med i tokenet, slik at serveren kan
// kreve gyldig vakt av nettopp appen uten å røre adminsiden i nettleseren
// (se requireWatchOnNative i routes/firelist.js).
export function signToken(user, { native = false } = {}) {
  const days = user.role === 'admin' ? config.nativeAdminSessionDays : config.nativeSessionDays;
  return jwt.sign(
    { sub: user.id, role: user.role, username: user.username, ...(native ? { native: true } : {}) },
    config.jwtSecret,
    { expiresIn: native ? `${days}d` : '12h' }
  );
}

export function issueSession(res, user) {
  const token = signToken(user);
  // Nettleseren bruker denne httpOnly-cookien. Native app (Expo) bruker i stedet
  // token-en som login-ruten returnerer i svaret (Bearer-header).
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: config.sessionMaxAgeMs,
  });
  return token;
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

// Middleware: krever gyldig innlogging. Legger req.auth = { sub, role, username }.
export function requireAuth(req, res, next) {
  // Godta Bearer-token (native app), httpOnly-cookie (nettleser), eller ?token=
  // (for å åpne fil-URL-er, f.eks. meny-PDF, direkte i mobilappen).
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.cookies?.[COOKIE_NAME] || req.query?.token;
  if (!token) return res.status(401).json({ error: 'Ikke innlogget' });
  try {
    req.auth = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'Ugyldig eller utløpt sesjon' });
  }
}

// Middleware: krever admin-rolle (bruk etter requireAuth).
export function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') {
    return res.status(403).json({ error: 'Krever administrator-tilgang' });
  }
  next();
}
