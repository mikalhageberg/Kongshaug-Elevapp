import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { isOnCampus } from '../geo.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth);

// Skolens område. Appen henter dette én gang per innlogging og cacher det, så
// den kan regne ut GPS-statusen selv i stedet for å spørre for hver skjerm
// (se mobile/src/campus.js). Ingen hemmelighet: posisjonen til skolen står på
// nettsidene, og selve registreringen valideres uansett server-side.
router.get('/campus', (req, res) => {
  res.json({
    lat: config.school.lat,
    lng: config.school.lng,
    radiusMeters: config.school.radiusMeters,
  });
});

// Sjekk om en posisjon er innenfor skolens område (brukes til å vise korrekt
// GPS-status i appen FØR eleven registrerer). Selve registreringen valideres
// uansett på nytt server-side, så dette er kun for visning.
//
// Nyere appversjoner regner dette ut lokalt. Ruten blir stående fordi eldre
// versjoner ute i App Store / Google Play fortsatt kaller den.
router.post('/check', (req, res) => {
  const { lat, lng } = req.body || {};
  const result = isOnCampus(Number(lat), Number(lng));
  res.json(result); // { ok, distance }
});

export default router;
