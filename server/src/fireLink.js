// Signert nedlastingslenke til brannlisten.
//
// Lenken ligger i e-posten til ansvarlig lærer, og må virke på en iPad som
// ikke er logget inn – ved brann skal ingen måtte finne fram et passord.
// Derfor signeres den i stedet for å kreve innlogging: natten og utløpstiden
// er skrevet inn i URL-en, og en HMAC over de to gjør at hverken dato eller
// frist kan endres i etterkant.
//
// PDF-en inneholder de samme opplysningene som allerede ligger vedlagt i den
// samme e-posten, så lenken utvider ikke hvem som kan se listen. Den utløper
// likevel, slik at en videresendt e-post ikke gir varig tilgang.

import crypto from 'node:crypto';
import { config } from './config.js';

// Hvor lenge lenken virker. Lang nok til at gårsdagens e-post fortsatt duger
// hvis noen leter, kort nok til at en gammel e-post ikke er en nøkkel.
export const LINK_TTL_HOURS = 72;

function sign(nightDate, exp) {
  return crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`brannliste|${nightDate}|${exp}`)
    .digest('base64url');
}

export function fireListLink(nightDate, now = Date.now()) {
  const exp = Math.floor(now / 1000) + LINK_TTL_HOURS * 3600;
  const sig = sign(nightDate, exp);
  const q = new URLSearchParams({ natt: nightDate, exp: String(exp), sig });
  return `${config.publicUrl}/api/firelist/pdf?${q}`;
}

// Gyldig signatur OG ikke utløpt. Sammenligningen er tidskonstant, slik at et
// forsøk på å gjette signaturen ikke kan måles byte for byte.
export function verifyFireListLink(nightDate, exp, sig, now = Date.now()) {
  if (!nightDate || !exp || !sig) return false;
  const utløp = Number(exp);
  if (!Number.isFinite(utløp) || utløp * 1000 < now) return false;
  const forventet = Buffer.from(sign(nightDate, utløp));
  const gitt = Buffer.from(String(sig));
  return forventet.length === gitt.length && crypto.timingSafeEqual(forventet, gitt);
}
