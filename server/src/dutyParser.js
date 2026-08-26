import OpenAI from 'openai';
import { config } from './config.js';
import { todayDate } from './andaktToken.js';
import { isDateString, weekStartOf, mondayOfIsoWeek, isoWeekNumber } from './isoWeek.js';
import { cellText, isBlankRow, normName, q, readTemplateHeader, throwRowErrors } from './sheetTemplate.js';

// Tolker et opplastet regneark med tjeneste-turnus til strukturert data via
// OpenAI, og løser opp ukenummer → mandagsdato og navn → elev-id lokalt.
// Speiler menuParser.js (samme klient/config, temperature 0, strict json_schema),
// men med tekst-input i stedet for bilde.
//
// Samme parser for kjøkkentjeneste og internatvask – arkene ser like ut, og
// `ledetekst` er det eneste som skiller dem (se duty.js).

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

const systemPrompt = (ledetekst) => [
  `Du får innholdet i et regneark (rader og kolonner) som viser ${ledetekst}-turnus for elever ved en norsk internatskole, uke for uke.`,
  'Hent ut hvilke personer som har tjeneste hver uke.',
  'Returner ISO-ukenummeret for hver uke, en startdato hvis arket viser en, og de fulle navnene slik de står.',
  'Ta med ALLE navn som står oppført for hver uke.',
  'Gjengi navnene nøyaktig slik de står i arket (behold æ, ø, å) – ikke rett opp eller gjett på skrivemåte.',
  'Ignorér overskrifter, tomme celler og kolonner som ikke er navn.',
  'Ikke dikt opp navn eller uker som ikke står i arket.',
].join(' ');

// ── Navnenormalisering (normName er delt, se sheetTemplate.js) ──
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

export async function parseDutyXlsx(rows, students, ledetekst = 'kjøkkentjeneste') {
  if (!config.openai.enabled) throw new Error('OpenAI er ikke konfigurert (mangler OPENAI_API_KEY).');
  const grid = (rows || []).map((r) => (r || []).join('\t')).join('\n').trim();
  if (!grid) throw new Error('Regnearket er tomt.');

  // Personvern: elevlista sendes IKKE til OpenAI. Modellen får bare innholdet i
  // det opplastede arket, og navnene kobles mot elevene lokalt (se resolveStudent).
  const client = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseUrl });
  const completion = await client.chat.completions.create({
    model: config.openai.menuModel,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt(ledetekst) },
      { role: 'user', content: `Regneark:\n${grid}` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'duty_plan', strict: true, schema: DUTY_SCHEMA } },
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

// ── Malen: tolkning helt uten OpenAI ─────────────────────────
//
// Følger arket skolens mal, trengs ingen modell – da tolkes hele turnusen
// lokalt på skolens server, og ingenting sendes ut.
//
// Malen: overskriftsrad øverst, én elev per rad under. Samme mal for
// kjøkkentjeneste og internatvask.
//
//   | Uke | Navn          | Startdato  |
//   | 34  | Ingrid Sæther | 2026-08-17 |
//   |     | Ola Nordmann  |            |   ← tom «Uke» = samme uke som raden over
//
// Internatvasken har i tillegg en «Oppgave»-kolonne med oppgavekoden (ØVEST1,
// se dormTasks.js). Hver rad har sin egen kode – den arves ikke nedover, for en
// tom celle betyr «vaskeuke uten bestemt oppgave».
//
// «Startdato» er valgfri, og pinner uken til en konkret dato (nyttig ved
// årsskifter). Uten den regnes mandagsdatoen ut fra ukenummeret, akkurat som
// når OpenAI tolker arket.
const DUTY_TEMPLATE_HEADERS = {
  week: 'Uke',
  name: 'Navn',
  startDate: 'Startdato',
};
// Internatvasken har i tillegg en «Oppgave»-kolonne med oppgavekoden (ØVEST1).
// Kjøkkentjenesten har ingen oppgaver, og da er kolonnen en ukjent overskrift.
const DUTY_TEMPLATE_HEADERS_TASKS = { ...DUTY_TEMPLATE_HEADERS, task: 'Oppgave' };

// «34» og «Uke 34» er begge greit. Alt annet er null (og blir en feilmelding).
function parseWeekNumber(text) {
  const m = /^(?:uke\s*)?(\d{1,2})$/i.exec(String(text).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 53 ? n : null;
}

// En datocelle kan komme som tekst («2026-08-17», «17.08.2026») eller – hvis
// den er formatert som dato i Excel – som et serienummer. Serienummeret telles
// fra 1899-12-30 (Excels 1900-system, inkludert skuddårsfeilen fra 1900).
function parseSheetDate(text) {
  const t = String(text).trim();
  if (!t) return null;
  if (isDateString(t)) return t;
  const norsk = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(t);
  if (norsk) return `${norsk[3]}-${norsk[2].padStart(2, '0')}-${norsk[1].padStart(2, '0')}`;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    if (serial >= 61 && serial <= 100000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

// Tolker et turnusark som følger malen. Samme returformat som parseDutyXlsx,
// så forhåndsvisningen i admin er den samme uansett hvilken vei arket kom inn.
export function parseDutyTemplate(rows, students, { tasks = null } = {}) {
  const grid = rows || [];
  const headers = tasks ? DUTY_TEMPLATE_HEADERS_TASKS : DUTY_TEMPLATE_HEADERS;
  const { headerRow, cols } = readTemplateHeader(grid, headers, ['week', 'name']);
  // Oppgavekoder slås opp normalisert, så «øvest1» og «ØVEST1» er samme kode.
  const koder = new Map((tasks || []).map((t) => [normName(t.code), t]));

  const today = todayDate();
  const index = buildIndex(students);
  const feil = [];
  const uker = new Map();     // ukenummer -> { week, startDate, matched, unmatched, seen }
  let forrigeUke = null;      // tom «Uke»-celle betyr «samme uke som raden over»

  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i];
    const radnr = i + 1;                       // radnummeret slik det står i Excel
    // Tom rad skiller blokker: da arves ikke ukenummeret videre, slik at en
    // glemt uke etter mellomrommet blir en tydelig feil i stedet for en gjetning.
    if (isBlankRow(row)) { forrigeUke = null; continue; }
    const ukeTekst = cellText(row, cols.week);
    const navn = cellText(row, cols.name).replace(/\s+/g, ' ');
    const datoTekst = cellText(row, cols.startDate);

    let week = forrigeUke;
    if (ukeTekst) {
      week = parseWeekNumber(ukeTekst);
      if (week == null) { feil.push(`rad ${radnr}: ${q(ukeTekst)} er ikke et gyldig ukenummer (1–53)`); continue; }
    } else if (week == null) {
      feil.push(`rad ${radnr}: mangler ukenummer`); continue;
    }
    forrigeUke = week;

    if (!navn) { feil.push(`rad ${radnr}: mangler navn`); continue; }

    // Oppgavekoden må finnes fra før – en ukjent kode er en skrivefeil, ikke en
    // ny oppgave. Tom celle er greit: da er det en vaskeuke uten oppgave.
    let task = null;
    const kodeTekst = cellText(row, cols.task);
    if (kodeTekst) {
      task = koder.get(normName(kodeTekst)) || null;
      if (!task) { feil.push(`rad ${radnr}: ${q(kodeTekst)} er ingen kjent oppgavekode`); continue; }
      // En deaktivert oppgave finnes, men skal ikke settes opp på nytt. Da er
      // «ukjent kode» feil svar – admin må aktivere den eller velge en annen.
      if (task.active === false) {
        feil.push(`rad ${radnr}: oppgaven ${q(task.code)} er deaktivert – aktiver den igjen, eller bruk en annen kode`);
        continue;
      }
    }

    const uke = uker.get(week)
      || uker.set(week, { week, startDate: null, matched: [], unmatched: [], seen: new Set() }).get(week);

    if (datoTekst) {
      const iso = parseSheetDate(datoTekst);
      if (!iso) { feil.push(`rad ${radnr}: ${q(datoTekst)} er ikke en gyldig dato (bruk 17.08.2026 eller 2026-08-17)`); continue; }
      const mandag = weekStartOf(iso);
      // Datoen og ukenummeret må peke på samme uke – ellers er ett av dem feil.
      if (isoWeekNumber(iso).isoWeek !== week) {
        feil.push(`rad ${radnr}: ${q(datoTekst)} er i uke ${isoWeekNumber(iso).isoWeek}, ikke uke ${week}`); continue;
      }
      if (uke.startDate && uke.startDate !== mandag) {
        feil.push(`rad ${radnr}: uke ${week} har to ulike startdatoer (${uke.startDate} og ${mandag})`); continue;
      }
      uke.startDate = mandag;
    }

    // Navnene kobles mot elevlista lokalt. Ingen treff (eller flertydig) vises
    // som «ikke funnet» i forhåndsvisningen, akkurat som i OpenAI-veien –
    // det er en jobb for admin, ikke en feil i selve malen.
    const stud = resolveStudent(navn, index);
    if (!stud) { uke.unmatched.push(navn); continue; }

    // Oppgaven hører til ett internat. Står en elev fra et annet internat på
    // den, er koden nesten alltid en skrivefeil – da sier vi ifra i stedet for
    // å sette opp vask på feil hus. (Unntak legges inn manuelt i admin.)
    if (task && stud.dorm && task.dorm && normName(stud.dorm) !== normName(task.dorm)) {
      feil.push(`rad ${radnr}: ${q(stud.full_name)} bor på ${stud.dorm}, men ${q(task.code)} hører til ${task.dorm}`);
      continue;
    }

    // Nøkkelen er elev + oppgave: samme elev kan ha to ulike oppgaver samme uke,
    // men ikke den samme to ganger.
    const nokkel = `${stud.id}:${task?.id || 0}`;
    if (!uke.seen.has(nokkel)) {
      uke.seen.add(nokkel);
      uke.matched.push({
        id: stud.id,
        fullName: stud.full_name,
        taskId: task?.id || null,
        taskCode: task?.code || null,
        taskTitle: task?.title || null,
      });
    }
  }

  throwRowErrors(feil);
  const weeks = [...uker.values()]
    .map(({ week, startDate, matched, unmatched }) => ({
      week,
      weekStart: resolveWeekStart(week, startDate, null, today),
      matched,
      unmatched,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (!weeks.length) throw new Error('Fant ingen uker i arket.');
  return { year: null, weeks };
}
