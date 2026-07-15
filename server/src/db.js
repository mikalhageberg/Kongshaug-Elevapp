import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.js';

const dbPath = path.join(paths.data, 'kongshaug.db');
// Diagnostikk: skriver ut hvor databasen ligger og om filen fantes FØR denne
// oppstarten. På et fungerende persistent volum skal «fantes fra før» være
// true på alle oppstarter etter den aller første. Er den false hver gang,
// lagres ikke data mellom utrullinger (volumet er ikke koblet riktig).
const dbPreexisting = fs.existsSync(dbPath);
fs.mkdirSync(paths.data, { recursive: true });
let dirContents = '(kunne ikke lese)';
try { const f = fs.readdirSync(paths.data); dirContents = f.length ? f.join(', ') : '(tom)'; } catch { /* ignorer */ }
console.log(`[db] sti=${dbPath} · fantes fra før=${dbPreexisting} · innhold=${dirContents}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    full_name     TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'student',   -- 'student' | 'admin'
    class_name    TEXT,                                  -- f.eks. '2MDD'
    dorm          TEXT,                                  -- internat, f.eks. 'Fjordly'
    room          TEXT,                                  -- rom, f.eks. '9'
    active        INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,       -- 1 = må velge nytt passord ved neste innlogging
    auth_provider TEXT    NOT NULL DEFAULT 'local',        -- 'local' | 'feide'
    feide_id      TEXT,                                    -- Feide 'sub' når kontoen er koblet til Feide
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Én rad per elev per natt de melder seg til stede på brannlisten.
  CREATE TABLE IF NOT EXISTS fire_checkins (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    night_date TEXT    NOT NULL,          -- 'YYYY-MM-DD' (natten det gjelder)
    status     TEXT    NOT NULL DEFAULT 'present',  -- 'present' (på skolen) | 'away' (borte)
    checked_at TEXT    NOT NULL DEFAULT (datetime('now')),
    lat        REAL,
    lng        REAL,
    UNIQUE (user_id, night_date)
  );

  -- Dagens andakts-økt. QR-token roterer, se andakt-ruten.
  CREATE TABLE IF NOT EXISTS andakt_sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT    NOT NULL UNIQUE,  -- 'YYYY-MM-DD'
    secret       TEXT    NOT NULL,         -- hemmelig frø for roterende QR-token
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Én rad per elev per dag de registrerer oppmøte på andakt.
  CREATE TABLE IF NOT EXISTS andakt_checkins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_date TEXT    NOT NULL,         -- 'YYYY-MM-DD'
    checked_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    status       TEXT    NOT NULL,         -- 'present' | 'late'
    lat          REAL,
    lng          REAL,
    UNIQUE (user_id, session_date)
  );

  CREATE INDEX IF NOT EXISTS idx_fire_night   ON fire_checkins(night_date);
  CREATE INDEX IF NOT EXISTS idx_andakt_date  ON andakt_checkins(session_date);

  -- Enkel nøkkel/verdi-tabell for innstillinger som admin kan endre i appen
  -- (uten omstart av serveren).
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Planlagt fravær: eleven melder på forhånd hvilke netter de er borte.
  -- Dekker nettene fra start_date til end_date (inklusiv), nøkkel = natten som begynner.
  CREATE TABLE IF NOT EXISTS fire_away_periods (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date TEXT    NOT NULL,   -- 'YYYY-MM-DD' første natt borte
    end_date   TEXT    NOT NULL,   -- 'YYYY-MM-DD' siste natt borte (inklusiv)
    no_dinner  INTEGER NOT NULL DEFAULT 0,  -- 1 = vil heller ikke ha middag i perioden
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_away_period_user ON fire_away_periods(user_id);

  -- Ukemenyer (PDF) lastet opp av admin, synlige for elevene i appen.
  CREATE TABLE IF NOT EXISTS menus (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    filename    TEXT    NOT NULL,   -- lagret filnavn på disk (<id>.pdf)
    size        INTEGER NOT NULL,
    uploaded_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Middag: rad = eleven har meldt fra at de IKKE vil ha middag den dagen.
  CREATE TABLE IF NOT EXISTS dinner_optouts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,   -- 'YYYY-MM-DD'
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_dinner_date ON dinner_optouts(date);
`);

// Migreringer: legg til nye kolonner i eldre databaser som ble laget før feltene fantes.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('fire_checkins', 'status', "TEXT NOT NULL DEFAULT 'present'");
ensureColumn('users', 'allergies', 'TEXT'); // JSON-array med allergier eleven har meldt inn
ensureColumn('fire_away_periods', 'no_dinner', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'auth_provider', "TEXT NOT NULL DEFAULT 'local'");
ensureColumn('users', 'feide_id', 'TEXT');
// Meny-tolkning via OpenAI: strukturert JSON + status for hver opplastet PDF.
ensureColumn('menus', 'parsed_json', 'TEXT');                        // JSON: { days: [{ day, dishes }], note }
ensureColumn('menus', 'parse_status', "TEXT NOT NULL DEFAULT 'none'"); // 'none' | 'pending' | 'ok' | 'error'
ensureColumn('menus', 'parse_error', 'TEXT');                        // feilmelding hvis parse_status = 'error'
ensureColumn('menus', 'parsed_at', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_feide ON users(feide_id) WHERE feide_id IS NOT NULL');

export default db;
