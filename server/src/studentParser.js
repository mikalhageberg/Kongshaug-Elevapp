import OpenAI from 'openai';
import { config } from './config.js';

// Tolker et opplastet regneark med elevlista til strukturert data via OpenAI.
// Speiler dutyParser.js (samme klient/config, temperature 0, strict json_schema).
// Klasse- og internatverdiene sendes inn fra frontend, slik at CLASSES/DORMS i
// admin.js forblir eneste fasit – vi dupliserer ikke listene her.

const STUDENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    students: {
      type: 'array',
      description: 'Én rad per elev i arket.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fullName: { type: 'string', description: 'Elevens fulle navn slik det står.' },
          className: { type: ['string', 'null'], description: 'Klasse, kun en av de tillatte verdiene. Null hvis ukjent.' },
          dorm: { type: ['string', 'null'], description: 'Internat, kun en av de tillatte verdiene. Null hvis ukjent.' },
          room: { type: ['string', 'null'], description: 'Romnummer, ellers null.' },
        },
        required: ['fullName', 'className', 'dorm', 'room'],
      },
    },
  },
  required: ['students'],
};

function systemPrompt(classes, dorms) {
  return [
    'Du får innholdet i et regneark (rader og kolonner) med elevlista ved en norsk internatskole.',
    'Hent ut én oppføring per elev: fullt navn, klasse, internat og rom.',
    'Behold navnet nøyaktig slik det står (æ, ø, å beholdes).',
    classes.length ? `Klasse MÅ være en av disse verdiene: ${classes.join(', ')}. Map varianter til riktig verdi (f.eks. «1A» → «${classes[0]}»).` : '',
    dorms.length ? `Internat MÅ være en av disse verdiene: ${dorms.join(', ')}. Map skrivevarianter til riktig verdi.` : '',
    'Hvis klasse, internat eller rom ikke går an å avgjøre fra arket, sett feltet til null – ikke gjett.',
    'Ignorér overskriftsrader, tomme rader og kolonner som ikke hører til en elev.',
    'Ikke dikt opp elever som ikke står i arket.',
  ].filter(Boolean).join(' ');
}

// Navnenormalisering: samme idé som slugName, men behold ordmellomrom.
function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Finn en tillatt verdi som matcher (normalisert), ellers null.
function matchAllowed(value, allowed) {
  const v = normName(value);
  if (!v) return null;
  return allowed.find((a) => normName(a) === v) || null;
}

export async function parseStudentsXlsx(rows, { classes = [], dorms = [], existingNames = [] } = {}) {
  if (!config.openai.enabled) throw new Error('OpenAI er ikke konfigurert (mangler OPENAI_API_KEY).');
  const grid = (rows || []).map((r) => (r || []).join('\t')).join('\n').trim();
  if (!grid) throw new Error('Regnearket er tomt.');

  const client = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseUrl });
  const completion = await client.chat.completions.create({
    model: config.openai.menuModel,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt(classes, dorms) },
      { role: 'user', content: `Regneark:\n${grid}` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'student_list', strict: true, schema: STUDENT_SCHEMA } },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Tomt svar fra modellen.');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed?.students) ? parsed.students : [];
  if (!list.length) throw new Error('Fant ingen elever i arket.');

  const existingSet = new Set(existingNames.map(normName));
  const seen = new Set();
  const students = [], existing = [];

  for (const s of list) {
    const fullName = String(s?.fullName || '').trim().replace(/\s+/g, ' ');
    if (!fullName) continue;
    const key = normName(fullName);
    if (!key || seen.has(key)) continue;   // dupliserte rader i selve arket
    seen.add(key);
    if (existingSet.has(key)) { existing.push(fullName); continue; }
    students.push({
      fullName,
      className: matchAllowed(s?.className, classes),
      dorm: matchAllowed(s?.dorm, dorms),
      room: s?.room != null && String(s.room).trim() ? String(s.room).trim() : null,
    });
  }

  if (!students.length && !existing.length) throw new Error('Fant ingen elever i arket.');
  return { students, existing };
}
