// Fyller databasen med en admin-konto og noen testelever.
// Kjør:  npm run seed
import db from './db.js';
import { hashPassword } from './auth.js';

const students = [
  ['Ingrid Sæther Lund', 'ingrid.saether', '2MDD', 'Fjordly', '9'],
  ['Mathias Berg Nilsen', 'mathias.nilsen', '1MDD', 'Fjordly', '12'],
  ['Sofie Aakre', 'sofie.aakre', '3MDD', 'Bjørkely', '7'],
  ['Jonas Vik Hansen', 'jonas.hansen', '2MDD', 'Solbakken', '21'],
  ['Emma Lie Dahl', 'emma.dahl', '1MDD', 'Fjordly', '4'],
  ['Nora Fjeld Berge', 'nora.berge', '2MDD', 'Bjørkely', '11'],
  ['Live Haugen', 'live.haugen', '3MDD', 'Fjordly', '6'],
  ['Aksel Rønning', 'aksel.ronning', '1MDD', 'Bjørkely', '3'],
  ['Maja Tveit', 'maja.tveit', '2MDD', 'Bjørkely', '15'],
  ['Oliver Strand', 'oliver.strand', '3MDD', 'Nystova', '15'],
  ['Thea Solheim', 'thea.solheim', '1MDD', 'Solbakken', '8'],
  ['Kasper Ruud Eide', 'kasper.eide', '1MDD', 'Solbakken', '14'],
];

async function main() {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (username, password_hash, full_name, role, class_name, dorm, room)
     VALUES (@username, @hash, @fullName, @role, @className, @dorm, @room)`
  );

  // Admin
  const adminHash = await hashPassword('admin1234');
  insert.run({
    username: 'admin',
    hash: adminHash,
    fullName: 'Marit Toften',
    role: 'admin',
    className: null,
    dorm: null,
    room: null,
  });

  // Elever – alle får passord "elev1234" i seed (endres av admin i praksis).
  const elevHash = await hashPassword('elev1234');
  for (const [fullName, username, className, dorm, room] of students) {
    insert.run({ username, hash: elevHash, fullName, role: 'student', className, dorm, room });
  }

  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  console.log(`\n  Seed ferdig. ${n} brukere i databasen.`);
  console.log('  Admin:  brukernavn "admin"  / passord "admin1234"');
  console.log('  Elev:   brukernavn "ingrid.saether" / passord "elev1234"');
  console.log('  ⚠  Bytt disse passordene før reell bruk.\n');
}

main();
