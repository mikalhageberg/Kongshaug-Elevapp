import OpenAI from 'openai';
import { config } from './config.js';

// Tolker et opplastet regneark med elevlista.
//
// PERSONVERN: modellen får BARE de første radene i arket, og svarer bare med
// hvilke kolonner som er hva (kolonnenumre – ingen persondata). Resten av arket
// tolkes lokalt på skolens server. Navn, klasse, internat og romnummer for
// resten av elevene forlater derfor aldri skolen.
//
// Modellens eneste jobb er å forstå STRUKTUREN i arket – aldri personene.

const SAMPLE_ROWS = 6;

const LAYOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dataStartRow: { type: 'integer', description: '0-basert radnummer der elevradene starter (etter tittel/overskrift).' },
    nameCol: { type: 'integer', description: '0-basert kolonnenummer for elevens fulle navn.' },
    classCol: { type: ['integer', 'null'], description: '0-basert kolonne for klasse, eller null hvis arket ikke har det.' },
    dormCol: { type: ['integer', 'null'], description: '0-basert kolonne for internat, eller null.' },
    roomCol: { type: ['integer', 'null'], description: '0-basert kolonne for rom, eller null.' },
    instrumentCol: { type: ['integer', 'null'], description: '0-basert kolonne for elevens hovedinstrument, eller null hvis arket ikke har det.' },
  },
  required: ['dataStartRow', 'nameCol', 'classCol', 'dormCol', 'roomCol', 'instrumentCol'],
};

const SYSTEM_PROMPT = [
  'Du får de første radene i et regneark med elevlista ved en norsk internatskole.',
  'Radene er nummerert fra 0, og kolonnene er skilt med tabulator (kolonne 0 er den første).',
  'Finn ut hvordan arket er bygd opp: hvilken kolonne inneholder elevens fulle navn, klasse, internat, rom og hovedinstrument,',
  'og på hvilken rad de faktiske elevradene begynner (hopp over tittel- og overskriftsrader og tomme rader).',
  'Hovedinstrument er instrumentet eleven har som sitt viktigste – kolonnen kan hete «instrument», «hovedinstrument» eller «hovedinstr.».',
  'Svar KUN med kolonnenumre og radnummer – ikke gjengi innholdet i cellene.',
  'Hvis arket ikke har en kolonne for klasse, internat, rom eller hovedinstrument, sett feltet til null.',
].join(' ');

// Navnenormalisering: samme idé som slugName, men behold ordmellomrom.
function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Klasse: «1A», «vg1a» og «VG 1A» skal alle treffe «VG1A».
const classKey = (s) => normName(s).replace(/\s+/g, '').replace(/^vg/, '');
function matchClass(value, classes) {
  const v = classKey(value);
  if (!v) return null;
  return classes.find((c) => classKey(c) === v) || null;
}

// Internat: «treet 1», «Treet 1» og «treet1» skal alle treffe «Treet 1».
function matchDorm(value, dorms) {
  const v = normName(value);
  if (!v) return null;
  const tight = v.replace(/\s+/g, '');
  return dorms.find((d) => normName(d) === v || normName(d).replace(/\s+/g, '') === tight) || null;
}

// Hovedinstrument mot den faste lista. Godtar hele ordet og de vanligste
// forkortelsene arkene bruker («fio» → Fiolin, «trm»/«slagverk» → Trommer).
// Uten treff blir feltet null, og admin velger selv i forhåndsvisningen.
function matchInstrument(value, instruments) {
  const v = normName(value);
  if (!v) return null;
  const exact = instruments.find((i) => normName(i) === v);
  if (exact) return exact;
  // «Trommer/slagverk» skal treffes av både «trommer» og «slagverk».
  const delvis = instruments.filter((i) => {
    const deler = normName(i).split(/[^a-z0-9]+/).filter(Boolean);
    return deler.some((d) => d === v || d.startsWith(v));
  });
  return delvis.length === 1 ? delvis[0] : null;
}

// Spør modellen om oppsettet, basert på et lite utdrag av arket.
async function detectLayout(rows) {
  const sample = rows.slice(0, SAMPLE_ROWS)
    .map((r, i) => `${i}: ${(r || []).join('\t')}`)
    .join('\n');

  const client = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseUrl });
  const completion = await client.chat.completions.create({
    model: config.openai.menuModel,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Første rader i arket:\n${sample}` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'sheet_layout', strict: true, schema: LAYOUT_SCHEMA } },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Tomt svar fra modellen.');
  return JSON.parse(raw);
}

export async function parseStudentsXlsx(rows, { classes = [], dorms = [], instruments = [], existingNames = [] } = {}) {
  if (!config.openai.enabled) throw new Error('OpenAI er ikke konfigurert (mangler OPENAI_API_KEY).');
  const grid = (rows || []).filter((r) => (r || []).some((c) => String(c || '').trim()));
  if (!grid.length) throw new Error('Regnearket er tomt.');

  const layout = await detectLayout(rows);
  const nameCol = Number(layout?.nameCol);
  if (!Number.isInteger(nameCol) || nameCol < 0) throw new Error('Fant ikke navnekolonnen i arket.');
  const startRow = Math.max(0, Number(layout?.dataStartRow) || 0);
  const col = (r, i) => (i == null || i < 0 ? '' : String((r || [])[i] ?? '').trim());

  // Overskriftsteksten i navnekolonnen, så gjentatte overskrifter lenger ned hoppes over.
  const headerNames = new Set(
    rows.slice(0, startRow).map((r) => normName(col(r, nameCol))).filter(Boolean)
  );

  const existingSet = new Set(existingNames.map(normName));
  const seen = new Set();
  const students = [], existing = [];

  // Resten av arket tolkes lokalt – ingenting av dette sendes ut.
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const fullName = col(row, nameCol).replace(/\s+/g, ' ');
    if (!fullName) continue;
    const key = normName(fullName);
    if (!key || headerNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (existingSet.has(key)) { existing.push(fullName); continue; }
    const room = col(row, layout?.roomCol);
    students.push({
      fullName,
      className: matchClass(col(row, layout?.classCol), classes),
      dorm: matchDorm(col(row, layout?.dormCol), dorms),
      room: room || null,
      instrument: matchInstrument(col(row, layout?.instrumentCol), instruments),
    });
  }

  if (!students.length && !existing.length) throw new Error('Fant ingen elever i arket.');
  return { students, existing };
}
