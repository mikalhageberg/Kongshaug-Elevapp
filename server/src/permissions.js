// Superbrukere: administratorer som i tillegg kan endre innstillingene og
// opprette eller slette brukere. Vanlige administratorer driver de daglige
// sidene – brannliste, andakt, gjester, kjøkken, internat, øvekonkurransen –
// og kan rette opplysninger på elever som allerede finnes.
//
// Flagget slås opp i databasen ved hvert kall, ikke i tokenet. En sesjon varer
// opptil 90 dager i mobilappen; tas rettigheten fra noen, skal det gjelde med
// én gang og ikke ved neste innlogging.

import db from './db.js';

// Finnes det noen superbruker i det hele tatt?
export function superadminCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND superadmin = 1 AND active = 1").get().n;
}

// Uten en eneste superbruker regnes ALLE administratorer som superbrukere.
//
// Dette er bevisst. Alternativet – å låse alt til ingen har tilgang – ville
// stengt skolen ute av sine egne innstillinger og brukerlister, uten noen vei
// inn igjen. Så snart den første superbrukeren er utpekt, slår begrensningen
// inn av seg selv. Tilstanden varsles ved oppstart og vises i admin.
export function isSuperAdmin(userId) {
  if (superadminCount() === 0) return true;
  return !!db
    .prepare("SELECT 1 FROM users WHERE id = ? AND role = 'admin' AND superadmin = 1 AND active = 1")
    .get(userId);
}

// Middleware. Brukes etter requireAuth + requireAdmin.
export function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.auth?.sub)) {
    return res.status(403).json({ error: 'Krever superbruker-tilgang' });
  }
  next();
}

// Er denne brukeren en administrator? Avgjør om PATCH på en konto krever
// superbruker: å endre passordet til en admin er å overta kontoen hennes.
export function isAdminAccount(userId) {
  return !!db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'admin'").get(userId);
}

// Den siste superbrukeren kan ikke fjernes – verken ved å ta flagget, slette
// kontoen eller deaktivere den. Uten denne sperren kan systemet havne i
// «ingen superbrukere», der alle administratorer plutselig har full tilgang.
export function erSisteSuperbruker(userId) {
  if (superadminCount() > 1) return false;
  return !!db
    .prepare("SELECT 1 FROM users WHERE id = ? AND role = 'admin' AND superadmin = 1 AND active = 1")
    .get(userId);
}

// Oppstart: gjør de navngitte kontoene til superbrukere. Ment som en
// midlertidig vei inn – sett SUPERADMIN_USERNAMES i miljøet, start serveren,
// og fjern variabelen igjen når de første superbrukerne er på plass.
export function bootstrapSuperadmins() {
  const navn = (process.env.SUPERADMIN_USERNAMES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (navn.length) {
    const ph = navn.map(() => '?').join(',');
    const info = db
      .prepare(`UPDATE users SET superadmin = 1 WHERE role = 'admin' AND lower(username) IN (${ph}) AND superadmin = 0`)
      .run(...navn);
    const funnet = db
      .prepare(`SELECT username FROM users WHERE role = 'admin' AND lower(username) IN (${ph})`)
      .all(...navn)
      .map((r) => r.username);
    const ukjente = navn.filter((n) => !funnet.some((f) => f.toLowerCase() === n));

    if (info.changes) console.log(`  ★  SUPERADMIN_USERNAMES: ga superbruker til ${info.changes} konto(er) · ${funnet.join(', ')}`);
    else if (funnet.length) console.log(`  ★  SUPERADMIN_USERNAMES: ${funnet.join(', ')} var superbruker fra før`);
    if (ukjente.length) console.warn(`  ⚠  SUPERADMIN_USERNAMES: fant ingen administrator med brukernavn ${ukjente.join(', ')}`);
  }

  const n = superadminCount();
  if (n === 0) {
    console.warn('\n  ⚠  Ingen superbrukere er utpekt ennå. Inntil videre har ALLE administratorer full tilgang');
    console.warn('     til innstillinger og brukeradministrasjon. Sett SUPERADMIN_USERNAMES i miljøet, eller kryss');
    console.warn('     av «Superbruker» på en administrator i admin, for at begrensningen skal tre i kraft.\n');
  } else {
    console.log(`  ★  Superbrukere: ${n}`);
  }
}
