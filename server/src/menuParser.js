import OpenAI from 'openai';
import { pdf } from 'pdf-to-img';
import { config } from './config.js';

// Maks antall PDF-sider vi sender til modellen. En ukemeny er nesten alltid
// én side; grensen hindrer at et feilaktig stort dokument sprenger kostnaden.
const MAX_PAGES = 5;

// JSON-formatet modellen MÅ svare i (strict). Alle felt er påkrevd; det som
// kan mangle settes til null i stedet for å utelates.
const MENU_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    days: {
      type: 'array',
      description: 'Én rad per dag menyen dekker, i rekkefølge.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          day: { type: 'string', description: 'Ukedag, f.eks. «Mandag». Ta med dato hvis den står.' },
          dishes: {
            type: 'array',
            description: 'Rettene som serveres denne dagen, hver som egen streng.',
            items: { type: 'string' },
          },
          note: { type: ['string', 'null'], description: ' Evt. merknad for dagen, ellers null.' },
        },
        required: ['day', 'dishes', 'note'],
      },
    },
    note: { type: ['string', 'null'], description: 'Generell merknad for hele menyen (f.eks. allergener), ellers null.' },
    nightGuards: {
      type: 'array',
      description: 'Internatvakt: hvilken lærer/ansatt som har nattevakt på internatet hver kveld/natt. Tom liste hvis ikke oppgitt.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          day: { type: 'string', description: 'Ukedag/natt vakten gjelder, f.eks. «Mandag».' },
          name: { type: 'string', description: 'Navn på læreren/den ansatte som er internatvakt.' },
        },
        required: ['day', 'name'],
      },
    },
  },
  required: ['days', 'note', 'nightGuards'],
};

const SYSTEM_PROMPT = [
  'Du leser et bilde av et ukeoppslag ved en norsk internatskole.',
  'Oppslaget inneholder en middagsmeny og som regel en oversikt over internatvakt (hvilken lærer/ansatt som har nattevakt hver kveld).',
  'Hent ut hvilke retter som serveres hver dag, i riktig rekkefølge.',
  'Hent også ut internatvaktene per kveld/natt (dag + navn) hvis de står i oppslaget.',
  'Behold norsk tekst nøyaktig slik den står (æ, ø, å beholdes).',
  'Ikke dikt opp retter, dager eller vakter som ikke står i bildet.',
  'Hvis en dag mangler retter, la «dishes» være en tom liste. Hvis internatvakt ikke er oppgitt, la «nightGuards» være tom.',
].join(' ');

// Render en PDF-buffer til PNG-buffere (én per side, opp til MAX_PAGES).
export async function pdfToImages(buffer) {
  const images = [];
  // scale 2 gir skarp nok tekst til at modellen leser små retter.
  const doc = await pdf(buffer, { scale: 2 });
  for await (const page of doc) {
    images.push(page);
    if (images.length >= MAX_PAGES) break;
  }
  if (!images.length) throw new Error('PDF-en har ingen sider å lese.');
  return images;
}

// Tolk en meny-PDF til strukturert JSON. Kaster hvis OpenAI ikke er konfigurert
// eller kallet feiler – kalleren håndterer feilen og lagrer status.
export async function parseMenuPdf(buffer) {
  if (!config.openai.enabled) throw new Error('OpenAI er ikke konfigurert (mangler OPENAI_API_KEY).');

  const images = await pdfToImages(buffer);
  const client = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseUrl });

  const imageContent = images.map((img) => ({
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${img.toString('base64')}`, detail: 'high' },
  }));

  const completion = await client.chat.completions.create({
    model: config.openai.menuModel,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Her er ukeoppslaget. Hent ut middagsrettene per dag og internatvaktene per kveld.' },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'weekly_menu', strict: true, schema: MENU_SCHEMA },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Tomt svar fra modellen.');
  const menu = normalizeMenu(JSON.parse(raw));

  if (!menu.days.length) throw new Error('Fant ingen dager i menyen.');
  return menu;
}

// Rydder opp i et meny-objekt: trimmer tekst, fjerner tomme retter/dager.
// Brukes både på OpenAI-svaret og på admins manuelle redigeringer.
export function normalizeMenu(raw) {
  const days = (raw?.days || [])
    .map((d) => ({
      day: String(d?.day || '').trim(),
      dishes: (Array.isArray(d?.dishes) ? d.dishes : []).map((s) => String(s).trim()).filter(Boolean),
      note: d?.note ? String(d.note).trim() : null,
    }))
    .filter((d) => d.day || d.dishes.length);
  const note = raw?.note ? String(raw.note).trim() : null;
  const nightGuards = (Array.isArray(raw?.nightGuards) ? raw.nightGuards : [])
    .map((g) => ({ day: String(g?.day || '').trim(), name: String(g?.name || '').trim() }))
    .filter((g) => g.day || g.name);
  return { days, note, nightGuards };
}
