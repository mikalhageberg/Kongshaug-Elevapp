// Tidsvindu for brannliste-innsjekk. Om kvelden er det et vindu (åpne–lukke) der
// elevene kan melde seg til stede – for å øke sikkerheten må registreringen skje
// i tidsrommet de faktisk skal være på internatet, ikke tidlig på dagen.
//
// Egne tider for hverdag (søn–tor), fredag og lørdag. I helgen kan lukketiden
// være FØR åpningstiden på klokka (f.eks. åpner 20:00, lukker 00:30) – da
// krysser vinduet midnatt. Da må natten en innsjekk teller for fortsatt være
// KVELDEN vinduet startet (fredag 00:30 → natt til lørdag = fredagens dato),
// ikke datoen etter midnatt.
//
// Alt regnes i skolens tidssone. Serveren kjører UTC i drift, så uten dette
// ville vinduet ligget to timer feil om sommeren.

import { config } from './config.js';
import { getSettings } from './settings.js';

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Dato + minutt-på-døgnet + ukedag i skolens tidssone.
export function osloParts(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.school.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now);
  const get = (t) => p.find((x) => x.type === t).value;
  const y = Number(get('year')), m = Number(get('month')), d = Number(get('day'));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = søndag
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    y, m, d, dow,
  };
}

// Dagen før, som { dateKey, dow }.
function dayBefore({ y, m, d }) {
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  const iso = dt.toISOString().slice(0, 10);
  return { dateKey: iso, dow: dt.getUTCDay() };
}

// Vinduet (åpne/lukke) for en gitt ukedag. Fredag (5) og lørdag (6) har egne;
// resten bruker hverdagsvinduet.
export function windowForDow(dow, s = getSettings()) {
  if (dow === 5) return { open: s.fireOpenFriday, close: s.fireCloseFriday };
  if (dow === 6) return { open: s.fireOpenSaturday, close: s.fireCloseSaturday };
  return { open: s.fireOpenWeekday, close: s.fireCloseWeekday };
}
const crossesMidnight = (w) => toMin(w.close) <= toMin(w.open);

// Tilstanden til innsjekk-vinduet akkurat nå:
//   { isOpen, nightDate, state: 'open'|'before'|'after', opensAt, closesAt }
// nightDate = natten en innsjekk NÅ teller for (null når stengt).
export function fireWindowNow(now = new Date(), s = getSettings()) {
  const t = osloParts(now);
  const wToday = windowForDow(t.dow, s);
  const oT = toMin(wToday.open), cT = toMin(wToday.close);

  // 1) Kveldsdelen av dagens vindu (før midnatt).
  const inToday = crossesMidnight(wToday)
    ? t.minutes >= oT                     // krysser: åpent fra åpningstid og døgnet ut
    : t.minutes >= oT && t.minutes <= cT; // vanlig: mellom åpne og lukke
  if (inToday) {
    return { isOpen: true, nightDate: t.dateKey, state: 'open', opensAt: wToday.open, closesAt: wToday.close };
  }

  // 2) Etter-midnatt-halen av GÅRSDAGENS vindu (bare hvis det krysset midnatt).
  const y = dayBefore(t);
  const wY = windowForDow(y.dow, s);
  if (crossesMidnight(wY) && t.minutes <= toMin(wY.close)) {
    return { isOpen: true, nightDate: y.dateKey, state: 'open', opensAt: wY.open, closesAt: wY.close };
  }

  // 3) Stengt. Før dagens åpning = venter på åpning; ellers stengt for kvelden.
  const state = t.minutes < oT ? 'before' : 'after';
  return { isOpen: false, nightDate: null, state, opensAt: wToday.open, closesAt: wToday.close };
}

// Natten «nå» hører til for registrering – brukes også når vinduet er stengt
// (f.eks. melde seg borte på dagtid), så til stede/borte alltid lander på samme
// natt. Lik dagens dato bortsett fra i helgens etter-midnatt-hale.
export function currentNightDate(now = new Date(), s = getSettings()) {
  const t = osloParts(now);
  const y = dayBefore(t);
  const wY = windowForDow(y.dow, s);
  if (crossesMidnight(wY) && t.minutes <= toMin(wY.close) && t.minutes < toMin(windowForDow(t.dow, s).open)) {
    return y.dateKey;
  }
  return t.dateKey;
}
