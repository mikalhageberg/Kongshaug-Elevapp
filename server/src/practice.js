// Øvekonkurranse: elevene konkurrerer om å øve mest på hovedinstrumentet sitt
// i en avgrenset periode.
//
// Tre ting er bevisst lagt til SERVEREN og ikke til appen:
//
//  1. Lengden på økten. Klienten sender aldri hvor lenge det ble øvd – serveren
//     regner den ut fra sine egne tidsstempler (started_at → nå). En app som
//     lyver om tiden kan da ikke påvirke stillingen.
//  2. Om økten skal dokumenteres med bilde. Terningkastet skjer her, når økten
//     starter, og lagres på raden. Ellers kunne appen bare latt være å spørre.
//  3. Om konkurransen er åpen. Perioden ligger i innstillingene, og økter kan
//     verken startes eller fullføres utenfor den.

import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
import { paths } from './config.js';
import { todayDate } from './andaktToken.js';
import { getSettings } from './settings.js';

export const photoDir = path.join(paths.data, 'practice');
fs.mkdirSync(photoDir, { recursive: true });

// En økt med mer enn dette i faktisk øvetid er ikke en økt lenger.
export const MAX_SESSION_SECONDS = 6 * 60 * 60;

// En pause skal kunne vare noen timer – ikke evig. Uten en øvre grense på selve
// klokketiden ville en økt satt på pause i forrige uke kunne registreres i dag,
// og havnet på datoen den startet.
export const MAX_WALL_SECONDS = 24 * 60 * 60;

// Konkurransens tilstand akkurat nå.
export function competitionState(today = todayDate(), s = getSettings()) {
  const { practiceStartDate: start, practiceEndDate: end } = s;
  const configured = !!(start && end);
  return {
    configured,
    startDate: start || null,
    endDate: end || null,
    // Periodens datoer er inklusive – siste dag teller med.
    active: configured && today >= start && today <= end,
    warmupSeconds: s.practiceWarmupMinutes * 60,
  };
}

// Faktisk øvetid, regnet på serveren: fra start til det tidligste av «stoppet»,
// «på pause nå» og «nå», minus pausene som allerede er avsluttet. Står økten på
// pause, står tallet stille.
function elapsedSeconds(sessionId) {
  return db
    .prepare(
      `SELECT CAST((julianday(COALESCE(stopped_at, paused_at, 'now')) - julianday(started_at)) * 86400
                   - paused_seconds AS INTEGER) AS n
         FROM practice_sessions WHERE id = ?`
    )
    .get(sessionId).n;
}

// Klokketid siden start, pauser inkludert. Brukes bare til å luke bort økter
// som har ligget for lenge.
function wallSeconds(sessionId) {
  return db
    .prepare("SELECT CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER) AS n FROM practice_sessions WHERE id = ?")
    .get(sessionId).n;
}

const publicSession = (r) => ({
  id: r.id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  sessionDate: r.session_date,
  warmupSeconds: r.warmup_seconds,
  totalSeconds: r.total_seconds,
  photoRequired: !!r.photo_required,
  hasPhoto: !!r.photo_filename,
  photoAt: r.photo_at || null,
  stoppedAt: r.stopped_at || null,
  pausedAt: r.paused_at || null,
  pausedSeconds: r.paused_seconds || 0,
});

// Elevens pågående økt, hvis hun har en. Glemte økter ryddes bort her, slik at
// en elev aldri blir stående fast med en økt fra i går.
export function pendingSession(userId) {
  const row = db
    .prepare('SELECT * FROM practice_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(userId);
  if (!row) return null;
  if (elapsedSeconds(row.id) > MAX_SESSION_SECONDS || wallSeconds(row.id) > MAX_WALL_SECONDS) {
    discardSession(row.id);
    return null;
  }
  return { ...publicSession(row), elapsedSeconds: elapsedSeconds(row.id) };
}

// Start en økt – eller hent fram den som allerede pågår. At en ny «start» gir
// samme økt tilbake er poenget: lukker eleven appen midt i økten, plukker
// timeren opp igjen der den var i stedet for å nullstille.
export function startSession(userId) {
  const eksisterende = pendingSession(userId);
  if (eksisterende) return eksisterende;

  const s = getSettings();
  const info = db
    .prepare(
      `INSERT INTO practice_sessions (user_id, session_date, warmup_seconds, photo_required)
       VALUES (?, ?, ?, ?)`
    )
    .run(userId, todayDate(), s.practiceWarmupMinutes * 60, Math.random() * 100 < s.practicePhotoPercent ? 1 : 0);

  const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(info.lastInsertRowid);
  return { ...publicSession(row), elapsedSeconds: 0 };
}

// Sett økten på pause. Tiden står stille til den startes igjen.
export function pauseSession(userId, sessionId) {
  const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
  if (!row) throw new Error('Fant ikke økten.');
  if (row.ended_at) throw new Error('Økten er allerede registrert.');
  if (row.stopped_at) throw new Error('Økten er stoppet.');
  if (!row.paused_at) {
    db.prepare("UPDATE practice_sessions SET paused_at = datetime('now') WHERE id = ?").run(row.id);
  }
  const oppdatert = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(row.id);
  return { ...publicSession(oppdatert), elapsedSeconds: elapsedSeconds(row.id) };
}

// Fortsett. Pausen som nettopp ble avsluttet legges til summen, slik at den
// aldri teller som øvetid.
export function resumeSession(userId, sessionId) {
  const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
  if (!row) throw new Error('Fant ikke økten.');
  if (row.ended_at) throw new Error('Økten er allerede registrert.');
  if (row.stopped_at) throw new Error('Økten er stoppet.');
  if (wallSeconds(row.id) > MAX_WALL_SECONDS) {
    discardSession(row.id);
    throw new Error('Økten har stått på pause for lenge. Start en ny.');
  }
  if (row.paused_at) {
    db.prepare(
      `UPDATE practice_sessions
          SET paused_seconds = paused_seconds
              + CAST((julianday('now') - julianday(paused_at)) * 86400 AS INTEGER),
              paused_at = NULL
        WHERE id = ?`
    ).run(row.id);
  }
  const oppdatert = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(row.id);
  return { ...publicSession(oppdatert), elapsedSeconds: elapsedSeconds(row.id) };
}

// Frys tiden. Eleven får ta seg tiden hun trenger på dokumentasjonsbildet
// etterpå uten at det legges til øvetiden. Trykkes «stopp» to ganger, står det
// første tidspunktet – ellers kunne man klatre oppover ved å trykke om igjen.
export function stopSession(userId, sessionId) {
  const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
  if (!row) throw new Error('Fant ikke økten.');
  if (row.ended_at) throw new Error('Økten er allerede registrert.');
  if (!row.stopped_at) {
    // Stopper eleven mens økten står på pause, er det pausetidspunktet som
    // gjelder – tiden har jo stått stille siden da.
    db.prepare("UPDATE practice_sessions SET stopped_at = COALESCE(paused_at, datetime('now')) WHERE id = ?")
      .run(row.id);
  }
  const oppdatert = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(row.id);
  return { ...publicSession(oppdatert), elapsedSeconds: elapsedSeconds(row.id) };
}

// Fullfør økten. Kaster med en lesbar melding når den ikke kan registreres.
export function finishSession(userId, sessionId) {
  const row = db
    .prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId);
  if (!row) throw new Error('Fant ikke økten.');
  if (row.ended_at) throw new Error('Økten er allerede registrert.');

  const total = elapsedSeconds(row.id);
  if (total > MAX_SESSION_SECONDS || wallSeconds(row.id) > MAX_WALL_SECONDS) {
    discardSession(row.id);
    throw new Error('Økten har vart for lenge til å registreres. Start en ny.');
  }
  if (total < row.warmup_seconds) throw new Error('Oppvarmingen er ikke ferdig ennå.');
  if (row.photo_required && !row.photo_filename) throw new Error('Denne økten må dokumenteres med et bilde.');

  db.prepare("UPDATE practice_sessions SET ended_at = datetime('now'), total_seconds = ? WHERE id = ?")
    .run(total, row.id);
  return publicSession(db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(row.id));
}

// Forkast en økt – både raden og et eventuelt bilde.
export function discardSession(sessionId) {
  const row = db.prepare('SELECT photo_filename FROM practice_sessions WHERE id = ?').get(sessionId);
  if (row?.photo_filename) deletePhotoFile(row.photo_filename);
  db.prepare('DELETE FROM practice_sessions WHERE id = ?').run(sessionId);
}

export function deletePhotoFile(filename) {
  try { fs.unlinkSync(path.join(photoDir, filename)); } catch { /* filen kan mangle */ }
}

// Lagre dokumentasjonsbildet for en pågående økt.
export function savePhoto(userId, sessionId, buffer) {
  const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
  if (!row) throw new Error('Fant ikke økten.');
  if (row.ended_at) throw new Error('Økten er allerede registrert.');

  const filename = `${row.id}.jpg`;
  fs.writeFileSync(path.join(photoDir, filename), buffer);
  db.prepare("UPDATE practice_sessions SET photo_filename = ?, photo_at = datetime('now') WHERE id = ?")
    .run(filename, row.id);
  return filename;
}

// Elevens egne fullførte økter, nyeste først.
export function mySessions(userId, limit = 50) {
  return db
    .prepare('SELECT * FROM practice_sessions WHERE user_id = ? AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT ?')
    .all(userId, limit)
    .map(publicSession);
}

// Elevens totale tid i konkurranseperioden.
export function myTotalSeconds(userId, comp = competitionState()) {
  if (!comp.configured) return 0;
  return db
    .prepare(
      `SELECT COALESCE(SUM(total_seconds), 0) AS n FROM practice_sessions
        WHERE user_id = ? AND ended_at IS NOT NULL AND session_date BETWEEN ? AND ?`
    )
    .get(userId, comp.startDate, comp.endDate).n;
}

export const SORTS = {
  // Stillingen: mest øvd først. De to andre grupperer i stedet, men holder
  // totaltiden synkende innenfor hver gruppe.
  time: 'total DESC, u.full_name COLLATE NOCASE',
  class: 'u.class_name COLLATE NOCASE, total DESC',
  instrument: 'u.instrument COLLATE NOCASE, total DESC',
};

// Stillingen: én rad per aktiv elev, også de som ikke har øvd ennå – hullene er
// like interessante for skolen som toppen av lista.
export function leaderboard(sort = 'time', comp = competitionState()) {
  const order = SORTS[sort] || SORTS.time;
  if (!comp.configured) return [];
  return db
    .prepare(
      `SELECT u.id, u.full_name, u.class_name, u.instrument,
              COALESCE(SUM(p.total_seconds), 0) AS total,
              COUNT(p.id) AS sessions
         FROM users u
         LEFT JOIN practice_sessions p
           ON p.user_id = u.id AND p.ended_at IS NOT NULL
          AND p.session_date BETWEEN @start AND @end
        WHERE u.role = 'student' AND u.active = 1
        GROUP BY u.id
        ORDER BY ${order}`
    )
    .all({ start: comp.startDate, end: comp.endDate })
    .map((r) => ({
      id: r.id,
      fullName: r.full_name,
      className: r.class_name,
      instrument: r.instrument,
      totalSeconds: r.total,
      sessions: r.sessions,
    }));
}

// Øktene til én elev i perioden – det admin ser når hun åpner en rad.
export function sessionsFor(userId, comp = competitionState()) {
  if (!comp.configured) return [];
  return db
    .prepare(
      `SELECT * FROM practice_sessions
        WHERE user_id = ? AND ended_at IS NOT NULL AND session_date BETWEEN ? AND ?
        ORDER BY ended_at DESC`
    )
    .all(userId, comp.startDate, comp.endDate)
    .map(publicSession);
}
