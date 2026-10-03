// Accounts, sessions, invites and encryption of stored mail credentials.
import crypto from 'node:crypto';
import fs from 'node:fs';

const SESSION_DAYS = 14;

// APP_SECRET encrypts each workspace's mail password at rest. Generated once and kept in .env.
export function ensureSecret(envFile) {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) return;
  const secret = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(envFile, `\n# Auto-generated – encrypts stored e-mail passwords. Do not share or change.\nAPP_SECRET=${secret}\n`);
  process.env.APP_SECRET = secret;
}
const key = () => crypto.createHash('sha256').update(process.env.APP_SECRET).digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
export function decrypt(blob) {
  if (!blob) return '';
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  const [, salt, hash] = stored.split('$');
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'base64'));
}
export function validatePassword(pw) {
  if (!pw || pw.length < 8) throw new Error('Password must be at least 8 characters');
}

export const token = () => crypto.randomBytes(24).toString('base64url');

export function createSession(state, userId) {
  const t = token();
  state.sessions[t] = { userId, exp: Date.now() + SESSION_DAYS * 86400e3 };
  for (const [k, s] of Object.entries(state.sessions)) if (s.exp < Date.now()) delete state.sessions[k];
  return t;
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(req, value, maxAgeSec) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

// Simple brute-force protection for login: max 10 failures per IP per 15 minutes
const attempts = new Map();
export function throttle(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter(t => now - t < 15 * 60e3);
  attempts.set(ip, a);
  if (a.length >= 10) throw new Error('Too many failed attempts. Try again in 15 minutes.');
  return () => a.push(now);
}

export const publicUser = u => u && ({ id: u.id, email: u.email, name: u.name, mobile: u.mobile || '', role: u.role, orgId: u.orgId, superAdmin: !!u.superAdmin, pending: !u.passwordHash });
