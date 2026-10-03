#!/usr/bin/env node
// Health check for every external data source the compliance calendar depends on.
// Usage: node scripts/check_sources.mjs [bseScripCode]   (default 500209 = Infosys)
// Prints OK / FAIL per source with a row count, so a broken exchange endpoint is spotted in seconds.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'app', 'lib');
const { bseApi } = await import(pathToFileURL(path.join(app, 'http.js')));
const { fetchBse, fetchNse, fetchSebi } = await import(pathToFileURL(path.join(app, 'circulars.js')));

const code = process.argv[2] || '500209';
const ymd = d => d.toISOString().slice(0, 10).replaceAll('-', '');
const to = new Date(), from = new Date(Date.now() - 180 * 86400e3);

const checks = {
  'BSE announcements': () => bseApi(`AnnSubCategoryGetData/w?pageno=1&strCat=-1&strPrevDate=${ymd(from)}&strScrip=${code}&strSearch=P&strToDate=${ymd(to)}&strType=C&subcategory=-1`).then(d => d.Table?.length ?? 0),
  'BSE shareholding pattern': () => bseApi(`SHPQNewFormat/w?scripcode=${code}&qtrid=&type=`).then(d => d.Table?.length ?? 0),
  'BSE integrated filing – governance': () => bseApi(`Integratedfiledata/w?scripcode=${code}`).then(d => d.Table?.length ?? 0),
  'BSE integrated filing – finance': () => bseApi(`Integratedfinancedata/w?scripcode=${code}`).then(d => d.Table?.length ?? 0),
  'BSE list of scrips': () => bseApi('ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active').then(d => d.length ?? 0),
  'BSE circulars to listed companies': () => fetchBse().then(r => r.length),
  'NSE circulars to listed companies (equity + debt)': () => fetchNse().then(r => r.length),
  'SEBI circulars / regulations': () => fetchSebi().then(r => r.length)
};

let failed = 0;
for (const [name, fn] of Object.entries(checks)) {
  const t = Date.now();
  try {
    const n = await fn();
    if (!n) throw new Error('returned 0 rows');
    console.log(`OK    ${name.padEnd(48)} ${String(n).padStart(5)} rows  ${Date.now() - t} ms`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name.padEnd(48)} ${e.message.slice(0, 120)}`);
  }
}
console.log(failed ? `\n${failed} source(s) failing — see references/data-sources.md §6 to re-discover the endpoint.` : '\nAll sources OK.');
process.exit(failed ? 1 : 0);
