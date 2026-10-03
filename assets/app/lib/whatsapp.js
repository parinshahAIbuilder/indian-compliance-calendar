// WhatsApp reminders through the Twilio Messaging API (one Twilio account per workspace).
import { decrypt } from './auth.js';
import { fmtLong } from './dates.js';

const API = 'https://api.twilio.com/2010-04-01/Accounts/';

export function waCreds(org) {
  const w = org?.whatsapp;
  if (!w?.sid || !w.token || !w.from) return null;
  return { sid: w.sid, token: decrypt(w.token), from: w.from, contentSid: w.contentSid || '' };
}
export const waConfigured = org => !!waCreds(org);

const auth = c => 'Basic ' + Buffer.from(`${c.sid}:${c.token}`).toString('base64');
const wa = n => {
  const d = String(n || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  const e164 = d.startsWith('+') ? d : d.length === 10 ? '+91' + d : '+' + d; // 10-digit numbers are treated as Indian mobiles
  return 'whatsapp:' + e164;
};
export const normaliseNumber = n => wa(n).replace('whatsapp:', '');

export async function verifyTwilio(c) {
  const r = await fetch(`${API}${encodeURIComponent(c.sid)}.json`, { headers: { Authorization: auth(c) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Twilio rejected the credentials (${r.status})`);
  return d.friendly_name || c.sid;
}

async function sendOne(c, to, body, vars) {
  const form = new URLSearchParams({ From: wa(c.from), To: wa(to) });
  if (c.contentSid) { form.set('ContentSid', c.contentSid); form.set('ContentVariables', JSON.stringify(vars)); }
  else form.set('Body', body);
  const r = await fetch(`${API}${encodeURIComponent(c.sid)}/Messages.json`, {
    method: 'POST', headers: { Authorization: auth(c), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    let msg = (d.message || String(r.status)) + (d.code ? ` (Twilio error ${d.code})` : '');
    if (/contentsid required/i.test(msg)) msg += ' — your Twilio account only accepts WhatsApp messages as a Content Template. Add the template’s Content SID (HX…) in the WhatsApp settings.';
    else if (/not a valid whatsapp|channel.*could not find|from address/i.test(msg)) msg += ' — the sender must be the Twilio sandbox (+14155238886) or a number registered as a WhatsApp sender in Twilio.';
    else if (/63015|not.*joined|sandbox/i.test(msg)) msg += ' — the recipient must first send the sandbox join code from their WhatsApp.';
    throw new Error(`${to}: ${msg}`);
  }
  return d.sid;
}

// Same content as the e-mail: reminder list (or quarter status) + new circulars + link to update status
export function buildWhatsApp(c, items, appUrl, { mode = 'reminder', quarterLabel = '', circulars = [] } = {}) {
  const short = c.shortName || c.name;
  const status = i => i.daysLeft < 0 ? `⚠️ overdue ${-i.daysLeft}d` : i.daysLeft === 0 ? '🔴 due TODAY' : `${i.daysLeft}d left`;
  const lines = items.slice(0, 15).map((i, n) => `${n + 1}. ${i.title.length > 90 ? i.title.slice(0, 87) + '…' : i.title}\n    Due ${fmtLong(i.due)} · ${status(i)}`);
  const head = mode === 'quarter'
    ? `*${short} – Compliance Status for Quarter ended ${quarterLabel}*\n${items.length} pending filing${items.length === 1 ? '' : 's'}:`
    : `*${short} – Compliance Reminder (${fmtLong(new Date(Date.now() + 19800000).toISOString().slice(0, 10))})*\n${items.length} filing${items.length === 1 ? '' : 's'} due / overdue:`;
  let body = `${head}\n\n${lines.join('\n') || 'No pending compliances 🎉'}`;
  if (items.length > 15) body += `\n…and ${items.length - 15} more`;
  if (circulars.length) body += `\n\n*New circulars (last 24 h)*\n` + circulars.slice(0, 5).map(x => `• ${x.source}: ${x.title.length > 80 ? x.title.slice(0, 77) + '…' : x.title}\n  ${x.url}`).join('\n');
  if (appUrl) body += `\n\nUpdate status: ${appUrl}`;
  if (body.length > 1550) body = body.slice(0, 1540) + '…';
  // Variables for an approved Twilio content template: {{1}} company, {{2}} count, {{3}} list, {{4}} link
  const vars = { 1: short, 2: String(items.length), 3: lines.slice(0, 8).join(' | ').slice(0, 900), 4: appUrl || '' };
  return { body, vars };
}

export async function sendWhatsApp(org, numbers, msg) {
  const c = waCreds(org);
  if (!c) throw new Error('WhatsApp (Twilio) is not connected for this workspace');
  const sent = [], failed = [];
  for (const n of numbers) {
    try { await sendOne(c, n, msg.body, msg.vars); sent.push(n); } catch (e) { failed.push(e.message); }
  }
  return { sent, failed };
}
