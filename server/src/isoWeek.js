// ISO-uker (ISO 8601), slik Norge teller uker: uken starter mandag, og uke 1 er
// uken som inneholder årets første torsdag. Kjøkkentjenesten går på rundgang per
// uke, så hele systemet identifiserer en uke ved MANDAGSDATOEN ('YYYY-MM-DD').
// Det er entydig, sorterer riktig som tekst, og slipper vrien rundt årsskiftet
// der uke 1 kan begynne i desember.

import { todayDate } from './andaktToken.js';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function parse(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return { y, m, d };
}

function ymd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Er dette en gyldig 'YYYY-MM-DD'-dato?
export function isDateString(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const { y, m, d } = parse(s);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Mandagen i uken som datoen hører til. Dette er «uke-nøkkelen» vår.
export function weekStartOf(dateStr = todayDate()) {
  const { y, m, d } = parse(dateStr);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0 = mandag … 6 = søndag
  dt.setDate(dt.getDate() - dow);
  return ymd(dt);
}

// Flytt en uke-nøkkel n uker fram (n < 0 = bakover).
export function shiftWeek(weekStart, n) {
  const { y, m, d } = parse(weekStart);
  return ymd(new Date(y, m - 1, d + n * 7));
}

// Søndagen i samme uke.
export function weekEndOf(weekStart) {
  const { y, m, d } = parse(weekStart);
  return ymd(new Date(y, m - 1, d + 6));
}

// Uke-nummer og ISO-år. Torsdagen i uken avgjør hvilket år uken tilhører.
export function isoWeekNumber(dateStr) {
  const { y, m, d } = parse(dateStr);
  const thu = new Date(Date.UTC(y, m - 1, d));
  thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3);
  const isoYear = thu.getUTCFullYear();

  // Torsdagen i uke 1 = torsdagen i uken som inneholder 4. januar.
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  firstThu.setUTCDate(firstThu.getUTCDate() - ((firstThu.getUTCDay() + 6) % 7) + 3);

  return { isoYear, isoWeek: 1 + Math.round((thu - firstThu) / MS_PER_WEEK) };
}

// Samlet beskrivelse av en uke – det klientene trenger for å vise «Uke 30 · 20.–26. juli».
export function weekInfo(weekStart) {
  return { weekStart, weekEnd: weekEndOf(weekStart), ...isoWeekNumber(weekStart) };
}

// Uken vi er i akkurat nå.
export function currentWeekStart(dateStr = todayDate()) {
  return weekStartOf(dateStr);
}
