// Tidsvindu for andakts-QR: koden er kun tilgjengelig fra 30 minutter FØR til
// 30 minutter ETTER «Frist for oppmøte» (andaktDeadline). Utenfor vinduet skjules
// QR-en og registrering avvises. Alt regnes i skolens tidssone – serveren kjører
// UTC i drift, så uten dette ville vinduet ligget to timer feil om sommeren.
// Speiler mønsteret i fireWindow.js.

import { osloParts } from './fireWindow.js';
import { getSettings, hhmmToMinutes, isAndaktDay } from './settings.js';

export const ANDAKT_QR_MARGIN_MIN = 30;

const hhmm = (m) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

// Tilstanden til andakts-vinduet akkurat nå:
//   { open, state: 'noday' | 'before' | 'open' | 'after', deadline, opensAt, closesAt }
// opensAt/closesAt = når QR-en blir/var tilgjengelig (HH:MM i skolens tidssone).
export function andaktWindow(now = new Date(), settings = getSettings()) {
  if (!isAndaktDay(now, settings)) {
    return { open: false, state: 'noday', deadline: settings.andaktDeadline };
  }
  const deadlineMin = hhmmToMinutes(settings.andaktDeadline);
  const openMin = deadlineMin - ANDAKT_QR_MARGIN_MIN;
  const closeMin = deadlineMin + ANDAKT_QR_MARGIN_MIN;
  const nowMin = osloParts(now).minutes;
  const base = { deadline: settings.andaktDeadline, opensAt: hhmm(openMin), closesAt: hhmm(closeMin) };

  if (nowMin < openMin) return { open: false, state: 'before', ...base };
  if (nowMin > closeMin) return { open: false, state: 'after', ...base };
  return { open: true, state: 'open', ...base };
}
