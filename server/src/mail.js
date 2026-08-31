import { config } from './config.js';
import { getSettings } from './settings.js';
import { getFireOverview, reportNightDate, nightLabel } from './fireReport.js';
import { getDinnerReport } from './kitchenReport.js';
import { buildFireListPdf } from './pdf.js';
import { fireListLink, LINK_TTL_HOURS } from './fireLink.js';
import { todayDate } from './andaktToken.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Uten denne avhenger æ/ø/å av at e-postklienten stoler på MIME-headeren.
// Deklarasjonen i selve dokumentet gjør at navnene også vises riktig når
// e-posten videresendes eller lagres som fil og headeren blir borte.
const MAIL_HEAD = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';

const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
function dateLabel(dstr) {
  const [y, m, d] = dstr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d}. ${MONTHS[m - 1]} ${y}`;
}

// ── Generisk Brevo-utsender ──────────────────────────────────
// `sender` (valgfritt) kan overstyre avsendernavn/-e-post per e-posttype.
async function sendViaBrevo({ recipient, subject, htmlContent, attachment, sender }) {
  const fromEmail = sender?.email || config.mail.from;
  const fromName = sender?.name || config.mail.fromName;
  if (!config.mail.brevoApiKey) throw new Error('Brevo API-nøkkel mangler. Sett BREVO_API_KEY i .env.');
  if (!fromEmail) throw new Error('Avsender-e-post mangler. Sett MAIL_FROM i .env.');
  if (!recipient) throw new Error('Ingen mottaker er satt. Fyll inn e-post under Innstillinger.');

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.mail.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: recipient }],
      subject,
      htmlContent,
      ...(attachment ? { attachment } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo svarte ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  return { messageId: data.messageId, recipient };
}

// Ren, lettlest HTML-e-post med sammendrag og hvem som mangler.
export function buildFireEmailHtml(overview, link = fireListLink(overview.nightDate)) {
  const label = nightLabel(overview.nightDate);
  const missing = [];
  for (const d of overview.dorms) for (const s of d.students) if (s.status === 'missing') missing.push({ ...s, dorm: d.dorm });

  const stat = (n, txt, color) =>
    `<td align="center" style="padding:14px 8px;background:#f7f8fa;border-radius:10px">
       <div style="font-size:30px;font-weight:bold;color:${color}">${n}</div>
       <div style="font-size:12px;color:#6b7280;font-weight:bold">${txt}</div></td>`;

  const missingBlock = missing.length
    ? `<div style="margin-top:20px;border:1px solid #f0c4c0;border-radius:10px;overflow:hidden">
         <div style="background:#fdf0ef;color:#a12a1f;font-weight:bold;padding:12px 16px;font-size:15px">
           ⚠ Ikke gjort rede for (${missing.length})</div>
         ${missing.map((s) => `<div style="padding:10px 16px;border-top:1px solid #f5d6d2;font-size:14px">
           <b>${esc(s.fullName)}</b> <span style="color:#8a93a3">· ${esc(s.dorm)}${s.room ? ' · rom ' + esc(s.room) : ''}</span></div>`).join('')}
       </div>`
    : `<div style="margin-top:20px;padding:14px 16px;background:#e6f4ec;color:#0f6b43;border-radius:10px;font-weight:bold">
         ✓ Alle elever er gjort rede for.</div>`;

  return `<!DOCTYPE html><html><head>${MAIL_HEAD}</head><body style="margin:0;background:#eceef1;padding:24px">
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a2230;max-width:600px;margin:0 auto">
      <div style="background:#1e3a5f;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <div style="font-size:13px;opacity:.85">Kongshaug Musikkgymnas</div>
        <div style="font-size:21px;font-weight:bold;margin-top:4px">Brannliste — natt til ${esc(label)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e6e8ec;border-top:none;padding:22px 24px;border-radius:0 0 12px 12px">
        <table width="100%" cellspacing="8" cellpadding="0" style="border-collapse:separate"><tr>
          ${stat(overview.present + ' / ' + overview.total, 'Til stede', '#1f8a5b')}
          ${stat(overview.away, 'Borte', '#1e3a5f')}
          ${stat(overview.missing, 'Mangler', '#d64545')}
        </tr></table>
        ${missingBlock}

        <!-- Nedlastingsknapp. Bygget som tabell og ikke som en stylet <a>, fordi
             flere e-postklienter (Outlook i særdeleshet) ikke gir padding til
             lenker – knappen ville blitt en tynn tekststrek. -->
        <table width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0 0">
          <tr><td align="center" bgcolor="#1f8a5b" style="border-radius:10px">
            <a href="${esc(link)}" style="display:block;padding:18px 24px;font-size:19px;font-weight:bold;color:#ffffff;text-decoration:none">
              ⬇ Last ned brannlisten
            </a>
          </td></tr>
        </table>
        <div style="margin:14px 0 0;padding:14px 16px;background:#fdf0ef;border:1px solid #f0c4c0;border-radius:10px">
          <div style="font-size:15px;font-weight:bold;color:#a12a1f">Last den ned nå – ikke vent til det brenner.</div>
          <div style="font-size:14px;color:#55607a;line-height:1.55;margin-top:6px">
            Ved brann kan både nett og strøm være borte. En nedlastet fil ligger på iPaden og virker uansett.
          </div>
          <div style="font-size:14px;color:#55607a;line-height:1.6;margin-top:12px;padding-top:12px;border-top:1px solid #f5d6d2">
            <b>Slik gjør du det:</b>
            <table cellspacing="0" cellpadding="0" style="margin-top:8px">
              <tr>
                <td valign="top" style="padding:0 8px 6px 0;font-weight:bold;color:#a12a1f">1.</td>
                <td style="padding:0 0 6px">Trykk den grønne knappen. Listen lastes ned.</td>
              </tr>
              <tr>
                <td valign="top" style="padding:0 8px 6px 0;font-weight:bold;color:#a12a1f">2.</td>
                <td style="padding:0 0 6px">Trykk <b>«Åpne i forhåndsvisning»</b> for å se den.</td>
              </tr>
              <tr>
                <td valign="top" style="padding:0 8px 0 0;font-weight:bold;color:#a12a1f">3.</td>
                <td>Filen ligger nå i <b>Filer → Nedlastinger</b> og virker uten nett.</td>
              </tr>
            </table>
          </div>
        </div>
        <p style="margin:18px 0 0;font-size:13px;color:#8a93a3">
          <a href="${esc(link)}&amp;vis=1" style="color:#55607a">Bare se på listen uten å laste ned</a>
          &nbsp;·&nbsp; Listen ligger også vedlagt denne e-posten. Lenkene virker i ${LINK_TTL_HOURS} timer.
        </p>
        <p style="margin:18px 0 0;font-size:12px;color:#8a93a3">Automatisk sendt fra Kongshaug Elevapp.</p>
      </div>
    </div></body></html>`;
}

// Send brannlisten på e-post via Brevo. Kaster feil hvis noe mangler.
export async function sendFireListEmail({ nightDate, recipient } = {}) {
  nightDate = nightDate || reportNightDate();
  recipient = recipient || getSettings().fireEmailRecipient;
  const overview = getFireOverview(nightDate);
  const pdf = await buildFireListPdf(overview);
  const r = await sendViaBrevo({
    recipient,
    subject: `Brannliste — natt til ${nightLabel(nightDate)}  (${overview.present}/${overview.total} til stede, ${overview.missing} mangler)`,
    htmlContent: buildFireEmailHtml(overview),
    attachment: [{ content: pdf.toString('base64'), name: `brannliste-${nightDate}.pdf` }],
  });
  return { ...r, nightDate };
}

// ── Middag / kjøkken ─────────────────────────────────────────
export function buildKitchenEmailHtml(report) {
  const label = dateLabel(report.date);
  const stat = (n, txt, color) =>
    `<td align="center" style="padding:14px 8px;background:#f7f8fa;border-radius:10px">
       <div style="font-size:30px;font-weight:bold;color:${color}">${n}</div>
       <div style="font-size:12px;color:#6b7280;font-weight:bold">${txt}</div></td>`;

  // Navnene er det viktigste i denne e-posten: appen lagrer bevisst ingen
  // allergiopplysninger (helseopplysninger, GDPR art. 9), så kjøkkenet må
  // kjenne igjen eleven på navnet. Da må navnet være lett å lese – ikke
  // liten, grå løpende tekst.
  const notEating = report.notEating.length
    ? `<div style="margin-top:20px;border:1px solid #e6e8ec;border-radius:10px;overflow:hidden">
         <div style="background:#f7f8fa;color:#1a2230;font-weight:bold;padding:12px 16px;font-size:15px">
           Spiser ikke i dag (${report.notEating.length})</div>
         ${report.notEating.map((n) => `<div style="padding:11px 16px;border-top:1px solid #eef0f3;font-size:17px;font-weight:bold;color:#1a2230">
           ${esc(n.name)}${n.className || n.dorm ? `<span style="font-size:13px;font-weight:normal;color:#6b7280"> · ${esc([n.className, n.dorm].filter(Boolean).join(' · '))}</span>` : ''}</div>`).join('')}
       </div>`
    : `<div style="margin-top:20px;padding:14px 16px;background:#e6f4ec;color:#0f6b43;border-radius:10px;font-weight:bold">
         ✓ Alle elever spiser middag i dag.</div>`;

  return `<!DOCTYPE html><html><head>${MAIL_HEAD}</head><body style="margin:0;background:#eceef1;padding:24px">
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a2230;max-width:600px;margin:0 auto">
      <div style="background:#1e3a5f;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <div style="font-size:13px;opacity:.85">Kongshaug Musikkgymnas · kjøkken</div>
        <div style="font-size:21px;font-weight:bold;margin-top:4px">Middag — ${esc(label)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e6e8ec;border-top:none;padding:22px 24px;border-radius:0 0 12px 12px">
        <p style="margin:0 0 14px;font-size:16px"><b>${report.eating}</b> av ${report.total} elever skal ha middag i dag.</p>
        <table width="100%" cellspacing="8" cellpadding="0" style="border-collapse:separate"><tr>
          ${stat(report.eating, 'Spiser', '#1f8a5b')}
          ${stat(report.total - report.eating, 'Spiser ikke', '#d64545')}
        </tr></table>
        ${notEating}
        <p style="margin:20px 0 0;font-size:12px;color:#8a93a3">Automatisk sendt fra Kongshaug Elevapp.</p>
      </div>
    </div></body></html>`;
}

// Send middagsoversikten til kjøkkenet via Brevo (eget avsendernavn).
export async function sendKitchenEmail({ date, recipient } = {}) {
  const settings = getSettings();
  date = date || todayDate();
  recipient = recipient || settings.kitchenEmailRecipient;
  const report = getDinnerReport(date);
  const r = await sendViaBrevo({
    recipient,
    subject: `Middag ${dateLabel(date)} — ${report.eating} spiser`,
    htmlContent: buildKitchenEmailHtml(report),
    sender: {
      email: settings.kitchenEmailFrom || config.mail.from,
      name: settings.kitchenEmailFromName || config.mail.fromName,
    },
  });
  return { ...r, date, eating: report.eating };
}

// ── Gjesteforespørsel fra elev ───────────────────────────────
// Sendes med én gang en elev melder gjest, slik at internatledelsen kan
// godkjenne uten å måtte sjekke admin-siden manuelt.

// 'YYYY-MM-DD' -> dagen etter, lesbart. Datoene er NETTER: gjesten reiser
// morgenen etter siste natt.
function nightsLabel(startDate, endDate) {
  const p = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const nights = Math.round((p(endDate) - p(startDate)) / 86400000) + 1;
  const leaves = new Date(p(endDate)); leaves.setDate(leaves.getDate() + 1);
  return {
    nights,
    text: `${nights} ${nights === 1 ? 'natt' : 'netter'}`,
    leaving: dateLabel(`${leaves.getFullYear()}-${String(leaves.getMonth() + 1).padStart(2, '0')}-${String(leaves.getDate()).padStart(2, '0')}`),
  };
}

export function buildGuestEmailHtml(g) {
  const n = nightsLabel(g.startDate, g.endDate);
  const link = `${config.publicUrl}/admin/#/gjester`;
  const row = (k, v) => `
    <tr><td style="padding:7px 0;color:#6b7280;font-size:14px;width:130px">${esc(k)}</td>
        <td style="padding:7px 0;font-size:15px;font-weight:bold;color:#16202b">${esc(v)}</td></tr>`;
  return `<!doctype html><html><head>${MAIL_HEAD}</head>
    <body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif">
      <div style="max-width:520px;margin:0 auto;padding:26px 18px">
        <div style="background:#fff;border-radius:14px;padding:26px 24px">
          <div style="font-size:12px;font-weight:bold;color:#a8791a;letter-spacing:.06em;text-transform:uppercase">Venter på godkjenning</div>
          <h1 style="margin:6px 0 4px;font-size:21px;color:#16202b">Ny gjesteforespørsel</h1>
          <p style="margin:0 0 18px;color:#6b7280;font-size:14px;line-height:1.5">
            ${esc(g.hostName)} har meldt en gjest på internatet. Besøket er ikke godkjent ennå.
          </p>
          <table style="width:100%;border-collapse:collapse;border-top:1px solid #eef0f3">
            ${row('Gjest', g.guestName)}
            ${g.note ? row('Kommentar', g.note) : ''}
            ${row('Vert (elev)', g.hostName + (g.hostDorm ? ` · ${g.hostDorm}` : ''))}
            ${row('Første natt', dateLabel(g.startDate))}
            ${row('Siste natt', dateLabel(g.endDate))}
            ${row('Varighet', `${n.text} · reiser ${n.leaving}`)}
          </table>
          <div style="margin-top:24px">
            <a href="${link}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 24px;border-radius:10px">Åpne og godkjenn</a>
          </div>
          <p style="margin:16px 0 0;font-size:12.5px;color:#8a93a3;line-height:1.5">
            Du må tildele internat og rom når du godkjenner. Gjesten føres da automatisk på brannlisten for hver natt i perioden.
          </p>
        </div>
        <p style="margin:18px 0 0;font-size:12px;color:#8a93a3;text-align:center">Automatisk sendt fra Kongshaug Elevapp.</p>
      </div>
    </body></html>`;
}

// Varsle om én ny gjesteforespørsel. Kaster hvis Brevo/mottaker mangler –
// kalleren avgjør om det skal svelges (se firelist.js).
export async function sendGuestRequestEmail(guest, { recipient } = {}) {
  const settings = getSettings();
  recipient = recipient || settings.guestEmailRecipient;
  const n = nightsLabel(guest.startDate, guest.endDate);
  const r = await sendViaBrevo({
    recipient,
    subject: `Gjesteforespørsel: ${guest.guestName} hos ${guest.hostName} (${n.text})`,
    htmlContent: buildGuestEmailHtml(guest),
  });
  return { ...r, guestId: guest.id };
}
