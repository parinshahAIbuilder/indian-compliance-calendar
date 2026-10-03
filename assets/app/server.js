import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { load, save, log, bus, getCompany, getOrg, viewFor, statusOf, eventsOf, DEFAULT_SETTINGS } from './lib/store.js';
import { buildCalendar, stats, qtrLabel } from './lib/engine.js';
import { TEMPLATES, EVENT_TEMPLATES, CATEGORIES, ENTITY_TYPES } from './lib/master.js';
import { syncCompany } from './lib/bse.js';
import { refreshAll } from './lib/circulars.js';
import { searchScrips } from './lib/scrips.js';
import { httpStatus } from './lib/http.js';
import { waConfigured, verifyTwilio, buildWhatsApp, sendWhatsApp, normaliseNumber } from './lib/whatsapp.js';
import { buildEmail, send, mailConfigured, mailUser, mailCreds, makeTransport, recipients, recentCirculars } from './lib/mailer.js';
import {
  ensureSecret, encrypt, hashPassword, checkPassword, validatePassword, token, createSession,
  parseCookies, sessionCookie, throttle, publicUser
} from './lib/auth.js';
import { todayIST, timeIST, fyOfDate, fyLabel, quarterEnds, QUARTER_NAMES, addDays, fmtLong, ymd } from './lib/dates.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
process.chdir(ROOT);

// ── .env (no dependency) ──
if (!fs.existsSync('.env') && fs.existsSync('.env.example')) fs.copyFileSync('.env.example', '.env');
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}
ensureSecret('.env');

const PORT = +(process.env.PORT || 4300);
const APP_URL = () => process.env.APP_URL || `http://localhost:${PORT}`;
// Address colleagues on the same office Wi-Fi / LAN can open (works even where public tunnel links are blocked)
const LAN_URL = () => {
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254')) return `http://${a.address}:${PORT}`;
  return null;
};
const links = hash => ({ link: `${APP_URL()}/#${hash}`, lanLink: LAN_URL() ? `${LAN_URL()}/#${hash}` : null });
const state = load();
state.platform ||= { allowSignup: false, trialDays: 14, trialMaxCompanies: 3 };
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => { res.set({ 'X-Frame-Options': 'SAMEORIGIN', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' }); next(); });
app.use(express.static(path.join(ROOT, 'public')));

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (e) { if (!e.status) console.error(e); res.status(e.status || 400).json({ error: e.message }); }
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fyParam = req => +(req.query.fy || req.body?.fy || fyOfDate(todayIST()));
const titleOf = (t, c) => typeof t.title !== 'function' ? t.title
  : t.kind === 'H' ? t.title(1).replace(/\s*\(.*?\)$/, '') : t.kind === 'M' ? t.title('each month') : t.title({ q: 1, c });
const cleanEmail = e => String(e || '').trim().toLowerCase();

/* ───────────── Authentication ───────────── */

const userBySession = req => {
  const s = state.sessions[parseCookies(req).sid];
  if (!s || s.exp < Date.now()) return null;
  return state.users.find(u => u.id === s.userId && u.active !== false) || null;
};

app.get('/api/auth/me', wrap(req => {
  const u = userBySession(req);
  return { user: publicUser(u), needsSetup: state.users.length === 0, signupOpen: !!state.platform.allowSignup, org: u ? orgSummary(getOrg(activeOrgId(req, u))) : null };
}));

// First run only: create the platform owner account (you)
app.post('/api/auth/setup', wrap((req, res) => {
  if (state.users.length) throw new HttpError(403, 'Setup already completed');
  const { name, email, password } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(email || '')) throw new Error('Enter a valid e-mail');
  validatePassword(password);
  const def = state.orgs.find(o => o.isDefault);
  const u = { id: uid(), name: (name || '').trim(), mobile: String(req.body.mobile || '').trim(), email: cleanEmail(email), passwordHash: hashPassword(password), orgId: def.id, role: 'owner', superAdmin: true, createdAt: new Date().toISOString() };
  state.users.push(u);
  res.set('Set-Cookie', sessionCookie(req, createSession(state, u.id), 14 * 86400));
  log('auth', `Platform owner account created: ${u.email}`, def.id);
  save('auth');
  return { ok: true };
}));

app.post('/api/auth/login', wrap((req, res) => {
  const fail = throttle(req.ip);
  const u = state.users.find(x => x.email === cleanEmail(req.body.email) && x.active !== false);
  if (!u || !checkPassword(req.body.password || '', u.passwordHash)) { fail(); throw new HttpError(401, 'Incorrect e-mail or password'); }
  res.set('Set-Cookie', sessionCookie(req, createSession(state, u.id), 14 * 86400));
  u.lastLogin = new Date().toISOString();
  save('auth');
  return { ok: true };
}));

app.post('/api/auth/logout', wrap((req, res) => {
  delete state.sessions[parseCookies(req).sid];
  res.set('Set-Cookie', sessionCookie(req, '', 0));
  save('auth');
  return { ok: true };
}));

// Invite links: the invited person sets their own password
app.get('/api/auth/invite/:token', wrap(req => {
  const u = state.users.find(x => x.inviteToken === req.params.token && x.inviteExp > Date.now());
  if (!u) throw new HttpError(404, 'This invite link is invalid or has expired. Ask your administrator for a new one.');
  return { email: u.email, name: u.name, org: getOrg(u.orgId)?.name };
}));
app.post('/api/auth/invite/:token', wrap((req, res) => {
  const u = state.users.find(x => x.inviteToken === req.params.token && x.inviteExp > Date.now());
  if (!u) throw new HttpError(404, 'This invite link is invalid or has expired.');
  validatePassword(req.body.password);
  u.passwordHash = hashPassword(req.body.password);
  if (req.body.name) u.name = req.body.name.trim();
  if (req.body.mobile) u.mobile = String(req.body.mobile).trim();
  delete u.inviteToken; delete u.inviteExp;
  res.set('Set-Cookie', sessionCookie(req, createSession(state, u.id), 14 * 86400));
  log('auth', `${u.email} activated their account`, u.orgId);
  save('auth');
  return { ok: true };
}));

// Team join link: anyone with the workspace's link can create a member account
const orgByJoin = code => state.orgs.find(o => o.joinCode && o.joinCode === code && o.joinEnabled);
app.get('/api/auth/join/:code', wrap(req => {
  const o = orgByJoin(req.params.code);
  if (!o) throw new HttpError(404, 'This join link is not active. Ask your administrator for a new one.');
  return { org: o.name };
}));
function newAccount(req, res, org, role, { name, mobile, email, password }) {
  email = cleanEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid e-mail');
  if (!(name || '').trim()) throw new Error('Enter your name');
  validatePassword(password);
  if (state.users.some(u => u.email === email && u.passwordHash)) throw new Error('An account with this e-mail already exists — please sign in');
  state.users = state.users.filter(u => !(u.email === email && !u.passwordHash)); // replace a pending invite for the same e-mail
  const u = { id: uid(), name: name.trim(), mobile: String(mobile || '').trim(), email, passwordHash: hashPassword(password), orgId: org.id, role, createdAt: new Date().toISOString() };
  state.users.push(u);
  res.set('Set-Cookie', sessionCookie(req, createSession(state, u.id), 14 * 86400));
  return u;
}
app.post('/api/auth/join/:code', wrap((req, res) => {
  throttle(req.ip)(); // count every sign-up attempt
  const o = orgByJoin(req.params.code);
  if (!o) throw new HttpError(404, 'This join link is not active.');
  const u = newAccount(req, res, o, 'member', req.body);
  log('auth', `${u.email} joined via the team join link`, o.id);
  save('auth');
  return { ok: true };
}));

// Public sign-up for a new client firm (only when the platform owner has switched it on)
app.post('/api/auth/signup', wrap((req, res) => {
  throttle(req.ip)(); // count every sign-up attempt
  if (!state.platform.allowSignup) throw new HttpError(403, 'New sign-ups are currently closed');
  const firm = (req.body.firm || '').trim();
  if (!firm) throw new Error('Enter your firm / company name');
  const p = state.platform;
  const valid = new Date(Date.now() + (p.trialDays || 14) * 86400e3).toISOString().slice(0, 10);
  const o = { id: 'org-' + uid(), name: firm, plan: 'trial', maxCompanies: p.trialMaxCompanies || 3, validUntil: valid, contact: `${req.body.name || ''} · ${req.body.mobile || ''}`.trim(), createdAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS }, mail: null, lastDaily: null, selfSignup: true };
  state.orgs.push(o);
  try { newAccount(req, res, o, 'owner', req.body); } catch (e) { state.orgs = state.orgs.filter(x => x !== o); throw e; }
  log('admin', `New trial sign-up: ${firm} (${cleanEmail(req.body.email)}), valid until ${valid}`, o.id);
  save('signup');
  return { ok: true };
}));

app.post('/api/auth/password', wrap(req => {
  const u = need(req);
  if (!checkPassword(req.body.current || '', u.passwordHash)) throw new Error('Current password is incorrect');
  validatePassword(req.body.password);
  u.passwordHash = hashPassword(req.body.password);
  save('auth');
  return { ok: true };
}));

// Everything below requires a signed-in user
function need(req, role) {
  const u = req.user || userBySession(req);
  if (!u) throw new HttpError(401, 'Please sign in');
  if (role === 'admin' && !(u.superAdmin || ['owner', 'admin'].includes(u.role))) throw new HttpError(403, 'Only workspace admins can do this');
  if (role === 'super' && !u.superAdmin) throw new HttpError(403, 'Only the platform owner can do this');
  return u;
}
// Platform owner may switch into a client workspace (X-Org header); others are fixed to their own.
const activeOrgId = (req, u) => (u.superAdmin && req.headers['x-org'] && getOrg(req.headers['x-org'])) ? req.headers['x-org'] : u.orgId;
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const u = userBySession(req);
  if (!u) return res.status(401).json({ error: 'Please sign in' });
  req.user = u;
  req.org = getOrg(activeOrgId(req, u));
  if (!req.org) return res.status(403).json({ error: 'Workspace not found' });
  if (req.org.validUntil && req.org.validUntil < todayIST() && !u.superAdmin && req.path !== '/meta')
    return res.status(402).json({ error: `Your subscription ended on ${req.org.validUntil}. Please contact your provider to renew.` });
  req.view = viewFor(req.org);
  next();
});

const orgCompanies = org => state.companies.filter(c => c.orgId === org.id);
const company = req => {
  const c = getCompany(req.query.company || req.body?.company);
  if (!c || c.orgId !== req.org.id) throw new HttpError(404, 'Unknown company');
  return c;
};
const orgSummary = o => o && ({ id: o.id, name: o.name, plan: o.plan, isDefault: !!o.isDefault });

/* ───────────── Real-time push (Server-Sent Events) ───────────── */
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const on = e => res.write(`data: ${JSON.stringify({ reason: e.reason, at: e.at })}\n\n`);
  bus.on('change', on);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { bus.off('change', on); clearInterval(ping); });
});

app.get('/api/meta', wrap(req => {
  const org = req.org;
  return {
    user: publicUser(req.user), org: orgSummary(org),
    orgs: req.user.superAdmin ? state.orgs.map(orgSummary) : null,
    companies: orgCompanies(org),
    settings: org.settings,
    today: todayIST(), currentFy: fyOfDate(todayIST()),
    categories: CATEGORIES, entityTypes: ENTITY_TYPES,
    mailConfigured: mailConfigured(org), mailUser: mailUser(org),
    mail: { provider: org.mail?.provider || (org.isDefault && process.env.GMAIL_USER ? 'gmail' : ''), user: mailUser(org), fromName: org.mail?.fromName || '', fromEnv: !org.mail && !!mailConfigured(org) },
    lastDaily: org.lastDaily,
    appUrl: APP_URL(), lanUrl: LAN_URL(),
    expired: !!(org.validUntil && org.validUntil < todayIST()), validUntil: org.validUntil || null,
    whatsapp: { configured: waConfigured(org), sid: org.whatsapp?.sid || '', from: org.whatsapp?.from || '', contentSid: org.whatsapp?.contentSid || '', enabled: org.whatsapp?.enabled !== false },
    platform: req.user.superAdmin ? state.platform : null,
    eventTemplates: EVENT_TEMPLATES.map(({ applies, ...t }) => t)
  };
}));

app.get('/api/calendar', wrap(req => {
  const c = company(req), fy = fyParam(req);
  const items = buildCalendar(req.view, c, fy);
  return {
    company: c, fy, fyLabel: fyLabel(fy), today: todayIST(), items, stats: stats(items),
    quarters: [1, 2, 3, 4].map(q => ({ q, label: qtrLabel(fy, q), end: quarterEnds(fy)[q - 1] })),
    events: state.events[c.id]?.[fy] || {},
    sync: state.sync[c.id] || null,
    eventTemplates: EVENT_TEMPLATES.filter(t => t.applies(c)).map(({ applies, ...t }) => t),
    applicable: TEMPLATES.filter(t => t.applies(c)).map(t => ({ id: t.id, kind: t.kind, cat: t.cat, title: titleOf(t, c) })),
    occurrences: state.occurrences[c.id] || [],
    manual: (state.manual[c.id] || []).filter(m => +m.fy === fy)
  };
}));

const who = req => req.user.name || req.user.email;

app.post('/api/instance', wrap(req => {
  const c = company(req);
  const { key, submittedAt, clear, snoozeUntil, note } = req.body;
  const st = statusOf(c.id, key);
  if (clear) { delete st.submittedAt; delete st.source; delete st.ref; }
  if (submittedAt) { st.submittedAt = submittedAt; st.source = 'manual'; st.by = who(req); delete st.ref; }
  if (snoozeUntil !== undefined) st.snoozeUntil = snoozeUntil || null;
  if (note !== undefined) st.note = note;
  log('update', `${c.shortName || c.name}: ${key} ${clear ? 'submission cleared' : submittedAt ? 'submitted ' + submittedAt : snoozeUntil ? 'snoozed till ' + snoozeUntil : 'updated'} by ${who(req)}`, c.orgId);
  save('instance');
  return { ok: true };
}));

app.post('/api/bulk-done', wrap(req => {
  need(req, 'admin');
  const c = company(req), fy = fyParam(req);
  const before = req.body.before || todayIST();
  let n = 0;
  for (const it of buildCalendar(req.view, c, fy)) {
    if (!it.submittedAt && it.due && it.due < before) {
      Object.assign(statusOf(c.id, it.key), { submittedAt: it.due + 'T00:00:00', source: 'bulk', by: who(req) });
      n++;
    }
  }
  log('update', `${c.shortName || c.name}: ${n} historical item(s) marked completed (due before ${before}) by ${who(req)}`, c.orgId);
  save('bulk');
  return { ok: true, count: n };
}));

app.post('/api/event-date', wrap(req => {
  const c = company(req), fy = fyParam(req);
  const { quarter, field, date } = req.body;
  if (!['bm', 'call', 'agm'].includes(field)) throw new Error('Unknown event');
  // Reject impossible dates (e.g. a 2-digit year saved as 0002, or a results meeting before the quarter has ended)
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a full date (DD-MM-YYYY)');
    const [lo, hi, what] = quarter
      ? [addDays(quarterEnds(fy)[quarter - 1], 1), addDays(quarterEnds(fy)[quarter - 1], 180), `${field === 'bm' ? 'The results board meeting' : 'The earnings call'} for the quarter ended ${fmtLong(quarterEnds(fy)[quarter - 1])}`]
      : [ymd(fy, 4, 1), ymd(fy + 1, 3, 31), 'The AGM date'];
    if (date < lo || date > hi) throw new Error(`${what} must fall between ${fmtLong(lo)} and ${fmtLong(hi)} — you entered ${fmtLong(date)}. Check the year (use 4 digits, e.g. 2026).`);
  }
  if (!date && !req.body.clear) throw new Error('Enter a date');
  const ev = eventsOf(c.id, fy);
  const target = quarter ? (ev['Q' + quarter] ||= {}) : ev;
  const before = target[field] || null;
  if (date) { target[field] = date; target[field + 'Src'] = 'user'; } else { delete target[field]; delete target[field + 'Src']; }
  const label = { bm: 'board meeting', call: 'earnings call', agm: 'AGM' }[field];
  log('update', `${c.shortName || c.name}: ${quarter ? `Q${quarter} ` : ''}${label} date ${date ? `set to ${fmtLong(date)}` : 'removed'}${before ? ` (was ${fmtLong(before)})` : ''} by ${who(req)}`, c.orgId);
  save('event');
  return { ok: true };
}));

/* Companies */
app.post('/api/company', wrap(req => {
  need(req, 'admin');
  const b = req.body;
  if (!b.name) throw new Error('Company name is required');
  let c = state.companies.find(x => x.id === b.id && x.orgId === req.org.id);
  if (!c) {
    const limit = req.org.maxCompanies;
    if (limit && orgCompanies(req.org).length >= limit) throw new Error(`Your plan allows ${limit} companies. Contact your provider to upgrade.`);
    c = { id: uid(), orgId: req.org.id, disabledTemplates: [], recipients: { to: '', cc: [] } };
    state.companies.push(c);
  }
  const flags = ['listedEquity', 'listedDebt', 'monitoringAgency', 'earningsCall', 'brsr', 'largeCorporate', 'costAudit', 'csr', 'secretarialAudit', 'includeTaxLabour'];
  Object.assign(c, {
    name: b.name.trim(), shortName: (b.shortName || '').trim(), entityType: b.entityType || 'listed',
    nseSymbol: (b.nseSymbol || '').trim(), bseCode: (b.bseCode || '').trim(), isin: (b.isin || '').trim(), cin: (b.cin || '').trim(), trackFrom: b.trackFrom || ''
  });
  for (const f of flags) c[f] = !!b[f];
  if (c.entityType !== 'listed') { c.listedEquity = false; c.listedDebt = false; c.bseCode = ''; c.nseSymbol = ''; }
  if (Array.isArray(b.disabledTemplates)) c.disabledTemplates = b.disabledTemplates;
  if (b.recipients) c.recipients = { to: (b.recipients.to || '').trim(), cc: (b.recipients.cc || []).filter(r => r.email), whatsapp: c.recipients?.whatsapp || [] };
  log('company', `Company saved: ${c.name} by ${who(req)}`, c.orgId);
  save('company');
  if (c.bseCode) {
    const view = req.view;
    syncCompany(view, c).then(r => { log('bse', `${c.shortName || c.name}: ${r.message} (new profile)`, c.orgId); save('bse-sync'); })
      .catch(e => { log('error', `${c.name}: BSE check failed – ${e.message}`, c.orgId); save('error'); });
  }
  return { ok: true, company: c };
}));

app.delete('/api/company/:id', wrap(req => {
  need(req, 'admin');
  const c = state.companies.find(x => x.id === req.params.id && x.orgId === req.org.id);
  if (!c) throw new HttpError(404, 'Unknown company');
  state.companies = state.companies.filter(x => x !== c);
  log('company', `Company deleted: ${c.name} by ${who(req)}`, c.orgId);
  save('company');
  return { ok: true };
}));

app.post('/api/recipients', wrap(req => {
  need(req, 'admin');
  const c = company(req);
  c.recipients = {
    to: (req.body.to || '').trim(), cc: (req.body.cc || []).filter(r => r.email),
    whatsapp: (req.body.whatsapp ?? c.recipients?.whatsapp ?? []).filter(r => r.number).map(r => ({ name: (r.name || '').trim(), number: normaliseNumber(r.number) }))
  };
  save('recipients');
  return { ok: true };
}));

/* Manual entries & event occurrences */
app.post('/api/manual', wrap(req => {
  const c = company(req);
  const b = req.body;
  if (!b.title) throw new Error('Title is required');
  if (!b.dates?.some(d => d.due)) throw new Error('At least one due date is required');
  const list = (state.manual[c.id] ||= []);
  const m = { id: b.id || uid(), fy: +b.fy, title: b.title, timeline: b.timeline || '', category: b.category || 'Manual', frequency: b.frequency || 'One-time', dueRule: b.dueRule || '', portal: b.portal || '', dates: b.dates.filter(d => d.due), createdAt: new Date().toISOString(), by: who(req) };
  const i = list.findIndex(x => x.id === m.id);
  if (i >= 0) list[i] = m; else list.push(m);
  if (b.completed) for (const d of m.dates) Object.assign(statusOf(c.id, `M:${m.id}|${d.pkey}`), { submittedAt: d.due + 'T00:00:00', source: 'manual' });
  log('manual', `${c.shortName || c.name}: manual compliance "${m.title}" saved by ${who(req)}`, c.orgId);
  save('manual');
  return { ok: true, entry: m };
}));
app.delete('/api/manual/:id', wrap(req => {
  const c = company(req);
  state.manual[c.id] = (state.manual[c.id] || []).filter(m => m.id !== req.params.id);
  save('manual');
  return { ok: true };
}));
app.post('/api/occurrence', wrap(req => {
  const c = company(req);
  const { tplId, eventDate, note } = req.body;
  if (!tplId || !eventDate) throw new Error('Select the event type and date');
  (state.occurrences[c.id] ||= []).push({ id: uid(), tplId, eventDate, note: note || '', createdAt: new Date().toISOString(), by: who(req) });
  save('occurrence');
  return { ok: true };
}));
app.delete('/api/occurrence/:id', wrap(req => {
  const c = company(req);
  state.occurrences[c.id] = (state.occurrences[c.id] || []).filter(o => o.id !== req.params.id);
  save('occurrence');
  return { ok: true };
}));

/* Workspace settings & sender mailbox */
app.post('/api/settings', wrap(req => {
  need(req, 'admin');
  const s = req.org.settings, b = req.body;
  if (b.reminderDays !== undefined) s.reminderDays = Math.max(0, Math.min(30, +b.reminderDays));
  if (b.sendTime) s.sendTime = b.sendTime;
  if (b.autoSend !== undefined) s.autoSend = !!b.autoSend;
  if (b.includeCirculars !== undefined) s.includeCirculars = !!b.includeCirculars;
  if (b.whatsappForward !== undefined) s.whatsappForward = !!b.whatsappForward;
  if (b.holidays !== undefined) s.holidays = String(b.holidays).split(/[\s,]+/).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  save('settings');
  return { ok: true, settings: s };
}));

app.post('/api/org/mail', wrap(async req => {
  need(req, 'admin');
  const { provider = 'gmail', user, password, fromName, host, port, remove } = req.body;
  if (remove) { req.org.mail = null; log('email', `Sender mailbox disconnected by ${who(req)}`, req.org.id); save('mail'); return { ok: true }; }
  if (!/^\S+@\S+\.\S+$/.test(user || '')) throw new Error('Enter the sender e-mail address');
  const pass = password || (req.org.mail?.user === user ? mailCreds(req.org)?.pass : '');
  if (!pass) throw new Error('Enter the app password for this mailbox');
  const creds = { provider, user: user.trim(), pass, host, port };
  try { await makeTransport(creds).verify(); }
  catch (e) { throw new Error('Could not sign in to the mailbox: ' + (e.response || e.message) + '. For Gmail use a 16-character App Password, not the normal password.'); }
  req.org.mail = { provider, user: creds.user, pass: encrypt(pass), fromName: (fromName || '').trim(), host: host || '', port: port || '' };
  log('email', `Sender mailbox connected: ${creds.user} by ${who(req)}`, req.org.id);
  save('mail');
  return { ok: true };
}));

/* Team & clients */
function invite(req, org, { email, name, role }) {
  email = cleanEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid e-mail');
  let u = state.users.find(x => x.email === email);
  if (u && u.orgId !== org.id) throw new Error('This e-mail already belongs to another workspace');
  if (u && u.passwordHash) throw new Error('This person already has an account');
  if (!u) { u = { id: uid(), email, name: (name || '').trim(), orgId: org.id, role: role || 'member', createdAt: new Date().toISOString() }; state.users.push(u); }
  u.inviteToken = token();
  u.inviteExp = Date.now() + 7 * 86400e3;
  log('auth', `Invite created for ${email} (${u.role}) by ${who(req)}`, org.id);
  return { user: publicUser(u), ...links('invite=' + u.inviteToken) };
}
app.get('/api/team', wrap(req => {
  need(req, 'admin');
  return state.users.filter(u => u.orgId === req.org.id).map(u => ({ ...publicUser(u), lastLogin: u.lastLogin, active: u.active !== false }));
}));
app.post('/api/team/invite', wrap(req => {
  need(req, 'admin');
  const role = ['admin', 'member'].includes(req.body.role) ? req.body.role : 'member';
  const r = invite(req, req.org, { ...req.body, role });
  save('team');
  return r;
}));
app.post('/api/team/:id', wrap(req => {
  const me = need(req, 'admin');
  const u = state.users.find(x => x.id === req.params.id && x.orgId === req.org.id);
  if (!u) throw new HttpError(404, 'User not found');
  if (u.id === me.id) throw new Error('You cannot change your own access here');
  if (u.superAdmin) throw new Error('The platform owner cannot be changed');
  if (req.body.remove) { state.users = state.users.filter(x => x !== u); for (const [k, s] of Object.entries(state.sessions)) if (s.userId === u.id) delete state.sessions[k]; }
  if (req.body.role && ['admin', 'member'].includes(req.body.role)) u.role = req.body.role;
  save('team');
  return { ok: true };
}));

app.get('/api/team-join-link', wrap(req => {
  need(req, 'admin');
  const o = req.org;
  return { enabled: !!o.joinEnabled, ...(o.joinCode ? links('join=' + o.joinCode) : {}) };
}));
app.post('/api/team-join-link', wrap(req => {
  need(req, 'admin');
  const o = req.org;
  if (req.body.regenerate || !o.joinCode) o.joinCode = token();
  if (req.body.enabled !== undefined) o.joinEnabled = !!req.body.enabled;
  log('auth', `Team join link ${o.joinEnabled ? 'enabled' : 'disabled'}${req.body.regenerate ? ' (new link)' : ''} by ${who(req)}`, o.id);
  save('team');
  return { enabled: !!o.joinEnabled, ...links('join=' + o.joinCode) };
}));

app.post('/api/admin/platform', wrap(req => {
  need(req, 'super');
  const p = state.platform, b = req.body;
  if (b.allowSignup !== undefined) p.allowSignup = !!b.allowSignup;
  if (b.trialDays) p.trialDays = Math.max(1, Math.min(365, +b.trialDays));
  if (b.trialMaxCompanies) p.trialMaxCompanies = Math.max(1, +b.trialMaxCompanies);
  save('platform');
  return { ...p, ...links('signup') };
}));

/* WhatsApp (Twilio) */
app.post('/api/org/whatsapp', wrap(async req => {
  need(req, 'admin');
  const b = req.body, o = req.org;
  if (b.remove) { o.whatsapp = null; save('wa'); return { ok: true }; }
  if (b.toggle !== undefined) { if (!o.whatsapp) throw new Error('Connect Twilio first'); o.whatsapp.enabled = !!b.toggle; save('wa'); return { ok: true }; }
  const sid = (b.sid || '').trim(), from = normaliseNumber(b.from);
  const tok = b.token || (o.whatsapp?.sid === sid ? (await import('./lib/auth.js')).decrypt(o.whatsapp.token) : '');
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) throw new Error('Account SID should start with AC followed by 32 characters (Twilio Console → Account Info)');
  if (!tok) throw new Error('Enter the Twilio Auth Token');
  if (!from) throw new Error('Enter the WhatsApp sender number (e.g. +14155238886 for the Twilio sandbox)');
  if (from !== '+14155238886' && !(b.contentSid || '').trim())
    throw new Error(`${from} is not the Twilio sandbox. Use +14155238886 for testing, or add your approved template's Content SID if ${from} is a WhatsApp sender registered in your Twilio account. (Your personal number belongs in the recipient list, not here.)`);
  const name = await verifyTwilio({ sid, token: tok });
  o.whatsapp = { sid, token: encrypt(tok), from, contentSid: (b.contentSid || '').trim(), enabled: b.enabled !== false };
  log('whatsapp', `Twilio connected (${name}), sender ${from}, by ${who(req)}`, o.id);
  save('wa');
  return { ok: true, account: name };
}));
function composeWhatsApp(org, c, mode, fy, q) {
  const view = viewFor(org);
  if (mode === 'quarter') {
    const items = buildCalendar(view, c, fy).filter(i => i.bucket === q && !i.submittedAt);
    const end = quarterEnds(fy)[q - 1];
    return buildWhatsApp(c, items, APP_URL(), { mode: 'quarter', quarterLabel: `${QUARTER_NAMES[q - 1]} ${end.slice(0, 4)}` });
  }
  return buildWhatsApp(c, reminderItems(view, c), APP_URL(), { circulars: org.settings.includeCirculars ? recentCirculars(state) : [] });
}
app.get('/api/whatsapp/preview', wrap(req => {
  const c = company(req);
  return { body: composeWhatsApp(req.org, c, req.query.mode || 'reminder', fyParam(req), +req.query.q || 2).body, numbers: (c.recipients?.whatsapp || []), from: req.org.whatsapp?.from || '' };
}));
app.post('/api/whatsapp/test', wrap(async req => {
  need(req, 'admin');
  const c = company(req);
  const nums = req.body.number ? [req.body.number] : (c.recipients?.whatsapp || []).map(r => r.number);
  if (!nums.length) throw new Error('Add at least one WhatsApp number for this company');
  const msg = composeWhatsApp(req.org, c, req.body.mode || 'reminder', fyParam(req), +req.body.q || 2);
  const r = await sendWhatsApp(req.org, nums, msg);
  log('whatsapp', `${c.shortName || c.name}: test WhatsApp sent to ${r.sent.join(', ') || 'nobody'}${r.failed.length ? ' – failed: ' + r.failed.join('; ') : ''} by ${who(req)}`, c.orgId);
  save('wa');
  if (!r.sent.length) throw new Error(r.failed.join('; '));
  return r;
}));

app.get('/api/admin/orgs', wrap(req => {
  need(req, 'super');
  return state.orgs.map(o => ({
    ...orgSummary(o), createdAt: o.createdAt, maxCompanies: o.maxCompanies || null, validUntil: o.validUntil || null, contact: o.contact || '',
    companies: orgCompanies(o).length, users: state.users.filter(u => u.orgId === o.id).length, mail: mailUser(o)
  }));
}));
app.post('/api/admin/orgs', wrap(req => {
  need(req, 'super');
  const b = req.body;
  if (!b.name) throw new Error('Client name is required');
  let o = b.id && getOrg(b.id);
  if (!o) {
    o = { id: 'org-' + uid(), name: '', createdAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS }, mail: null, lastDaily: null };
    state.orgs.push(o);
  }
  Object.assign(o, { name: b.name.trim(), plan: b.plan || o.plan || 'standard', maxCompanies: b.maxCompanies ? +b.maxCompanies : null, validUntil: b.validUntil || null, contact: (b.contact || '').trim() });
  let inv = null;
  if (b.ownerEmail) inv = invite(req, o, { email: b.ownerEmail, name: b.ownerName, role: 'owner' });
  log('admin', `Client workspace saved: ${o.name}`, o.id);
  save('orgs');
  return { ok: true, org: orgSummary(o), invite: inv };
}));
app.post('/api/admin/orgs/:id/invite', wrap(req => {
  need(req, 'super');
  const o = getOrg(req.params.id);
  if (!o) throw new HttpError(404, 'Unknown workspace');
  const r = invite(req, o, { ...req.body, role: req.body.role || 'owner' });
  save('team');
  return r;
}));

/* BSE verification */
let syncing = false;
async function syncAll(reason) {
  if (syncing) return;
  syncing = true;
  try {
    for (const c of state.companies.filter(c => c.bseCode)) {
      const org = getOrg(c.orgId);
      if (!org || (org.validUntil && org.validUntil < todayIST())) continue;
      try {
        const r = await syncCompany(viewFor(org), c);
        log('bse', `${c.shortName || c.name}: ${r.message} (${reason})`, c.orgId);
      } catch (e) {
        state.sync[c.id] = { ok: false, at: new Date().toISOString(), message: 'BSE check failed: ' + e.message };
        log('error', `${c.shortName || c.name}: BSE check failed – ${e.message}`, c.orgId);
      }
    }
    save('bse-sync');
  } finally { syncing = false; }
}
app.post('/api/sync', wrap(async req => {
  const c = company(req);
  const r = await syncCompany(req.view, c);
  log('bse', `${c.shortName || c.name}: ${r.message} (manual)`, c.orgId);
  save('bse-sync');
  return r;
}));

/* Circulars (shared by all workspaces) */
let refreshing = false;
async function refreshCirculars() {
  if (refreshing) return;
  refreshing = true;
  try {
    const r = await refreshAll(state);
    log('circulars', 'Circulars refreshed – ' + Object.entries(r).map(([k, v]) => `${k.toUpperCase()}: ${v.ok ? v.count + (v.new ? ` (${v.new} new)` : '') : 'failed'}`).join(', '));
    save('circulars');
    return r;
  } finally { refreshing = false; }
}
// Read / unread is tracked per user: everything that arrived before `readUpTo` (or was opened individually) is read.
const circRead = u => {
  u.circRead ||= {};
  for (const k of ['bse', 'nse', 'sebi']) u.circRead[k] ||= { upTo: new Date().toISOString(), ids: [] };
  return u.circRead;
};
app.get('/api/circulars', wrap(req => {
  const rd = circRead(req.user);
  const out = {};
  for (const k of ['bse', 'nse', 'sebi']) {
    const f = state.circulars[k] || {}, ids = new Set(rd[k].ids), forced = new Set(rd[k].unreadIds || []);
    const items = (f.items || []).filter(i => i.title && i.date).map(i => {
      const seen = f.firstSeen?.[i.id] || '';
      return { ...i, firstSeen: seen, unread: forced.has(i.id) || (seen > rd[k].upTo && !ids.has(i.id)) };
    });
    out[k] = { fetchedAt: f.fetchedAt, ok: f.ok, error: f.error, unread: items.filter(i => i.unread).length, items };
  }
  return out;
}));
app.post('/api/circulars/read', wrap(req => {
  const rd = circRead(req.user);
  const { source, id, all, unread } = req.body;
  if (!rd[source]) throw new Error('Unknown source');
  const r = rd[source];
  r.unreadIds ||= [];
  if (all) rd[source] = { upTo: new Date().toISOString(), ids: [], unreadIds: [] };
  else if (id && unread) { r.ids = r.ids.filter(x => x !== id); if (!r.unreadIds.includes(id)) r.unreadIds.push(id); }
  else if (id) { r.unreadIds = r.unreadIds.filter(x => x !== id); if (!r.ids.includes(id)) r.ids = [...r.ids, id].slice(-2000); }
  save('circ-read');
  return { ok: true };
}));
app.post('/api/circulars/refresh', wrap(() => refreshCirculars()));

/* Email */
function reminderItems(view, c) {
  const fy = fyOfDate(todayIST());
  return [...buildCalendar(view, c, fy - 1), ...buildCalendar(view, c, fy)]
    .filter(i => i.inReminderWindow)
    .sort((a, b) => a.due.localeCompare(b.due));
}
function composeEmail(org, c, mode, fy, q) {
  const view = viewFor(org);
  const waText = org.settings.whatsappForward !== false ? composeWhatsApp(org, c, mode, fy, q).body : '';
  if (mode === 'quarter') {
    const items = buildCalendar(view, c, fy).filter(i => i.bucket === q && !i.submittedAt);
    const end = quarterEnds(fy)[q - 1];
    return buildEmail(c, items, { mode: 'quarter', quarterLabel: `${QUARTER_NAMES[q - 1]} ${end.slice(0, 4)}`, appUrl: APP_URL(), waText });
  }
  return buildEmail(c, reminderItems(view, c), { appUrl: APP_URL(), circulars: org.settings.includeCirculars ? recentCirculars(state) : [], waText });
}
app.get('/api/email/preview', wrap(req => {
  const c = company(req);
  const email = composeEmail(req.org, c, req.query.mode || 'reminder', fyParam(req), +req.query.q || 2);
  return { ...email, ...recipients(c), from: mailUser(req.org) || '(no sender connected)' };
}));
app.post('/api/email/send', wrap(async req => {
  const c = company(req);
  const email = composeEmail(req.org, c, req.body.mode || 'reminder', fyParam(req), +req.body.q || 2);
  const r = await send(c, email, req.org);
  log('email', `${c.shortName || c.name}: "${email.subject}" sent to ${r.to}${r.cc.length ? ' (cc ' + r.cc.join(', ') + ')' : ''} by ${who(req)}`, c.orgId);
  save('email');
  return { ok: true, ...r, subject: email.subject };
}));

async function runDailyReminders(org, reason) {
  const out = [];
  for (const c of orgCompanies(org)) {
    const items = reminderItems(viewFor(org), c);
    if (!items.length) { out.push({ company: c.name, sent: false, reason: 'Nothing due in reminder window' }); continue; }
    if (mailConfigured(org)) try {
      const email = composeEmail(org, c, 'reminder');
      const r = await send(c, email, org);
      log('email', `${c.shortName || c.name}: daily reminder (${items.length} item(s)) sent to ${r.to} (${reason})`, org.id);
      out.push({ company: c.name, sent: true, items: items.length });
    } catch (e) {
      log('error', `${c.shortName || c.name}: reminder email failed – ${e.message}`, org.id);
      out.push({ company: c.name, sent: false, reason: e.message });
    }
    const nums = (c.recipients?.whatsapp || []).map(r => r.number);
    if (nums.length && waConfigured(org) && org.whatsapp?.enabled !== false) {
      try {
        const r = await sendWhatsApp(org, nums, buildWhatsApp(c, items, APP_URL(), { circulars: org.settings.includeCirculars ? recentCirculars(state) : [] }));
        log('whatsapp', `${c.shortName || c.name}: WhatsApp reminder sent to ${r.sent.length} number(s)${r.failed.length ? ' – failed: ' + r.failed.join('; ') : ''}`, org.id);
      } catch (e) { log('error', `${c.shortName || c.name}: WhatsApp reminder failed – ${e.message}`, org.id); }
    }
  }
  org.lastDaily = { date: todayIST(), at: new Date().toISOString(), results: out };
  save('daily');
  return out;
}
app.post('/api/reminders/run', wrap(async req => {
  need(req, 'admin');
  await syncAll('before reminders');
  return runDailyReminders(req.org, 'manual run by ' + who(req));
}));

// BSE moves older attachments from AttachLive to AttachHis — resolve the right one when the link is opened
app.get('/api/bse-pdf/:file', async (req, res) => {
  const file = req.params.file;
  if (!/^[\w-]+\.pdf$/i.test(file)) return res.status(400).send('Invalid file');
  const base = 'https://www.bseindia.com/xml-data/corpfiling/';
  for (const dir of ['AttachLive', 'AttachHis']) {
    if (await httpStatus(base + dir + '/' + file, { Referer: 'https://www.bseindia.com/' }) < 400) return res.redirect(base + dir + '/' + file);
  }
  res.redirect(base + 'AttachHis/' + file);
});

app.get('/api/lookup', wrap(req => searchScrips(req.query.q)));
app.get('/api/announcements', wrap(req => {
  const c = company(req);
  return { company: c, items: state.announcements?.[c.id] || [], sync: state.sync[c.id] || null };
}));
app.get('/api/logs', wrap(req => state.logs.filter(l => !l.orgId || l.orgId === req.org.id).slice(0, 200)));

/* ── Scheduler: BSE every 2 h (07:00–23:00 IST), circulars every 2 h, each workspace's daily e-mail at its send time ── */
let lastSyncAt = 0, lastCircAt = 0, dailyBusy = false;
setInterval(async () => {
  const hhmm = timeIST(), hour = +hhmm.slice(0, 2), now = Date.now();
  if (hour >= 7 && hour <= 23 && now - lastSyncAt > 2 * 3600e3) { lastSyncAt = now; syncAll('scheduled').catch(() => {}); }
  if (now - lastCircAt > 2 * 3600e3) { lastCircAt = now; refreshCirculars().catch(() => {}); }
  if (dailyBusy) return;
  const due = state.orgs.filter(o => o.settings.autoSend && hhmm >= o.settings.sendTime && o.lastDaily?.date !== todayIST() && (mailConfigured(o) || waConfigured(o)) && !(o.validUntil && o.validUntil < todayIST()));
  if (!due.length) return;
  dailyBusy = true;
  try {
    for (const o of due) o.lastDaily = { date: todayIST(), at: new Date().toISOString(), results: [] }; // claim the slot
    await syncAll('before reminders');
    await refreshCirculars().catch(() => {});
    for (const o of due) await runDailyReminders(o, `scheduled ${o.settings.sendTime} IST`).catch(e => log('error', 'Daily run failed: ' + e.message, o.id));
  } finally { dailyBusy = false; }
}, 60 * 1000);

app.listen(PORT, () => {
  const def = state.orgs.find(o => o.isDefault);
  console.log(`\n  Compliance Calendar running → ${APP_URL()}\n  Workspaces: ${state.orgs.length} · Users: ${state.users.length}${state.users.length ? '' : ' (open the app to create the owner account)'}\n  Team sender mailbox: ${mailUser(def) || 'not connected'}\n`);
  setTimeout(() => { lastSyncAt = Date.now(); syncAll('startup'); }, 2000);
  setTimeout(() => { lastCircAt = Date.now(); refreshCirculars().catch(() => {}); }, 4000);
});
