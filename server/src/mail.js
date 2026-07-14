import { config } from './config.js';
import { getSettings } from './settings.js';
import { getFireOverview, reportNightDate, nightLabel } from './fireReport.js';
import { getDinnerReport } from './kitchenReport.js';
import { buildFireListPdf } from './pdf.js';
import { todayDate } from './andaktToken.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

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
export function buildFireEmailHtml(overview) {
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

  return `<!DOCTYPE html><html><body style="margin:0;background:#eceef1;padding:24px">
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
        <p style="margin:22px 0 0;font-size:14px;color:#55607a">Full brannliste, gruppert på internat, ligger vedlagt som PDF.</p>
        <p style="margin:18px 0 0;font-size:12px;color:#8a93a3">Automatisk sendt fra Kongshaug Brannvakt.</p>
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

  const allergyBlock = report.allergyGroups.length
    ? `<div style="margin-top:20px;border:1px solid #f0dca0;border-radius:10px;overflow:hidden">
         <div style="background:#fdf4e0;color:#8a6300;font-weight:bold;padding:12px 16px;font-size:15px">Allergier å ta hensyn til (kun de som spiser)</div>
         ${report.allergyGroups.map((g) => `<div style="padding:11px 16px;border-top:1px solid #f0dca0;font-size:14px">
           <b>${esc(g.allergy)}</b> <span style="color:#8a93a3">(${g.count})</span><br>
           <span style="color:#55607a;font-size:13px">${g.students.map(esc).join(', ')}</span></div>`).join('')}
       </div>`
    : `<div style="margin-top:20px;padding:14px 16px;background:#e6f4ec;color:#0f6b43;border-radius:10px;font-weight:bold">
         Ingen registrerte allergier blant de som spiser i dag.</div>`;

  const notEating = report.notEating.length
    ? `<p style="margin:20px 0 0;font-size:13px;color:#8a93a3;line-height:1.6"><b>Spiser ikke:</b> ${report.notEating.map((n) => esc(n.name)).join(', ')}</p>`
    : '';

  return `<!DOCTYPE html><html><body style="margin:0;background:#eceef1;padding:24px">
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
        ${allergyBlock}
        ${notEating}
        <p style="margin:20px 0 0;font-size:12px;color:#8a93a3">Automatisk sendt fra Kongshaug Brannvakt.</p>
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
    subject: `Middag ${dateLabel(date)} — ${report.eating} spiser${report.allergyGroups.length ? ', ' + report.allergyGroups.length + ' allergihensyn' : ''}`,
    htmlContent: buildKitchenEmailHtml(report),
    sender: {
      email: settings.kitchenEmailFrom || config.mail.from,
      name: settings.kitchenEmailFromName || config.mail.fromName,
    },
  });
  return { ...r, date, eating: report.eating };
}
