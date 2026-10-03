// Directory of BSE-listed companies (scrip code, symbol, ISIN, market cap) for company lookup.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bseApi } from './http.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'scrips.json');
let cache = null;

async function load() {
  if (cache && Date.now() - cache.at < 24 * 3600e3) return cache.list;
  if (!cache && fs.existsSync(FILE)) {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Date.now() - cache.at < 24 * 3600e3) return cache.list;
  }
  try {
    const rows = await bseApi('ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active');
    const list = rows.map(r => ({
      bseCode: r.SCRIP_CD, symbol: r.scrip_id, name: r.Issuer_Name || r.Scrip_Name, shortName: r.Scrip_Name,
      isin: r.ISIN_NUMBER, group: r.GROUP, mcap: parseFloat(r.Mktcap) || 0
    })).sort((a, b) => b.mcap - a.mcap);
    list.forEach((s, i) => (s.mcapRank = i + 1));
    cache = { at: Date.now(), list };
    fs.writeFileSync(FILE, JSON.stringify(cache));
  } catch (e) {
    if (!cache) throw e; // keep serving the stale copy if BSE is unreachable
  }
  return cache.list;
}

export async function searchScrips(q) {
  q = String(q || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const list = await load();
  const score = s => {
    const n = s.name.toLowerCase(), sym = (s.symbol || '').toLowerCase();
    if (s.bseCode === q || sym === q || (s.isin || '').toLowerCase() === q) return 0;
    if (n.startsWith(q) || sym.startsWith(q)) return 1;
    if (n.includes(q) || s.shortName.toLowerCase().includes(q)) return 2;
    return 9;
  };
  return list.map(s => [score(s), s]).filter(([sc]) => sc < 9)
    .sort((a, b) => a[0] - b[0] || a[1].mcapRank - b[1].mcapRank).slice(0, 12).map(([, s]) => s);
}
