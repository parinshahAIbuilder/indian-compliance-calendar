// Regulatory circular feeds: BSE (circulars to listed companies), NSE (listing / debt), SEBI (RSS).
import { bseApi, curl, getJSON, NSE_JAR } from './http.js';
import { addDays, todayIST } from './dates.js';

const DEBT_RX = /\bdebt\b|debenture|\bNCDs?\b|non[- ]convertible|bond|commercial paper|securiti[sz]ed|municipal|\bInvITs?\b|\bREITs?\b|green debt/i;
const segment = text => (DEBT_RX.test(text) ? 'Debt' : 'Equity');
const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12, Jan: 1, Feb: 2, Mar: 3, Apr: 4, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad = n => String(n).padStart(2, '0');
const decode = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

export async function fetchBse() {
  const today = todayIST();
  const d = await bseApi(`getDataAdvance_New/w?strTxtNoticeNo=&strTxtDate=${addDays(today, -365)}&strTxtTodate=${today}&strScripcode=&strDep=&strSegment=&subject=&category=Circulars%20Listed%20Companies&containgtext=`);
  return (d.Table || []).map(r => ({
    id: 'bse-' + r.Notice_No, date: (r.Notice_Date || '').slice(0, 10), title: decode(r.Subject || ''), ref: r.Notice_No,
    category: r.Dept_Name || 'Circulars to Listed Companies',
    segment: /debt/i.test(r.Segment_Name || '') ? 'Debt' : segment(r.Subject || ''),
    url: r.FileName || `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${r.Notice_No}`
  })).sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));
}

const NSE_DEPTS = /^(listing|debt segment|legal.*|inspection.*|primary market segment)$/i;
const ROUTINE = /^(listing of|trade for trade|buyback offer|mock trading|change in (the )?name|trading in|(suspension|revocation) of|extinguishment|revision in|scheme of arrangement|rights issue|open offer|delisting offer|offer for sale|face value split|listing & trading|trading of rights|early redemption|segmental surrender|dissemination of|interest payment|redemption of)|\(IPO\)\s*$|IPO.*listing/i;

const nseItem = r => ({
  id: 'nse-' + r.circNumber, date: `${r.cirDate.slice(0, 4)}-${r.cirDate.slice(4, 6)}-${r.cirDate.slice(6, 8)}`,
  title: decode(r.sub || ''), ref: r.circDisplayNo, category: r.circDepartment,
  segment: /debt/i.test(r.circDepartment) ? 'Debt' : segment(r.sub || ''),
  routine: ROUTINE.test(r.sub || ''), url: r.circFilelink
});

async function nseRss() {
  const xml = await curl('https://nsearchives.nseindia.com/content/RSS/Circulars.xml', { timeout: 30, http1: true });
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const g = tag => decode((new RegExp(`<${tag}>([\s\S]*?)</${tag}>`).exec(m[1]) || [])[1] || '');
    const link = g('link'), file = link.split('/').pop() || '';
    const dept = (/^[A-Z]+/.exec(file) || [''])[0];
    const pd = /(\d{1,2})\s+(\w{3})\w*\s+(\d{4})/.exec(g('pubDate')) || [];
    return {
      id: 'nse-' + (/\d+/.exec(file) || [link])[0], date: pd[3] ? `${pd[3]}-${pad(MONTHS[pd[2]] || 1)}-${pad(pd[1])}` : '',
      title: g('title'), ref: 'NSE/' + dept + '/' + ((/\d+/.exec(file) || [''])[0]), category: dept === 'CML' ? 'Listing' : dept,
      segment: segment(g('title')), routine: dept !== 'CML' || ROUTINE.test(g('title')), url: link
    };
  });
}

// NSE "Circulars issued to listed companies" (Resources for Listed Companies) – equity & debt pages.
async function nseListedPage(kind) {
  const url = `https://www.nseindia.com/companies-listing/circular-for-listed-companies-${kind}-market`;
  const html = await curl(url, { headers: { Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' }, writeJar: NSE_JAR, timeout: 40, http1: true });
  const start = html.indexOf('Circulars issued to listed companies');
  if (start < 0) throw new Error('NSE page layout not recognised');
  const body = html.slice(start, html.indexOf('</table>', start));
  const out = [];
  for (const row of body.split(/<tr[\s>]/i).slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 2) continue;
    const title = decode(cells[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const cell = c => {
      if (!c) return null;
      const d = /(\d{2})\/(\d{2})\/(\d{4})/.exec(c);
      const h = /href\s*=\s*["']?\s*([^"'\s>]+)/i.exec(c);
      return d ? { date: `${d[3]}-${d[2]}-${d[1]}`, url: h ? h[1].replace(/([^:])\/\/+/g, '$1/') : '' } : null;
    };
    const nse = cell(cells[1]), sebi = cell(cells[2]);
    if (!title || !nse) continue;
    out.push({
      id: `nse-${kind}-${nse.date}-${title.slice(0, 60)}`, date: nse.date, title, ref: sebi ? `SEBI circular ${sebi.date.split('-').reverse().join('/')}` : '',
      category: `Listed companies – ${kind === 'equity' ? 'Equity' : 'Debt'}`, segment: kind === 'equity' ? 'Equity' : 'Debt',
      url: nse.url || url, sebiUrl: sebi?.url || ''
    });
  }
  return out;
}

export async function fetchNse() {
  const retry = kind => nseListedPage(kind).catch(() => new Promise(r => setTimeout(r, 3000)).then(() => nseListedPage(kind)));
  const [eq, debt] = await Promise.allSettled([retry('equity'), retry('debt')]);
  const items = [eq, debt].filter(p => p.status === 'fulfilled').flatMap(p => p.value);
  if (!items.length) throw (eq.reason || debt.reason || new Error('No NSE circulars found'));
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

async function sebiListing(ssid, type) {
  const html = await curl(`https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=${ssid}&smid=0`, { headers: { Accept: 'text/html,*/*' } });
  const out = [];
  for (const m of html.matchAll(/<tr[^>]*>\s*<td[^>]*>\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
    const a = /<a[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/.exec(m[2]);
    if (!a) continue;
    const [mon, dd, yy] = m[1].replace(',', '').split(' ');
    const title = decode(a[3].replace(/<[^>]+>/g, ''));
    out.push({ id: 'sebi-' + a[2], date: `${yy}-${pad(MONTHS[mon])}-${pad(dd)}`, title, category: type, segment: segment(title), url: a[2].startsWith('http') ? a[2] : 'https://www.sebi.gov.in' + a[2], legal: true });
  }
  return out;
}

async function sebiRss() {
  const xml = await curl('https://www.sebi.gov.in/sebirss.xml', { headers: { Accept: 'application/rss+xml,text/xml,*/*' } });
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const g = tag => decode((new RegExp(`<${tag}>([\s\S]*?)</${tag}>`).exec(m[1]) || [])[1] || '');
    const link = g('link'), title = g('title');
    const pd = /(\d{1,2})\s+(\w{3})\w*\s+(\d{4})/.exec(g('pubDate')) || [];
    const date = pd[3] ? `${pd[3]}-${pad(MONTHS[pd[2]] || 1)}-${pad(pd[1])}` : '';
    const type = /master-circular/.test(link) ? 'Master Circular' : /\/legal\/circulars\//.test(link) ? 'Circular'
      : /\/legal\/regulations\//.test(link) ? 'Regulation' : /\/legal\//.test(link) ? 'Legal'
      : /enforcement/.test(link) ? 'Enforcement' : /press-release/.test(link) ? 'Press Release'
      : /consultation|reports-and-statistics/.test(link) ? 'Consultation / Report' : 'Other';
    return { id: 'sebi-' + link, date, title, category: type, segment: segment(title), url: link, legal: /^(Master Circular|Circular|Regulation|Legal|Consultation \/ Report)$/.test(type) };
  });
}

export async function fetchSebi() {
  const parts = await Promise.allSettled([sebiListing(7, 'Circular'), sebiListing(6, 'Master Circular'), sebiListing(3, 'Regulation'), sebiRss()]);
  const ok = parts.filter(p => p.status === 'fulfilled').map(p => p.value);
  if (!ok.length) throw parts[0].reason;
  const seen = new Set(), out = [];
  for (const i of ok.flat()) { const k = i.url.replace(/^https?:\/\/[^/]+/, ''); if (!seen.has(k)) { seen.add(k); out.push(i); } }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function refreshAll(state) {
  const out = {};
  for (const [k, fn] of Object.entries({ bse: fetchBse, nse: fetchNse, sebi: fetchSebi })) {
    try {
      const items = (await fn()).filter(i => i.title && /^\d{4}-\d{2}-\d{2}$/.test(i.date)); // skip malformed feed entries
      const prev = new Set((state.circulars[k]?.items || []).map(i => i.id));
      const firstLoad = !state.circulars[k]?.items?.length;
      const seen = state.circulars[k]?.firstSeen || {};
      const now = new Date().toISOString();
      for (const i of items) if (!seen[i.id]) seen[i.id] = firstLoad ? i.date + 'T00:00:00' : now;
      state.circulars[k] = { fetchedAt: now, ok: true, items: items.slice(0, 1000), firstSeen: seen };
      out[k] = { ok: true, count: items.length, new: firstLoad ? 0 : items.filter(i => !prev.has(i.id)).length };
    } catch (e) {
      state.circulars[k] = { ...(state.circulars[k] || {}), ok: false, error: e.message, triedAt: new Date().toISOString() };
      out[k] = { ok: false, error: e.message };
    }
  }
  return out;
}
