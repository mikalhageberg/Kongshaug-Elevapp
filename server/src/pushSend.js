import { Expo } from 'expo-server-sdk';
import db from './db.js';

const expo = new Expo();

// Sender en Expo push-melding til en liste med tokens. Rydder bort tokens
// som Expo rapporterer som avinstallert (DeviceNotRegistered).
export async function sendExpoPush(tokens, { title, body }) {
  if (!tokens.length) return { sent: 0, failed: 0 };
  const messages = tokens.map((token) => ({ to: token, title, body, sound: 'default' }));
  const chunks = expo.chunkPushNotifications(messages);
  const badTokens = [];
  let sent = 0;
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error') {
          if (ticket.details?.error === 'DeviceNotRegistered') badTokens.push(chunk[i].to);
        } else {
          sent++;
        }
      });
    } catch {
      // Hele chunken feilet (f.eks. nettverksfeil) – hopp over, ikke stopp resten.
    }
  }
  if (badTokens.length) {
    const ph = badTokens.map(() => '?').join(',');
    db.prepare(`DELETE FROM push_tokens WHERE token IN (${ph})`).run(...badTokens);
  }
  return { sent, failed: tokens.length - sent };
}
