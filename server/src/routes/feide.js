// Feide / Dataporten innlogging via OpenID Connect (authorization code + PKCE).
//
// Denne modulen er komplett, men kan ikke tas i bruk før skolen har registrert
// tjenesten i Feide Kundeportal og fylt inn FEIDE_CLIENT_ID / FEIDE_CLIENT_SECRET
// i .env. Se FEIDE-SETUP.md. Uten konfigurasjon svarer rutene med en tydelig
// melding og «Logg inn med Feide» skjules i frontenden.
import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db.js';
import { config } from '../config.js';
import { issueSession } from '../auth.js';

const router = Router();

// Enkelt cache av discovery-dokumentet (endepunkt-URL-er).
let discovery = null;
async function getDiscovery() {
  if (discovery) return discovery;
  const res = await fetch(config.feide.discoveryUrl);
  if (!res.ok) throw new Error('Kunne ikke hente Feide-konfigurasjon');
  discovery = await res.json();
  return discovery;
}

function b64url(buf) { return buf.toString('base64url'); }

function requireEnabled(req, res, next) {
  if (!config.feide.enabled) {
    return res.status(503).json({ error: 'Feide-innlogging er ikke konfigurert ennå.' });
  }
  next();
}

// Steg 1: send brukeren til Feide.
router.get('/login', requireEnabled, async (req, res) => {
  try {
    const disc = await getDiscovery();
    const state = b64url(crypto.randomBytes(16));
    const nonce = b64url(crypto.randomBytes(16));
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

    // Lagre kortlevde verdier i signerte, httpOnly cookies til callback.
    const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: config.isProduction, maxAge: 10 * 60 * 1000 };
    res.cookie('feide_state', state, cookieOpts);
    res.cookie('feide_nonce', nonce, cookieOpts);
    res.cookie('feide_verifier', verifier, cookieOpts);

    const url = new URL(disc.authorization_endpoint);
    url.searchParams.set('client_id', config.feide.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', config.feide.redirectUri);
    url.searchParams.set('scope', 'openid profile email userid');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    res.redirect(url.toString());
  } catch (ex) {
    res.status(502).send('Feide er utilgjengelig akkurat nå. ' + ex.message);
  }
});

// Steg 2: Feide sender brukeren tilbake hit med en engangskode.
router.get('/callback', requireEnabled, async (req, res) => {
  const fail = (msg) => res.redirect('/app/?feide_error=' + encodeURIComponent(msg));
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.cookies?.feide_state) return fail('Ugyldig svar fra Feide');
    const verifier = req.cookies?.feide_verifier;
    const nonce = req.cookies?.feide_nonce;

    const disc = await getDiscovery();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: config.feide.redirectUri,
      client_id: config.feide.clientId,
      client_secret: config.feide.clientSecret,
      code_verifier: verifier || '',
    });
    const tokenRes = await fetch(disc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) return fail('Kunne ikke fullføre innlogging med Feide');
    const tokens = await tokenRes.json();

    const userinfoRes = await fetch(disc.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoRes.ok) return fail('Fikk ikke brukerinfo fra Feide');
    const info = await userinfoRes.json();

    // Rydd opp i engangs-cookies.
    for (const c of ['feide_state', 'feide_nonce', 'feide_verifier']) res.clearCookie(c);

    const user = resolveUser(info);
    if (!user) {
      return fail('Kontoen din finnes ikke i systemet ennå. Kontakt administrasjonen.');
    }
    // Koble Feide-id til kontoen første gang, og marker som feide-konto.
    if (!user.feide_id) {
      db.prepare("UPDATE users SET feide_id = ?, auth_provider = 'feide', must_change_password = 0 WHERE id = ?")
        .run(info.sub, user.id);
    }
    issueSession(res, user);
    res.redirect(user.role === 'admin' ? '/admin/' : '/app/');
  } catch (ex) {
    fail('Uventet feil under Feide-innlogging');
  }
});

// Finn den lokale kontoen som hører til Feide-brukeren.
// Ingen auto-oppretting: admin styrer hvem som finnes (jf. «ingen selvregistrering»).
function resolveUser(info) {
  // 1) Allerede koblet på Feide-id.
  const byFeide = db.prepare('SELECT * FROM users WHERE feide_id = ?').get(info.sub);
  if (byFeide) return byFeide;

  // 2) Match mot lokalt brukernavn via valgt claim (localpart før @).
  const claimVal = info[config.feide.matchClaim] || info.email || '';
  const localpart = String(claimVal).split('@')[0].toLowerCase();
  if (!localpart) return null;
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND active = 1').get(localpart) || null;
}

export default router;
