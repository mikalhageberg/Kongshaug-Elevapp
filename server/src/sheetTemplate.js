// Felles verktøy for regnearkene som følger skolens faste Excel-maler.
//
// En mal har én overskriftsrad øverst med faste kolonnenavn, og én rad per
// person under. Følger arket malen, vet vi hvilken kolonne som er hva – da
// tolkes hele arket lokalt på skolens server, uten OpenAI.
//
// Malen gjetter ALDRI: stemmer ikke overskriftene, sier vi ifra med hva som er
// galt og hvor, slik at arket kan rettes. Brukes av studentParser.js (elevliste)
// og dutyParser.js (kjøkkentjeneste/internatvask).

// Navnenormalisering: samme idé som slugName, men behold ordmellomrom.
export function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const q = (s) => `«${s}»`;

// Innholdet i én celle som trimmet tekst. Kolonner som ikke finnes gir ''.
export const cellText = (row, i) => (i == null ? '' : String((row || [])[i] ?? '').trim());

export const isBlankRow = (row) => !(row || []).some((c) => String(c || '').trim());

// Leser overskriftsraden i et ark som skal følge en mal.
//   headers  – { felt: 'Overskrift' }, f.eks. { fullName: 'Navn' }
//   required – feltene som MÅ være med
// Returnerer { headerRow, cols } der cols er felt → 0-basert kolonneindeks.
export function readTemplateHeader(rows, headers, required = []) {
  const headerRow = (rows || []).findIndex((r) => !isBlankRow(r));
  if (headerRow < 0) throw new Error('Regnearket er tomt.');

  const cols = {};
  const ukjente = [], dobble = [];
  (rows[headerRow] || []).forEach((cell, i) => {
    const text = String(cell || '').trim();
    if (!text) return;
    const felt = Object.keys(headers).find((f) => normName(headers[f]) === normName(text));
    if (!felt) ukjente.push(text);
    else if (cols[felt] != null) dobble.push(headers[felt]);
    else cols[felt] = i;
  });

  const hvor = `Overskriftsraden er rad ${headerRow + 1}.`;
  const mal = `Malen bruker nøyaktig disse overskriftene: ${Object.values(headers).join(', ')}.`
    + ' Følger ikke arket malen, kan du velge «Tolk arket med OpenAI» i stedet.';
  if (ukjente.length) throw new Error(`Ukjent kolonneoverskrift: ${ukjente.map(q).join(', ')}. ${mal} ${hvor}`);
  if (dobble.length) throw new Error(`Kolonnen ${dobble.map(q).join(' og ')} står flere ganger. ${hvor}`);
  const mangler = required.filter((f) => cols[f] == null);
  if (mangler.length) {
    throw new Error(`Fant ingen ${mangler.map((f) => q(headers[f])).join('- og ')}-kolonne. ${mal} ${hvor}`);
  }
  return { headerRow, cols };
}

// Samler feil fra radene og kaster én melding med radnummer, slik de står i
// Excel. Vi lister de første – resten telles, så meldingen holder seg lesbar.
export function throwRowErrors(feil, maks = 8) {
  if (!feil.length) return;
  const vis = feil.slice(0, maks).join('; ');
  const resten = feil.length > maks ? ` (og ${feil.length - maks} til)` : '';
  throw new Error(`Arket følger ikke malen – ${vis}${resten}. Rett arket og prøv igjen.`);
}
