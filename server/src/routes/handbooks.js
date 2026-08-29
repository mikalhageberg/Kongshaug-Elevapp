// Håndbøkene: brukermanualen for elever og håndboken for administrasjonen,
// som ferdige PDF-er. Kilden til begge er HTML-filene i docs/ – PDF-ene bygges
// derfra (se docs/README.md) og legges tilbake i samme mappe.
//
// De serveres her, og ikke fra public/, fordi public/ er åpent for alle som
// kjenner adressen. Håndbøkene inneholder ingen hemmeligheter, men de beskriver
// hele adminflaten, og det er ingen grunn til at den beskrivelsen skal ligge
// ute på nett. Ruten krever innlogget administrator.

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireAdmin } from '../auth.js';
import { paths } from '../config.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Fasit over hvilke filer som finnes. En hardkodet liste – ikke et katalog-
// oppslag – slik at ingenting annet som måtte havne i docs/ blir servert.
export const HANDBOOKS = [
  {
    slug: 'elever',
    title: 'Brukermanual for elever',
    description: 'Innlogging, brannliste, andakt, planlagt fravær, gjester, middag, internatvask og øvekonkurransen – slik elevene møter det i appen. Del den ut ved skolestart.',
    file: 'Kongshaug-Elevapp-brukermanual.pdf',
  },
  {
    slug: 'admin',
    title: 'Håndbok for administrasjonen',
    description: 'Alle sidene i admin, forklart: elever og import, brannliste, gjester, andakt og arkiv, kjøkken, internat, øvekonkurranse, varsler og innstillinger – med rutinene gjennom året.',
    file: 'Kongshaug-Elevapp-adminhandbok.pdf',
  },
];

const filePath = (h) => path.join(paths.docs, h.file);

// ── Liste: hva som finnes, og om filen faktisk ligger der ────
// Mangler en fil (den er ikke bygget ennå), sier lista det i stedet for at
// knappen fører til en 404 først når noen trykker på den.
router.get('/', (req, res) => {
  res.json({
    handbooks: HANDBOOKS.map((h) => {
      const stat = fs.existsSync(filePath(h)) ? fs.statSync(filePath(h)) : null;
      return {
        slug: h.slug,
        title: h.title,
        description: h.description,
        filename: h.file,
        available: !!stat,
        size: stat ? stat.size : null,
        updatedAt: stat ? stat.mtime.toISOString() : null,
      };
    }),
  });
});

// ── Selve PDF-en ─────────────────────────────────────────────
// ?last=1 gir «attachment», altså nedlasting med filnavn. Uten den vises
// PDF-en i nettleserens egen leser, som er det man vil når man bare skal slå
// opp noe.
router.get('/:slug', (req, res) => {
  const h = HANDBOOKS.find((x) => x.slug === req.params.slug);
  if (!h) return res.status(404).json({ error: 'Fant ikke håndboken.' });
  const fp = filePath(h);
  if (!fs.existsSync(fp)) {
    return res.status(404).json({ error: 'Håndboken er ikke bygget ennå. Se docs/README.md.' });
  }
  const disp = req.query.last ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disp}; filename="${h.file}"`);
  fs.createReadStream(fp).pipe(res);
});

export default router;
