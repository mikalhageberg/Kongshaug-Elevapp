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
//     tildelinger, og ser hele endringsloggen. Ingenting slettes for godt:
//     en slettet tildeling merkes, og loggen viser hvem som gjorde hva.
//   - Den som har vakten kan tildele fra brannlisten, men får ALDRI se hvor
//     mange prikker eleven har fra før. Svaret på en tildeling inneholder
//     derfor ingen sum.
//   - Eleven ser sine egne prikker, med kategori og begrunnelse.

import db from './db.js';

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

const MAX_POINTS = 100;
const MAX_REASON = 500;

// Tolker og kontrollerer en tildeling. Kaster med en norsk feilmelding som kan
// vises rett i appen.
export function parseDemerit({ category, points, reason }) {
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

// Alle gjeldende tildelinger til én elev, nyeste først. withGiver tar med
// hvem som ga prikkene – det ser bare superbrukerne.
export function demeritsFor(userId, { withGiver = false } = {}) {
  const rows = db.prepare(
    `SELECT d.id, d.category_key, d.category_label, d.points, d.reason, d.created_at, d.updated_at,
            u.full_name AS given_by_name
       FROM demerits d LEFT JOIN users u ON u.id = d.given_by
      WHERE d.user_id = ? AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC, d.id DESC`
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

// Hele endringsloggen for én elev, nyeste først: hver tildeling, endring og
// sletting, med hvem som gjorde det. Bare for superbrukere.
export function demeritHistory(userId) {
  return db.prepare(
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
