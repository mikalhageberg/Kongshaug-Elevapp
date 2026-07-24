import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Last hemmeligheter fra server/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Mangler miljøvariabel «${name}». Kopier server/.env.example til server/.env og fyll den ut.`
    );
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  isProduction: process.env.NODE_ENV === 'production',
  jwtSecret: requireEnv('JWT_SECRET'),

  school: {
    lat: Number(process.env.SCHOOL_LAT ?? 60.18023),
    lng: Number(process.env.SCHOOL_LNG ?? 5.42007),
    radiusMeters: Number(process.env.SCHOOL_RADIUS_METERS ?? 200),
    // Klokkeslett admin skriver inn (e-posttidspunkter) er norsk tid. Serveren
    // kjører i UTC i drift (node:22-slim setter ingen TZ), så tidssonen må sies
    // eksplisitt – ellers sendes e-postene to timer feil om sommeren.
    timeZone: process.env.SCHOOL_TIMEZONE || 'Europe/Oslo',
  },

  andakt: {
    // "08:10" -> minutter etter midnatt
    deadlineMinutes: parseTimeToMinutes(process.env.ANDAKT_DEADLINE || '08:10'),
    qrTtlSeconds: Number(process.env.ANDAKT_QR_TTL_SECONDS ?? 30),
  },

  // OpenAI: leser ukemeny-PDF-er og gjør dem om til strukturert tekst i appen.
  // Uten OPENAI_API_KEY hoppes tolkningen over – PDF-en vises fortsatt som før.
  openai: {
    get enabled() { return !!process.env.OPENAI_API_KEY; },
    apiKey: process.env.OPENAI_API_KEY || '',
    // gpt-4.1-mini: billig, rask, støtter bilde-input og strukturert JSON.
    menuModel: process.env.OPENAI_MENU_MODEL || 'gpt-4.1-mini',
    // Valgfri: peker klienten mot en proxy/Azure-endepunkt. Tom = OpenAIs standard.
    baseUrl: process.env.OPENAI_BASE_URL || undefined,
  },

  // E-post via Brevo. brevoApiKey må settes i .env for at utsending skal virke.
  mail: {
    get enabled() { return !!(process.env.BREVO_API_KEY || process.env.MAIL_API_KEY); },
    brevoApiKey: process.env.BREVO_API_KEY || process.env.MAIL_API_KEY || '',
    from: process.env.MAIL_FROM || '',
    fromName: process.env.MAIL_FROM_NAME || 'Kongshaug Elevapp',
  },

  // Feide / Dataporten (OpenID Connect). Aktiveres først når skolen har registrert
  // tjenesten og fylt inn client-id/secret. Tom id = «Logg inn med Feide» skjules.
  feide: {
    get enabled() { return !!(process.env.FEIDE_CLIENT_ID && process.env.FEIDE_CLIENT_SECRET); },
    clientId: process.env.FEIDE_CLIENT_ID || '',
    clientSecret: process.env.FEIDE_CLIENT_SECRET || '',
    redirectUri: process.env.FEIDE_REDIRECT_URI || 'http://localhost:3000/api/auth/feide/callback',
    discoveryUrl: process.env.FEIDE_DISCOVERY_URL || 'https://auth.dataporten.no/.well-known/openid-configuration',
    // Hvilket Feide-claim som kobles mot lokalt brukernavn (localpart brukes).
    // 'email' passer når brukernavn = delen før @ i skole-e-posten.
    matchClaim: process.env.FEIDE_MATCH_CLAIM || 'email',
  },

  // Sesjonens levetid i nettleseren (elevapp + admin). Kort, fordi en nettleser
  // ikke kan låses bak Face ID – en åpen maskin gir da full tilgang.
  sessionMaxAgeMs: 1000 * 60 * 60 * 12, // 12 timer

  // Mobilappen bruker Bearer-token og er låst bak Face ID / kode ved hver
  // åpning, så den kan ha lang sesjon uten at eleven må skrive passord ofte.
  // Gjelder KUN native app – aldri nettleser eller admin.
  nativeSessionDays: Number(process.env.NATIVE_SESSION_DAYS ?? 90),

  // App Store/Play Store-reviewere kan ikke fysisk være på skolen, så de kan
  // ikke bestå GPS-sjekken (brannliste/andakt) eller skanne en ekte QR-kode
  // (andakt). Med APPLE_REVIEW_USERNAME satt, hopper KUN den ene, eksakte
  // kontoen over disse sjekkene – lag en dedikert testkonto til dette, aldri
  // en ekte elevs konto. Tom (standard) = ingen unntak for noen.
  // ⚠ Fjern miljøvariabelen igjen når appen er godkjent – dette er et reelt,
  // om enn smalt avgrenset, unntak fra brannsikkerhets-verifiseringen.
  appReview: {
    // Brukernavn lagres alltid små bokstaver (users.js normaliserer ved
    // opprettelse), så lowercase her også – ellers matcher aldri f.eks.
    // «Apple.Reviewer» i miljøvariabelen mot den faktiske, lagrede kontoen.
    bypassUsername: (process.env.APPLE_REVIEW_USERNAME || '').trim().toLowerCase(),
  },
};

function parseTimeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const paths = {
  root: path.join(__dirname, '..'),
  // Datamappa (SQLite-db + opplastede meny-PDF-er). Kan overstyres med DATA_DIR,
  // slik at et persistent volum kan monteres på en enkel topp-nivå-sti (f.eks.
  // «/data») i stedet for en nøstet sti inni koden («server/data»). Lokalt/uten
  // DATA_DIR beholdes den gamle plasseringen.
  data: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data'),
  public: path.join(__dirname, '..', '..', 'public'),
};
