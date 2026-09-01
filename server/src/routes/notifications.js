import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { watchNightDate } from '../fireWatch.js';
import { listForUser, unreadCount, markRead } from '../adminNotify.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Varslene mine, nyeste først. Bevisst IKKE bak vakt-kravet: har du fått et
// varsel, skal du kunne lese det igjen etterpå – også etter at vakten er over.
router.get('/', (req, res) => {
  res.json({
    nightDate: watchNightDate(),
    unread: unreadCount(req.auth.sub),
    notifications: listForUser(req.auth.sub),
  });
});

// Bare telleren – til merket på fanen, som hentes ofte.
router.get('/unread-count', (req, res) => {
  res.json({ count: unreadCount(req.auth.sub) });
});

// Merk som lest. Uten ids merkes alt; det er det å åpne senteret gjør.
router.post('/read', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  res.json({ ok: true, changed: markRead(req.auth.sub, ids), unread: unreadCount(req.auth.sub) });
});

export default router;
