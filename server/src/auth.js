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

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, username: user.username },
    config.jwtSecret,
    { expiresIn: '12h' }
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
