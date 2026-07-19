// Liten fetch-hjelper. Cookies (httpOnly sesjon) sendes automatisk med.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* tomt svar */ }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || 'Noe gikk galt');
    err.status = res.status;
    err.code = data?.error;
    err.data = data;
    throw err;
  }
  return data;
}

// Hent nåværende GPS-posisjon. Returnerer { lat, lng } eller kaster.
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      return reject(new Error('Enheten støtter ikke posisjon'));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'Du må gi appen tilgang til posisjon' : 'Fikk ikke posisjon')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export function formatTime(iso) {
  if (!iso) return '';
  // SQLite datetime('now') er UTC uten sone -> tolk som UTC.
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];

export function formatDateLong(dstr) {
  const [y, m, d] = dstr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d}. ${MONTHS[m - 1]} ${y}`;
}

export function formatDateShort(dstr) {
  const [y, m, d] = dstr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ['sø','ma','ti','on','to','fr','lø'][dt.getDay()];
  return `${wd}. ${d}. ${MONTHS[m - 1].slice(0, 3)}`;
}

// ── Netter ───────────────────────────────────────────────────
// Brannlisten gjelder NATTEN, og en dato står for natten som BEGYNNER den
// kvelden: 19. juli = natt til 20. juli. Elevene tenker på fraværet sitt som
// «natt til», så alt vi viser dem skrives slik – ellers er det lett å bomme
// med én dag når man velger i kalenderen.
export function formatNight(dstr) {
  const [y, m, d] = dstr.split('-').map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `natt til ${WEEKDAYS[n.getDay()]} ${n.getDate()}. ${MONTHS[n.getMonth()]}`;
}

export function formatNightShort(dstr) {
  const [y, m, d] = dstr.split('-').map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `natt til ${n.getDate()}. ${MONTHS[n.getMonth()]}`;
}

// Én natt: «natt til mandag 20. juli». Flere: «natt til 20. – natt til 22. juli».
export function formatNightRange(startStr, endStr) {
  if (!endStr || startStr === endStr) return formatNight(startStr);
  return `${formatNightShort(startStr)} – ${formatNightShort(endStr)}`;
}

// Antall netter i en periode (inklusiv begge ender).
export function countNights(startStr, endStr) {
  if (!endStr || startStr === endStr) return 1;
  const [y1, m1, d1] = startStr.split('-').map(Number);
  const [y2, m2, d2] = endStr.split('-').map(Number);
  const ms = new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
  return Math.round(ms / 86400000) + 1;
}

// Datointervallet for en uke, så kort som mulig uten å bli tvetydig:
// «20.–26. juli» · «29. juni – 5. juli» · «29. desember 2025 – 4. januar 2026»
export function formatWeekRange(startStr, endStr) {
  const [y1, m1, d1] = startStr.split('-').map(Number);
  const [y2, m2, d2] = endStr.split('-').map(Number);
  if (y1 !== y2) return `${d1}. ${MONTHS[m1 - 1]} ${y1} – ${d2}. ${MONTHS[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1}. ${MONTHS[m1 - 1]} – ${d2}. ${MONTHS[m2 - 1]}`;
  return `${d1}.–${d2}. ${MONTHS[m1 - 1]}`;
}

// Icon-hjelper (Feather-lignende SVG-er brukt i designet).
export const icon = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2S6 7 6 13a6 6 0 0 0 12 0c0-2.2-1.2-3.8-2.3-5.2C14.7 6.6 14 5 14 3.5c-1 .8-1.6 2-2 3.2C11.4 5.2 11.8 3.4 12 2Z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2V5Z"/><path d="M20 5a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2V5Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2"/><path d="M5 2v20"/><path d="M17 2v20"/><path d="M17 8c0-3 1-6 3-6v20"/></svg>',
};
