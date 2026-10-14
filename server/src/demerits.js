// Prikkesystemet: prikker for brudd på internatreglene.
//
// Kategoriene og prikkene er skolens egen liste (Prikkekategorier.xlsx). De
// ligger her i koden og ikke i en tabell: lista endres sjelden, og serveren er
// den eneste som skal avgjøre hvor mange prikker en kategori gir – klienten
// sender bare hvilken kategori, aldri antallet, utenom «Egendefinert» og
// rusmidler (som har et minstetall, men kan settes høyere).
//
// Hvem ser hva:
//   - Superbrukere tildeler, ser alle elevenes summer, kan endre og slette
//     tildelinger, og ser hele endringsloggen. En slettet tildeling merkes,
//     og loggen viser hvem som gjorde hva – til en superbruker sletter
//     loggen for eleven (clearDemeritLog).
//   - Den som har vakten kan tildele fra brannlisten i appen, og alle
//     administratorer kan tildele fra brannlisten i nettleseren – men ingen av
//     dem får se hvor mange prikker eleven har fra før. Svaret på en tildeling inneholder
//     derfor ingen sum.
//   - Eleven ser sine egne prikker, med kategori og begrunnelse.

import db from './db.js';
import { cellText, isBlankRow, normName, q, readTemplateHeader, throwRowErrors } from './sheetTemplate.js';

export const DEMERIT_CATEGORIES = [
  { key: 'kjokkentjeneste', label: 'Møtte ikke til kjøkkentjeneste', points: 2 },
  { key: 'romvask', label: 'Ikke tatt romvask', points: 1 },
  { key: 'internatvask', label: 'Ikke tatt internatvask', points: 2 },
  { key: 'brannliste', label: 'Mangler X (inne) eller B (borte) på brannlisten', points: 0.5 },
  { key: 'ute-for-innetid', label: 'Ute etter innkryss, før innetid', points: 1 },
  { key: 'ute-etter-innetid-kort', label: 'Ute etter innetid, under 30 min', points: 1.5 },
  { key: 'ute-etter-innetid-lang', label: 'Ute etter innetid, over 30 min', points: 2.5 },
  { key: 'feil-sted-kort', label: 'Feil sted på eget internat etter innetid, under 30 min', points: 1 },
  { key: 'feil-sted-lang', label: 'Feil sted på eget internat etter innetid, over 30 min', points: 2 },
  { key: 'ommoblering', label: 'Ommøblert rom eller fellesrom uten lov', points: 1 },
  { key: 'gjest-kort', label: 'Gjest på rommet uten avtale, under 30 min (følger ellers reglene)', points: 1 },
  { key: 'gjest-lang', label: 'Gjest på rommet uten avtale, over 30 min (følger ellers reglene)', points: 2 },
  { key: 'gjest-regelbrudd', label: 'Gjest på rommet uten avtale, bryter andre regler (f.eks. bråk)', points: 3 },
  { key: 'uro-fokustid', label: 'Uro i fokustid etter først å ha fått tilsnakk', points: 1 },
  { key: 'uro-innetid', label: 'Uro etter innetid', points: 1 },
  { key: 'forsopling', label: 'Forsøpling ute eller inne', points: 1 },
  { key: 'snus', label: 'Snus', points: 1 },
  { key: 'royking', label: 'Røyking', points: 2 },
  // «15 +» i arket: minst 15, men den som tildeler kan sette mer.
  {
    key: 'rusmidler', label: 'Alkohol og andre rusmidler', points: 15, minPoints: 15,
    note: 'Nulltoleranse! Se internatreglementet §5.',
  },
  // Den som tildeler oppgir antallet selv.
  { key: 'egendefinert', label: 'Egendefinert', points: null, custom: true },
];

// Prikker eleven hadde fra papirlista før appen ble tatt i bruk. Kommer bare
// inn via Excel-importen – kategorien står ikke i DEMERIT_CATEGORIES og kan
// derfor ikke velges i tildelingsmenyen. Én slik rad per elev: en ny import
// endrer den som finnes (og logger endringen) i stedet for å legge til enda en.
export const IMPORT_CATEGORY = {
  key: 'tidligere',
  label: 'Opptjente prikker før appen ble tatt i bruk',
};

const MAX_POINTS = 100;
const MAX_IMPORT_POINTS = 500;
const MAX_REASON = 500;

// Tolker og kontrollerer en tildeling. Kaster med en norsk feilmelding som kan
// vises rett i appen.
//
// allowImport slipper gjennom «tidligere»-kategorien – bare når en importert
// rad endres. Ved vanlig tildeling kan den ikke velges.
export function parseDemerit({ category, points, reason }, { allowImport = false } = {}) {
  if (allowImport && category === IMPORT_CATEGORY.key) {
    const n = parsePoints(points);
    if (n == null) throw new Error('Skriv inn antall prikker.');
    if (n > MAX_IMPORT_POINTS) throw new Error(`Høyst ${MAX_IMPORT_POINTS} prikker.`);
    return { categoryKey: IMPORT_CATEGORY.key, categoryLabel: IMPORT_CATEGORY.label, points: n, reason: null };
  }
  const cat = DEMERIT_CATEGORIES.find((c) => c.key === category);
  if (!cat) throw new Error('Velg en kategori.');

  let p = cat.points;
  if (cat.custom || cat.minPoints != null) {
    const n = Number(String(points ?? '').replace(',', '.'));
    if (cat.custom && (points == null || points === '')) throw new Error('Skriv inn antall prikker.');
    if (points != null && points !== '') {
      if (!Number.isFinite(n) || n <= 0) throw new Error('Antall prikker må være et positivt tall.');
      // Halve prikker finnes i lista (0,5), men ikke noe finere enn det.
      if (Math.round(n * 2) !== n * 2) throw new Error('Antall prikker må være et helt tall eller en halv (f.eks. 1,5).');
      if (n > MAX_POINTS) throw new Error(`Høyst ${MAX_POINTS} prikker om gangen.`);
      p = n;
    }
    if (cat.minPoints != null && p < cat.minPoints) throw new Error(`Denne kategorien gir minst ${cat.minPoints} prikker.`);
  }

  const r = String(reason ?? '').trim();
  if (r.length > MAX_REASON) throw new Error(`Begrunnelsen kan være høyst ${MAX_REASON} tegn.`);
  return { categoryKey: cat.key, categoryLabel: cat.label, points: p, reason: r || null };
}

// En tildeling slik den lagres i loggen: det som kan endres.
const snapshot = (r) => ({ category: r.category_key, categoryLabel: r.category_label, points: r.points, reason: r.reason });

const logEvent = db.prepare(
  `INSERT INTO demerit_events (demerit_id, user_id, action, actor_id, before_json, after_json, note)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const json = (o) => (o ? JSON.stringify(o) : null);

function aktiv(id) {
  return db.prepare('SELECT * FROM demerits WHERE id = ? AND deleted_at IS NULL').get(id);
}

// «1,5», «1.5», 2 → tall i halve prikker. null for tomt; kaster for ugyldig.
function parsePoints(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) throw new Error('Antall prikker må være et positivt tall.');
  if (Math.round(n * 2) !== n * 2) throw new Error('Antall prikker må være et helt tall eller en halv (f.eks. 1,5).');
  return n;
}

export const addDemerit = db.transaction((userId, givenBy, d) => {
  const info = db.prepare(
    `INSERT INTO demerits (user_id, category_key, category_label, points, reason, given_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, d.categoryKey, d.categoryLabel, d.points, d.reason, givenBy);
  const id = Number(info.lastInsertRowid);
  logEvent.run(id, userId, 'opprettet', givenBy, null, json(snapshot(aktiv(id))), null);
  return id;
});

// Endre kategori, antall eller begrunnelse. Returnerer false hvis
// tildelingen ikke finnes (eller er slettet), null hvis ingenting endret seg.
export const updateDemerit = db.transaction((id, actorId, d, note = null) => {
  const før = aktiv(id);
  if (!før) return false;
  const etter = { category: d.categoryKey, categoryLabel: d.categoryLabel, points: d.points, reason: d.reason };
  if (JSON.stringify(snapshot(før)) === JSON.stringify(etter)) return null;
  db.prepare(
    `UPDATE demerits SET category_key = ?, category_label = ?, points = ?, reason = ?, updated_at = datetime('now')
      WHERE id = ?`
  ).run(d.categoryKey, d.categoryLabel, d.points, d.reason, id);
  logEvent.run(id, før.user_id, 'endret', actorId, json(snapshot(før)), json(etter), note);
  return true;
});

// Sletting er myk: raden blir stående, merket som slettet, så loggen fortsatt
// kan vise hva som ble gitt. Eleven og summene ser den ikke lenger.
export const deleteDemerit = db.transaction((id, actorId, note = null) => {
  const før = aktiv(id);
  if (!før) return false;
  db.prepare("UPDATE demerits SET deleted_at = datetime('now') WHERE id = ?").run(id);
  logEvent.run(id, før.user_id, 'slettet', actorId, json(snapshot(før)), null, note);
  return true;
});

// Nullstill en elev: alle gjeldende tildelinger slettes (mykt) på én gang.
// I loggen er det ÉN hendelse (demerit_resets), ikke en sletting per
// tildeling. Returnerer antall som ble slettet.
export const resetDemerits = db.transaction((userId, actorId) => {
  const { n, sum } = db.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS sum FROM demerits WHERE user_id = ? AND deleted_at IS NULL'
  ).get(userId);
  if (!n) return 0;
  db.prepare("UPDATE demerits SET deleted_at = datetime('now') WHERE user_id = ? AND deleted_at IS NULL").run(userId);
  db.prepare('INSERT INTO demerit_resets (user_id, actor_id, points, count) VALUES (?, ?, ?, ?)').run(userId, actorId, sum, n);
  return n;
});

// Slett endringsloggen for én elev. Alt som bare finnes i loggen forsvinner
// for godt: hendelsene, nullstillingene og tildelingene som allerede var
// slettet (de vises ingen andre steder). Gjeldende prikker røres ikke.
export const clearDemeritLog = db.transaction((userId) => {
  db.prepare('DELETE FROM demerits WHERE user_id = ? AND deleted_at IS NOT NULL').run(userId);
  const hendelser = db.prepare('DELETE FROM demerit_events WHERE user_id = ?').run(userId).changes;
  const nullstillinger = db.prepare('DELETE FROM demerit_resets WHERE user_id = ?').run(userId).changes;
  return hendelser + nullstillinger;
});

// Alle gjeldende tildelinger til én elev, nyeste først. withGiver tar med
// hvem som ga prikkene – det ser bare superbrukerne.
export function demeritsFor(userId, { withGiver = false } = {}) {
  const rows = db.prepare(
    `SELECT d.id, d.category_key, d.category_label, d.points, d.reason, d.created_at, d.updated_at,
            u.full_name AS given_by_name
       FROM demerits d LEFT JOIN users u ON u.id = d.given_by
      WHERE d.user_id = ? AND d.deleted_at IS NULL
      ORDER BY d.category_key = '${IMPORT_CATEGORY.key}', d.created_at DESC, d.id DESC`
  ).all(userId);
  const items = rows.map((r) => ({
    id: r.id,
    category: r.category_key,
    categoryLabel: r.category_label,
    points: r.points,
    reason: r.reason,
    createdAt: r.created_at,
    ...(withGiver ? { givenBy: r.given_by_name || null, updatedAt: r.updated_at } : {}),
  }));
  return { total: items.reduce((s, x) => s + x.points, 0), items };
}

// Hele endringsloggen for én elev, nyeste først: hver tildeling, endring,
// sletting og nullstilling, med hvem som gjorde det. Bare for superbrukere.
export function demeritHistory(userId) {
  const nullstillinger = db.prepare(
    `SELECT r.id, r.points, r.count, r.created_at, u.full_name AS actor_name
       FROM demerit_resets r LEFT JOIN users u ON u.id = r.actor_id
      WHERE r.user_id = ?`
  ).all(userId).map((r) => ({
    id: `nullstilt-${r.id}`,
    action: 'nullstilt',
    before: { points: r.points, count: r.count },
    after: null,
    note: null,
    actor: r.actor_name || null,
    createdAt: r.created_at,
  }));
  const hendelser = db.prepare(
    `SELECT e.id, e.demerit_id, e.action, e.before_json, e.after_json, e.note, e.created_at,
            u.full_name AS actor_name
       FROM demerit_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.user_id = ?
      ORDER BY e.created_at DESC, e.id DESC`
  ).all(userId).map((r) => ({
    id: r.id,
    demeritId: r.demerit_id,
    action: r.action,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
    note: r.note,
    actor: r.actor_name || null,
    createdAt: r.created_at,
  }));
  return [...hendelser, ...nullstillinger]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

// Elevlista på adminsiden: alle aktive elever med summen sin, også de som
// står på null – det er like mye en opplysning.
export function demeritTotals() {
  return db.prepare(
    `SELECT u.id, u.full_name, u.class_name, u.dorm, u.room,
            COALESCE(SUM(d.points), 0) AS total, COUNT(d.id) AS count, MAX(d.created_at) AS last_at
       FROM users u LEFT JOIN demerits d ON d.user_id = u.id AND d.deleted_at IS NULL
      WHERE u.role = 'student' AND u.active = 1
      GROUP BY u.id
      ORDER BY u.full_name COLLATE NOCASE`
  ).all().map((r) => ({
    id: r.id,
    fullName: r.full_name,
    className: r.class_name,
    dorm: r.dorm,
    room: r.room,
    total: r.total,
    count: r.count,
    lastAt: r.last_at,
  }));
}

// Tildelinger gitt før endringsloggen fantes, får en «opprettet»-rad i
// ettertid, så historikken ikke starter midt i. Trygt å kjøre ved hver oppstart.
db.exec(`
  INSERT INTO demerit_events (demerit_id, user_id, action, actor_id, after_json, created_at)
  SELECT d.id, d.user_id, 'opprettet', d.given_by,
         json_object('category', d.category_key, 'categoryLabel', d.category_label, 'points', d.points, 'reason', d.reason),
         d.created_at
    FROM demerits d
   WHERE NOT EXISTS (SELECT 1 FROM demerit_events e WHERE e.demerit_id = d.id AND e.action = 'opprettet')
`);

// ── Import av tidligere prikker (Excel) ──────────────────────
// Malen har to kolonner: Navn og Prikker. Arket tolkes lokalt, og navnene
// kobles mot de aktive elevene. Bare fullt navn eller fornavn + etternavn
// godtas – ikke fornavn alene, som vaskelistene: her henger det prikker på
// treffet, og to elever med samme fornavn skal ikke kunne forveksles.
export const IMPORT_HEADERS = { name: 'Navn', points: 'Prikker' };

function firstLast(norm) {
  const t = norm.split(' ').filter(Boolean);
  return t.length < 2 ? null : `${t[0]} ${t[t.length - 1]}`;
}

// Returnerer en forhåndsvisning: én rad per linje i arket, med eleven den ble
// koblet til (eller null), antallet, og hva eleven har importert fra før.
// Skriver ingenting.
export function parseImportSheet(rows) {
  let headerRow, cols;
  try { ({ headerRow, cols } = readTemplateHeader(rows, IMPORT_HEADERS, ['name', 'points'])); }
  catch (ex) {
    // Malfeilen foreslår OpenAI-tolking, som ikke finnes for denne importen.
    throw new Error(ex.message.replace(/ Følger ikke arket malen, kan du velge «Tolk arket med OpenAI» i stedet\./, ' Last ned malen, så er overskriftene riktige.'));
  }
  const students = db.prepare(
    "SELECT id, full_name, class_name, dorm FROM users WHERE role = 'student' AND active = 1"
  ).all();
  const full = new Map(), fl = new Map();
  const push = (m, k, s) => { if (k) (m.get(k) || m.set(k, []).get(k)).push(s); };
  for (const s of students) { const n = normName(s.full_name); push(full, n, s); push(fl, firstLast(n), s); }
  const finn = (navn) => {
    const n = normName(navn);
    const a = full.get(n); if (a?.length === 1) return { student: a[0] };
    if (a?.length > 1) return { error: 'flere elever har dette navnet' };
    const b = fl.get(firstLast(n)); if (b?.length === 1) return { student: b[0] };
    if (b?.length > 1) return { error: 'flere elever passer – skriv hele navnet' };
    return { error: 'fant ingen aktiv elev med dette navnet' };
  };
  const tidligere = new Map(db.prepare(
    'SELECT user_id, points FROM demerits WHERE category_key = ? AND deleted_at IS NULL'
  ).all(IMPORT_CATEGORY.key).map((r) => [r.user_id, r.points]));

  const feil = [];
  const out = [];
  const sett = new Map();  // elev-id → radnummer, for å oppdage dubletter
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankRow(row)) continue;
    const linje = i + 1;
    const navn = cellText(row, cols.name);
    const tekst = cellText(row, cols.points);
    if (!navn) { feil.push(`rad ${linje}: mangler navn`); continue; }
    let points;
    try { points = parsePoints(tekst); }
    catch (ex) { feil.push(`rad ${linje} (${q(navn)}): ${ex.message.toLowerCase()}`); continue; }
    if (points == null) continue;  // tom eller 0 → ingenting å importere
    if (points > MAX_IMPORT_POINTS) { feil.push(`rad ${linje} (${q(navn)}): høyst ${MAX_IMPORT_POINTS} prikker`); continue; }
    const { student, error } = finn(navn);
    if (student && sett.has(student.id)) {
      feil.push(`rad ${linje} (${q(navn)}): eleven står også på rad ${sett.get(student.id)}`);
      continue;
    }
    if (student) sett.set(student.id, linje);
    out.push({
      row: linje,
      name: navn,
      points,
      student: student ? { id: student.id, fullName: student.full_name, className: student.class_name, dorm: student.dorm } : null,
      error: error || null,
      existing: student ? (tidligere.get(student.id) ?? null) : null,
    });
  }
  throwRowErrors(feil);
  if (!out.length) throw new Error('Fant ingen rader med prikker i arket.');
  return { rows: out };
}

// Lagrer importen: items = [{ userId, points }]. Har eleven en importert rad
// fra før, endres den; ellers opprettes en ny. Alt i én transaksjon.
export const importDemerits = db.transaction((items, actorId) => {
  const elev = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student' AND active = 1");
  const finnes = db.prepare('SELECT id FROM demerits WHERE user_id = ? AND category_key = ? AND deleted_at IS NULL');
  let created = 0, updated = 0, unchanged = 0;
  const seen = new Set();
  for (const it of items) {
    const uid = Number(it?.userId);
    if (!Number.isInteger(uid) || seen.has(uid) || !elev.get(uid)) throw new Error('Ugyldig eller dobbel elev i importen.');
    seen.add(uid);
    const d = parseDemerit({ category: IMPORT_CATEGORY.key, points: it.points }, { allowImport: true });
    const før = finnes.get(uid, IMPORT_CATEGORY.key);
    if (før) {
      const r = updateDemerit(før.id, actorId, d, 'Importert på nytt fra Excel');
      if (r) updated++; else unchanged++;
    } else {
      addDemerit(uid, actorId, d);
      created++;
    }
  }
  return { created, updated, unchanged };
});
