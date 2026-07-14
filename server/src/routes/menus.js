import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { paths, config } from '../config.js';
import { parseMenuPdf, normalizeMenu } from '../menuParser.js';

const menusDir = path.join(paths.data, 'menus');
fs.mkdirSync(menusDir, { recursive: true });

const router = Router();
router.use(requireAuth);

// Leser meny-PDF-en fra disk og tolker den via OpenAI, og lagrer resultatet
// på meny-raden. Kjøres i bakgrunnen (ikke await-et av opplastingen) slik at
// admin får raskt svar. Feil lagres som status 'error' – PDF-en virker uansett.
async function parseAndStore(id) {
  const m = db.prepare('SELECT filename FROM menus WHERE id = ?').get(id);
  if (!m) return;
  db.prepare("UPDATE menus SET parse_status = 'pending', parse_error = NULL WHERE id = ?").run(id);
  try {
    const buf = fs.readFileSync(path.join(menusDir, m.filename));
    const menu = await parseMenuPdf(buf);
    db.prepare("UPDATE menus SET parsed_json = ?, parse_status = 'ok', parse_error = NULL, parsed_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(menu), id);
  } catch (err) {
    console.error(`Meny-tolkning feilet (id ${id}):`, err.message);
    db.prepare("UPDATE menus SET parse_status = 'error', parse_error = ? WHERE id = ?")
      .run(String(err.message || 'Ukjent feil').slice(0, 500), id);
  }
}

// ── Liste over menyer (alle innloggede: elever + ansatte) ────
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, title, filename, size, uploaded_at, parse_status FROM menus ORDER BY uploaded_at DESC, id DESC').all();
  res.json({
    menus: rows.map((r) => ({
      id: r.id, title: r.title, size: r.size, uploadedAt: r.uploaded_at, parseStatus: r.parse_status,
      hasFile: !!r.filename,
    })),
  });
});

// ── Hent tolket meny som strukturert JSON ────────────────────
router.get('/:id/parsed', (req, res) => {
  const m = db.prepare('SELECT parse_status, parsed_json, parse_error, parsed_at FROM menus WHERE id = ?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Fant ikke menyen' });
  res.json({
    status: m.parse_status || 'none',
    menu: m.parsed_json ? JSON.parse(m.parsed_json) : null,
    error: m.parse_error || null,
    parsedAt: m.parsed_at || null,
  });
});

// ── Lagre admin-redigert meny (overstyrer OpenAI-tolkningen) ─
router.put('/:id/parsed', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT id FROM menus WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Fant ikke menyen' });
  const menu = normalizeMenu(req.body?.menu ?? req.body);
  if (!menu.days.length) return res.status(400).json({ error: 'Menyen må ha minst én dag med innhold.' });
  db.prepare("UPDATE menus SET parsed_json = ?, parse_status = 'ok', parse_error = NULL, parsed_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(menu), id);
  res.json({ status: 'ok', menu });
});

// ── Opprett en meny manuelt (admin) – ingen PDF, kun tittel ──
// Admin fyller ut middag/internatvakt direkte i redigeringsskjemaet etterpå.
router.post('/manual', requireAdmin, (req, res) => {
  const title = (String(req.body?.title || '').trim() || 'Meny').slice(0, 100);
  const emptyMenu = { days: [], note: null, nightGuards: [] };
  const info = db.prepare(
    "INSERT INTO menus (title, filename, size, parse_status, parsed_json, parsed_at) VALUES (?, '', 0, 'ok', ?, datetime('now'))"
  ).run(title, JSON.stringify(emptyMenu));
  res.status(201).json({ id: info.lastInsertRowid, title, hasFile: false, parseStatus: 'ok', menu: emptyMenu });
});

// ── Vis en meny-PDF (inline i nettleser/PDF-visning) ─────────
router.get('/:id/file', (req, res) => {
  const m = db.prepare('SELECT * FROM menus WHERE id = ?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Fant ikke menyen' });
  if (!m.filename) return res.status(404).json({ error: 'Denne oppføringen har ingen PDF – lagt til manuelt.' });
  const fp = path.join(menusDir, m.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Filen mangler' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="meny-${m.id}.pdf"`);
  fs.createReadStream(fp).pipe(res);
});

// ── Last opp en ny meny (admin) – rå PDF-body ────────────────
router.post('/', requireAdmin, express.raw({ type: 'application/pdf', limit: '20mb' }), (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).json({ error: 'Ingen fil mottatt. Velg en PDF.' });
  if (buf.slice(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: 'Filen er ikke en gyldig PDF.' });

  const title = (String(req.query.title || '').trim() || 'Meny').slice(0, 100);
  // Uten OpenAI-nøkkel hopper vi over tolkning; PDF-en vises som før.
  const initialStatus = config.openai.enabled ? 'pending' : 'none';
  const info = db.prepare('INSERT INTO menus (title, filename, size, parse_status) VALUES (?, ?, ?, ?)')
    .run(title, 'pending', buf.length, initialStatus);
  const filename = `${info.lastInsertRowid}.pdf`;
  fs.writeFileSync(path.join(menusDir, filename), buf);
  db.prepare('UPDATE menus SET filename = ? WHERE id = ?').run(filename, info.lastInsertRowid);

  // Tolk i bakgrunnen – ikke la admin vente på OpenAI-kallet.
  if (config.openai.enabled) parseAndStore(info.lastInsertRowid);

  res.status(201).json({ id: info.lastInsertRowid, title, size: buf.length, parseStatus: initialStatus });
});

// ── Tolk en meny på nytt (admin) ─────────────────────────────
router.post('/:id/parse', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT id FROM menus WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Fant ikke menyen' });
  if (!config.openai.enabled) return res.status(400).json({ error: 'OpenAI er ikke konfigurert på serveren.' });
  await parseAndStore(id);
  const updated = db.prepare('SELECT parse_status, parsed_json, parse_error FROM menus WHERE id = ?').get(id);
  res.json({
    status: updated.parse_status,
    menu: updated.parsed_json ? JSON.parse(updated.parsed_json) : null,
    error: updated.parse_error || null,
  });
});

// ── Slett en meny (admin) ────────────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM menus WHERE id = ?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Fant ikke menyen' });
  if (m.filename) { try { fs.unlinkSync(path.join(menusDir, m.filename)); } catch { /* filen kan mangle */ } }
  db.prepare('DELETE FROM menus WHERE id = ?').run(m.id);
  res.json({ ok: true });
});

export default router;
