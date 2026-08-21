// Push-varsel om ukestjeneste: «du har internatvask neste uke».
//
// Sendes søndag kveld, altså siste dag i uken før tjenesteuken begynner
// (ISO-uken går mandag–søndag). Varselet gjelder derfor uken som starter dagen
// etter – `shiftWeek(currentWeekStart(), 1)`.
//
// Én bryter i innstillingene dekker begge tjenestene. En elev som har både
// kjøkkentjeneste og internatvask samme uke får ett varsel om hver, fordi det
// er to forskjellige oppgaver å møte opp til.

import db from './db.js';
import { currentWeekStart, shiftWeek, weekInfo } from './isoWeek.js';
import { KIND_KEYS, kindOf, dutyUserIds } from './duty.js';
import { sendExpoPush } from './pushSend.js';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli',
  'august', 'september', 'oktober', 'november', 'desember'];

// «24.–30. august» / «31. august – 6. september» – samme form som appen viser.
export function weekRangeLabel(weekStart, weekEnd) {
  const [, m1, d1] = weekStart.split('-').map(Number);
  const [, m2, d2] = weekEnd.split('-').map(Number);
  return m1 === m2
    ? `${d1}.–${d2}. ${MONTHS[m1 - 1]}`
    : `${d1}. ${MONTHS[m1 - 1]} – ${d2}. ${MONTHS[m2 - 1]}`;
}

// Er denne datoen ('YYYY-MM-DD') en søndag? Datoen er allerede regnet ut i
// skolens tidssone, så den leses som UTC midt på dagen for å unngå at en
// tidssone-forskyvning flytter den til nabodagen.
export function isSunday(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay() === 0;
}

export async function sendDutyReminders() {
  const weekStart = shiftWeek(currentWeekStart(), 1);
  const info = weekInfo(weekStart);
  const range = weekRangeLabel(info.weekStart, info.weekEnd);

  let targeted = 0, sent = 0, failed = 0;
  const per = {};

  for (const kind of KIND_KEYS) {
    const ids = dutyUserIds(kind, weekStart);
    if (!ids.length) continue;
    targeted += ids.length;
    const { varselTittel, navn } = kindOf(kind);
    // Antallet føres opp selv om ingen av dem har appen installert – ellers
    // ville testknappen i admin sett ut som om uken var tom.
    per[navn] = ids.length;

    const ph = ids.map(() => '?').join(',');
    const tokens = db.prepare(`SELECT token FROM push_tokens WHERE user_id IN (${ph})`)
      .all(...ids).map((r) => r.token);
    if (!tokens.length) continue;

    const r = await sendExpoPush(tokens, {
      title: varselTittel,
      body: `Du har ${navn.toLowerCase()} i uke ${info.isoWeek} (${range}). Se hvem du har uken sammen med i appen.`,
    });
    sent += r.sent; failed += r.failed;
  }

  return { weekStart, isoWeek: info.isoWeek, targeted, sent, failed, per };
}
