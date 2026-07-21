import db from './db.js';
import { todayDate } from './andaktToken.js';

// Ukedagsnavn slik de står i menyen (OpenAI beholder norsk tekst). Indeks følger
// Date.getDay(): 0 = søndag.
const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

// Menyen skriver dagen som fritekst («Mandag», «Mandag 21.», «21. juli»), så vi
// matcher på at ukedagsnavnet forekommer i teksten – tolerant for store/små
// bokstaver og etterfølgende dato.
function matchesWeekday(dayText, weekday) {
  return String(dayText || '').toLowerCase().includes(weekday);
}

// Dagens middagsrett og nattens internatvakt, hentet fra den SIST tolkede
// menyen (admin laster opp inneværende ukes oppslag). Returnerer null-felt når
// ingenting matcher dagens ukedag, slik at klienten kan skjule widgeten.
export function getTodayMenu(date = todayDate()) {
  const weekday = weekdayOf(date);

  // Nyeste meny først, samme rekkefølge som elevlisten ellers bruker.
  const rows = db
    .prepare("SELECT parsed_json FROM menus WHERE parse_status = 'ok' AND parsed_json IS NOT NULL ORDER BY uploaded_at DESC, id DESC")
    .all();

  for (const row of rows) {
    let menu;
    try { menu = JSON.parse(row.parsed_json); } catch { continue; }

    const day = (menu.days || []).find((d) => matchesWeekday(d.day, weekday));
    const guard = (menu.nightGuards || []).find((g) => matchesWeekday(g.day, weekday));

    // Bruk den første menyen som faktisk dekker dagen med enten rett eller vakt.
    if ((day && day.dishes && day.dishes.length) || guard) {
      return {
        date,
        weekday,
        dinner: day && day.dishes && day.dishes.length
          ? { dishes: day.dishes, note: day.note || null }
          : null,
        guard: guard ? { name: guard.name } : null,
      };
    }
  }

  return { date, weekday, dinner: null, guard: null };
}
