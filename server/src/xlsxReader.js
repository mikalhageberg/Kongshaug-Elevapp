// Minimal, avhengighetsfri leser for .xlsx (og .csv som fallback).
//
// .xlsx er en ZIP med XML-deler. Vi bruker Nodes innebygde zlib til å pakke ut
// (samme filosofi som den håndlagde xlsx-SKRIVEREN i frontend, bare motsatt vei).
// Vi leser sentralkatalogen for å finne delene, men beregner datastart fra hver
// dels EGEN lokale header (navn-/extra-lengdene der er ulike sentralkatalogens).
// Vi trenger bare et rutenett med tekst – tall beholdes som de står, datoer og
// stiler bryr vi oss ikke om (kjøkkentjeneste = navn + ukenummer).

import zlib from 'node:zlib';

const MAX_INFLATED = 20 * 1024 * 1024; // vern mot zip-bombe per del

// ── ZIP ──────────────────────────────────────────────────────
// Finn End Of Central Directory (0x06054b50), bakfra.
function findEOCD(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('Ugyldig Excel-fil (fant ikke ZIP-katalogen).');
}

// Les alle entries i sentralkatalogen: { name -> { offset, method, compSize } }.
function readCentralDirectory(buf) {
  const eocd = findEOCD(buf);
  let ptr = buf.readUInt32LE(eocd + 16); // start på sentralkatalogen
  const count = buf.readUInt16LE(eocd + 10);
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    entries[name] = { method, compSize, localOffset };
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Pakk ut én del til en tekststreng (utf8). Datastart regnes fra den LOKALE
// headeren (0x04034b50) sine egne lengder.
function readEntry(buf, entry) {
  if (!entry) return null;
  const lo = entry.localOffset;
  if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('Ødelagt ZIP-del.');
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const comp = buf.subarray(start, start + entry.compSize);
  let out;
  if (entry.method === 0) out = comp;                       // lagret (uncompressed)
  else if (entry.method === 8) out = zlib.inflateRawSync(comp, { maxOutputLength: MAX_INFLATED }); // deflate
  else throw new Error(`ZIP-komprimering ${entry.method} støttes ikke.`);
  if (out.length > MAX_INFLATED) throw new Error('Excel-delen er for stor.');
  return out.toString('utf8');
}

// ── XML-hjelpere ─────────────────────────────────────────────
function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Kolonnebokstav(er) i en celle-ref (f.eks. "AB12") -> 0-basert kolonneindeks.
function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function rowIndex(ref) {
  const m = /(\d+)$/.exec(ref || '');
  return m ? parseInt(m[1], 10) - 1 : 0;
}

// sharedStrings.xml -> array av strenger. En <si> kan ha flere <t>-løp (rik
// tekst) som skal slås sammen.
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const runs = m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
    const text = runs.map((r) => decodeEntities(r.replace(/<t[^>]*>/, '').replace(/<\/t>/, ''))).join('');
    out.push(text);
  }
  return out;
}

// Ett regneark-XML -> string[][]. Bygger ut fra celle-referansen r, så glisne
// rader/kolonner (hull i r=) og selvlukkende <c/> håndteres.
function parseSheet(xml, shared) {
  const rows = [];
  if (!xml) return rows;
  const rowRe = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const rIdx = parseInt(rm[1], 10) - 1;
    const row = [];
    const cellRe = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const attrs = cm[1];
      const inner = cm[3] || '';
      const refM = /\br="([A-Z]+\d+)"/.exec(attrs);
      const c = refM ? colIndex(refM[1]) : row.length;
      const t = (/\bt="([^"]+)"/.exec(attrs) || [])[1];
      let val = '';
      if (t === 'inlineStr') {
        const runs = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        val = runs.map((r) => decodeEntities(r.replace(/<t[^>]*>/, '').replace(/<\/t>/, ''))).join('');
      } else {
        const vM = /<v>([\s\S]*?)<\/v>/.exec(inner);
        const raw = vM ? vM[1] : '';
        if (t === 's') val = shared[parseInt(raw, 10)] ?? '';
        else if (t === 'str') val = decodeEntities(raw);
        else val = decodeEntities(raw); // tall/bool beholdes som tekst
      }
      row[c] = val;
    }
    rows[rIdx] = row;
  }
  // Fyll hull med tomme strenger så nedstrøms-kode slipper undefined.
  return rows.map((r) => Array.from({ length: r ? r.length : 0 }, (_, i) => (r && r[i] != null ? r[i] : '')));
}

// Finn stien til første regneark via workbook + rels (ikke hardkod sheet1.xml).
function firstSheetPath(entries, workbookXml, relsXml) {
  if (workbookXml && relsXml) {
    const firstSheet = /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbookXml);
    if (firstSheet) {
      const rid = firstSheet[1];
      const rel = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(relsXml);
      if (rel) {
        let target = rel[1].replace(/^\//, '');
        if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\.\//, '');
        if (entries[target]) return target;
      }
    }
  }
  // Fallback: første worksheet-del i alfabetisk rekkefølge.
  const names = Object.keys(entries).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  return names[0] || 'xl/worksheets/sheet1.xml';
}

// ── CSV-fallback ─────────────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── Offentlig API ────────────────────────────────────────────
// Les et opplastet regneark (.xlsx eller .csv) til et rutenett med tekst.
export function readXlsxGrid(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Tom fil.');

  // ZIP? (xlsx) — magiske bytes 'PK\x03\x04'
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    const entries = readCentralDirectory(buffer);
    const shared = parseSharedStrings(readEntry(buffer, entries['xl/sharedStrings.xml']));
    const workbookXml = readEntry(buffer, entries['xl/workbook.xml']);
    const relsXml = readEntry(buffer, entries['xl/_rels/workbook.xml.rels']);
    const sheetPath = firstSheetPath(entries, workbookXml, relsXml);
    const sheetXml = readEntry(buffer, entries[sheetPath]);
    if (!sheetXml) throw new Error('Fant ingen regneark-fane i Excel-filen.');
    return { rows: parseSheet(sheetXml, shared) };
  }

  // Ellers: prøv CSV (tekst). Null-byte tidlig = binærfil vi ikke kan lese.
  if (buffer.subarray(0, 512).includes(0)) throw new Error('Ukjent filformat. Last opp en .xlsx- eller .csv-fil.');
  return { rows: parseCsv(buffer.toString('utf8')) };
}
