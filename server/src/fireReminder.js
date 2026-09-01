import db from './db.js';
import { currentNightDate } from './fireWindow.js';
import { getFireOverview, nightLabel } from './fireReport.js';
import { watchNightDate, watchers } from './fireWatch.js';
import { recordAdminNotification } from './adminNotify.js';
import { sendExpoPush } from './pushSend.js';

// Send push-påminnelse til elever som ikke har krysset seg av på
// brannlisten for kvelden ennå.
export async function sendFireListReminder() {
  const nightDate = currentNightDate();
  const overview = getFireOverview(nightDate);
  const missingIds = overview.dorms.flatMap((d) => d.students).filter((s) => s.status === 'missing').map((s) => s.id);
  if (!missingIds.length) return { nightDate, targeted: 0, sent: 0, failed: 0 };

  const ph = missingIds.map(() => '?').join(',');
  const tokens = db.prepare(`SELECT token FROM push_tokens WHERE user_id IN (${ph})`).all(...missingIds).map((r) => r.token);
  const result = await sendExpoPush(tokens, {
    title: 'Husk brannlisten!',
    body: 'Du har ikke krysset deg av for i kveld ennå. Åpne appen og registrer om du er til stede eller borte.',
  });
  return { nightDate, targeted: missingIds.length, ...result };
}

// ── Til brannvakten: hvem mangler etter at fristen gikk ut? ──
//
// Sendes et kvarter etter at innsjekksvinduet stengte, til administratoren(e)
// som har tatt vakten i kveld. Poenget er at vakten skal slippe å åpne noe for
// å vite om det er noe å gjøre: står det «Alle er registrert», er kvelden over.
//
// Navnene står i varselet med vilje. Et varsel som bare sier «3 mangler» tvinger
// vakten til å låse opp telefonen for å finne ut hvem – og det er nettopp de tre
// navnene hun trenger for å begynne å lete.

// Hvor mange navn som får plass før varselet blir en tekstvegg på låseskjermen.
const NAVN_I_VARSEL = 5;

function navneliste(navn) {
  if (navn.length <= NAVN_I_VARSEL) return navn.join(', ');
  return `${navn.slice(0, NAVN_I_VARSEL).join(', ')} og ${navn.length - NAVN_I_VARSEL} til`;
}

export async function sendWatchMissingPush(nightDate = watchNightDate()) {
  const overview = getFireOverview(nightDate);
  const missing = overview.dorms
    .flatMap((d) => d.students)
    .filter((s) => s.status === 'missing');

  const vakter = watchers(nightDate);
  // Ingen har tatt vakten i kveld. Da har varselet ingen adressat – det er
  // hele meningen med QR-skanningen. Det logges av kalleren, ikke sendes
  // videre til alle som tilfeldigvis har appen.
  if (!vakter.length) return { nightDate, missing: missing.length, watchers: 0, sent: 0, failed: 0 };

  const ph = vakter.map(() => '?').join(',');
  const tokens = db.prepare(`SELECT token FROM push_tokens WHERE user_id IN (${ph})`)
    .all(...vakter.map((v) => v.id)).map((r) => r.token);

  const natt = `natt til ${nightLabel(nightDate)}`;
  const melding = missing.length
    ? {
        title: `${missing.length} mangler på brannlisten`,
        body: `${navneliste(missing.map((s) => s.fullName))}. Åpne appen for opprop (${natt}).`,
      }
    : {
        title: 'Brannlisten er komplett',
        body: `Alle ${overview.total} elever er gjort rede for (${natt}).`,
      };

  // Legges i varslingssenteret FØR utsendingen, og uavhengig av hvordan den
  // går. Et varsel som aldri nådde låseskjermen er nettopp det vakten skal
  // kunne finne igjen i appen.
  recordAdminNotification({
    userIds: vakter.map((v) => v.id),
    nightDate, kind: 'vakt', ...melding,
  });

  const r = await sendExpoPush(tokens, melding);
  return { nightDate, missing: missing.length, watchers: vakter.length, ...r };
}
