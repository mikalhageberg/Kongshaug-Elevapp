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
  },

  andakt: {
    // "08:10" -> minutter etter midnatt
    deadlineMinutes: parseTimeToMinutes(process.env.ANDAKT_DEADLINE || '08:10'),
    qrTtlSeconds: Number(process.env.ANDAKT_QR_TTL_SECONDS ?? 45),
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
    fromName: process.env.MAIL_FROM_NAME || 'Kongshaug Brannvakt',
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

  // Sesjonens levetid
  sessionMaxAgeMs: 1000 * 60 * 60 * 12, // 12 timer
};

function parseTimeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const paths = {
  root: path.join(__dirname, '..'),
  data: path.join(__dirname, '..', 'data'),
  public: path.join(__dirname, '..', '..', 'public'),
};
