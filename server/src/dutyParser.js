import OpenAI from 'openai';
import { config } from './config.js';
import { todayDate } from './andaktToken.js';
import { isDateString, weekStartOf, mondayOfIsoWeek, isoWeekNumber } from './isoWeek.js';

// Tolker et opplastet regneark med kjøkkentjeneste-turnus til strukturert data
// via OpenAI, og løser opp ukenummer → mandagsdato og navn → elev-id lokalt.
// Speiler menuParser.js (samme klient/config, temperature 0, strict json_schema),
// men med tekst-input i stedet for bilde.

const DUTY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    year: { type: ['integer', 'null'], description: 'Årstallet arket gjelder, hvis det står. Ellers null.' },
    weeks: {
      type: 'array',
      description: 'Én rad per uke i arket.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          week: { type: 'integer', description: 'ISO-ukenummer (1–53).' },
          startDate: { type: ['string', 'null'], description: 'Startdato for uken hvis arket viser en (helst YYYY-MM-DD), ellers null.' },
          students: { type: 'array', items: { type: 'string' }, description: 'Fulle navn på elevene som har tjeneste denne uken.' },
        },
        required: ['week', 'startDate', 'students'],
      },
    },
  },
  required: ['year', 'weeks'],
};

const SYSTEM_PROMPT = [
  'Du får innholdet i et regneark (rader og kolonner) som viser kjøkkentjeneste-turnus for elever ved en norsk internatskole, uke for uke.',
  'Hent ut hvilke personer som har tjeneste hver uke.',
  'Returner ISO-ukenummeret for hver uke, en startdato hvis arket viser en, og de fulle navnene slik de står.',
  'Ta med ALLE navn som står oppført for hver uke – også navn du ikke finner igjen i elevlista.',
  'Hvis et navn i arket tydelig er samme person som en elev i lista, bruk elevens skrivemåte fra lista (behold æ, ø, å). Ellers tar du med navnet nøyaktig slik det står i arket.',
  'Ignorér overskrifter, tomme celler og kolonner som ikke er navn.',
  'Ikke dikt opp navn eller uker som ikke står i arket.',
].join(' ');

// ── Navnenormalisering (samme idé som slugName, men behold ordmellomrom) ──
function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function firstLastKey(norm) {
  const t = norm.split(' ').filter(Boolean);
  if (t.length < 2) return null;
  return `${t[0]} ${t[t.length - 1]}`;
}

// Bygger oppslags-maps fra elevlista. Verdi = liste (for å oppdage flertydighet).
function buildIndex(students) {
  const full = new Map(), fl = new Map();
  const push = (map, key, s) => { if (!key) return; (map.get(key) || map.set(key, []).get(key)).push(s); };
  for (const s of students) {
    const norm = normName(s.full_name);
    push(full, norm, s);
    push(fl, firstLastKey(norm), s);
  }
  return { full, fl };
}

// Løs ett navn til én elev, eller null hvis ingen/flertydig.
function resolveStudent(name, index) {
  const norm = normName(name);
  const exact = index.full.get(norm);
  if (exact && exact.length === 1) return exact[0];
  const fl = index.fl.get(firstLastKey(norm));
  if (fl && fl.length === 1) return fl[0];
  return null; // ingen treff, eller flertydig → «unmatched»
}

// Løs ukenummer (+ evt. startdato/år) til mandagsdato ('YYYY-MM-DD').
function resolveWeekStart(week, startDate, parsedYear, today) {
  // 1) Eksplisitt dato i arket vinner.
  if (startDate) {
    let iso = null;
    if (isDateString(startDate)) iso = startDate;
    else {
      const m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(String(startDate).trim());
      if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    if (iso) return weekStartOf(iso);
  }
  // 2) Årstall oppgitt i arket.
  if (parsedYear) return mondayOfIsoWeek(parsedYear, week);
  // 3) Velg nærmeste kommende blant fjor/i år/neste år.
  const { isoYear } = isoWeekNumber(today);
  const t = new Date(today);
  const cutoff = new Date(t); cutoff.setDate(cutoff.getDate() - 14); // foretrekk ≥ i dag − 14 dager
  const cands = [isoYear - 1, isoYear, isoYear + 1].map((y) => mondayOfIsoWeek(y, week));
  const future = cands.filter((d) => new Date(d) >= cutoff);
  const pool = future.length ? future : cands;
  return pool.reduce((best, d) =>
    Math.abs(new Date(d) - t) < Math.abs(new Date(best) - t) ? d : best);
}

export async function parseDutyXlsx(rows, students) {
  if (!config.openai.enabled) throw new Error('OpenAI er ikke konfigurert (mangler OPENAI_API_KEY).');
  const grid = (rows || []).map((r) => (r || []).join('\t')).join('\n').trim();
  if (!grid) throw new Error('Regnearket er tomt.');
  const roster = students.map((s) => s.full_name).join('\n');

  const client = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseUrl });
  const completion = await client.chat.completions.create({
    model: config.openai.menuModel,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Elever ved skolen (fasit for skrivemåte):\n${roster}\n\nRegneark:\n${grid}` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'kitchen_duty_plan', strict: true, schema: DUTY_SCHEMA } },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Tomt svar fra modellen.');
  const parsed = JSON.parse(raw);
  const parsedWeeks = Array.isArray(parsed?.weeks) ? parsed.weeks : [];
  if (!parsedWeeks.length) throw new Error('Fant ingen uker i arket.');

  const today = todayDate();
  const index = buildIndex(students);
  const weeks = [];
  for (const w of parsedWeeks) {
    const week = Number(w?.week);
    if (!Number.isInteger(week) || week < 1 || week > 53) continue;
    const weekStart = resolveWeekStart(week, w?.startDate, parsed?.year, today);
    const matched = [], unmatched = [], seen = new Set();
    for (const name of Array.isArray(w?.students) ? w.students : []) {
      const clean = String(name || '').trim();
      if (!clean) continue;
      const stud = resolveStudent(clean, index);
      if (stud) { if (!seen.has(stud.id)) { seen.add(stud.id); matched.push({ id: stud.id, fullName: stud.full_name }); } }
      else unmatched.push(clean);
    }
    weeks.push({ week, weekStart, matched, unmatched });
  }
  if (!weeks.length) throw new Error('Fant ingen gyldige uker i arket.');
  return { year: parsed?.year ?? null, weeks };
}
