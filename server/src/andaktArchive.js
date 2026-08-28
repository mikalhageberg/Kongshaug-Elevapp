// Arkivet over ukesrapporter for andaktsfraværet.
//
// Rapporten for en ferdig uke fryses ned og legges her, som en JSON-kopi av
// nøyaktig det uken viste. Grunnen til at det er en KOPI og ikke et oppslag i
// registreringene hver gang: fraværet regnes ut fra elevene som er aktive nå.
// Slutter en elev, eller flytter hun internat, ville en gammel «rapport» regnet
// på nytt gitt andre navn og andre tall enn den gjorde den uken det gjaldt. Et
// arkiv som endrer seg bakover er ikke et arkiv.
//
// Skolen velger selv hvor mange uker arkivet skal ta vare på. Uker eldre enn
// det fjernes for godt – arkivet er personopplysninger, og skal ikke vokse i
// det uendelige. Ryddingen kjøres hver time, og er uavhengig av den generelle
// lagringstiden under Innstillinger (som fortsatt gjelder som ytre grense, se
// retention.js).

import db from './db.js';
import { getSettings } from './settings.js';
import { currentWeekStart, shiftWeek, weekEndOf, isoWeekNumber } from './isoWeek.js';
import { weekReport, weekHasCheckins } from './andaktReport.js';

const TICK_INTERVAL_MS = 60 * 60 * 1000;

// Hvor langt tilbake arkivet strekker seg: mandagen i den eldste uken vi
// beholder. Med 12 uker og dagens uke = W, er det W−12.
function oldestKeptWeek(weeks, today = currentWeekStart()) {
  return shiftWeek(today, -weeks);
}

// Legg én ferdig uke i arkivet. Gjør ingenting hvis uken allerede ligger der
// (rapporten er frosset), eller hvis ingen registrerte oppmøte den uken.
export function archiveWeek(weekStart) {
  const finnes = db.prepare('SELECT 1 FROM andakt_week_reports WHERE week_start = ?').get(weekStart);
  if (finnes) return null;
  if (!weekHasCheckins(weekStart)) return null;

  const rapport = weekReport(weekStart);
  const { isoYear, isoWeek } = isoWeekNumber(weekStart);
  db.prepare(
    `INSERT INTO andakt_week_reports
       (week_start, week_end, iso_year, iso_week, absent_count, late_count, report_json)
     VALUES (@weekStart, @weekEnd, @isoYear, @isoWeek, @absentCount, @lateCount, @json)`
  ).run({
    weekStart,
    weekEnd: weekEndOf(weekStart),
    isoYear,
    isoWeek,
    absentCount: rapport.absentCount,
    lateCount: rapport.lateCount,
    json: JSON.stringify(rapport),
  });
  return rapport;
}

// Fyll arkivet med de ferdige ukene som mangler, innenfor perioden skolen har
// valgt. Første kjøring henter dermed inn ukene som allerede er registrert.
// Uken vi står i nå arkiveres ikke – den er ikke ferdig ennå.
export function syncArchive(weeks = getSettings().andaktArchiveWeeks) {
  const nå = currentWeekStart();
  let lagt = 0;
  for (let i = 1; i <= weeks; i++) {
    if (archiveWeek(shiftWeek(nå, -i))) lagt++;
  }
  return lagt;
}

// Fjern uker som faller utenfor perioden. Endelig – rapporten er borte etterpå.
export function pruneArchive(weeks = getSettings().andaktArchiveWeeks) {
  return db
    .prepare('DELETE FROM andakt_week_reports WHERE week_start < ?')
    .run(oldestKeptWeek(weeks)).changes;
}

// Både påfyll og rydding. Kalles av planleggeren og når admin åpner arkivet,
// slik at listen alltid stemmer med innstillingen – også rett etter at den ble
// endret.
export function refreshArchive(weeks = getSettings().andaktArchiveWeeks) {
  return { added: syncArchive(weeks), removed: pruneArchive(weeks) };
}

// Oversikten: én rad per uke, uten selve rapporten. Nyeste uke først.
export function listArchive() {
  return db
    .prepare(
      `SELECT week_start, week_end, iso_year, iso_week, absent_count, late_count, created_at
       FROM andakt_week_reports ORDER BY week_start DESC`
    )
    .all()
    .map((r) => ({
      weekStart: r.week_start,
      weekEnd: r.week_end,
      isoYear: r.iso_year,
      isoWeek: r.iso_week,
      absentCount: r.absent_count,
      lateCount: r.late_count,
      archivedAt: r.created_at,
    }));
}

// Hele den arkiverte rapporten for én uke, eller null.
export function getArchivedWeek(weekStart) {
  const row = db
    .prepare('SELECT report_json, created_at FROM andakt_week_reports WHERE week_start = ?')
    .get(weekStart);
  if (!row) return null;
  return { ...JSON.parse(row.report_json), archivedAt: row.created_at };
}

// Å slette en konto skal fjerne alt om personen – også fra de frosne
// rapportene. De ligger som JSON, og nås derfor ikke av ON DELETE CASCADE slik
// registreringene gjør: her må hver rapport skrives om. Returnerer hvor mange
// uker som ble endret.
export function removeUsersFromArchive(userIds) {
  const ids = new Set((userIds || []).map(Number));
  if (!ids.size) return 0;

  const rader = db.prepare('SELECT week_start, report_json FROM andakt_week_reports').all();
  const oppdater = db.prepare(
    'UPDATE andakt_week_reports SET report_json = ?, absent_count = ?, late_count = ? WHERE week_start = ?'
  );
  const utenIds = (liste) => liste.filter((p) => !ids.has(Number(p.id)));

  return db.transaction(() => {
    let endret = 0;
    for (const r of rader) {
      const rapport = JSON.parse(r.report_json);
      let rørt = false;
      for (const d of rapport.days) {
        const før = d.absentList.length + d.lateList.length;
        d.absentList = utenIds(d.absentList);
        d.lateList = utenIds(d.lateList);
        if (d.absentList.length + d.lateList.length !== før) rørt = true;
      }
      if (!rørt) continue;
      rapport.absentCount = rapport.days.reduce((n, d) => n + d.absentList.length, 0);
      rapport.lateCount = rapport.days.reduce((n, d) => n + d.lateList.length, 0);
      oppdater.run(JSON.stringify(rapport), rapport.absentCount, rapport.lateCount, r.week_start);
      endret++;
    }
    return endret;
  })();
}

export function startAndaktArchiveScheduler() {
  const { andaktArchiveWeeks: uker } = getSettings();
  console.log(`  🗄  Andaktsarkiv startet · ukesrapporter beholdes i ${uker} uker`);
  const tick = () => {
    try {
      const { added, removed } = refreshArchive();
      if (added || removed) console.log(`  🗄  Andaktsarkiv · ${added} uke(r) arkivert, ${removed} fjernet`);
    } catch (ex) {
      console.error(`  🗄  Andaktsarkiv feilet: ${ex.message}`);
    }
  };
  tick();
  setInterval(tick, TICK_INTERVAL_MS);
}
