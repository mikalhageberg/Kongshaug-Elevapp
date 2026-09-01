import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { watchNightDate, watchStartedAt } from '../fireWatch.js';
import { listCurrent, listEarlier, unreadCount, markRead } from '../adminNotify.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Varslene mine. Delt i vakten som pågår og alt som ligger foran den.
//
// Senteret viser vakten du står i, og starter derfor tomt når du tar den:
// gårsdagens varsler er ikke ditt problem i kveld. De er ikke borte – appen
// legger dem under «Tidligere vakter».
//
// Bevisst IKKE bak vakt-kravet: har du fått et varsel, skal du kunne lese det
// igjen etterpå. Uten vakt er alt «tidligere», og siden er tom med en
// forklaring på hvorfor.
router.get('/', (req, res) => {
  const since = watchStartedAt(req.auth.sub);
  res.json({
    nightDate: watchNightDate(),
    watchStartedAt: since,
    unread: unreadCount(req.auth.sub, since),
    current: listCurrent(req.auth.sub, since),
    earlier: listEarlier(req.auth.sub, since),
  });
});

// Bare telleren – til merket på fanen, som hentes ofte.
router.get('/unread-count', (req, res) => {
  res.json({ count: unreadCount(req.auth.sub, watchStartedAt(req.auth.sub)) });
});

// Merk som lest. Uten ids merkes alt – det er det å åpne senteret gjør.
// Alt, ikke bare vaktens: ellers ville et gammelt ulest varsel ligget igjen og
// slått ut igjen som merke neste gang det havnet innenfor en vakt.
router.post('/read', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  const changed = markRead(req.auth.sub, ids);
  res.json({ ok: true, changed, unread: unreadCount(req.auth.sub, watchStartedAt(req.auth.sub)) });
});

export default router;
