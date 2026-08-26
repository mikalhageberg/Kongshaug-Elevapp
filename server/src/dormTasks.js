// Internatvaskens oppgaver.
//
// Hvert internat har sine faste oppgaver – «80-gongen med bøttekott», «KJØKKEN,
// vaske opp, sette på plass …» – med hele teksten fra lista som ellers henger på
// veggen. Eleven får den opp i appen, og kvitterer med Face ID/fingeravtrykk når
// jobben er gjort.
//
// Hver oppgave har en kort kode (ØVEST1 = Øvre Vestheim, oppgave 1). Koden er
// det admin skriver i Excel-turnusen, og den er unik på tvers av internatene, så
// en import aldri kan treffe feil internats oppgave.

import db from './db.js';

// Internatnavn → kodestamme: «Øvre Vestheim» → ØVEST, «Granhaug» → GRANH.
// Første bokstav i første ord + de fire første tegnene i det siste ordet, slik
// at Øvre/Nedre Vestheim og Øvre/Nedre Austheim holdes fra hverandre.
export function codeStem(dorm) {
  const ord = String(dorm || '').toUpperCase().replace(/[^A-ZÆØÅ0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!ord.length) return 'OPPG';
  if (ord.length === 1) return ord[0].slice(0, 5);
  const sist = ord[ord.length - 1];
  // «Treet 1» → TREET1: tallet hører til internatnavnet, ikke til oppgavenummeret.
  if (/^\d+$/.test(sist)) return ord[0].slice(0, 5) + sist;
  return ord[0][0] + sist.slice(0, 4);
}

// Neste ledige kode for internatet: ØVEST1, ØVEST2 … Hopper over koder som
// finnes fra før (også deaktiverte oppgaver, så en kode aldri gjenbrukes).
export function nextCode(dorm) {
  const stem = codeStem(dorm);
  // Ender stammen på et tall («TREET1»), skiller en bindestrek den fra
  // oppgavenummeret – ellers ville TREET1 + 2 blitt til det uleselige TREET12.
  const skille = /\d$/.test(stem) ? '-' : '';
  const brukt = new Set(db.prepare('SELECT code FROM dorm_tasks').all().map((r) => r.code));
  for (let n = 1; n < 1000; n++) {
    const kode = `${stem}${skille}${n}`;
    if (!brukt.has(kode)) return kode;
  }
  throw new Error('Fant ingen ledig oppgavekode.');
}

// Koder skrives store, uten mellomrom. Æ/Ø/Å er med fordi internatnavnene har
// dem, og bindestrek fordi internat med tall i navnet bruker den som skille.
export function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-ZÆØÅ0-9-]+/g, '');
}
export function isValidCode(code) {
  return /^[A-ZÆØÅ0-9][A-ZÆØÅ0-9-]{1,11}$/.test(code);
}

const publicTask = (t) => t && ({
  id: t.id,
  dorm: t.dorm,
  code: t.code,
  title: t.title,
  description: t.description,
  active: !!t.active,
  sortOrder: t.sort_order,
});

// Alle oppgaver, eller bare ett internats. `activeOnly` brukes der eleven ser
// dem – en deaktivert oppgave skal ikke kunne settes opp på nytt.
export function listTasks({ dorm = null, activeOnly = false } = {}) {
  const der = [];
  const arg = [];
  if (dorm) { der.push('dorm = ?'); arg.push(dorm); }
  if (activeOnly) der.push('active = 1');
  const sql = `SELECT * FROM dorm_tasks ${der.length ? 'WHERE ' + der.join(' AND ') : ''}
               ORDER BY dorm COLLATE NOCASE, sort_order, id`;
  return db.prepare(sql).all(...arg).map(publicTask);
}

export function taskById(id) {
  return publicTask(db.prepare('SELECT * FROM dorm_tasks WHERE id = ?').get(id));
}

export function taskByCode(code) {
  return publicTask(db.prepare('SELECT * FROM dorm_tasks WHERE code = ?').get(normalizeCode(code)));
}

export function createTask({ dorm, title, description = '', code = null }) {
  const kode = code ? normalizeCode(code) : nextCode(dorm);
  if (!isValidCode(kode)) throw new Error('Koden kan bare inneholde bokstaver, tall og bindestrek (2–12 tegn).');
  if (db.prepare('SELECT 1 FROM dorm_tasks WHERE code = ?').get(kode)) {
    throw new Error(`Koden ${kode} er allerede i bruk.`);
  }
  // Ny oppgave legger seg sist i internatets liste.
  const sist = db.prepare('SELECT MAX(sort_order) AS n FROM dorm_tasks WHERE dorm = ?').get(dorm)?.n ?? 0;
  const info = db
    .prepare('INSERT INTO dorm_tasks (dorm, code, title, description, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(dorm, kode, title, description, sist + 1);
  return taskById(info.lastInsertRowid);
}

export function updateTask(id, felt) {
  const t = db.prepare('SELECT * FROM dorm_tasks WHERE id = ?').get(id);
  if (!t) return null;
  const sett = [], arg = [];
  const legg = (kol, verdi) => { sett.push(`${kol} = ?`); arg.push(verdi); };
  if (felt.title != null) legg('title', String(felt.title).trim());
  if (felt.description != null) legg('description', String(felt.description).trim());
  if (felt.active != null) legg('active', felt.active ? 1 : 0);
  if (felt.sortOrder != null) legg('sort_order', Number(felt.sortOrder) || 0);
  // Koden endres bare når admin ber om det – den ligger i regnearkene ute hos folk.
  if (felt.code != null) {
    const kode = normalizeCode(felt.code);
    if (!isValidCode(kode)) throw new Error('Koden kan bare inneholde bokstaver, tall og bindestrek (2–12 tegn).');
    if (kode !== t.code && db.prepare('SELECT 1 FROM dorm_tasks WHERE code = ?').get(kode)) {
      throw new Error(`Koden ${kode} er allerede i bruk.`);
    }
    legg('code', kode);
  }
  if (sett.length) db.prepare(`UPDATE dorm_tasks SET ${sett.join(', ')} WHERE id = ?`).run(...arg, id);
  return taskById(id);
}

// Hvor mange ganger oppgaven er satt opp. En oppgave som har vært i bruk
// slettes ikke – da ville historikken mistet hva som faktisk ble gjort.
export function taskUsage(id) {
  return db.prepare('SELECT COUNT(*) AS n FROM dorm_duties WHERE task_id = ?').get(id).n;
}

export function deleteTask(id) {
  if (taskUsage(id) > 0) return false;
  db.prepare('DELETE FROM dorm_tasks WHERE id = ?').run(id);
  return true;
}
