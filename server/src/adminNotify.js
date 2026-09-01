// Varslingssenteret: kopien av varslene som ble sendt til administratorene.
//
// Et push-varsel er flyktig. Det kan komme mens telefonen ligger i lommen, bli
// sveipet bort i søvne, eller aldri nå fram fordi vakten tok vakten etter at
// det gikk. Da er beskjeden borte, og ingen vet at den fantes.
//
// Derfor lagres hvert varsel også som en rad. Det er kveldens varslinger som
// blir liggende – ikke en logg over alt som skjer, bare det noen faktisk fikk
// beskjed om, med tidspunktet det ble sendt.
//
// Én rad per mottaker. Administratorer er en håndfull og varslene et par i
// døgnet, så utbrettingen koster ingenting – og til gjengjeld ligger lest-
// statusen der den hører hjemme, på mottakerens egen rad.
//
// VIKTIG: raden skrives selv om selve utsendingen feiler, eller mottakeren
// ikke har appen installert. Det er nettopp da senteret har en jobb å gjøre.

import db from './db.js';

export const NOTIFICATION_KINDS = {
  vakt: 'Brannliste',      // varselet om hvem som mangler etter stengetid
  beskjed: 'Beskjed',      // «Send til alle» fra Varsler-siden
};

const insert = db.prepare(
  `INSERT INTO admin_notifications (user_id, night_date, kind, title, body)
   VALUES (?, ?, ?, ?, ?)`
);

// Lagre ett varsel for hver mottaker. Returnerer antall rader.
export function recordAdminNotification({ userIds, nightDate, kind, title, body }) {
  const ids = [...new Set(userIds || [])];
  if (!ids.length) return 0;
  db.transaction(() => {
    for (const id of ids) insert.run(id, nightDate, kind, title, body);
  })();
  return ids.length;
}

// Alle aktive administratorer – mottakerne av en beskjed sendt til alle.
export function allAdminIds() {
  return db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all().map((r) => r.id);
}

// Varslene til én administrator, nyeste først.
//
// `since` er tidspunktet vakten hennes begynte. Senteret viser vakten hun står
// i nå, og starter derfor tomt når hun tar den: varslene fra i går er ikke
// hennes problem i kveld. De er ikke borte – de ligger under «Tidligere
// vakter», og lever så lenge lagringstiden for varsler sier.
//
// Uten vakt er `since` null. Da er alt «tidligere», og siden er tom med en
// forklaring på hvorfor.
function les(rader) {
  return rader.map((r) => ({
    id: r.id,
    nightDate: r.night_date,
    kind: r.kind,
    kindLabel: NOTIFICATION_KINDS[r.kind] || 'Varsel',
    title: r.title,
    body: r.body,
    read: !!r.read_at,
    createdAt: r.created_at,
  }));
}

const KOLONNER = 'id, night_date, kind, title, body, read_at, created_at';

// Varslene fra vakten som pågår.
export function listCurrent(userId, since) {
  if (!since) return [];
  return les(db.prepare(
    `SELECT ${KOLONNER} FROM admin_notifications
      WHERE user_id = ? AND created_at >= ?
      ORDER BY created_at DESC, id DESC`
  ).all(userId, since));
}

// Alt som ligger foran vakten som pågår.
export function listEarlier(userId, since, limit = 50) {
  return les(since
    ? db.prepare(
        `SELECT ${KOLONNER} FROM admin_notifications
          WHERE user_id = ? AND created_at < ?
          ORDER BY created_at DESC, id DESC LIMIT ?`
      ).all(userId, since, limit)
    : db.prepare(
        `SELECT ${KOLONNER} FROM admin_notifications WHERE user_id = ?
          ORDER BY created_at DESC, id DESC LIMIT ?`
      ).all(userId, limit));
}

// Uleste i vakten som pågår. Bevisst ikke i hele historikken: et gammelt
// ulest varsel ville ellers latt merket henge på fanen i ukevis.
export function unreadCount(userId, since) {
  if (!since) return 0;
  return db.prepare(
    'SELECT COUNT(*) AS n FROM admin_notifications WHERE user_id = ? AND read_at IS NULL AND created_at >= ?'
  ).get(userId, since).n;
}

// Merk som lest. Uten ids merkes alt – det er det å åpne senteret gjør.
export function markRead(userId, ids) {
  if (Array.isArray(ids) && ids.length) {
    const ph = ids.map(() => '?').join(',');
    return db.prepare(
      `UPDATE admin_notifications SET read_at = datetime('now')
        WHERE user_id = ? AND read_at IS NULL AND id IN (${ph})`
    ).run(userId, ...ids.map(Number)).changes;
  }
  return db.prepare("UPDATE admin_notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL")
    .run(userId).changes;
}
