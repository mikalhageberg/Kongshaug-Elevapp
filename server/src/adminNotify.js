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
export function listForUser(userId, limit = 50) {
  return db.prepare(
    `SELECT id, night_date, kind, title, body, read_at, created_at
       FROM admin_notifications WHERE user_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(userId, limit).map((r) => ({
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

export function unreadCount(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM admin_notifications WHERE user_id = ? AND read_at IS NULL')
    .get(userId).n;
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
