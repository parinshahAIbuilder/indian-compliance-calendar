// Gmail (SMTP + app password) reminder emails.
import nodemailer from 'nodemailer';
import { fmtLong, todayIST, addDays } from './dates.js';
import { decrypt } from './auth.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Each workspace sends from its own mailbox. The default (your team) workspace falls back to .env.
const PROVIDERS = {
  gmail: { service: 'gmail' },
  outlook: { host: 'smtp.office365.com', port: 587, secure: false },
  zoho: { host: 'smtp.zoho.in', port: 465, secure: true }
};
export function mailCreds(org) {
  if (org?.mail?.user && org.mail.pass) return { provider: org.mail.provider || 'gmail', user: org.mail.user, pass: decrypt(org.mail.pass), fromName: org.mail.fromName, host: org.mail.host, port: org.mail.port };
  if (org?.isDefault && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return { provider: 'gmail', user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD, fromName: process.env.MAIL_FROM_NAME };
  return null;
}
export const mailConfigured = org => !!mailCreds(org);
export const mailUser = org => mailCreds(org)?.user || '';

export function makeTransport(creds) {
  const base = creds.provider === 'custom' ? { host: creds.host, port: +creds.port || 587, secure: +creds.port === 465 } : PROVIDERS[creds.provider] || PROVIDERS.gmail;
  return nodemailer.createTransport({ ...base, auth: { user: creds.user, pass: String(creds.pass).replace(/\s+/g, '') } });
}
const transports = new Map();
function getTransport(org) {
  const creds = mailCreds(org);
  if (!creds) throw new Error('No sender e-mail connected for this workspace. Connect one under Email Updates → Sender account.');
  const k = `${org.id}|${creds.user}|${creds.pass.length}|${creds.provider}`;
  if (!transports.has(k)) transports.set(k, makeTransport(creds));
  return { t: transports.get(k), creds };
}

export function recipients(c) {
  const to = (c.recipients?.to || '').trim();
  const cc = (c.recipients?.cc || []).filter(r => r.email && r.active !== false);
  return { to, cc };
}

const statusText = i => i.daysLeft < 0 ? `Overdue by ${-i.daysLeft} day${i.daysLeft === -1 ? '' : 's'}`
  : i.daysLeft === 0 ? 'Due TODAY' : `${i.daysLeft} day${i.daysLeft === 1 ? '' : 's'} left`;
const statusColor = i => i.daysLeft < 0 ? '#b42318' : i.daysLeft <= 1 ? '#b54708' : '#3538cd';

// mode 'reminder' → items in the reminder window; mode 'quarter' → all pending items of a quarter
export function buildEmail(c, items, { mode = 'reminder', quarterLabel = '', circulars = [], appUrl = '', waText = '' } = {}) {
  const today = todayIST();
  const short = c.shortName || c.name;
  const overdue = items.filter(i => i.daysLeft < 0).length;
  const subject = mode === 'quarter'
    ? `${short} - Compliance Status for Quarter ended on ${quarterLabel}`
    : `${short} - Compliance Reminder (${fmtLong(today)}): ${items.length} filing${items.length === 1 ? '' : 's'} due${overdue ? `, ${overdue} overdue` : ''}`;

  const rows = items.map((i, n) => `
    <tr>
      <td style="padding:10px 12px;border:1px solid #e4e7ec;text-align:center;font-weight:600">${n + 1}</td>
      <td style="padding:10px 12px;border:1px solid #e4e7ec">${esc(i.title)}<div style="color:#667085;font-size:12px;margin-top:3px">${esc(i.cat)} · ${esc(i.period)}${i.timeline ? ' · ' + esc(i.timeline) : ''}</div></td>
      <td style="padding:10px 12px;border:1px solid #e4e7ec;color:#3538cd;font-weight:600;white-space:nowrap">${fmtLong(i.due)}${i.est ? '<div style="font-size:11px;color:#98a2b3;font-weight:400">statutory latest</div>' : ''}</td>
      <td style="padding:10px 12px;border:1px solid #e4e7ec;color:${statusColor(i)};font-weight:600;white-space:nowrap">${statusText(i)}</td>
    </tr>`).join('');

  const circ = circulars.length ? `
    <p style="margin:24px 0 8px;font-weight:600">New regulatory circulars (last 24 hours)</p>
    <ul style="margin:0;padding-left:18px">${circulars.slice(0, 15).map(x => `<li style="margin:4px 0"><b>${esc(x.source)}</b> · ${esc(x.title)} – <a href="${esc(x.url)}">view</a></li>`).join('')}</ul>` : '';

  const intro = mode === 'quarter'
    ? `Please find below the statutory compliance status table for the <b>Quarter ended on ${esc(quarterLabel)}</b>.`
    : `The following compliance${items.length === 1 ? ' is' : 's are'} due within the reminder window or overdue. This reminder repeats every day until the filing is updated on the exchange / in the compliance calendar.`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#101828;font-size:14px;line-height:1.5;max-width:760px">
    <p>Dear Secretarial Team,</p>
    <p>${intro}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="background:#f2f4f7">
        <th style="padding:10px 12px;border:1px solid #e4e7ec;text-align:center">SR No.</th>
        <th style="padding:10px 12px;border:1px solid #e4e7ec;text-align:left">Name of Compliance</th>
        <th style="padding:10px 12px;border:1px solid #e4e7ec;text-align:left">Due Date</th>
        <th style="padding:10px 12px;border:1px solid #e4e7ec;text-align:left">Status</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="padding:14px;text-align:center;border:1px solid #e4e7ec">No pending compliances 🎉</td></tr>'}</tbody>
    </table>
    ${circ}
    ${waText ? `<p style="margin-top:22px"><a href="https://wa.me/?text=${encodeURIComponent(waText.slice(0, 1800))}" style="background:#25d366;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;display:inline-block">📲 Forward this reminder on WhatsApp</a>
      <br><span style="color:#667085;font-size:12px">Opens WhatsApp with the reminder already typed — choose your team group and press send.</span></p>` : ''}
    ${appUrl ? `<p style="margin-top:20px">Update submission dates on the dashboard: <a href="${esc(appUrl)}">${esc(appUrl)}</a></p>` : ''}
    <p style="margin-top:20px">Regards,<br>Compliance Desk – ${esc(c.name)}</p>
    <p style="color:#98a2b3;font-size:11px">Automated reminder · ${esc(c.name)}${c.cin ? ' · CIN ' + esc(c.cin) : ''}. Filings detected on BSE are removed automatically.</p>
  </div>`;

  const text = [
    'Dear Secretarial Team,', '',
    mode === 'quarter' ? `Compliance status for the Quarter ended on ${quarterLabel}:` : 'Compliances due / overdue:', '',
    ...items.map((i, n) => `${n + 1}. ${i.title}\n   Due: ${fmtLong(i.due)} (${statusText(i)})`),
    ...(waText ? ['', 'Forward on WhatsApp: https://wa.me/?text=' + encodeURIComponent(waText.slice(0, 1500))] : []),
    ...(circulars.length ? ['', 'New regulatory circulars:', ...circulars.slice(0, 15).map(x => `- [${x.source}] ${x.title} ${x.url}`)] : []),
    '', 'Regards,', `Compliance Desk – ${c.name}`
  ].join('\n');

  return { subject, html, text };
}

export async function send(c, email, org) {
  const { to, cc } = recipients(c);
  if (!to) throw new Error('No primary recipient configured for ' + c.name);
  const { t, creds } = getTransport(org);
  const info = await t.sendMail({
    from: `"${creds.fromName || (c.shortName || c.name) + ' Compliance'}" <${creds.user}>`,
    to, cc: cc.map(r => (r.name ? `"${r.name}" <${r.email}>` : r.email)),
    subject: email.subject, html: email.html, text: email.text
  });
  return { messageId: info.messageId, to, cc: cc.map(r => r.email) };
}

export const recentCirculars = state => {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const out = [];
  for (const [k, label] of [['bse', 'BSE'], ['nse', 'NSE'], ['sebi', 'SEBI']]) {
    const feed = state.circulars[k];
    for (const i of feed?.items || []) {
      if ((feed.firstSeen?.[i.id] || '') < since) continue;
      if (k === 'nse' && i.routine) continue;
      if (k === 'sebi' && !i.legal) continue;
      out.push({ ...i, source: label });
    }
  }
  return out;
};

export const _addDays = addDays;
