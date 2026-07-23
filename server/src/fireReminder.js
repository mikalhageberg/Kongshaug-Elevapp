import db from './db.js';
import { currentNightDate } from './fireWindow.js';
import { getFireOverview } from './fireReport.js';
import { sendExpoPush } from './pushSend.js';

// Send push-påminnelse til elever som ikke har krysset seg av på
// brannlisten for kvelden ennå.
export async function sendFireListReminder() {
  const nightDate = currentNightDate();
  const overview = getFireOverview(nightDate);
  const missingIds = overview.dorms.flatMap((d) => d.students).filter((s) => s.status === 'missing').map((s) => s.id);
  if (!missingIds.length) return { nightDate, targeted: 0, sent: 0, failed: 0 };

  const ph = missingIds.map(() => '?').join(',');
  const tokens = db.prepare(`SELECT token FROM push_tokens WHERE user_id IN (${ph})`).all(...missingIds).map((r) => r.token);
  const result = await sendExpoPush(tokens, {
    title: 'Husk brannlisten!',
    body: 'Du har ikke krysset deg av for i kveld ennå. Åpne appen og registrer om du er til stede eller borte.',
  });
  return { nightDate, targeted: missingIds.length, ...result };
}
