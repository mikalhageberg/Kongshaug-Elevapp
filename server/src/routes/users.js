import express, { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db.js';
import { config } from '../config.js';
import { hashPassword, requireAuth, requireAdmin } from '../auth.js';
import { readXlsxGrid } from '../xlsxReader.js';
import { parseStudentsXlsx } from '../studentParser.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role,
    className: u.class_name,
    dorm: u.dorm,
    room: u.room,
    active: !!u.active,
    mustChangePassword: !!u.must_change_password,
    authProvider: u.auth_provider || 'local',
    createdAt: u.created_at,
  };
}

// Enkel passordgenerator (leselige tegn, ingen forvekslingsbare 0/O/1/l).
function generatePassword(len = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Brukernavn "fornavn.etternavn" fra fullt navn (norske tegn normalisert).
function slugName(s) {
  return String(s).toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function baseUsername(fullName) {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = slugName(parts[0]);
  const last = parts.length > 1 ? slugName(parts[parts.length - 1]) : '';
  return last ? `${first}.${last}` : first;
}
// Finn et ledig brukernavn (legger på 2,3,… ved kollisjon). `taken` = Set i denne batchen.
function uniqueUsername(fullName, taken) {
  const base = baseUsername(fullName);
  if (!base) return '';
  const exists = (u) =>
    taken.has(u) || !!db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(u);
  let candidate = base, n = 1;
  while (exists(candidate)) { n += 1; candidate = `${base}${n}`; }
  taken.add(candidate);
  return candidate;
}

// GET /api/users  – liste over alle brukere (elever + admin)
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM users ORDER BY active DESC, full_name COLLATE NOCASE ASC')
    .all();
  res.json({ users: rows.map(publicUser) });
});

// POST /api/users  – opprett bruker. Kun admin. Elever kan ikke registrere seg selv.
router.post('/', async (req, res) => {
  let { username, password, fullName, role, className, dorm, room } = req.body || {};
  username = String(username || '').trim().toLowerCase();
  fullName = String(fullName || '').trim();
  role = role === 'admin' ? 'admin' : 'student';

  if (!username || !fullName) {
    return res.status(400).json({ error: 'Navn og brukernavn kreves' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (exists) return res.status(409).json({ error: 'Brukernavnet er allerede i bruk' });

  // Hvis passord ikke er oppgitt, generer ett og returner det i klartekst ÉN gang.
  const generated = !password;
  if (generated) password = generatePassword();
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Passord må ha minst 6 tegn' });
  }

  const password_hash = await hashPassword(password);
  // Nye kontoer får et midlertidig passord som må byttes ved første innlogging.
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, role, class_name, dorm, room, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(username, password_hash, fullName, role, className || null, dorm || null, room || null);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({
    user: publicUser(user),
    // Klartekst-passordet returneres bare her, slik at admin kan gi det videre.
    generatedPassword: generated ? password : undefined,
  });
});

// POST /api/users/parse-xlsx – les en opplastet elevliste (.xlsx/.csv), tolk den
// med OpenAI og returner en FORHÅNDSVISNING. Skriver ikke til databasen; admin
// bekrefter (og kan rette) før opprettelsen skjer via /bulk under.
// Tillatte klasser/internat sendes som query-parametre fra frontend, slik at
// CLASSES/DORMS i admin.js forblir eneste fasit.
router.post('/parse-xlsx', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Tom fil.' });
  if (!config.openai.enabled) return res.status(400).json({ error: 'OpenAI er ikke satt opp (mangler OPENAI_API_KEY).' });
  const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  try {
    const { rows } = readXlsxGrid(req.body);
    const existingNames = db.prepare("SELECT full_name FROM users WHERE role = 'student'").all().map((r) => r.full_name);
    const preview = await parseStudentsXlsx(rows, {
      classes: split(req.query.classes),
      dorms: split(req.query.dorms),
      existingNames,
    });
    res.json(preview);
  } catch (ex) {
    res.status(400).json({ error: ex.message || 'Kunne ikke lese filen.' });
  }
});

// POST /api/users/bulk  – opprett mange brukere på én gang.
// body: { students: [{ fullName, className, dorm, room }], role?: 'student' | 'admin' }
// Genererer brukernavn (fornavn.etternavn, unikt) og et midlertidig passord for hver,
// og returnerer passordene i klartekst ÉN gang (til utskrift av brukerkort).
// Feltet heter fortsatt «students» av bakoverkompatibilitet; role styrer om det
// blir elever eller administratorer. Administratorer får ikke klasse/internat/rom.
router.post('/bulk', async (req, res) => {
  const list = Array.isArray(req.body?.students) ? req.body.students : [];
  if (!list.length) return res.status(400).json({ error: 'Ingen brukere å opprette' });
  if (list.length > 500) return res.status(400).json({ error: 'For mange på én gang (maks 500)' });
  const role = req.body?.role === 'admin' ? 'admin' : 'student';
  const isStudent = role === 'student';

  const taken = new Set();
  const created = [];
  const errors = [];

  const insert = db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role, class_name, dorm, room, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );

  for (let i = 0; i < list.length; i++) {
    const row = list[i] || {};
    const fullName = String(row.fullName || '').trim();
    if (!fullName) { errors.push({ line: i + 1, error: 'Mangler navn' }); continue; }
    const username = uniqueUsername(fullName, taken);
    if (!username) { errors.push({ line: i + 1, fullName, error: 'Kunne ikke lage brukernavn' }); continue; }
    const password = generatePassword();
    const hash = await hashPassword(password);
    try {
      const info = insert.run(
        username, hash, fullName, role,
        isStudent ? (row.className || null) : null,
        isStudent ? (row.dorm || null) : null,
        isStudent ? (row.room || null) : null
      );
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      created.push({ ...publicUser(u), password });
    } catch (ex) {
      errors.push({ line: i + 1, fullName, error: 'Kunne ikke lagre' });
    }
  }

  res.status(201).json({ created, errors, count: created.length });
});

// PATCH /api/users/:id  – oppdater felter og/eller sett nytt passord.
router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Fant ikke brukeren' });

  const { fullName, className, dorm, room, active, password } = req.body || {};
  const fields = [];
  const vals = [];
  if (fullName !== undefined) { fields.push('full_name = ?'); vals.push(String(fullName).trim()); }
  if (className !== undefined) { fields.push('class_name = ?'); vals.push(className || null); }
  if (dorm !== undefined) { fields.push('dorm = ?'); vals.push(dorm || null); }
  if (room !== undefined) { fields.push('room = ?'); vals.push(room || null); }
  if (active !== undefined) { fields.push('active = ?'); vals.push(active ? 1 : 0); }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Passord må ha minst 6 tegn' });
    fields.push('password_hash = ?');
    vals.push(await hashPassword(password));
    // Admin-satt passord er midlertidig – brukeren må velge nytt ved neste innlogging.
    fields.push('must_change_password = 1');
  }
  if (!fields.length) return res.status(400).json({ error: 'Ingenting å oppdatere' });

  vals.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ user: publicUser(updated) });
});

// DELETE /api/users/:id  – slett en bruker (og deres registreringer via cascade).
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number(req.auth.sub) === id) {
    return res.status(400).json({ error: 'Du kan ikke slette din egen konto' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Fant ikke brukeren' });

  // Ikke la den siste admin-kontoen bli slettet.
  if (user.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
    if (admins <= 1) return res.status(400).json({ error: 'Kan ikke slette den siste administratoren' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// POST /api/users/bulk-delete  – slett flere brukere på én gang.
// body: { ids: [1,2,3] }. Hopper over egen konto; verner den siste administratoren.
router.post('/bulk-delete', (req, res) => {
  const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const selfId = Number(req.auth.sub);
  const ids = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== selfId))];
  if (!ids.length) return res.status(400).json({ error: 'Ingen gyldige brukere valgt' });

  const ph = ids.map(() => '?').join(',');
  const targets = db.prepare(`SELECT id, role FROM users WHERE id IN (${ph})`).all(...ids);
  const adminsInSet = targets.filter((t) => t.role === 'admin').length;
  if (adminsInSet > 0) {
    const totalAdmins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
    if (adminsInSet >= totalAdmins) {
      return res.status(400).json({ error: 'Kan ikke slette den siste administratoren.' });
    }
  }

  const info = db.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
  res.json({ deleted: info.changes });
});

export default router;
