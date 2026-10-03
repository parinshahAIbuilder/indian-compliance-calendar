// Verifies filings on BSE and records the BSE submission date & time against each compliance.
import { bseApi } from './http.js';
import { TEMPLATES } from './master.js';
import { buildCalendar, contexts } from './engine.js';
import { addDays, ymd, todayIST, fyOfDate, minDate } from './dates.js';
import { statusOf, eventsOf, log } from './store.js';

const ATTACH = 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/';
const BSE = 'https://www.bseindia.com';
const compact = d => d.replaceAll('-', '');

// BSE quarter id: Jun-2026 = 130, Sep-2026 = 131, ... (one per quarter)
export const qtrId = (fy, q) => 130 + (fy - 2026) * 4 + (q - 1);

async function fetchAnnouncements(code, from, to) {
  const out = [];
  // BSE limits a query to 12 months, 50 rows per page
  let start = from;
  while (start <= to) {
    const end = minDate(addDays(start, 360), to);
    for (let page = 1; page <= 40; page++) {
      const d = await bseApi(`AnnSubCategoryGetData/w?pageno=${page}&strCat=-1&strPrevDate=${compact(start)}&strScrip=${code}&strSearch=P&strToDate=${compact(end)}&strType=C&subcategory=-1`);
      const rows = d.Table || [];
      out.push(...rows);
      const total = d.Table1?.[0]?.ROWCNT ?? 0;
      if (!rows.length || page * 50 >= total) break;
    }
    start = addDays(end, 1);
  }
  return out.map(r => ({
    at: (r.News_submission_dt || r.DissemDT || r.DT_TM || '').slice(0, 19),
    day: (r.News_submission_dt || r.DissemDT || r.DT_TM || '').slice(0, 10),
    cat: r.CATEGORYNAME || '', sub: r.SUBCATNAME || '',
    text: `${r.NEWSSUB || ''} ${r.HEADLINE || ''}`,
    headline: r.NEWSSUB || r.HEADLINE || '',
    url: r.ATTACHMENTNAME ? ATTACH + r.ATTACHMENTNAME : `${BSE}/stock-share-price/x/x/${code}/corp-announcements/`
  })).sort((a, b) => a.at.localeCompare(b.at));
}

const firstMatch = (anns, rule, x) => {
  const from = rule.from(x), to = rule.to(x);
  const hits = anns.filter(a => a.day >= from && a.day <= to &&
    (!rule.sub || rule.sub.test(a.sub)) && (!rule.cat || rule.cat.test(a.cat)) && (!rule.text || rule.text.test(a.text)));
  return rule.pick === 'last' ? hits[hits.length - 1] : hits[0];
};

// "June 30, 2026" / "30th June 2026" / "30-06-2026" style mentions of a quarter-end in an announcement
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const mentionsQuarter = (text, qEnd) => {
  const [y, m, d] = qEnd.split('-').map(Number);
  const mon = MONTHS[m - 1];
  const dd = String(d).padStart(2, '0'), mm = String(m).padStart(2, '0');
  const S = '\\s*';
  return new RegExp(`${mon}${S}${d}(st|nd|rd|th)?,?${S}${y}|${d}(st|nd|rd|th)?${S}${mon},?${S}${y}|${dd}[-./]${mm}[-./]${y}`, 'i').test(text);
};

export async function syncCompany(state, c, { fys } = {}) {
  if (!c.bseCode) return { ok: false, message: 'No BSE scrip code configured' };
  const today = todayIST();
  const curFy = fyOfDate(today);
  fys ||= [curFy - 1, curFy];
  const counts = { matched: 0, events: 0 };

  const [anns, shp, igov, ifin] = await Promise.all([
    fetchAnnouncements(c.bseCode, ymd(fys[0], 2, 1), today),
    bseApi(`SHPQNewFormat/w?scripcode=${c.bseCode}&qtrid=&type=`).then(d => d.Table || []).catch(() => []),
    bseApi(`Integratedfiledata/w?scripcode=${c.bseCode}`).then(d => d.Table || []).catch(() => []),
    bseApi(`Integratedfinancedata/w?scripcode=${c.bseCode}`).then(d => d.Table || []).catch(() => [])
  ]);

  for (const fy of fys) {
    // 1) Detect event dates from BSE (board meeting for results, AGM) unless the user entered them
    const ev = eventsOf(c.id, fy);
    for (let q = 1; q <= 4; q++) {
      const qEnd = contexts(state, c, fy).qs[q - 1].qEnd;
      const e = (ev['Q' + q] ||= {});
      if (!e.bm || e.bmSrc === 'bse') {
        // the results announcement names the quarter (e.g. "Results for the Quarter Ended June 30, 2026")
        const hit = anns.find(a => a.day > qEnd && a.day <= addDays(qEnd, 150) &&
          /financial results|outcome of board meeting/i.test(a.sub) && /result/i.test(a.text) && mentionsQuarter(a.text, qEnd))
          || anns.find(a => a.day > qEnd && a.day <= addDays(qEnd, q === 4 ? 60 : 45) && /financial results/i.test(a.sub));
        if (hit && e.bm !== hit.day) { e.bm = hit.day; e.bmSrc = 'bse'; counts.events++; }
      }
    }
    if (!ev.agm || ev.agmSrc === 'bse') {
      const hit = anns.find(a => a.day >= ymd(fy, 6, 1) && a.day <= ymd(fy, 12, 31) &&
        /agm/i.test(a.sub) && /outcome of agm|voting result|scrutini[sz]er|proceedings/i.test(a.text));
      if (hit && ev.agm !== hit.day) { ev.agm = hit.day; ev.agmSrc = 'bse'; counts.events++; }
    }

    // 2) Match each pending compliance with a BSE filing
    const { qs, annual } = contexts(state, c, fy);
    const items = buildCalendar(state, c, fy, today);
    for (const it of items) {
      if (it.origin !== 'master' || it.submittedAt) continue;
      const t = TEMPLATES.find(t => t.id === it.tplId);
      if (!t?.bse) continue;
      const q = it.pkey.startsWith('Q') ? +it.pkey[1] : null;
      const x = q ? qs[q - 1] : annual;
      let found = null;
      if (t.bse.src === 'ann') {
        const a = firstMatch(anns, t.bse, x);
        if (a) found = { at: a.at, headline: a.headline, url: a.url, via: 'Corporate Announcements' };
      } else if (q) {
        const id = qtrId(fy, q);
        const list = t.bse.src === 'shp' ? shp : t.bse.src === 'igov' ? igov : ifin;
        const rows = list.filter(r => Number(r.qtrid ?? r.Qtrid) === id && r.filing_date_time)
          .sort((a, b) => a.filing_date_time.localeCompare(b.filing_date_time));
        const r = rows[0];
        if (r) {
          const page = { shp: 'Shareholding Pattern', igov: 'Integrated Filing (Governance)', ifin: 'Integrated Filing (Finance)' }[t.bse.src];
          const link = r.navigateurl || r.xbrlurl || r.XbrlFile;
          found = {
            at: r.filing_date_time.slice(0, 19), headline: `${page} – ${r.qtr || r.Quarter_Name || ''}`.trim(),
            url: link ? (link.startsWith('http') ? link : BSE + (link.startsWith('/') ? '' : '/') + link) : '', via: page
          };
        }
      }
      if (found) {
        const st = statusOf(c.id, it.key);
        st.submittedAt = found.at;
        st.source = 'bse';
        st.ref = found;
        counts.matched++;
        log('bse', `${c.shortName || c.name}: "${it.title.slice(0, 80)}" (${it.period}) found on BSE – filed ${found.at.replace('T', ' ')}`, c.orgId);
      }
    }
  }
  state.announcements ||= {};
  state.announcements[c.id] = anns.slice(-200).reverse().map(({ text, ...a }) => a);
  const result = { ok: true, at: new Date().toISOString(), announcements: anns.length, ...counts, message: `Checked ${anns.length} BSE announcements, ${shp.length} SHP, ${igov.length + ifin.length} integrated filings; ${counts.matched} new filing(s) matched` };
  state.sync[c.id] = result;
  return result;
}
