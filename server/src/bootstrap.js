// Oppretter den aller første admin-kontoen automatisk ved oppstart, hvis
// databasen ennå ikke har noen admin. Trygt å kalle hver oppstart: gjør
// ingenting så snart én admin finnes. Løser «tom database etter første
// utrulling» uten at man trenger shell-tilgang til serveren.
import db from './db.js';
import { hashPassword } from './auth.js';

export async function ensureBootstrapAdmin() {
  const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  if (adminCount > 0) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('\n  ⚠  Ingen admin-konto finnes ennå, og ADMIN_USERNAME/ADMIN_PASSWORD er ikke satt.');
    console.warn('  Sett disse miljøvariablene og start på nytt for å opprette første admin automatisk');
    console.warn('  (eller kjør «npm run seed» mot databasen for demo-data).\n');
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (existing) {
    console.warn(`\n  ⚠  ADMIN_USERNAME «${username}» finnes allerede som bruker, men uten admin-rolle. Gjør ingenting.\n`);
    return;
  }

  const hash = await hashPassword(password);
  db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, 'admin')`
  ).run(username, hash, process.env.ADMIN_FULL_NAME || username);
  console.log(`\n  ✓ Opprettet første admin-konto: «${username}» (fra ADMIN_USERNAME/ADMIN_PASSWORD).\n`);
}
