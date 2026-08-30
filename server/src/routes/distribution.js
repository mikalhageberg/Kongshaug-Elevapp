import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, '..', 'views', 'distribusjon.html');

// Malen leses én gang ved oppstart – den endrer seg ikke mens serveren kjører.
const template = fs.readFileSync(templatePath, 'utf8');

const APPLE_LOGO = '<svg viewBox="0 0 24 24" fill="#000" aria-hidden="true"><path d="M16.7 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.6 2.1-1.5 2.6-.4 6.5 1.1 8.7.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4-.1 0-2.2-.9-2.2-3.3zM14.5 6.2c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 2-.5 2.6-1.2z"/></svg>';

// Play-ikonet: den firefargede trekanten, tegnet som fire flater som møtes i
// midtpunktet – blå til venstre, grønn over, rød under og gul ytterst.
const PLAY_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path fill="#00a0ff" d="M3 2 13 12 3 22z"/>'
  + '<path fill="#00e676" d="M3 2 17.2 9.89 13 12z"/>'
  + '<path fill="#ff3a44" d="M3 22 17.2 14.11 13 12z"/>'
  + '<path fill="#ffce00" d="M13 12 17.2 9.89 21 12 17.2 14.11z"/>'
  + '</svg>';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function storeButton(url, logo, over, name) {
  return `<a class="store" href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="${over} ${name}">`
    + logo
    + `<span class="store-text"><small>${over}</small><b>${name}</b></span></a>`;
}

// Setter butikken telefonen faktisk kan bruke øverst. Begge vises uansett –
// noen åpner siden på PC for å sende den videre.
function iosFirst(userAgent) {
  const ua = String(userAgent || '');
  if (/Android/i.test(ua)) return false;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return true;
}

function renderStores(userAgent) {
  const { appStore, playStore } = config.stores;
  if (!appStore && !playStore) {
    return '<div class="notice">Appen er ikke lagt ut i butikkene ennå. '
      + 'Bruk appen i nettleseren så lenge – den har det samme innholdet.</div>';
  }
  const apple = appStore ? storeButton(appStore, APPLE_LOGO, 'Last ned på', 'App Store') : '';
  const play = playStore ? storeButton(playStore, PLAY_LOGO, 'Last ned på', 'Google Play') : '';
  const buttons = iosFirst(userAgent) ? apple + play : play + apple;
  return `<div class="stores">${buttons}</div>`;
}

const router = Router();

// Enkel landingsside elevene sendes til (lenke eller QR-kode) for å laste ned
// appen. Butikklenkene settes med APP_STORE_URL og PLAY_STORE_URL.
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(template.replace('{{STORES}}', renderStores(req.get('user-agent'))));
});

export default router;
