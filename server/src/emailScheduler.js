// Automatisk utsending av brannliste- og middags-e-post, samt push-påminnelse
// om brannlisten.
//
// To ting gjorde at den gamle versjonen kunne hoppe over en dag i det stille:
//
//  1. Den sammenlignet med serverens LOKALE klokke. I drift kjører serveren i
//     UTC (node:22-slim setter ingen TZ), mens admin skriver inn norsk tid –
//     altså to timers bom om sommeren, én om vinteren.
//
//  2. Den krevde at et tick landet nøyaktig i riktig minutt («16:08» === «16:08»).
//     setInterval driver, og et travelt øyeblikk holder i seg: går klokka fra
//     16:07:59 til 16:09:00 mellom to tick, ble minuttet aldri sett, og
//     e-posten uteble den dagen uten noe spor.
//
// Nå regnes klokkeslettet ut i skolens tidssone, og i stedet for et eksakt
// treff sendes e-posten første gang vi ser at tidspunktet har PASSERT – innen
// et slingringsmonn. «Sist sendt» ligger i databasen, så en omstart midt i
// vinduet ikke gir dobbel utsending.

import { config } from './config.js';
import { getSettings, getLastSent, setLastSent, hhmmToMinutes } from './settings.js';
import { sendFireListEmail, sendKitchenEmail } from './mail.js';
import { sendFireListReminder } from './fireReminder.js';

// Hvor lenge etter oppsatt tidspunkt vi fortsatt sender. Dekker drift og korte
// nedetider, men hindrer at en e-post fra i formiddag plutselig går ut om
// kvelden etter en lang utetid.
export const GRACE_MINUTES = 60;

const CHECK_INTERVAL_MS = 30 * 1000;

// Klokkeslett og dato slik de ser ut i skolens tidssone, uavhengig av hvilken
// tidssone serveren selv kjører i.
export function zonedNow(date = new Date(), timeZone = config.school.timeZone) {
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const hour = t.find((p) => p.type === 'hour').value;
  const minute = t.find((p) => p.type === 'minute').value;
  // 'en-CA' gir 'YYYY-MM-DD'.
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  return { hhmm: `${hour}:${minute}`, minutes: Number(hour) * 60 + Number(minute), dateKey };
}

// Ren avgjørelse: skal denne e-posten sendes nå? Skilt ut for å kunne testes
// uten å vente på klokka.
export function isDue({ enabled, recipient, time, lastSent }, now, grace = GRACE_MINUTES) {
  if (!enabled || !recipient || !time) return false;
  if (lastSent === now.dateKey) return false;          // allerede sendt i dag
  const scheduled = hhmmToMinutes(time);
  const past = now.minutes - scheduled;
  return past >= 0 && past <= grace;
}

// Ett gjennomløp. Eksportert slik at testene kan kalle den direkte.
export async function runOnce(now = zonedNow(), log = console) {
  let s;
  try { s = getSettings(); } catch { return []; }
  const sent = [];

  const jobs = [
    {
      navn: 'Brannliste',
      key: 'fireEmailLastSent',
      cfg: { enabled: s.fireEmailEnabled, recipient: s.fireEmailRecipient, time: s.fireEmailTime },
      send: sendFireListEmail,
      beskriv: (r) => `sendt til ${r.recipient} (natt ${r.nightDate})`,
    },
    {
      navn: 'Middagsoversikt',
      key: 'kitchenEmailLastSent',
      cfg: { enabled: s.kitchenEmailEnabled, recipient: s.kitchenEmailRecipient, time: s.kitchenEmailTime },
      send: sendKitchenEmail,
      beskriv: (r) => `sendt til ${r.recipient} (${r.eating} spiser)`,
    },
    {
      navn: 'Brannliste-påminnelse',
      key: 'fireReminderPushLastSent',
      // recipient: true er en plassholder – denne jobben har ingen fast mottaker
      // (målgruppen beregnes dynamisk ved kjøring), men isDue() krever en «sann» verdi her.
      cfg: { enabled: s.fireReminderPushEnabled, recipient: true, time: '20:00' },
      send: sendFireListReminder,
      beskriv: (r) => `sendt til ${r.sent} av ${r.targeted} elever (natt ${r.nightDate})`,
    },
  ];

  for (const job of jobs) {
    if (!isDue({ ...job.cfg, lastSent: getLastSent(job.key) }, now)) continue;
    // Merk som sendt FØR utsending: feiler sendingen, vil vi ikke at neste tick
    // 30 sekunder senere skal prøve igjen og igjen resten av vinduet.
    setLastSent(job.key, now.dateKey);
    try {
      const r = await job.send();
      sent.push(job.navn);
      log.log(`  ✉  ${job.navn} ${job.beskriv(r)}`);
    } catch (ex) {
      log.error(`  ✉  ${job.navn} feilet: ${ex.message}`);
    }
  }
  return sent;
}

export function startEmailSchedulers() {
  console.log(`  ✉  E-postplanlegger startet · tidssone ${config.school.timeZone} · klokka er nå ${zonedNow().hhmm} der`);
  setInterval(() => { runOnce().catch(() => {}); }, CHECK_INTERVAL_MS);
}
