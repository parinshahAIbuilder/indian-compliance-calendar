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

export const bseApi = (p, tries) => getJSON('https://api.bseindia.com/BseIndiaAPI/api/' + p, { headers: BSE_HEADERS }, tries);
