// Helselogg: skriver jevnlig hvordan serveren har det, slik at et brudd kan
// spores i Railway-loggen i ettertid.
//
// Bakgrunn: systemet ble utilgjengelig noen minutter rundt 09:00 hver morgen,
// uten et eneste spor i loggen. Denne modulen skal skille mellom de mulige
// årsakene:
//
//  • Prosessen ble stoppet utenfra (f.eks. for mye minne, eller Railway som
//    starter den på nytt): da logges signalet/utgangen, og minnet stiger på
//    linjene før.
//  • Noe blokkerte serveren: da viser «event-loop maks» et stort tall, og det
//    blir et hull i linjene mens det sto på.
//  • Prosessen levde og var ledig, men ingen forespørsler kom fram: da går
//    linjene som normalt, med «0 forespørsler» – feilen ligger utenfor koden
//    (nettverk/plattform).
//
// Normalt skrives én linje hvert 10. minutt. I morgentimene der bruddene har
// skjedd, skrives det hvert minutt. Avvik logges med en gang uansett.

import { monitorEventLoopDelay } from 'node:perf_hooks';
import { osloParts } from './fireWindow.js';

const TICK_MS = 60 * 1000;
// Morgenvinduet med tett logging (skolens tidssone, minutter etter midnatt).
const DENSE_FROM = 8 * 60;        // 08:00
const DENSE_TO = 10 * 60 + 30;    // 10:30
const QUIET_EVERY_MIN = 10;

// Terskler for å varsle med en gang, utenom den faste linjen.
const LAG_WARN_MS = 1000;          // event-loopen sto stille over ett sekund
const SLOW_REQUEST_MS = 3000;      // en enkelt forespørsel brukte over 3 sekunder
const TIMER_LATE_MS = 5000;        // minutt-tikket kom over 5 sekunder for sent

const mb = (bytes) => Math.round(bytes / 1024 / 1024);
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

let requestsThisPeriod = 0;
let inFlight = 0;

// Express-mellomvare: teller forespørsler og logger de trege. Bare metode og
// sti logges – aldri spørrestrengen, som kan inneholde tokens.
export function requestMonitor(req, res, next) {
  const start = process.hrtime.bigint();
  requestsThisPeriod++;
  inFlight++;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    inFlight--;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (ms >= SLOW_REQUEST_MS) {
      console.warn(`  🩺 Treg forespørsel · ${req.method} ${req.path} · ${Math.round(ms)} ms · status ${res.statusCode}`);
    }
  };
  res.on('finish', finish);
  res.on('close', finish);
  next();
}

export function startHealthLog() {
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();

  let lastTick = Date.now();
  let lastLoggedRss = process.memoryUsage().rss;
  let requestsSinceLine = 0;

  const line = (prefix, extra = '') => {
    const m = process.memoryUsage();
    const now = osloParts();
    console.log(
      `  🩺 ${prefix}${hhmm(now.minutes)} · minne ${mb(m.rss)} MB (heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB)` +
      ` · event-loop maks ${Math.round(loop.max / 1e6)} ms, p99 ${Math.round(loop.percentile(99) / 1e6)} ms` +
      ` · ${requestsSinceLine} forespørsler, ${inFlight} aktive` +
      ` · oppe ${Math.round(process.uptime() / 60)} min${extra}`
    );
    lastLoggedRss = m.rss;
  };

  const tick = () => {
    const nowMs = Date.now();
    const late = nowMs - lastTick - TICK_MS;
    lastTick = nowMs;

    requestsSinceLine += requestsThisPeriod;
    requestsThisPeriod = 0;

    const maxLag = loop.max / 1e6;
    const rss = process.memoryUsage().rss;
    const { minutes } = osloParts();
    const dense = minutes >= DENSE_FROM && minutes <= DENSE_TO;

    const avvik = [];
    if (late >= TIMER_LATE_MS) avvik.push(`tikket kom ${Math.round(late / 1000)} s for sent`);
    if (maxLag >= LAG_WARN_MS) avvik.push(`event-loopen sto stille opptil ${Math.round(maxLag)} ms`);
    // Brå minneøkning siden forrige linje (over 100 MB eller en dobling).
    if (rss - lastLoggedRss > 100 * 1024 * 1024 || rss > lastLoggedRss * 2) {
      avvik.push(`minnet steg fra ${mb(lastLoggedRss)} til ${mb(rss)} MB`);
    }

    if (avvik.length) {
      line('⚠ ', ` · ${avvik.join(' · ')}`);
    } else if (dense || minutes % QUIET_EVERY_MIN === 0) {
      line();
    } else {
      return; // ingen linje: tellerne og event-loop-målingen samles videre
    }
    requestsSinceLine = 0;
    loop.reset();
  };

  setInterval(tick, TICK_MS);
  line('Helselogg startet · ');
  loop.reset();

  // Stoppes prosessen utenfra, vil vi se det. Railway sender SIGTERM før
  // containeren stoppes. Signalet sendes videre etter loggingen, slik at
  // prosessen avslutter akkurat som før.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, () => {
      line(`Mottok ${sig} · `);
      process.kill(process.pid, sig);
    });
  }
  process.on('exit', (code) => {
    console.log(`  🩺 Prosessen avslutter · kode ${code} · oppe ${Math.round(process.uptime() / 60)} min`);
  });
  // «Monitor»-varianten logger uten å endre hva som skjer etterpå: en
  // ubehandlet feil krasjer fortsatt prosessen, men nå med et spor.
  process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.error(`  🩺 Ubehandlet feil (${origin}): ${err && err.stack ? err.stack : err}`);
  });
}
