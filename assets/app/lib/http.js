// HTTP via the system curl. BSE's edge (Akamai) rejects Node's TLS/header fingerprint and sends
// headers Node's strict parser refuses, while curl with browser headers is accepted reliably.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

export const BSE_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.bseindia.com/',
  Origin: 'https://www.bseindia.com',
  'sec-fetch-site': 'same-site',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty'
};

export const NSE_JAR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'nse-cookies.txt');

export function curl(url, { headers = {}, readJar, writeJar, timeout = 45, http1 = false } = {}) {
  const args = ['-s', '-S', '--compressed', '-L', '-m', String(timeout), '-A', UA];
  if (http1) args.push('--http1.1');
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  if (readJar) args.push('-b', readJar);
  if (writeJar) args.push('-c', writeJar);
  args.push(url);
  return new Promise((resolve, reject) =>
    execFile(CURL, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, out, stderr) =>
      err ? reject(new Error((stderr || err.message).trim())) : resolve(out)));
}

// HTTP status of a URL without downloading the body (first byte only)
export function httpStatus(url, headers = {}) {
  const args = ['-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null', '-w', '%{http_code}', '-r', '0-0', '-m', '20', '-A', UA];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push(url);
  return new Promise(resolve => execFile(CURL, args, { windowsHide: true }, (err, out) => resolve(err ? 0 : +out)));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getJSON(url, opts = {}, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const body = await curl(url, opts);
      const trimmed = body.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
      last = new Error(/access denied/i.test(body) ? 'Blocked by exchange firewall (retrying)' : 'Unexpected response: ' + trimmed.slice(0, 120));
    } catch (e) { last = e; }
    await sleep(1500 * (i + 1));
  }
  throw last;
}

// ── Browser fallback ──
// BSE's firewall sometimes rejects every non-browser client (curl included) while real browsers still get data.
// When that happens, requests go through a hidden Chrome/Edge (puppeteer-core + the browser already installed),
// which fetches from a bseindia.com page exactly like the website does. The browser closes after 3 idle minutes.
const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
let browserPage = null, browserIdle = null, browserStarting = null;

async function bsePage() {
  clearTimeout(browserIdle);
  browserIdle = setTimeout(async () => { const p = browserPage; browserPage = null; try { await p?.browser().close(); } catch {} }, 3 * 60e3);
  if (browserPage && !browserPage.isClosed()) return browserPage;
  if (browserStarting) return browserStarting;
  browserStarting = (async () => {
    const { default: puppeteer } = await import('puppeteer-core');
    const fs = await import('node:fs'), os = await import('node:os');
    let lastErr;
    // also pick up a Playwright-installed Chromium (used on Linux servers, incl. ARM)
    const pw = path.join(os.homedir(), '.cache', 'ms-playwright');
    const extra = fs.existsSync(pw) ? fs.readdirSync(pw).filter(d => d.startsWith('chromium')).map(d => path.join(pw, d, 'chrome-linux', 'chrome')) : [];
    for (const exe of [...BROWSERS, ...extra].filter(p => fs.existsSync(p))) {
      try {
        const b = await puppeteer.launch({
          executablePath: exe, headless: true,
          args: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--no-first-run'],
          userDataDir: path.join(os.tmpdir(), 'compliance-calendar-' + path.basename(exe).replace(/\W/g, ''))
        });
        const p = await b.newPage();
        await p.setUserAgent((await b.userAgent()).replace('HeadlessChrome', 'Chrome'));
        await p.goto('https://www.bseindia.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        return (browserPage = p);
      } catch (e) { lastErr = e; }
    }
    throw new Error('BSE blocked the request and no usable Chrome/Edge was found for the fallback' + (lastErr ? ` (${lastErr.message.split('\n')[0]})` : ''));
  })();
  try { return await browserStarting; } finally { browserStarting = null; }
}

async function bseViaBrowser(url) {
  const page = await bsePage();
  const text = await page.evaluate(async u => { const r = await fetch(u); return r.text(); }, url);
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return JSON.parse(t);
  throw new Error(/access denied/i.test(t) ? 'BSE blocked the request (browser fallback too)' : 'Unexpected BSE response: ' + t.slice(0, 120));
}

let preferBrowser = 0; // after a block, use the browser directly for 30 minutes
export async function bseApi(p, tries = 2) {
  const url = 'https://api.bseindia.com/BseIndiaAPI/api/' + p;
  if (Date.now() < preferBrowser) return bseViaBrowser(url);
  try { return await getJSON(url, { headers: BSE_HEADERS }, tries); }
  catch (e) {
    if (!/blocked|access denied|unexpected response/i.test(e.message)) throw e;
    preferBrowser = Date.now() + 30 * 60e3;
    return bseViaBrowser(url);
  }
}
