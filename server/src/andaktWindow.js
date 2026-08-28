// Tidsvindu for andakts-QR: koden er kun tilgjengelig et stykke FØR og et
// stykke ETTER «Frist for oppmøte» (andaktDeadline). Skolen setter begge
// sidene selv under Innstillinger – standard er 30 minutter hver vei.
// Utenfor vinduet skjules QR-en og registrering avvises.
//
// De to sidene styrer hver sin ting: åpningen avgjør når koden dukker opp på
// storskjermen, lukkingen hvor lenge en som kommer for sent fortsatt rekker å
// registrere seg (og bli stående som «for sent» framfor fravær).
//
// Alt regnes i skolens tidssone – serveren kjører UTC i drift, så uten dette
// ville vinduet ligget to timer feil om sommeren. Speiler fireWindow.js.

import { osloParts } from './fireWindow.js';
import { getSettings, hhmmToMinutes, isAndaktDay } from './settings.js';

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
  const openMin = deadlineMin - settings.andaktQrOpenBefore;
  const closeMin = deadlineMin + settings.andaktQrCloseAfter;
  const nowMin = osloParts(now).minutes;
  // openBefore/closeAfter sendes med, så klientene kan skrive «30 min før
  // fristen» uten å gjette på tallet.
  const base = {
    deadline: settings.andaktDeadline,
    opensAt: hhmm(openMin),
    closesAt: hhmm(closeMin),
    openBefore: settings.andaktQrOpenBefore,
    closeAfter: settings.andaktQrCloseAfter,
  };

  if (nowMin < openMin) return { open: false, state: 'before', ...base };
  if (nowMin > closeMin) return { open: false, state: 'after', ...base };
  return { open: true, state: 'open', ...base };
}
