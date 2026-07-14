import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { isOnCampus } from '../geo.js';

const router = Router();
router.use(requireAuth);

// Sjekk om en posisjon er innenfor skolens område (brukes til å vise korrekt
// GPS-status i appen FØR eleven registrerer). Selve registreringen valideres
// uansett på nytt server-side, så dette er kun for visning.
router.post('/check', (req, res) => {
  const { lat, lng } = req.body || {};
  const result = isOnCampus(Number(lat), Number(lng));
  res.json(result); // { ok, distance }
});

export default router;
