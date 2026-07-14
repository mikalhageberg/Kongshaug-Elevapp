import crypto from 'node:crypto';
import db from './db.js';
import { config } from './config.js';

// Dagens dato som 'YYYY-MM-DD' i lokal tid.
export function todayDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Hent (eller opprett) andakts-økten for en gitt dato.
export function getOrCreateSession(date = todayDate()) {
  let row = db.prepare('SELECT * FROM andakt_sessions WHERE session_date = ?').get(date);
  if (!row) {
    const secret = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO andakt_sessions (session_date, secret) VALUES (?, ?)').run(date, secret);
    row = db.prepare('SELECT * FROM andakt_sessions WHERE session_date = ?').get(date);
  }
  return row;
}

// Tving frem en ny hemmelighet (ugyldiggjør alle tidligere QR-koder for dagen).
export function rotateSecret(date = todayDate()) {
  const secret = crypto.randomBytes(32).toString('hex');
  getOrCreateSession(date);
  db.prepare('UPDATE andakt_sessions SET secret = ? WHERE session_date = ?').run(secret, date);
  return getOrCreateSession(date);
}

function windowIndex(ttl = config.andakt.qrTtlSeconds, now = Date.now()) {
  return Math.floor(now / 1000 / ttl);
}

function signWindow(secret, date, win) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${date}:${win}`)
    .digest('base64url')
    .slice(0, 24);
}

// Bygg det QR-en skal inneholde for gjeldende tidsvindu.
// Formatet er kompakt: "AND1.<dato>.<vindu>.<signatur>"
export function currentToken(date = todayDate()) {
  const session = getOrCreateSession(date);
  const win = windowIndex();
  const sig = signWindow(session.secret, date, win);
  return `AND1.${date}.${win}.${sig}`;
}

// Valider en innsendt QR-token. Godtar gjeldende og forrige vindu (litt slingringsmonn).
// Returnerer { ok, reason, date }.
export function verifyToken(token) {
  if (typeof token !== 'string') return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'AND1') return { ok: false, reason: 'invalid' };
  const [, date, winStr, sig] = parts;

  const session = db.prepare('SELECT * FROM andakt_sessions WHERE session_date = ?').get(date);
  if (!session) return { ok: false, reason: 'invalid' };

  const submittedWin = Number(winStr);
  const now = windowIndex();
  // Kun gjeldende eller forrige vindu godtas -> avfotografert kode utløper raskt.
  if (submittedWin !== now && submittedWin !== now - 1) {
    return { ok: false, reason: 'expired', date };
  }
  const expected = signWindow(session.secret, date, submittedWin);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, reason: 'invalid' };
  }
  // Kun for dagens dato (ingen gjenbruk fra tidligere dager).
  if (date !== todayDate()) return { ok: false, reason: 'expired', date };
  return { ok: true, date };
}
