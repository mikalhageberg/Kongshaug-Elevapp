import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config, paths } from './config.js';

import authRoutes from './routes/auth.js';
import feideRoutes from './routes/feide.js';
import userRoutes from './routes/users.js';
import fireRoutes from './routes/firelist.js';
import andaktRoutes from './routes/andakt.js';
import geoRoutes from './routes/geo.js';
import settingsRoutes from './routes/settings.js';
import historyRoutes from './routes/history.js';
import dinnerRoutes from './routes/dinner.js';
import menuRoutes from './routes/menus.js';
import { getSettings } from './settings.js';
import { sendFireListEmail, sendKitchenEmail } from './mail.js';
import { ensureBootstrapAdmin } from './bootstrap.js';

await ensureBootstrapAdmin();

const app = express();
app.disable('x-powered-by');
// Hele systemet bruker UTF-8. express.json og res.json setter allerede
// «charset=utf-8», og databasen (SQLite) lagrer tekst som UTF-8.
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Enkel sikkerhetsheader-baseline.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// ── API ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auth/feide', feideRoutes);
app.use('/api/users', userRoutes);

// Forteller frontenden hvilke innloggingsmåter som er tilgjengelige.
app.get('/api/config', (req, res) => res.json({ feide: config.feide.enabled }));
app.use('/api/firelist', fireRoutes);
app.use('/api/andakt', andaktRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/dinner', dinnerRoutes);
app.use('/api/menus', menuRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ── Statiske frontends ───────────────────────────────────────
// Sett eksplisitt charset=utf-8 på alle tekstbaserte filer, slik at norske
// tegn (æ ø å) alltid tolkes riktig i nettleseren.
const UTF8_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};
app.use(express.static(paths.public, {
  setHeaders: (res, filePath) => {
    const type = UTF8_TYPES[path.extname(filePath).toLowerCase()];
    if (type) res.setHeader('Content-Type', type);
  },
}));

function sendHtmlUtf8(res, file) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(file);
}

// Elevapp (PWA) og admin er egne mapper med hash-ruting.
app.get('/', (req, res) => res.redirect('/app/'));
app.get('/app/*', (req, res) => sendHtmlUtf8(res, path.join(paths.public, 'app', 'index.html')));
app.get('/admin/*', (req, res) => sendHtmlUtf8(res, path.join(paths.public, 'admin', 'index.html')));

app.listen(config.port, () => {
  console.log(`\n  Kongshaug Brannvakt kjører:`);
  console.log(`  → Elevapp:  http://localhost:${config.port}/app/`);
  console.log(`  → Admin:    http://localhost:${config.port}/admin/`);
  console.log(`  (skolens område: ${config.school.lat}, ${config.school.lng} · radius ${config.school.radiusMeters} m)\n`);
  startEmailSchedulers();
});

// Sjekker hvert minutt om klokka er lik et innstilt sendetidspunkt, og sender da
// den aktuelle e-posten – én gang per dag. Robust mot at innstillinger endres.
function startEmailSchedulers() {
  let lastFire = null, lastKitchen = null;
  setInterval(async () => {
    let s;
    try { s = getSettings(); } catch { return; }
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateKey = now.toISOString().slice(0, 10);

    if (s.fireEmailEnabled && s.fireEmailRecipient && hhmm === s.fireEmailTime && lastFire !== dateKey) {
      lastFire = dateKey;
      try { const r = await sendFireListEmail(); console.log(`  ✉  Brannliste sendt til ${r.recipient} (natt ${r.nightDate})`); }
      catch (ex) { console.error('  ✉  Brannliste-epost feilet:', ex.message); }
    }

    if (s.kitchenEmailEnabled && s.kitchenEmailRecipient && hhmm === s.kitchenEmailTime && lastKitchen !== dateKey) {
      lastKitchen = dateKey;
      try { const r = await sendKitchenEmail(); console.log(`  ✉  Middagsoversikt sendt til ${r.recipient} (${r.eating} spiser)`); }
      catch (ex) { console.error('  ✉  Middags-epost feilet:', ex.message); }
    }
  }, 60 * 1000);
}
