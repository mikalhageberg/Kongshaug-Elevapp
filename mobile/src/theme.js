export const C = {
  navy: '#1e3a5f',
  navyDark: '#16293f',
  green: '#1f8a5b',
  greenBg: '#e6f4ec',
  greenInk: '#0f6b43',
  red: '#d64545',
  redBg: '#fbeaea',
  redInk: '#a12a1f',
  amber: '#d9a406',
  amberBg: '#fdf4e0',
  amberInk: '#8a6300',
  ink: '#1a2230',
  muted: '#6b7280',
  muted2: '#8a93a3',
  slate: '#55607a',
  line: '#e6e8ec',
  line2: '#dfe4ea',
  surface: '#f4f5f7',
  card: '#ffffff',
};

const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateLong(dstr) {
  const [y, m, d] = dstr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d}. ${MONTHS[m - 1]} ${y}`;
}

export function formatDateShort(dstr) {
  const [y, m, d] = dstr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ['sø', 'ma', 'ti', 'on', 'to', 'fr', 'lø'][dt.getDay()];
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

// Formater et Date-objekt som 'YYYY-MM-DD' i LOKAL tid (ikke UTC).
// Viktig: toISOString() ville brukt UTC og gitt feil dato nær midnatt.
export function ymd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayStr(dt = new Date()) {
  return ymd(dt);
}

export function shiftDate(dstr, days) {
  const [y, m, d] = dstr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + days));
}

export function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Tidsriktig hilsen basert på klokkeslettet.
export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h >= 23 || h < 5) return 'God natt';
  if (h < 10) return 'God morgen';
  if (h < 14) return 'God formiddag';
  if (h < 18) return 'God ettermiddag';
  return 'God kveld';
}
