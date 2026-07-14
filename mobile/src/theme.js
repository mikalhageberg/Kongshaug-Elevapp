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
