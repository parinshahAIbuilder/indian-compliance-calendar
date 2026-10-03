/* Compliance Calendar – dashboard */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtLong = s => { if (!s) return '--'; const [y, m, d] = s.slice(0, 10).split('-'); return `${d} ${MONTHS[+m - 1]} ${y}`; };
const fmtShort = s => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const fmtDT = s => { if (!s) return ''; const t = s.slice(11, 16); return fmtShort(s) + (t && t !== '00:00' ? ' ' + t : ''); };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// route BSE attachment links through the server so archived (AttachHis) filings still open
const bsePdf = u => { const m = /corpfiling\/Attach(?:Live|His)\/([\w-]+\.pdf)/i.exec(u || ''); return m ? '/api/bse-pdf/' + m[1] : u; };
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const S = {
  tab: lsGet('tab', 'calendar'), orgId: lsGet('org', null), meta: null, cal: null, circ: null, logs: [],
  companyId: lsGet('company', null), fy: lsGet('fy', null),
  filter: { q: null, freq: 'all', cat: 'all', state: 'all', search: '' },
  circFilter: { bse: { seg: 'All', search: '' }, nse: { seg: 'All', search: '', hideRoutine: true }, sebi: { type: 'Legal', search: '' } },
  editing: null, manualQ: 'all'
};

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (S.orgId) headers['X-Org'] = S.orgId;
  const res = await fetch(path, { headers, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/')) { showAuth('login'); throw new Error('Please sign in'); }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const post = (p, body) => api(p, { method: 'POST', body: { company: S.companyId, fy: S.fy, ...body } });
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), err ? 6000 : 3200);
}
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); await refresh(); return r; }
  catch (e) { toast(e.message, true); }
}

/* ─────────── loading & real-time ─────────── */
async function loadMeta() {
  S.meta = await api('/api/meta');
  if (!S.meta.companies.find(c => c.id === S.companyId)) S.companyId = S.meta.companies[0]?.id || null;
  if (!S.fy) S.fy = S.meta.currentFy;
  $('#companySel').innerHTML = S.meta.companies.map(c => `<option value="${c.id}" ${c.id === S.companyId ? 'selected' : ''}>${esc(c.name)}${c.nseSymbol || c.bseCode ? ` (${[c.nseSymbol && 'NSE: ' + c.nseSymbol, c.bseCode && 'BSE: ' + c.bseCode].filter(Boolean).join(' | ')})` : ` — ${S.meta.entityTypes[c.entityType] || ''}`}</option>`).join('');
  const fys = []; for (let y = S.meta.currentFy - 2; y <= S.meta.currentFy + 1; y++) fys.push(y);
  $('#fySel').innerHTML = fys.map(y => `<option value="${y}" ${y === +S.fy ? 'selected' : ''}>FY ${y}-${String(y + 1).slice(2)}</option>`).join('');
  const c = S.meta.companies.find(c => c.id === S.companyId);
  $('#codes').innerHTML = c ? [
    c.nseSymbol && `<span class="code nse">NSE: <b>${esc(c.nseSymbol)}</b></span>`,
    c.bseCode && `<span class="code bse">BSE: <b>${esc(c.bseCode)}</b></span>`,
    c.cin && `<span class="code">CIN: ${esc(c.cin)}</span>`,
    !c.bseCode && `<span class="code">${esc(S.meta.entityTypes[c.entityType])}</span>`
  ].filter(Boolean).join('') : '';
  const m = S.meta;
  const os = $('#orgSel');
  if (m.orgs) { os.classList.remove('hidden'); os.innerHTML = m.orgs.map(o => `<option value="${o.id}" ${o.id === m.org.id ? 'selected' : ''}>${o.isDefault ? '🏠 ' : '🏢 '}${esc(o.name)}</option>`).join(''); }
  else os.classList.add('hidden');
  $('#userMenu').innerHTML = `<button class="btn sm" id="umBtn">👤 ${esc(m.user.name || m.user.email)} ▾</button>
    <div class="um-pop hidden" id="umPop"><div class="rem" style="font-style:normal;padding:4px 8px">${esc(m.user.email)}<br>${esc(m.org.name)} · ${esc(m.user.superAdmin ? 'Platform owner' : m.user.role)}</div>
    <button class="btn sm" id="umPw" style="width:100%">Change password</button><button class="btn sm danger" id="umOut" style="width:100%">Sign out</button></div>`;
  $('#umBtn').onclick = () => $('#umPop').classList.toggle('hidden');
  $('#umOut').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.hash = ''; location.reload(); };
  $('#umPw').onclick = changePassword;
  $('#mailPill').innerHTML = `<div class="av">${esc((m.mailUser || 'G')[0].toUpperCase())}</div><div><b>${esc(m.mailUser || 'No sender mailbox')}</b>
    <small style="color:${m.mailConfigured ? 'var(--green)' : 'var(--red)'}">${m.mailConfigured ? '✓ Sender ready' : '✕ Connect sender in Email Updates'}</small></div>`;
}
async function loadCalendar() {
  if (!S.companyId) { S.cal = null; return; }
  S.cal = await api(`/api/calendar?company=${S.companyId}&fy=${S.fy}`);
  if (S.filter.q === null) {
    // default to the quarter whose filings are currently running (period ended within ~45 days)
    const t = addDays(S.cal.today, -45);
    const qi = S.cal.quarters.findIndex(q => t <= q.end);
    S.filter.q = String(qi >= 0 ? qi + 1 : 4);
  }
}
async function loadCirculars() { S.circ = await api('/api/circulars'); }
async function loadAnn() { S.ann = S.companyId ? await api(`/api/announcements?company=${S.companyId}`) : null; }
// circular tabs default to the selected company's listed segments
function defaultSegments() {
  const c = S.meta?.companies.find(c => c.id === S.companyId);
  if (!c || S.segFor === c.id) return;
  S.segFor = c.id;
  const seg = c.listedEquity && !c.listedDebt ? 'Equity' : c.listedDebt && !c.listedEquity ? 'Debt' : 'All';
  S.circFilter.bse.seg = seg; S.circFilter.nse.seg = seg;
}
async function refresh() {
  await loadMeta();
  defaultSegments();
  await Promise.all([loadCalendar(), loadCirculars(), loadAnn(), S.tab === 'log' ? api('/api/logs').then(l => (S.logs = l)) : null]);
  render();
}
function connectStream() {
  const es = new EventSource('/api/stream');
  let timer;
  es.onopen = () => $('#livePill').classList.remove('off');
  es.onerror = () => $('#livePill').classList.add('off');
  es.onmessage = () => { clearTimeout(timer); timer = setTimeout(() => { if (!S.editing && !document.activeElement?.matches('input,textarea,select')) refresh(); else S.pendingRefresh = true; }, 400); };
}

/* ─────────── render root ─────────── */
const TITLES = { calendar: 'COMPLIANCE CALENDAR', events: 'EVENT BASED COMPLIANCES', manual: 'MANUAL COMPLIANCE ENTRY', email: 'EMAIL UPDATES & AWARENESS', bse: 'BSE CIRCULARS', nse: 'NSE CIRCULARS', sebi: 'SEBI UPDATES', companies: 'COMPANIES & SETTINGS', log: 'ACTIVITY LOG', ann: 'COMPANY ANNOUNCEMENTS', team: 'TEAM & CLIENTS' };
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === S.tab));
  $('#pageTitle').textContent = TITLES[S.tab];
  const cal = S.cal;
  $('#cntCal').textContent = cal ? `${cal.items.filter(i => i.origin === 'master').length} filings` : '';
  $('#cntEv').textContent = cal ? cal.occurrences.length || '' : '';
  $('#cntMan').textContent = cal ? cal.manual.length : 0;
  const nc = k => S.circ?.[k]?.unread || 0;
  for (const [k, id] of [['bse', '#cntBse'], ['nse', '#cntNse'], ['sebi', '#cntSebi']]) {
    $(id).textContent = nc(k) ? `${nc(k)} unread` : '';
    $(id).classList.toggle('unread', !!nc(k));
  }
  $('#cntAnn').textContent = S.ann?.items?.length || '';
  const v = $('#view');
  if (S.meta?.expired && !S.meta.user.superAdmin) { v.innerHTML = `<div class="card empty"><b>Your subscription ended on ${fmtShort(S.meta.validUntil)}.</b><br>Please contact your provider to renew.</div>`; return; }
  if (!S.companyId && !['companies', 'bse', 'nse', 'sebi', 'log', 'team'].includes(S.tab)) { v.innerHTML = `<div class="card empty">No company yet. <button class="btn primary" onclick="setTab('companies')">Add a company</button></div>`; return; }
  ({ team: renderTeam, ann: renderAnn, calendar: renderCalendar, events: renderEvents, manual: renderManual, email: renderEmail, bse: () => renderCirc('bse'), nse: () => renderCirc('nse'), sebi: () => renderCirc('sebi'), companies: renderCompanies, log: renderLog })[S.tab](v);
}
function setTab(t) { S.tab = t; lsSet('tab', t); if (t === 'log') api('/api/logs').then(l => { S.logs = l; render(); }); if (t === 'team') loadTeam(); render(); }
window.setTab = setTab;

/* ─────────── Calendar ─────────── */
function filteredItems() {
  const f = S.filter;
  return S.cal.items.filter(i =>
    (f.q === 'all' || i.bucket === +f.q) &&
    (f.freq === 'all' || i.frequency === f.freq) &&
    (f.cat === 'all' || i.cat === f.cat) &&
    (f.state === 'all' || (f.state === 'pending' ? i.state !== 'done' : f.state === 'week' ? i.state === 'soon' : i.state === f.state)) &&
    (!f.search || (i.title + ' ' + i.reg + ' ' + i.cat + ' ' + i.timeline).toLowerCase().includes(f.search.toLowerCase())));
}
function renderCalendar(v) {
  const { stats: st, quarters, sync, company: c } = S.cal;
  const f = S.filter;
  const kpi = (key, label, val, icon, sub, foot, cls = '') => `<div class="kpi ${cls} ${f.state === key ? 'sel' : ''}" data-state="${key}">
      <div class="h">${label}<span class="ic">${icon}</span></div><div class="v">${val}</div><div class="s">${sub}</div><div class="f">${foot}</div></div>`;
  const qcard = q => {
    const qs = st.quarters[q.q - 1];
    const pct = qs.total ? Math.round(qs.done / qs.total * 100) : 0;
    const [tag, name] = q.label.split(' · ');
    const chip = q.q === 2 ? 'Includes Reg 23(9) in Financials' : q.q === 4 ? 'Includes Annual & Reg 23(9)' : `Q${q.q} Core Filings`;
    return `<div class="qcard ${f.q === String(q.q) ? 'sel' : ''}" data-q="${q.q}">
      ${qs.total && qs.done === qs.total ? '<span class="alldone">✓ All Done</span>' : qs.overdue ? `<span class="odbadge">${qs.overdue} overdue</span>` : ''}
      <span class="tag">${tag} • ${fmtLong(q.end).toUpperCase().replace(/ (\w{3})\w*/, ' $1')}</span>
      <h3>Quarter ended ${name.split(' ')[0]}</h3><span class="chip">${chip}</span>
      <div class="foot"><span>${qs.done} of ${qs.total} Done</span><span class="bar ${pct === 100 ? 'full' : ''}"><i style="width:${pct}%"></i></span></div></div>`;
  };
  const items = filteredItems();
  const freqs = [...new Set(S.cal.items.map(i => i.frequency))];
  const cats = [...new Set(S.cal.items.map(i => i.cat))];
  v.innerHTML = `
    <div class="kpis">
      ${kpi('all', 'Total Compliances', st.total, '📄', 'Master Statutory Items', `${st.pct}% complete ${f.state === 'all' ? '· <b style="color:var(--brand)">✓ Filtered</b>' : ''}`)}
      ${kpi('today', 'Due Today', st.today, '📆', 'Immediate Dissemination', st.today ? 'Act today' : 'Zero Filings Due')}
      ${kpi('week', 'Due in 7 Days', st.week, '⏱', 'Upcoming Deadlines', st.week ? `${st.week} in queue` : 'Queue Clear')}
      ${kpi('overdue', 'Overdue', st.overdue, '⚠', 'SEBI / MCA Penalty Risk', st.overdue ? 'Needs attention' : 'Zero Default Protected', st.overdue ? 'red' : 'green')}
      ${kpi('done', 'Completed', st.done, '✔', 'Filed / Disseminated', `${st.pct}% Accomplished`, 'green')}
      ${kpi('pending', 'Pending Filings', st.pending, '⏳', 'Active Statutory Queue', `${st.reminders} in reminder window`)}
    </div>
    <div class="qwrap">${quarters.map(qcard).join('')}</div>
    <div class="toolbar">
      <div class="search"><input id="srch" placeholder="Search Regulation / Compliance (e.g. 31(1)(b), Governance, AOC-4, Audit)..." value="${esc(f.search)}"></div>
      <label>Quarter:</label><select id="fq"><option value="all">All Quarters</option>${quarters.map(q => `<option value="${q.q}" ${f.q === String(q.q) ? 'selected' : ''}>Q${q.q}: ${q.label.split(' · ')[1].split(' ')[0].toUpperCase()}</option>`).join('')}</select>
      <label>Frequency:</label><select id="ff"><option value="all">All Frequencies</option>${freqs.map(x => `<option ${f.freq === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select id="fc"><option value="all">All Categories</option>${cats.map(x => `<option ${f.cat === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <button class="btn" id="csvBtn">⤓ Export CSV</button><button class="btn" onclick="print()">🖨 Print</button>
    </div>
    <div class="toolbar" style="padding:10px 16px">
      ${c.bseCode ? `<button class="btn soft" id="syncBtn">↻ Verify filings on BSE now</button>
        <span class="syncinfo">${sync ? (sync.ok ? `Last BSE check: <b>${new Date(sync.at).toLocaleString('en-IN')}</b> — ${esc(sync.message)}` : `<span style="color:var(--red)">${esc(sync.message)}</span>`) : 'BSE check runs automatically every 2 hours'}</span>`
        : `<span class="syncinfo">No BSE scrip code — submission dates are updated manually.</span>`}
      <span class="spacer"></span>
      <button class="btn green" id="waQuick" title="Open WhatsApp with today's reminder typed in">📲 WhatsApp reminder</button>
      <button class="btn" id="bulkBtn" title="Mark pending items with a due date before a cut-off as already completed">✔ Mark past items done…</button>
    </div>
    <div class="tablecard"><table class="grid">
      <thead><tr><th style="width:50px">SR NO</th><th>COMPLIANCE ITEM</th><th style="width:22%">TIMELINE</th><th style="width:150px">DUE DATE</th><th style="width:250px">SUBMISSION DATE</th><th style="width:150px">REMINDER</th></tr></thead>
      <tbody>${items.length ? rows(items) : `<tr><td colspan="6" class="empty">No compliances match the filters.</td></tr>`}</tbody>
    </table></div>`;

  v.querySelectorAll('.kpi').forEach(k => k.onclick = () => { S.filter.state = k.dataset.state; render(); });
  v.querySelectorAll('.qcard').forEach(k => k.onclick = () => { S.filter.q = S.filter.q === k.dataset.q ? 'all' : k.dataset.q; render(); });
  $('#srch').oninput = e => { S.filter.search = e.target.value; const pos = e.target.selectionStart; render(); const s = $('#srch'); s.focus(); s.setSelectionRange(pos, pos); };
  $('#fq').onchange = e => { S.filter.q = e.target.value; render(); };
  $('#ff').onchange = e => { S.filter.freq = e.target.value; render(); };
  $('#fc').onchange = e => { S.filter.cat = e.target.value; render(); };
  $('#csvBtn').onclick = () => exportCsv(items);
  if ($('#syncBtn')) $('#syncBtn').onclick = async e => { e.target.disabled = true; e.target.textContent = '↻ Checking BSE…'; await act(() => post('/api/sync'), r => r.message); };
  $('#bulkBtn').onclick = bulkDone;
  $('#waQuick').onclick = async () => {
    const win = window.open('about:blank', '_blank');
    try { const p = await api(`/api/whatsapp/preview?company=${S.companyId}&fy=${S.fy}&mode=reminder`); const url = 'https://wa.me/?text=' + encodeURIComponent(p.body.slice(0, 1800)); if (win) win.location = url; else location.href = url; }
    catch (e) { win?.close(); toast(e.message, true); }
  };
  bindRowEvents(v);
  if (S.flashKey) {
    const tr = [...v.querySelectorAll('tr[data-key]')].find(t => t.dataset.key === S.flashKey);
    S.flashKey = null;
    if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('flash'); }
  }
}

function rows(items) {
  let n = 0, lastBucket = null;
  const multi = S.filter.q === 'all';
  return items.map(i => {
    let head = '';
    if (multi && i.bucket !== lastBucket) { lastBucket = i.bucket; const q = S.cal.quarters[i.bucket - 1]; head = `<tr class="bucket-row"><td colspan="6">${esc(q.label.toUpperCase())}</td></tr>`; }
    n++;
    return head + `<tr class="${i.state}" data-key="${esc(i.key)}">
      <td class="sr">${n}</td>
      <td><div class="title">${esc(i.title)}</div>
        <div class="meta"><span class="tag2 cat">${esc(i.cat)}</span><span class="tag2 freq">${esc(i.frequency)}</span><span class="tag2">${esc(i.period)}</span>
        ${i.verify ? '<span class="tag2 verify" title="Timeline recently amended — confirm against the latest circular">⚠ verify timeline</span>' : ''}
        ${i.portal ? `<a class="tag2" href="${esc(i.portal)}" target="_blank" rel="noopener">portal ↗</a>` : ''}</div>
        ${eventBox(i)}
        ${i.reg ? `<div class="srcline" style="max-width:none">${esc(i.reg)}</div>` : ''}</td>
      <td class="timeline">${esc(i.timeline) || '--'}</td>
      <td><div class="due">${fmtLong(i.due)}</div>${i.est ? '<span class="tag2 est" title="No event date entered — showing the statutory latest date">statutory latest</span>' : ''}
        <div class="dl ${i.state}">${dueLabel(i)}</div></td>
      <td>${submissionCell(i)}</td>
      <td>${reminderCell(i)}</td></tr>`;
  }).join('');
}
const dueLabel = i => i.state === 'done' ? '✓ Filed' : i.daysLeft === null ? '' : i.daysLeft < 0 ? `Overdue ${-i.daysLeft}d` : i.daysLeft === 0 ? 'Due today' : `${i.daysLeft} days left`;
function eventBox(i) {
  if (!i.eventField) return '';
  const label = { bm: 'Board Meeting Date', call: 'Earnings Call Date', agm: 'AGM Date' }[i.eventField];
  const q = i.pkey.startsWith('Q') ? i.pkey[1] : '';
  const qEnd = q ? S.cal.quarters[q - 1].end : null;
  const [min, max] = q ? [addDays(qEnd, 1), addDays(qEnd, 180)] : [`${S.cal.fy}-04-01`, `${S.cal.fy + 1}-03-31`];
  return `<div class="evbox">📅 ${label}: <input type="date" class="evdate" data-q="${q}" data-field="${i.eventField}" value="${i.eventValue || ''}" min="${min}" max="${max}" title="Allowed: ${fmtLong(min)} – ${fmtLong(max)}">
    ${i.eventSource === 'bse' ? '<span class="src bse" title="Detected from BSE announcement">BSE auto</span>' : i.eventValue ? '<span class="src user">entered</span>' : ''}
    ${i.eventValue ? `<button class="iconbtn evclear" data-q="${q}" data-field="${i.eventField}" title="Clear">🗑</button>` : ''}</div>`;
}
function submissionCell(i) {
  if (S.editing === i.key) {
    const def = (i.submittedAt || new Date(Date.now() + 5.5 * 3600e3).toISOString()).slice(0, 16);
    return `<div class="inline-edit"><input type="datetime-local" id="subInp" value="${def}"><button class="btn sm primary" id="subSave">Save</button><button class="btn sm" id="subCancel">✕</button></div>`;
  }
  if (!i.submittedAt) return `<button class="subbtn" data-act="enter">📅 + Enter Date</button>`;
  const src = i.submissionSource === 'bse'
    ? `<div class="srcline"><span class="badge-bse">BSE ✓</span> ${esc(i.ref?.via || 'BSE')}${i.ref?.url ? ` · <a href="${esc(bsePdf(i.ref.url))}" target="_blank" rel="noopener">view filing ↗</a>` : ''}</div>`
    : i.submissionSource === 'bulk' ? '<div class="srcline">marked complete (history)</div>' : '<div class="srcline">entered manually</div>';
  return `<div class="subwrap"><span class="subchip">📅 ${fmtDT(i.submittedAt)}</span>
    <button class="iconbtn" data-act="enter" title="Edit">✎</button><button class="iconbtn" data-act="clear" title="Clear submission">🗑</button></div>${src}`;
}
function reminderCell(i) {
  if (i.state === 'done') return '<span class="rem">Filing Done</span>';
  if (i.snoozeUntil && i.snoozeUntil > S.cal.today) return `<span class="rem">Snoozed till ${fmtShort(i.snoozeUntil)}</span><br><button class="btn sm" data-act="unsnooze" style="margin-top:6px">Resume</button>`;
  const rd = S.meta.settings.reminderDays;
  const startsOn = i.due ? addDays(i.due, -rd) : null;
  return `${i.inReminderWindow ? '<span class="rem on">🔔 Daily reminder active</span>' : startsOn ? `<span class="rem">Reminders from ${fmtShort(startsOn)}</span>` : ''}
    <br><select class="btn sm snoozeSel" style="margin-top:6px"><option value="">🕑 Snooze</option><option value="1">1 day</option><option value="3">3 days</option><option value="7">1 week</option></select>`;
}
function bindRowEvents(v) {
  v.querySelectorAll('tr[data-key]').forEach(tr => {
    const key = tr.dataset.key;
    tr.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const a = b.dataset.act;
      if (a === 'enter') { S.editing = key; render(); $('#subInp')?.focus(); }
      if (a === 'clear' && confirm('Clear the submission date? The item will become pending again and reminders will resume.')) act(() => post('/api/instance', { key, clear: true }), 'Submission cleared');
      if (a === 'unsnooze') act(() => post('/api/instance', { key, snoozeUntil: null }), 'Reminders resumed');
    });
    const sel = tr.querySelector('.snoozeSel');
    if (sel) sel.onchange = () => sel.value && act(() => post('/api/instance', { key, snoozeUntil: addDays(S.cal.today, +sel.value) }), `Snoozed for ${sel.options[sel.selectedIndex].text}`);
  });
  if ($('#subSave')) {
    $('#subSave').onclick = () => { const v = $('#subInp').value; if (!v) return; const key = S.editing; S.editing = null; act(() => post('/api/instance', { key, submittedAt: v + ':00' }), 'Submission date saved — reminders stopped'); };
    $('#subCancel').onclick = () => { S.editing = null; render(); if (S.pendingRefresh) { S.pendingRefresh = false; refresh(); } };
  }
  v.querySelectorAll('.evdate').forEach(inp => {
    const saveIt = () => {
      if (inp.value === (inp.defaultValue || '')) return;
      if (!inp.value) { inp.value = inp.defaultValue; return; } // half-typed / emptied box: keep the saved date
      if (inp.value < inp.min || inp.value > inp.max) { toast(`Date must be between ${fmtLong(inp.min)} and ${fmtLong(inp.max)} — check the year (4 digits).`, true); inp.value = inp.defaultValue; return; }
      S.flashKey = inp.closest('tr')?.dataset.key;
      act(() => post('/api/event-date', { quarter: inp.dataset.q || null, field: inp.dataset.field, date: inp.value }), `Saved ${fmtLong(inp.value)} — due dates recalculated (rows re-sorted by due date)`);
    };
    inp.onblur = saveIt;
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveIt(); } };
  });
  v.querySelectorAll('.evclear').forEach(b => b.onclick = () => confirm('Remove this date? Dependent due dates go back to the statutory latest dates.') && act(() => post('/api/event-date', { quarter: b.dataset.q || null, field: b.dataset.field, date: '', clear: true }), 'Date removed'));
}
function bulkDone() {
  const d = prompt('Mark all PENDING items with a due date BEFORE this date as already completed (use once when onboarding history).\nDate (YYYY-MM-DD):', S.cal.today);
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) act(() => post('/api/bulk-done', { before: d }), r => `${r.count} item(s) marked completed`);
}
function exportCsv(items) {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [['SR', 'Compliance', 'Category', 'Frequency', 'Period', 'Timeline', 'Due Date', 'Status', 'Submission Date', 'Source', 'Reference'].map(q).join(',')];
  items.forEach((i, n) => lines.push([n + 1, i.title, i.cat, i.frequency, i.period, i.timeline, i.due, i.state, i.submittedAt?.replace('T', ' ') || '', i.submissionSource || '', i.ref?.url || ''].map(q).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
  a.download = `${S.cal.company.shortName || 'compliance'}_${S.cal.fyLabel.replace(/\s/g, '')}.csv`; a.click();
}

/* ─────────── Event based ─────────── */
function renderEvents(v) {
  const { eventTemplates: tpls, items } = S.cal;
  const occ = items.filter(i => i.origin === 'event');
  v.innerHTML = `
    <div class="card"><h3>Log an event-based compliance</h3>
      <div class="sub">These compliances are triggered by an event (resolution, allotment, appointment, record date, insider trade…). Log the event date — the due date is calculated and daily reminders start ${S.meta.settings.reminderDays} days before it.</div>
      <div class="form-grid">
        <div class="fld two"><label>Compliance <span class="req">*</span></label><select id="evTpl">${tpls.map(t => `<option value="${t.id}">${esc(t.cat)} — ${esc(t.title)}</option>`).join('')}</select></div>
        <div class="fld"><label id="evLbl">Event date <span class="req">*</span></label><input type="date" id="evDate"></div>
        <div class="fld two"><label>Note (optional)</label><input id="evNote" placeholder="e.g. Appointment of Mr. X as Independent Director"></div>
        <div class="fld" style="align-self:end"><button class="btn primary" id="evAdd" style="width:100%;justify-content:center">⊕ Add & start tracking</button></div>
        <div class="full notice info" id="evHint"></div>
      </div></div>
    <div class="tablecard"><table class="grid"><thead><tr><th>SR</th><th>COMPLIANCE</th><th>TIMELINE</th><th>DUE DATE</th><th>SUBMISSION DATE</th><th>REMINDER</th></tr></thead>
    <tbody>${occ.length ? rows(occ).replace(/<\/tr>/g, '</tr>') : '<tr><td colspan="6" class="empty">No event-based compliances logged for this FY.</td></tr>'}</tbody></table></div>
    <div class="card" style="margin-top:18px"><h3>Logged events</h3><div class="sub">Delete an event if it was logged by mistake.</div>
      ${(S.cal.occurrences || []).map(o => { const t = tpls.find(t => t.id === o.tplId); return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line2)"><span class="mono">${o.eventDate}</span><span style="flex:1">${esc(t?.title || o.tplId)} ${o.note ? '— ' + esc(o.note) : ''}</span><button class="btn sm danger" data-del="${o.id}">Delete</button></div>`; }).join('') || '<div class="rem">None yet.</div>'}
    </div>`;
  const hint = () => { const t = tpls.find(t => t.id === $('#evTpl').value); if (!t) return; $('#evLbl').innerHTML = esc(t.eventLabel) + ' <span class="req">*</span>'; $('#evHint').innerHTML = `<b>Timeline:</b> ${esc(t.timeline)}${t.verify ? ' &nbsp;<span class="tag2 verify">⚠ verify timeline</span>' : ''}`; };
  $('#evTpl').onchange = hint; hint();
  $('#evAdd').onclick = () => act(() => post('/api/occurrence', { tplId: $('#evTpl').value, eventDate: $('#evDate').value, note: $('#evNote').value }), 'Event logged — due date calculated');
  v.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirm('Delete this event?') && act(() => api(`/api/occurrence/${b.dataset.del}?company=${S.companyId}`, { method: 'DELETE' }), 'Deleted'));
  bindRowEvents(v);
}

/* ─────────── Manual entry ─────────── */
const PRESETS = [
  { l: '+ Reg 29 (Every Quarter)', title: 'Regulation 29 – Prior Intimation of Board Meeting', freq: 'Quarterly', cat: 'SEBI LODR', tl: 'At least 2 working days before the Board Meeting' },
  { l: '+ Reg 30 (Monitoring Agency)', title: 'Regulation 32(6) / Regulation 30 – Monitoring Agency Report', freq: 'Quarterly', cat: 'SEBI ICDR', tl: 'Within 45 days from the end of the quarter' },
  { l: '+ Reg 30 (Investor Pres.)', title: 'Regulation 30 (LODR) – Investor Presentation', freq: 'Quarterly', cat: 'SEBI LODR', tl: 'On same day when financials are filed' },
  { l: '+ Reg 30 (Newspaper Pub.)', title: 'Regulation 47 / Regulation 30 – Newspaper Publication', freq: 'Quarterly', cat: 'SEBI LODR', tl: 'Within 48 hours of the Board Meeting' },
  { l: '+ Trading Window (Quarterly)', title: 'Closure of Trading Window', freq: 'Quarterly', cat: 'SEBI PIT', tl: 'Before the end of the quarter' },
  { l: '+ Event Base (Reg 30)', title: 'Regulation 30 – Disclosure of material event', freq: 'Event Base', cat: 'SEBI LODR', tl: 'Within 24 hours of the event' },
  { l: '+ Annual (DIR-3 KYC)', title: 'DIR-3 KYC – KYC of Directors', freq: 'Annual', cat: 'Companies Act / MCA', tl: 'By 30 September' },
  { l: '+ Half-Yearly (MSME-1)', title: 'MSME-1 – Half-yearly return', freq: 'Half-Yearly', cat: 'Companies Act / MCA', tl: '30 April and 31 October' },
  { l: '+ Monthly', title: '', freq: 'Monthly', cat: 'Other', tl: '' }
];
function renderManual(v) {
  const fy = +S.fy, man = S.cal.manual;
  const qEnds = S.cal.quarters.map(q => q.end);
  const form = S.manualForm ||= { title: '', freq: 'Quarterly', cat: 'SEBI LODR', tl: '', rule: '', portal: '', completed: false, qs: [true, true, true, true], qd: qEnds.map(e => addDays(e, 45)), hy: [`${fy}-10-31`, `${fy + 1}-04-30`], one: '', mday: 15 };
  const qNames = ['Q1: June Quarter', 'Q2: September Quarter', 'Q3: December Quarter', 'Q4: March Quarter'];
  const sched = form.freq === 'Quarterly' ? `<div class="qopts"><div class="row"><b>📅 Quarterly Scheduling Options (Enter Manual Due Dates & Quarters)</b><span class="spacer"></span><button class="btn sm primary" id="allQ">✓ All 4 Quarters</button></div>
      <div class="sub" style="margin:4px 0 0">Select quarters and enter custom due dates (not fixed to statutory 45/60 days).</div>
      <div class="qs">${qNames.map((n, k) => `<div class="qopt"><label><input type="checkbox" class="qchk" data-k="${k}" ${form.qs[k] ? 'checked' : ''}> ${n}</label><small style="color:var(--muted)">Ended ${fmtLong(qEnds[k])}</small><input type="date" class="qdate" data-k="${k}" value="${form.qd[k]}"></div>`).join('')}</div></div>`
    : form.freq === 'Half-Yearly' ? `<div class="qopts"><b>Half-yearly due dates</b><div class="qs" style="grid-template-columns:1fr 1fr">${['H1 (Apr–Sep)', 'H2 (Oct–Mar)'].map((n, k) => `<div class="qopt"><label>${n}</label><input type="date" class="hdate" data-k="${k}" value="${form.hy[k]}"></div>`).join('')}</div></div>`
    : form.freq === 'Monthly' ? `<div class="qopts"><b>Monthly</b> — due on day <input type="number" min="1" max="28" id="mday" value="${form.mday}" style="width:70px" class="inp"> of the following month (12 reminders generated for ${S.cal.fyLabel}).</div>`
    : `<div class="fld"><label>Actual Due Date (IST) <span class="req">*</span></label><input type="date" id="oneDate" value="${form.one}"></div>`;
  const counts = { all: man.length, ev: man.filter(m => m.frequency === 'Event Base').length, done: S.cal.items.filter(i => i.origin === 'manual' && i.state === 'done').length };
  const mItems = S.cal.items.filter(i => i.origin === 'manual' && (S.manualQ === 'all' || (S.manualQ === 'ev' ? i.frequency === 'Event Base' : i.bucket === +S.manualQ)));
  v.innerHTML = `
    <div class="hero"><div><span class="k">MANUAL COMPLIANCE ENTRY</span><span class="mono" style="color:#a5b4fc">${esc(S.cal.company.name)} ${S.cal.company.cin ? '(CIN: ' + esc(S.cal.company.cin) + ')' : ''}</span>
      <h3>Enter Any Statutory Compliance</h3><p>Manually add, schedule and track custom compliances across <b>Monthly</b>, <b>Quarterly</b>, <b>Half-Yearly</b>, <b>Annual</b>, <b>Event Base</b> or one-time frequency. Entries get the same IST due-date monitoring, daily e-mail reminders and audit log.</p></div>
      <div class="stats"><div class="st">MANUAL ENTRIES<b>${counts.all}</b></div><div class="st">EVENT BASE<b>${counts.ev}</b></div><div class="st">COMPLETED<b>${counts.done}</b></div></div></div>
    <div class="card"><h3>⊕ Manually Enter New Compliance</h3><div class="sub">Provide regulatory details, select frequency and set due dates.</div>
      <div class="presets"><span>Quick Statutory Presets:</span>${PRESETS.map((p, k) => `<button class="preset" data-p="${k}">${p.l}</button>`).join('')}</div>
      <div class="form-grid">
        <div class="fld two"><label>Regulation Reference / Section / Title <span class="req">*</span></label><input id="mTitle" value="${esc(form.title)}" placeholder="e.g. Regulation 29 – Prior Intimation of Board Meeting / Reg 30 – Outcome of Board Meeting"></div>
        <div class="fld"><label>Frequency <span class="req">*</span></label><select id="mFreq">${['Quarterly', 'Half-Yearly', 'Annual', 'Monthly', 'Event Base', 'One-time'].map(x => `<option ${form.freq === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        ${form.freq === 'Quarterly' || form.freq === 'Half-Yearly' || form.freq === 'Monthly' ? sched : ''}
        <div class="fld full"><label>Time Period / Particulars <span class="req">*</span></label><textarea id="mTl" placeholder="e.g. Within 30 days from quarter end / On or before 6 days before quarter begins">${esc(form.tl)}</textarea></div>
        <div class="fld"><label>Category</label><select id="mCat">${S.meta.categories.concat(['Other']).map(x => `<option ${form.cat === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="fld"><label>Prescribed Due Date Rule / Timeline</label><input id="mRule" value="${esc(form.rule)}" placeholder="e.g. Within 24 hours of event / By 30th October"></div>
        ${form.freq === 'Quarterly' || form.freq === 'Half-Yearly' || form.freq === 'Monthly' ? '' : sched}
        <div class="fld two"><label>BSE / Filing Portal URL (optional)</label><input id="mPortal" value="${esc(form.portal)}" placeholder="https://listing.bseindia.com/ or https://www.mca.gov.in/"></div>
        <div class="full check"><input type="checkbox" id="mDone" ${form.completed ? 'checked' : ''}><div><b>Mark this compliance as already COMPLETED</b></div></div>
        <div class="full row"><button class="btn" id="mClear">Clear Form</button><span class="spacer"></span><button class="btn primary" id="mSave">⊕ Save & Add Compliance</button></div>
      </div></div>
    <div class="card"><div class="row" style="margin-bottom:12px"><b>📅 QUARTERLY TABS (FILTER BY QUARTER)</b></div>
      <div class="chips">${[['all', 'All Entries'], ['1', 'Q1: June'], ['2', 'Q2: September'], ['3', 'Q3: December'], ['4', 'Q4: March'], ['ev', 'Event Base']].map(([k, l]) => `<button class="chipbtn ${S.manualQ === k ? 'on' : ''}" data-mq="${k}">${l}</button>`).join('')}</div></div>
    <div class="tablecard"><table class="grid"><thead><tr><th>SR</th><th>COMPLIANCE</th><th>TIMELINE</th><th>DUE DATE</th><th>SUBMISSION DATE</th><th>REMINDER</th></tr></thead>
      <tbody>${mItems.length ? rows(mItems) : '<tr><td colspan="6" class="empty">📅<br><b>No Manual Compliances Found</b><br>Use the form above to add any statutory compliance.</td></tr>'}</tbody></table></div>
    ${man.length ? `<div class="card" style="margin-top:18px"><h3>Manage manual entries</h3>${man.map(m => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line2)"><span class="tag2 freq">${esc(m.frequency)}</span><span style="flex:1">${esc(m.title)}</span><button class="btn sm danger" data-mdel="${m.id}">Delete</button></div>`).join('')}</div>` : ''}`;

  const sync = () => {
    form.title = $('#mTitle').value; form.tl = $('#mTl').value; form.cat = $('#mCat').value; form.rule = $('#mRule').value; form.portal = $('#mPortal').value; form.completed = $('#mDone').checked;
    v.querySelectorAll('.qchk').forEach(c => form.qs[c.dataset.k] = c.checked);
    v.querySelectorAll('.qdate').forEach(c => form.qd[c.dataset.k] = c.value);
    v.querySelectorAll('.hdate').forEach(c => form.hy[c.dataset.k] = c.value);
    if ($('#oneDate')) form.one = $('#oneDate').value;
    if ($('#mday')) form.mday = +$('#mday').value;
  };
  v.querySelectorAll('input,textarea,select').forEach(el => el.addEventListener('change', sync));
  $('#mFreq').onchange = e => { sync(); form.freq = e.target.value; render(); };
  if ($('#allQ')) $('#allQ').onclick = () => { sync(); form.qs = [true, true, true, true]; render(); };
  v.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const p = PRESETS[b.dataset.p]; Object.assign(form, { title: p.title, freq: p.freq, cat: p.cat, tl: p.tl }); render(); });
  v.querySelectorAll('[data-mq]').forEach(b => b.onclick = () => { S.manualQ = b.dataset.mq; render(); });
  v.querySelectorAll('[data-mdel]').forEach(b => b.onclick = () => confirm('Delete this manual compliance?') && act(() => api(`/api/manual/${b.dataset.mdel}?company=${S.companyId}`, { method: 'DELETE' }), 'Deleted'));
  $('#mClear').onclick = () => { S.manualForm = null; render(); };
  $('#mSave').onclick = () => {
    sync();
    let dates = [];
    if (form.freq === 'Quarterly') dates = form.qs.map((on, k) => on && { pkey: 'Q' + (k + 1), label: S.cal.quarters[k].label, due: form.qd[k] }).filter(Boolean);
    else if (form.freq === 'Half-Yearly') dates = form.hy.map((d, k) => ({ pkey: 'H' + (k + 1), label: k ? `H2 of ${S.cal.fyLabel}` : `H1 of ${S.cal.fyLabel}`, due: d }));
    else if (form.freq === 'Monthly') for (let k = 0; k < 12; k++) { const m = ((3 + k) % 12) + 1, y = m >= 4 ? fy : fy + 1; const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; dates.push({ pkey: 'M' + m, label: `${MONTHS[m - 1]} ${y}`, due: `${ny}-${String(nm).padStart(2, '0')}-${String(form.mday).padStart(2, '0')}` }); }
    else dates = [{ pkey: 'X', label: form.freq === 'Annual' ? S.cal.fyLabel : form.freq, due: form.one }];
    act(() => post('/api/manual', { title: form.title, timeline: form.tl, category: form.cat, frequency: form.freq, dueRule: form.rule, portal: form.portal, completed: form.completed, dates }), 'Compliance added to calendar')
      .then(r => { if (r) S.manualForm = null; });
  };
  bindRowEvents(v);
}

/* ─────────── Email ─────────── */
function renderEmail(v) {
  const c = S.cal.company, m = S.meta, rec = c.recipients || { to: '', cc: [] };
  const remCount = S.cal.items.filter(i => i.inReminderWindow).length;
  const q = +S.filter.q || 2;
  v.innerHTML = `
    <div class="card"><h3>📮 Sender account — reminders are sent from this mailbox</h3>
      <div class="sub">Each workspace sends from its own e-mail. ${m.mailConfigured ? `Connected: <b>${esc(m.mail.user)}</b>${m.mail.fromEnv ? ' (from server settings)' : ''}` : '<b style="color:var(--red)">Not connected yet</b> — previews work, sending needs a mailbox.'}</div>
      <div class="form-grid">
        <div class="fld"><label>Provider</label><select id="mProv">${[['gmail', 'Gmail / Google Workspace'], ['outlook', 'Outlook / Microsoft 365'], ['zoho', 'Zoho Mail'], ['custom', 'Other (SMTP)']].map(([k, l]) => `<option value="${k}" ${m.mail.provider === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="fld"><label>Sender e-mail</label><input id="mUser" value="${esc(m.mail.user)}" placeholder="compliance@yourcompany.com"></div>
        <div class="fld"><label>App password ${m.mailConfigured ? '(leave blank to keep)' : ''}</label><input id="mPass" type="password" autocomplete="new-password" placeholder="16-character app password"></div>
        <div class="fld"><label>Display name</label><input id="mFrom" value="${esc(m.mail.fromName)}" placeholder="e.g. ACME Compliance"></div>
        <div class="fld hidden" id="mSmtp"><label>SMTP host : port</label><div class="row"><input id="mHost" class="inp" style="flex:1" placeholder="smtp.example.com"><input id="mPort" class="inp" style="width:80px" placeholder="587"></div></div>
        <div class="fld" style="align-self:end"><div class="row"><button class="btn primary" id="mConn">Test & connect</button>${m.mailConfigured && !m.mail.fromEnv ? '<button class="btn danger" id="mDisc">Disconnect</button>' : ''}</div></div>
        <div class="full notice info">For <b>Gmail</b>: turn on 2-Step Verification, then create an App Password at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a> and paste it here. The password is stored encrypted and is never shown again.</div>
      </div></div>
    <div class="card"><div class="row"><div class="logo" style="width:40px;height:40px">✉</div><div style="flex:1"><h3>Daily reminder: ${esc(c.shortName || c.name)} – compliances due in the next ${m.settings.reminderDays} days / overdue</h3>
      <div class="mono" style="font-size:12.5px;color:var(--muted)">To: <b style="color:var(--brand)">${esc(rec.to || '—')}</b> ${rec.cc?.length ? '• CC: ' + rec.cc.map(r => esc(r.email)).join(', ') : ''}</div></div>
      <button class="btn" data-prev="reminder">👁 Email Preview</button><button class="btn primary" data-send="reminder" ${m.mailConfigured ? '' : 'disabled'}>➤ Send Now (Gmail)</button></div>
      <div class="notice ${m.mailConfigured ? 'ok' : 'warn'}" style="margin-top:14px">${m.mailConfigured ? `Connected Google Account: <b>${esc(m.mailUser)}</b> — ✓ Outbound Gmail (SMTP) ready` : 'Gmail not configured'}
        · Daily run at <b>${esc(m.settings.sendTime)} IST</b> ${m.settings.autoSend ? '(automatic)' : '(automatic sending OFF)'} · Last run: <b>${m.lastDaily?.at ? new Date(m.lastDaily.at).toLocaleString('en-IN') : 'never'}</b></div>
      <div class="notice info" style="margin-top:10px"><b>Submission Date Rule:</b> once a filing is detected on BSE or its submission date is entered here, it drops out of the e-mail automatically. <b>${remCount}</b> item(s) currently in the reminder window for ${esc(S.cal.fyLabel)}.</div>
      <div class="row" style="margin-top:14px"><b>Quarter status e-mail:</b>
        <select id="qSel" class="inp">${S.cal.quarters.map(x => `<option value="${x.q}" ${x.q === q ? 'selected' : ''}>Quarter ended ${x.label.split(' · ')[1]}</option>`).join('')}</select>
        <button class="btn" data-prev="quarter">👁 Preview</button><button class="btn soft" data-send="quarter" ${m.mailConfigured ? '' : 'disabled'}>➤ Send quarter status</button></div></div>
    <div class="card"><h3>✉ Daily Email Updates & Due Date Tracking</h3><div class="sub">Manage who receives the daily compliance reminders for <b>${esc(c.name)}</b>.</div>
      <div class="fld"><label>PRIMARY EMAIL ID (DAILY EMAILS SENT TO)</label><div class="row"><input id="toInp" class="inp" style="flex:1;font-family:JetBrains Mono" value="${esc(rec.to)}"><button class="btn primary" id="toSave">✓ Save</button></div></div>
      <div class="fld" style="margin-top:18px"><label>ADD PARTICIPANT (CC) FOR TRACKING DUE DATES</label><div class="row"><input id="ccName" class="inp" placeholder="Name (e.g. Company Secretary)" style="width:240px"><input id="ccEmail" class="inp" placeholder="email@company.com" style="flex:1"><button class="btn green" id="ccAdd">⊕ Add Participant</button></div></div>
      <div class="fld" style="margin-top:14px"><label>ACTIVE TRACKING PARTICIPANTS (${rec.cc?.length || 0})</label><div class="cclist">${(rec.cc || []).map((r, k) => `<div class="cc"><b style="min-width:180px">${esc(r.name || '—')}</b><span class="em" style="flex:1">${esc(r.email)}</span><button class="iconbtn" data-rm="${k}" title="Remove">✕</button></div>`).join('') || '<div class="cc rem">No participants yet</div>'}</div></div>
    </div>
    <div class="card"><h3>📲 WhatsApp updates — free one-tap sending</h3>
      <div class="sub">No Twilio or paid account needed. Each button opens WhatsApp (phone or WhatsApp Web) with the reminder already typed — just press send. The daily e-mail also carries a green <b>“Forward this reminder on WhatsApp”</b> button.</div>
      <div class="row">
        <button class="btn green" data-wafree="reminder" data-to="">📲 Daily reminder → choose chat / group</button>
        <button class="btn green" data-wafree="quarter" data-to="">📲 Quarter status → choose chat / group</button>
        <span class="spacer"></span>
        <label class="row" style="gap:6px"><input type="checkbox" id="waFwd" ${m.settings.whatsappForward !== false ? 'checked' : ''}> Add WhatsApp button to e-mails</label>
      </div>
      ${(rec.whatsapp || []).length ? `<div class="row" style="margin-top:10px"><small class="rem" style="font-style:normal">Send directly to a saved number:</small>${rec.whatsapp.map(r => `<button class="btn sm" data-wafree="reminder" data-to="${esc(r.number)}">📲 ${esc(r.name || r.number)}</button>`).join('')}</div>` : ''}
    </div>
    <details class="card"><summary><b>💬 Automatic WhatsApp via Twilio (optional — needs a paid Twilio account)</b> ${m.whatsapp.configured ? `· connected, sender ${esc(m.whatsapp.from)}` : ''}</summary>
      <div class="form-grid" style="margin-top:14px">
        <div class="fld"><label>Twilio Account SID</label><input id="wSid" value="${esc(m.whatsapp.sid)}" placeholder="AC…"></div>
        <div class="fld"><label>Auth Token ${m.whatsapp.configured ? '(leave blank to keep)' : ''}</label><input id="wTok" type="password" autocomplete="new-password" placeholder="Twilio Auth Token"></div>
        <div class="fld"><label>Twilio sender number — <u>not</u> your own mobile</label><div class="row"><input id="wFrom" class="inp" style="flex:1" value="${esc(m.whatsapp.from || '+14155238886')}" placeholder="+14155238886"><button class="btn sm" type="button" onclick="$('#wFrom').value='+14155238886';$('#wTpl').value=''">Use sandbox</button></div><small class="rem">Sandbox for testing: +14155238886. Your own number goes in the recipient list below.</small></div>
        <div class="fld two"><label>Approved template Content SID (optional — needed outside the 24-hour chat window)</label><input id="wTpl" value="${esc(m.whatsapp.contentSid)}" placeholder="HX…  variables: {{1}} company, {{2}} count, {{3}} list, {{4}} link"></div>
        <div class="fld" style="align-self:end"><div class="row"><button class="btn primary" id="wSave">Test & connect</button>${m.whatsapp.configured ? '<button class="btn danger" id="wDel">Disconnect</button>' : ''}</div></div>
      </div>
      <div class="fld" style="margin-top:16px"><label>WHATSAPP NUMBERS FOR ${esc((c.shortName || c.name).toUpperCase())} (used by one-tap buttons and Twilio)</label>
        <div class="cclist">${(rec.whatsapp || []).map((r, k) => `<div class="cc"><b style="min-width:180px">${esc(r.name || '—')}</b><span class="em" style="flex:1">${esc(r.number)}</span><button class="iconbtn" data-wrm="${k}" title="Remove">✕</button></div>`).join('') || '<div class="cc rem">No WhatsApp numbers yet</div>'}</div>
        <div class="row" style="margin-top:10px"><input id="wName" class="inp" placeholder="Name" style="width:200px"><input id="wNum" class="inp" placeholder="Mobile e.g. 98765 43210 or +91…" style="flex:1"><button class="btn green" id="wAdd">⊕ Add number</button></div></div>
      <div class="row" style="margin-top:14px">
        ${m.whatsapp.configured ? `<label class="row" style="gap:6px"><input type="checkbox" id="wOn" ${m.whatsapp.enabled ? 'checked' : ''}> <b>Send the daily reminder on WhatsApp too</b> (${esc(m.settings.sendTime)} IST, same as e-mail)</label>` : ''}
        <span class="spacer"></span>
        <button class="btn" data-wprev="reminder">👁 Preview daily WhatsApp</button><button class="btn soft" data-wsend="reminder" ${m.whatsapp.configured ? '' : 'disabled'}>➤ Send now</button>
        <button class="btn" data-wprev="quarter">👁 Preview quarter status</button><button class="btn soft" data-wsend="quarter" ${m.whatsapp.configured ? '' : 'disabled'}>➤ Send quarter status</button></div>
      <div class="notice info" style="margin-top:12px"><b>Getting started with Twilio:</b> create an account at <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener">twilio.com</a> → copy <b>Account SID</b> and <b>Auth Token</b> from the Console.
        For testing use the <b>WhatsApp Sandbox</b> (Messaging → Try it out → Send a WhatsApp message): sender <code>+14155238886</code>, and each recipient must first send the join code shown there from their WhatsApp.
        For live use, register your business number as a WhatsApp sender in Twilio and create an approved message template (paste its Content SID above).</div></details>
    <div class="card"><h3>⚙ Reminder settings (all companies)</h3>
      <div class="form-grid">
        <div class="fld"><label>Start reminders this many days before the due date</label><input type="number" min="0" max="30" id="rdays" value="${m.settings.reminderDays}"></div>
        <div class="fld"><label>Daily send time (IST)</label><input type="time" id="stime" value="${m.settings.sendTime}"></div>
        <div class="fld"><label>&nbsp;</label><label class="check"><input type="checkbox" id="auto" ${m.settings.autoSend ? 'checked' : ''}><div><b>Send automatically every day</b><small>Repeats daily until each item is filed</small></div></label></div>
        <div class="fld two"><label class="check"><input type="checkbox" id="incCirc" ${m.settings.includeCirculars ? 'checked' : ''}><div><b>Include new BSE / NSE / SEBI circulars (last 24 h) in the daily e-mail</b></div></label></div>
        <div class="fld" style="align-self:end"><button class="btn primary" id="setSave" style="width:100%;justify-content:center">Save settings</button></div>
      </div>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="runNow" ${m.mailConfigured ? '' : 'disabled'}>➤ Send Daily Email Update Now (all companies)</button><span class="spacer"></span><button class="btn soft" id="syncAll">🔔 Run BSE check now</button></div>
      ${m.lastDaily?.results?.length ? `<div class="notice info" style="margin-top:12px">${m.lastDaily.results.map(r => `${esc(r.company)}: ${r.sent ? `sent (${r.items} item(s))` : esc(r.reason)}`).join('<br>')}</div>` : ''}
    </div>`;
  const saveWa = list => act(() => post('/api/recipients', { to: rec.to, cc: rec.cc || [], whatsapp: list }), 'WhatsApp numbers saved');
  $('#wAdd').onclick = () => { const n = $('#wNum').value.replace(/[^\d+]/g, ''); if (n.replace('+', '').length < 10) return toast('Enter a valid mobile number', true); saveWa([...(rec.whatsapp || []), { name: $('#wName').value.trim(), number: n }]); };
  v.querySelectorAll('[data-wrm]').forEach(b => b.onclick = () => saveWa(rec.whatsapp.filter((_, k) => k !== +b.dataset.wrm)));
  $('#wSave').onclick = e => { e.target.disabled = true; e.target.textContent = 'Checking…';
    act(() => post('/api/org/whatsapp', { sid: $('#wSid').value, token: $('#wTok').value, from: $('#wFrom').value, contentSid: $('#wTpl').value }), r => `Twilio connected (${r.account})`)
      .finally(() => { const b = $('#wSave'); if (b) { b.disabled = false; b.textContent = 'Test & connect'; } }); };
  if ($('#wDel')) $('#wDel').onclick = () => confirm('Disconnect WhatsApp?') && act(() => post('/api/org/whatsapp', { remove: true }), 'WhatsApp disconnected');
  v.querySelectorAll('[data-wafree]').forEach(b => b.onclick = async () => {
    const win = window.open('about:blank', '_blank'); // open first so pop-up blockers allow it
    try {
      const p = await api(`/api/whatsapp/preview?company=${S.companyId}&fy=${S.fy}&mode=${b.dataset.wafree}&q=${$('#qSel').value}`);
      const to = (b.dataset.to || '').replace(/[^\d]/g, '');
      const url = `https://wa.me/${to}?text=${encodeURIComponent(p.body.slice(0, 1800))}`;
      if (win) win.location = url; else location.href = url;
    } catch (e) { win?.close(); toast(e.message, true); }
  });
  $('#waFwd').onchange = e => act(() => post('/api/settings', { whatsappForward: e.target.checked }), e.target.checked ? 'E-mails will include the WhatsApp button' : 'WhatsApp button removed from e-mails');
  if ($('#wOn')) $('#wOn').onchange = e => act(() => post('/api/org/whatsapp', { toggle: e.target.checked }), e.target.checked ? 'WhatsApp reminders on' : 'WhatsApp reminders off');
  v.querySelectorAll('[data-wprev]').forEach(b => b.onclick = async () => {
    try {
      const p = await api(`/api/whatsapp/preview?company=${S.companyId}&fy=${S.fy}&mode=${b.dataset.wprev}&q=${$('#qSel').value}`);
      const html = esc(p.body).replace(/\*(.+?)\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
      $('#modalCard').innerHTML = `<div class="mhead"><div><h3>WhatsApp preview</h3><small style="color:#a5b4fc">From ${esc(p.from || '(Twilio not connected)')} → ${esc(p.numbers.map(n => n.number).join(', ') || 'no numbers added')}</small></div><button class="iconbtn" style="color:#fff" onclick="$('#modal').classList.add('hidden')">✕</button></div>
        <div class="mbody" style="background:#e5ddd5"><div class="wa-bubble">${html}</div></div>`;
      $('#modal').classList.remove('hidden');
    } catch (e) { toast(e.message, true); }
  });
  v.querySelectorAll('[data-wsend]').forEach(b => b.onclick = () => { if (!(rec.whatsapp || []).length) return toast('Add a WhatsApp number first', true);
    if (confirm(`Send the ${b.dataset.wsend === 'quarter' ? 'quarter status' : 'daily reminder'} on WhatsApp to ${rec.whatsapp.map(r => r.number).join(', ')}?`))
      act(() => post('/api/whatsapp/test', { mode: b.dataset.wsend, q: $('#qSel').value }), r => `WhatsApp sent to ${r.sent.join(', ')}${r.failed.length ? ' — failed: ' + r.failed.join('; ') : ''}`); });
  const prov = () => $('#mSmtp').classList.toggle('hidden', $('#mProv').value !== 'custom');
  $('#mProv').onchange = prov; prov();
  $('#mConn').onclick = e => { e.target.disabled = true; e.target.textContent = 'Testing…';
    act(() => post('/api/org/mail', { provider: $('#mProv').value, user: $('#mUser').value, password: $('#mPass').value, fromName: $('#mFrom').value, host: $('#mHost').value, port: $('#mPort').value }), 'Mailbox connected — reminders will be sent from it')
      .finally(() => { const b = $('#mConn'); if (b) { b.disabled = false; b.textContent = 'Test & connect'; } }); };
  if ($('#mDisc')) $('#mDisc').onclick = () => confirm('Disconnect this mailbox? Reminders will stop until another one is connected.') && act(() => post('/api/org/mail', { remove: true }), 'Disconnected');
  const saveRec = (to, cc) => act(() => post('/api/recipients', { to, cc }), 'Recipients saved');
  $('#toSave').onclick = () => saveRec($('#toInp').value, rec.cc || []);
  $('#ccAdd').onclick = () => { const e = $('#ccEmail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(e)) return toast('Enter a valid e-mail', true); saveRec(rec.to, [...(rec.cc || []), { name: $('#ccName').value.trim(), email: e }]); };
  v.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => saveRec(rec.to, rec.cc.filter((_, k) => k !== +b.dataset.rm)));
  v.querySelectorAll('[data-prev]').forEach(b => b.onclick = () => previewEmail(b.dataset.prev, +$('#qSel').value));
  v.querySelectorAll('[data-send]').forEach(b => b.onclick = () => sendEmail(b.dataset.send, +$('#qSel').value));
  $('#setSave').onclick = () => act(() => post('/api/settings', { reminderDays: $('#rdays').value, sendTime: $('#stime').value, autoSend: $('#auto').checked, includeCirculars: $('#incCirc').checked }), 'Settings saved');
  $('#runNow').onclick = e => { if (!confirm('Send today\'s reminder e-mail now for every company that has items in the reminder window?')) return; e.target.disabled = true; act(() => post('/api/reminders/run'), r => r.map(x => `${x.company}: ${x.sent ? 'sent' : x.reason}`).join(' · ')); };
  $('#syncAll').onclick = e => { e.target.disabled = true; act(() => post('/api/sync'), r => r.message); };
}
async function sendEmail(mode, q) {
  const c = S.cal.company;
  if (!confirm(`Send the ${mode === 'quarter' ? 'quarter status' : 'reminder'} e-mail for ${c.name} now to ${c.recipients?.to}${c.recipients?.cc?.length ? ' (+' + c.recipients.cc.length + ' cc)' : ''}?`)) return;
  act(() => post('/api/email/send', { mode, q }), r => `Sent: "${r.subject}"`);
}
async function previewEmail(mode, q) {
  try {
    const e = await api(`/api/email/preview?company=${S.companyId}&fy=${S.fy}&mode=${mode}&q=${q}`);
    const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(e.to)}&cc=${encodeURIComponent(e.cc.map(r => r.email).join(','))}&su=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.text)}`;
    $('#modalCard').innerHTML = `<div class="mhead"><div><h3>Live Email Inbox Preview <span class="tag2" style="background:#10b98133;color:#6ee7b7">EXACT RECIPIENT VIEW</span></h3><small style="color:#a5b4fc">Rendered as it appears in Gmail / Outlook</small></div>
      <div class="seg2"><button class="on" data-v="html">Rendered HTML</button><button data-v="text">Plain Text</button><button data-v="src">HTML Source</button></div><button class="iconbtn" style="color:#fff" id="mClose">✕</button></div>
      <div class="mmeta"><span>SUBJECT</span><b>${esc(e.subject)}</b><span>FROM</span><span class="mono" style="color:var(--ink);font-weight:500">${esc(e.from)}</span><span>TO</span><span class="mono" style="color:var(--brand);font-weight:600">${esc(e.to)}</span><span>CC</span><span class="mono" style="color:var(--ink);font-weight:500">${esc(e.cc.map(r => r.email).join(', ') || '—')}</span></div>
      <div class="mbody" id="mBody"></div>
      <div class="mfoot"><div class="row"><button class="btn" id="cpH">⧉ Copy HTML</button><button class="btn" id="cpT">⧉ Copy Plain Text</button><a class="btn soft" href="${gmail}" target="_blank" rel="noopener">↗ Open in Gmail Web</a></div>
        <div class="row"><button class="btn" id="mClose2">Close</button><button class="btn primary" id="mSend" ${S.meta.mailConfigured ? '' : 'disabled'}>➤ Send via Gmail</button></div></div>`;
    const show = k => { $('#mBody').innerHTML = k === 'html' ? '<iframe id="ifr"></iframe>' : `<pre>${esc(k === 'text' ? e.text : e.html)}</pre>`; if (k === 'html') $('#ifr').srcdoc = e.html; document.querySelectorAll('.seg2 button').forEach(b => b.classList.toggle('on', b.dataset.v === k)); };
    show('html');
    document.querySelectorAll('.seg2 button').forEach(b => b.onclick = () => show(b.dataset.v));
    const close = () => $('#modal').classList.add('hidden');
    $('#mClose').onclick = close; $('#mClose2').onclick = close;
    $('#cpH').onclick = () => navigator.clipboard.writeText(e.html).then(() => toast('HTML copied'));
    $('#cpT').onclick = () => navigator.clipboard.writeText(e.text).then(() => toast('Text copied'));
    $('#mSend').onclick = () => { close(); sendEmail(mode, q); };
    $('#modal').classList.remove('hidden');
  } catch (err) { toast(err.message, true); }
}

/* ─────────── Circulars ─────────── */
const isNew = i => !!i.unread;
function renderCirc(k) {
  const v = $('#view'), feed = S.circ?.[k] || {}, f = S.circFilter[k];
  const label = { bse: 'BSE – Circulars to Listed Companies', nse: 'NSE – Circulars issued to Listed Companies (Equity & Debt)', sebi: 'SEBI – Circulars, Master Circulars, Regulations & Updates' }[k];
  let items = feed.items || [];
  if (k === 'sebi') { if (f.type === 'Legal') items = items.filter(i => i.legal); else if (f.type !== 'All') items = items.filter(i => i.category === f.type); }
  else if (f.seg !== 'All') items = items.filter(i => i.segment === f.seg);
  if (f.unreadOnly) items = items.filter(i => i.unread);
  if (f.search) items = items.filter(i => (i.title + ' ' + (i.ref || '') + ' ' + i.category).toLowerCase().includes(f.search.toLowerCase()));
  const chips = k === 'sebi' ? ['Legal', 'All', 'Circular', 'Master Circular', 'Regulation', 'Consultation / Report', 'Press Release', 'Enforcement'] : ['All', 'Equity', 'Debt'];
  v.innerHTML = `<div class="toolbar"><b>${label}</b><span class="spacer"></span>
      <span class="syncinfo">${feed.fetchedAt ? 'Updated ' + new Date(feed.fetchedAt).toLocaleString('en-IN') : ''} ${feed.ok === false ? `<span style="color:var(--red)">· last refresh failed: ${esc(feed.error)}</span>` : ''}</span>
      ${feed.unread ? `<button class="btn primary" id="cAll">✓ Mark all ${feed.unread} as read</button>` : '<span class="tag2" style="background:var(--green-soft);color:var(--green)">✓ All read</span>'}
      <button class="btn soft" id="cRef">↻ Refresh now</button></div>
    <div class="toolbar"><div class="chips">${chips.map(c => `<button class="chipbtn ${(k === 'sebi' ? f.type : f.seg) === c ? 'on' : ''}" data-c="${c}">${c === 'Legal' ? 'Circulars & Regulations' : c}</button>`).join('')}</div>
      <label class="row" style="gap:6px"><input type="checkbox" id="cUnr" ${f.unreadOnly ? 'checked' : ''}> Unread only</label>
      <div class="search"><input id="cSrch" placeholder="Search circulars…" value="${esc(f.search)}"></div></div>
    <div class="tablecard">${items.length ? items.map(i => `<div class="circ ${i.unread ? 'unread' : ''}" data-cid="${esc(i.id)}"><div class="d">${i.unread ? '<span class="dot"></span>' : ''}${fmtShort(i.date)}</div>
        <div><div class="t">${i.unread ? '<span class="newb">UNREAD</span> ' : ''}${esc(i.title)}</div><div class="m"><span class="seg ${i.segment}">${i.segment}</span><span class="tag2">${esc(i.category)}</span>${i.ref ? `<span class="tag2 mono">${esc(i.ref)}</span>` : ''}</div></div>
        <div class="row" style="gap:6px;flex-wrap:nowrap"><button class="iconbtn" data-toggle="${i.unread ? 'read' : 'unread'}" title="Mark as ${i.unread ? 'read' : 'unread'}">${i.unread ? '✓' : '●'}</button><a class="btn sm" href="${esc(i.url)}" target="_blank" rel="noopener">${k === 'nse' ? 'NSE' : 'Open'} ↗</a>${i.sebiUrl ? `<a class="btn sm soft" href="${esc(i.sebiUrl)}" target="_blank" rel="noopener">SEBI ↗</a>` : ''}</div></div>`).join('') : `<div class="empty">${feed.fetchedAt ? 'No circulars match.' : 'Loading circulars… click Refresh if this persists.'}</div>`}</div>`;
  v.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { if (k === 'sebi') f.type = b.dataset.c; else f.seg = b.dataset.c; render(); });
  if ($('#hideR')) $('#hideR').onchange = e => { f.hideRoutine = e.target.checked; render(); };
  $('#cSrch').oninput = e => { f.search = e.target.value; const p = e.target.selectionStart; render(); const s = $('#cSrch'); s.focus(); s.setSelectionRange(p, p); };
  if ($('#cAll')) $('#cAll').onclick = () => act(() => post('/api/circulars/read', { source: k, all: true }), 'All marked as read');
  $('#cUnr').onchange = e => { f.unreadOnly = e.target.checked; render(); };
  const markRead = (id, unread = false) => post('/api/circulars/read', { source: k, id, unread }).then(() => loadCirculars()).then(render).catch(() => {});
  v.querySelectorAll('.circ[data-cid]').forEach(row => {
    row.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { if (row.classList.contains('unread')) markRead(row.dataset.cid); }));
    const t = row.querySelector('[data-toggle]');
    if (t) t.onclick = () => markRead(row.dataset.cid, t.dataset.toggle === 'unread');
  });
  $('#cRef').onclick = e => { e.target.disabled = true; e.target.textContent = 'Refreshing…'; act(() => post('/api/circulars/refresh'), 'Circulars refreshed'); };
}

/* ─────────── Companies & settings ─────────── */
const FLAG_INFO = {
  listedEquity: ['Equity shares listed (NSE / BSE)', 'SEBI LODR Chapter IV, PIT, SAST, DP Regs'],
  listedDebt: ['Debt securities listed (NCDs / CPs)', 'SEBI LODR Chapter V – Reg 50–62'],
  monitoringAgency: ['Monitoring Agency appointed', 'IPO / QIP proceeds > ₹100 cr (ICDR Reg 41)'],
  earningsCall: ['Holds earnings calls / investor presentations', 'Intimation, audio, transcript, presentation'],
  brsr: ['BRSR applicable', 'Top 1,000 listed entities by market cap'],
  largeCorporate: ['Large Corporate framework', 'Initial & annual LC disclosures'],
  secretarialAudit: ['Secretarial audit (MR-3) applicable', 'Listed / large unlisted public companies'],
  costAudit: ['Cost audit applicable', 'CRA-2 & CRA-4'],
  csr: ['CSR applicable (s.135)', 'CSR-2 filing'],
  includeTaxLabour: ['Include tax & labour deadlines', 'TDS, GST, PF/ESI, advance tax, ITR']
};
function renderCompanies(v) {
  const m = S.meta;
  const c = S.editCompany ||= structuredClone(m.companies.find(x => x.id === S.companyId) || { entityType: 'listed', listedEquity: true, recipients: { to: '', cc: [] }, disabledTemplates: [] });
  const listed = c.entityType === 'listed';
  const flags = Object.keys(FLAG_INFO).filter(f => listed || !['listedEquity', 'listedDebt', 'monitoringAgency', 'earningsCall', 'brsr', 'largeCorporate'].includes(f));
  v.innerHTML = `
    <div class="two-col">
      <div class="card"><h3>Companies</h3><div class="sub">Add every entity you manage — listed companies, private limited companies and LLPs. The compliance list adapts to the entity type.</div>
        ${m.companies.map(x => `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line2)"><div style="flex:1"><b>${esc(x.name)}</b><div class="rem" style="font-style:normal">${esc(m.entityTypes[x.entityType])}${x.bseCode ? ' · BSE ' + esc(x.bseCode) : ''}${x.nseSymbol ? ' · NSE ' + esc(x.nseSymbol) : ''}</div></div>
          <button class="btn sm" data-edit="${x.id}">Edit</button><button class="btn sm danger" data-cdel="${x.id}">Delete</button></div>`).join('')}
        <button class="btn primary" id="newCo" style="margin-top:14px">⊕ Add company / LLP</button></div>
      <div class="card"><h3>Holidays (working-day calculations)</h3><div class="sub">Trading / bank holidays (YYYY-MM-DD, one per line). Weekends are always excluded from "working day" timelines.</div>
        <textarea id="hol" class="inp" style="width:100%;min-height:150px;font-family:JetBrains Mono">${(m.settings.holidays || []).join('\n')}</textarea>
        <button class="btn primary" id="holSave" style="margin-top:10px">Save holidays</button></div>
    </div>
    <div class="card"><h3>${c.id ? 'Edit: ' + esc(c.name) : 'New company'}</h3><div class="sub">Profile flags decide which compliances apply.</div>
      ${c.id ? '' : `<div class="fld" style="margin-bottom:16px;position:relative"><label>🔎 Find a listed company (BSE / NSE) — fills codes automatically</label>
        <input id="cFind" class="inp" style="width:100%" placeholder="Type company name, BSE code, NSE symbol or ISIN…" autocomplete="off"><div id="cFindRes" class="lookup hidden"></div>
        <small class="rem">For a private company or LLP, skip this and fill the form below.</small></div>`}
      <div class="form-grid">
        <div class="fld two"><label>Company / LLP name <span class="req">*</span></label><input id="cName" value="${esc(c.name || '')}"></div>
        <div class="fld"><label>Short name (used in e-mail subject)</label><input id="cShort" value="${esc(c.shortName || '')}"></div>
        <div class="fld"><label>Entity type</label><select id="cType">${Object.entries(m.entityTypes).map(([k, l]) => `<option value="${k}" ${c.entityType === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="fld"><label>CIN / LLPIN</label><input id="cCin" value="${esc(c.cin || '')}"></div>
        <div class="fld"><label>Track compliances due from</label><input type="date" id="cTrack" value="${esc(c.trackFrom || '')}"></div>
        ${listed ? `<div class="fld"><label>BSE scrip code (enables auto-verification)</label><input id="cBse" value="${esc(c.bseCode || '')}" placeholder="e.g. 500209"></div>
        <div class="fld"><label>NSE symbol</label><input id="cNse" value="${esc(c.nseSymbol || '')}"></div>
        <div class="fld"><label>ISIN</label><input id="cIsin" value="${esc(c.isin || '')}"></div>` : ''}
        <div class="full flags">${flags.map(f => `<label class="check"><input type="checkbox" data-flag="${f}" ${c[f] ? 'checked' : ''}><div><b>${FLAG_INFO[f][0]}</b><small>${FLAG_INFO[f][1]}</small></div></label>`).join('')}</div>
        <div class="fld"><label>Primary reminder e-mail</label><input id="cTo" value="${esc(c.recipients?.to || '')}"></div>
        <div class="fld two" style="align-self:end"><span class="rem">Add CC participants from the Email Updates tab.</span></div>
        <div class="full row"><span class="spacer"></span>${c.id ? '<button class="btn" id="cCancel">Cancel</button>' : ''}<button class="btn primary" id="cSave">✓ Save company</button></div>
      </div>
      ${c.id ? `<h3 style="margin-top:24px">Applicable compliances (${esc(m.entityTypes[c.entityType])})</h3><div class="sub">Untick anything that does not apply to this entity (e.g. ADT-1 in a non-appointment year). Changes apply when you save.</div>
        <div class="applist">${c.id === S.cal?.company?.id ? S.cal.applicable.map(t => `<label><input type="checkbox" data-tpl="${t.id}" ${(c.disabledTemplates || []).includes(t.id) ? '' : 'checked'}><span class="k">${t.kind}</span><span class="tag2 cat">${esc(t.cat)}</span>${esc(t.title)}</label>`).join('') : '<div class="rem" style="padding:12px">Save the profile to see the applicable list.</div>'}</div>` : ''}
    </div>`;
  const read = () => {
    c.name = $('#cName').value; c.shortName = $('#cShort').value; c.entityType = $('#cType').value; c.cin = $('#cCin').value; c.trackFrom = $('#cTrack').value;
    if ($('#cBse')) { c.bseCode = $('#cBse').value; c.nseSymbol = $('#cNse').value; }
    if ($('#cIsin')) c.isin = $('#cIsin').value;
    v.querySelectorAll('[data-flag]').forEach(x => c[x.dataset.flag] = x.checked);
    c.recipients = { ...(c.recipients || {}), to: $('#cTo').value, cc: c.recipients?.cc || [] };
    if (v.querySelector('[data-tpl]')) c.disabledTemplates = [...v.querySelectorAll('[data-tpl]')].filter(x => !x.checked).map(x => x.dataset.tpl);
  };
  if ($('#cFind')) {
    let t;
    $('#cFind').oninput = e => { clearTimeout(t); const q = e.target.value; t = setTimeout(async () => {
      const res = await api('/api/lookup?q=' + encodeURIComponent(q)).catch(() => []);
      const box = $('#cFindRes'); box.classList.toggle('hidden', !res.length);
      box.innerHTML = res.map((r, k) => `<div class="lk" data-k="${k}"><b>${esc(r.name)}</b><span class="mono">BSE ${esc(r.bseCode)} · ${esc(r.symbol)} · ${esc(r.isin)}</span><small>Mkt cap ₹${r.mcap.toLocaleString('en-IN')} cr · rank #${r.mcapRank}</small></div>`).join('');
      box.querySelectorAll('.lk').forEach(el => el.onclick = () => {
        read(); const r = res[el.dataset.k];
        Object.assign(c, { name: r.name, shortName: c.shortName || r.symbol, bseCode: r.bseCode, nseSymbol: r.symbol, isin: r.isin, entityType: 'listed', listedEquity: true, brsr: r.mcapRank <= 1000, secretarialAudit: true, trackFrom: c.trackFrom || S.meta.today.slice(0, 8) + '01' });
        render(); toast(`Filled from BSE: ${r.name} — BRSR ${r.mcapRank <= 1000 ? 'applies (top 1,000)' : 'not applicable'} by market-cap rank #${r.mcapRank}. Review flags and save.`);
      });
    }, 250); };
  }
  $('#cType').onchange = () => { read(); if (c.entityType === 'listed' && !c.listedDebt) c.listedEquity = true; render(); };
  v.querySelectorAll('[data-flag]').forEach(x => x.onchange = () => { read(); render(); });
  $('#cSave').onclick = async () => { read(); const r = await act(() => api('/api/company', { method: 'POST', body: c }), 'Company saved'); if (r) { S.companyId = r.company.id; lsSet('company', S.companyId); S.editCompany = null; await refresh(); } };
  if ($('#cCancel')) $('#cCancel').onclick = () => { S.editCompany = null; render(); };
  $('#newCo').onclick = () => { S.editCompany = { entityType: 'private', recipients: { to: '', cc: [] }, disabledTemplates: [] }; render(); };
  v.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { S.companyId = b.dataset.edit; lsSet('company', S.companyId); S.editCompany = null; S.filter.q = null; refresh(); });
  v.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => confirm('Delete this company and stop its reminders?') && act(() => api('/api/company/' + b.dataset.cdel, { method: 'DELETE' }), 'Deleted').then(() => { S.editCompany = null; }));
  $('#holSave').onclick = () => act(() => post('/api/settings', { holidays: $('#hol').value }), 'Holidays saved');
}
/* ─────────── Company announcements ─────────── */
function renderAnn(v) {
  const a = S.ann, c = S.cal?.company;
  if (!c?.bseCode) { v.innerHTML = '<div class="card empty">This entity has no BSE scrip code — add one under Companies & Settings to see its exchange filings.</div>'; return; }
  const f = S.annFilter ||= { search: '' };
  const items = (a?.items || []).filter(i => !f.search || (i.headline + ' ' + i.sub + ' ' + i.cat).toLowerCase().includes(f.search.toLowerCase()));
  v.innerHTML = `<div class="toolbar"><b>${esc(c.name)} — filings disseminated on BSE (scrip ${esc(c.bseCode)})</b><span class="spacer"></span>
      <span class="syncinfo">${a?.sync?.at ? 'Checked ' + new Date(a.sync.at).toLocaleString('en-IN') : ''}</span><button class="btn soft" id="annRef">↻ Fetch latest</button></div>
    <div class="toolbar"><div class="search"><input id="annSrch" placeholder="Search filings (e.g. Board Meeting, Trading Window, Newspaper)…" value="${esc(f.search)}"></div>
      <a class="btn" href="https://www.bseindia.com/stock-share-price/x/x/${esc(c.bseCode)}/corp-announcements/" target="_blank" rel="noopener">Open on BSE ↗</a></div>
    <div class="tablecard">${items.length ? items.map(i => `<div class="circ"><div class="d">${fmtDT(i.at)}</div>
      <div><div class="t">${esc(i.headline)}</div><div class="m"><span class="tag2 cat">${esc(i.cat)}</span><span class="tag2">${esc(i.sub)}</span></div></div>
      <a class="btn sm" href="${esc(bsePdf(i.url))}" target="_blank" rel="noopener">PDF ↗</a></div>`).join('') : '<div class="empty">No announcements loaded yet — click “Fetch latest”.</div>'}</div>`;
  $('#annSrch').oninput = e => { f.search = e.target.value; const p = e.target.selectionStart; render(); const s = $('#annSrch'); s.focus(); s.setSelectionRange(p, p); };
  $('#annRef').onclick = e => { e.target.disabled = true; e.target.textContent = 'Fetching…'; act(() => post('/api/sync'), r => r.message); };
}

/* ─────────── Team & clients ─────────── */
async function loadTeam() {
  try {
    S.team = await api('/api/team');
    S.join = await api('/api/team-join-link');
    S.clients = S.meta?.user?.superAdmin ? await api('/api/admin/orgs') : null;
  } catch (e) { S.team = null; S.teamErr = e.message; }
  if (S.tab === 'team') render();
}
const linkRow = (label, link) => link ? `<div style="margin-top:8px"><small><b>${label}</b></small><div class="row" style="margin-top:4px"><input class="inp mono" style="flex:1;font-size:12px" readonly value="${esc(link)}" onclick="this.select()"><button class="btn sm" onclick="navigator.clipboard.writeText('${esc(link)}').then(()=>toast('Link copied'))">⧉ Copy</button>
  <a class="btn sm green" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Compliance Calendar – create your account: ' + link)}">WhatsApp</a></div></div>` : '';
function inviteBox(r, who) {
  return `<div class="notice ok" style="margin-top:12px"><b>Invite link for ${esc(who)}</b> (valid 7 days) — they open it and set their own password.
    ${linkRow('🌐 From anywhere (internet)', r.link)}${linkRow('🏢 Same office Wi-Fi (use this if the internet link is blocked)', r.lanLink)}</div>`;
}
function renderTeam(v) {
  const m = S.meta, isAdmin = m.user.superAdmin || ['owner', 'admin'].includes(m.user.role);
  if (!isAdmin) { v.innerHTML = '<div class="card empty">Only workspace admins can manage the team.</div>'; return; }
  const team = S.team || [];
  v.innerHTML = `
    <div class="card"><h3>👥 Team — ${esc(m.org.name)}</h3><div class="sub">People who can sign in to this workspace. <b>Admins</b> manage companies, recipients and settings; <b>members</b> update filings.</div>
      <div class="cclist">${team.map(u => `<div class="cc"><b style="min-width:180px">${esc(u.name || '—')}</b><span class="em" style="flex:1">${esc(u.email)}</span>
        <span class="tag2">${u.superAdmin ? 'platform owner' : esc(u.role)}</span>${u.pending ? '<span class="tag2 verify">invite pending</span>' : `<span class="rem">${u.lastLogin ? 'last login ' + new Date(u.lastLogin).toLocaleDateString('en-IN') : ''}</span>`}
        ${u.superAdmin || u.id === m.user.id ? '' : `<select class="btn sm" data-role="${u.id}">${['member', 'admin', 'owner'].map(r => `<option ${u.role === r ? 'selected' : ''} ${r === 'owner' ? 'disabled' : ''}>${r}</option>`).join('')}</select>
        ${u.pending ? `<button class="btn sm" data-reinv="${esc(u.email)}">New link</button>` : ''}<button class="iconbtn" data-rmu="${u.id}" title="Remove">✕</button>`}</div>`).join('') || '<div class="cc rem">Loading…</div>'}</div>
      <div class="row" style="margin-top:14px"><input id="tName" class="inp" placeholder="Name" style="width:200px"><input id="tEmail" class="inp" placeholder="email@company.com" style="flex:1"><select id="tRole" class="inp"><option value="member">Member</option><option value="admin">Admin</option></select><button class="btn green" id="tInv">⊕ Invite</button></div>
      <div id="tLink"></div></div>
    <div class="card"><h3>🔗 Team join link</h3><div class="sub">Share one link with your whole team — each person opens it and creates their own account (as a <b>member</b>) in <b>${esc(m.org.name)}</b>. Turn it off when everyone has joined.</div>
      <div class="row"><label class="row" style="gap:8px"><input type="checkbox" id="jOn" ${S.join?.enabled ? 'checked' : ''}> <b>Join link active</b></label><span class="spacer"></span><button class="btn sm" id="jNew">↻ New link (old one stops working)</button></div>
      ${S.join?.enabled ? linkRow('🌐 From anywhere (internet)', S.join.link) + linkRow('🏢 Same office Wi-Fi', S.join.lanLink) : '<div class="rem" style="margin-top:8px">Switch it on to get the link.</div>'}</div>
    ${m.platform ? `<div class="card"><h3>🚀 Client self sign-up (platform owner)</h3><div class="sub">When on, any new firm can create its own workspace from the sign-up link and starts a free trial. You can then edit its plan, company limit and expiry under Client workspaces.</div>
      <div class="form-grid"><label class="check"><input type="checkbox" id="pOn" ${m.platform.allowSignup ? 'checked' : ''}><div><b>Allow new firms to sign up</b><small>Login page shows “Create an account”</small></div></label>
        <div class="fld"><label>Free trial (days)</label><input id="pDays" type="number" min="1" value="${m.platform.trialDays}"></div>
        <div class="fld"><label>Companies allowed on trial</label><input id="pMax" type="number" min="1" value="${m.platform.trialMaxCompanies}"></div>
        <div class="full row"><span class="spacer"></span><button class="btn primary" id="pSave">Save sign-up settings</button></div></div>
      ${m.platform.allowSignup ? linkRow('🌐 Sign-up link for new clients', m.appUrl + '/#signup') + linkRow('🏢 Same office Wi-Fi', m.lanUrl ? m.lanUrl + '/#signup' : '') : ''}</div>` : ''}
    ${S.clients ? `<div class="card"><h3>🏢 Client workspaces (platform owner)</h3><div class="sub">Each client firm gets a private workspace: its own companies, calendar, recipients and sender mailbox. Use the workspace switcher at the top to open one.</div>
      <table class="grid"><thead><tr><th>CLIENT</th><th>PLAN</th><th>COMPANIES</th><th>USERS</th><th>SENDER</th><th>VALID UNTIL</th><th></th></tr></thead><tbody>
      ${S.clients.map(o => `<tr><td><b>${esc(o.name)}</b>${o.isDefault ? ' <span class="tag2">your team</span>' : ''}<div class="rem" style="font-style:normal">${esc(o.contact || '')}</div></td><td>${esc(o.plan || '')}</td>
        <td>${o.companies}${o.maxCompanies ? ' / ' + o.maxCompanies : ''}</td><td>${o.users}</td><td class="mono" style="font-size:12px">${esc(o.mail || '—')}</td>
        <td>${o.validUntil ? fmtShort(o.validUntil) : '—'}</td><td><button class="btn sm" data-open="${o.id}">Open</button> ${o.isDefault ? '' : `<button class="btn sm" data-edito="${o.id}">Edit</button>`}</td></tr>`).join('')}</tbody></table>
      <h3 style="margin-top:22px">${S.editOrg?.id ? 'Edit client' : '⊕ New client workspace'}</h3>
      <div class="form-grid">
        <div class="fld"><label>Client / firm name <span class="req">*</span></label><input id="oName" value="${esc(S.editOrg?.name || '')}"></div>
        <div class="fld"><label>Plan</label><select id="oPlan">${['trial', 'standard', 'professional', 'enterprise'].map(p => `<option ${S.editOrg?.plan === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="fld"><label>Max companies (blank = unlimited)</label><input id="oMax" type="number" min="1" value="${esc(S.editOrg?.maxCompanies || '')}"></div>
        <div class="fld"><label>Subscription valid until</label><input id="oValid" type="date" value="${esc(S.editOrg?.validUntil || '')}"></div>
        <div class="fld two"><label>Contact / billing note</label><input id="oContact" value="${esc(S.editOrg?.contact || '')}" placeholder="e.g. CS Name · phone · invoice ref"></div>
        ${S.editOrg?.id ? '' : `<div class="fld"><label>Client admin name</label><input id="oOwnerName"></div><div class="fld two"><label>Client admin e-mail (gets the invite link)</label><input id="oOwner" placeholder="cs@clientcompany.com"></div>`}
        <div class="full row"><span class="spacer"></span>${S.editOrg?.id ? '<button class="btn" id="oCancel">Cancel</button>' : ''}<button class="btn primary" id="oSave">✓ Save client</button></div>
      </div><div id="oLink"></div></div>` : ''}`;
  $('#jOn').onchange = e => post('/api/team-join-link', { enabled: e.target.checked }).then(j => { S.join = j; render(); toast(j.enabled ? 'Join link is active' : 'Join link switched off'); }).catch(err => toast(err.message, true));
  $('#jNew').onclick = () => confirm('Create a new join link? The current link will stop working.') && post('/api/team-join-link', { regenerate: true, enabled: true }).then(j => { S.join = j; render(); toast('New join link created'); }).catch(err => toast(err.message, true));
  if ($('#pSave')) $('#pSave').onclick = () => act(() => post('/api/admin/platform', { allowSignup: $('#pOn').checked, trialDays: $('#pDays').value, trialMaxCompanies: $('#pMax').value }), 'Sign-up settings saved');
  $('#tInv').onclick = async () => { try { const r = await post('/api/team/invite', { name: $('#tName').value, email: $('#tEmail').value, role: $('#tRole').value }); $('#tLink').innerHTML = inviteBox(r, r.user.email); loadTeam(); } catch (e) { toast(e.message, true); } };
  v.querySelectorAll('[data-reinv]').forEach(b => b.onclick = async () => { try { const r = await post('/api/team/invite', { email: b.dataset.reinv }); $('#tLink').innerHTML = inviteBox(r, r.user.email); } catch (e) { toast(e.message, true); } });
  v.querySelectorAll('[data-role]').forEach(s => s.onchange = () => post('/api/team/' + s.dataset.role, { role: s.value }).then(() => toast('Role updated')).catch(e => toast(e.message, true)));
  v.querySelectorAll('[data-rmu]').forEach(b => b.onclick = () => confirm('Remove this person from the workspace?') && post('/api/team/' + b.dataset.rmu, { remove: true }).then(loadTeam).catch(e => toast(e.message, true)));
  if (S.clients) {
    v.querySelectorAll('[data-open]').forEach(b => b.onclick = () => switchOrg(b.dataset.open));
    v.querySelectorAll('[data-edito]').forEach(b => b.onclick = () => { S.editOrg = S.clients.find(o => o.id === b.dataset.edito); render(); });
    if ($('#oCancel')) $('#oCancel').onclick = () => { S.editOrg = null; render(); };
    $('#oSave').onclick = async () => {
      try {
        const r = await post('/api/admin/orgs', { id: S.editOrg?.id, name: $('#oName').value, plan: $('#oPlan').value, maxCompanies: $('#oMax').value, validUntil: $('#oValid').value, contact: $('#oContact').value, ownerEmail: $('#oOwner')?.value, ownerName: $('#oOwnerName')?.value });
        S.editOrg = null; await loadMeta(); await loadTeam();
        toast('Client saved');
        if (r.invite) $('#oLink').innerHTML = inviteBox(r.invite, r.invite.user.email);
      } catch (e) { toast(e.message, true); }
    };
  }
}
function switchOrg(id) {
  S.orgId = id; lsSet('org', id); S.companyId = null; lsSet('company', null); S.filter.q = null; S.segFor = null; S.editCompany = null;
  refresh().then(() => toast('Switched to ' + S.meta.org.name));
}
function changePassword() {
  const cur = prompt('Current password:'); if (!cur) return;
  const pw = prompt('New password (min 8 characters):'); if (!pw) return;
  api('/api/auth/password', { method: 'POST', body: { current: cur, password: pw } }).then(() => toast('Password changed')).catch(e => toast(e.message, true));
}

/* ─────────── Sign-in / setup / invite screens ─────────── */
function showAuth(mode, extra = {}) {
  const box = $('#auth');
  box.classList.remove('hidden');
  const head = `<div class="logo" style="margin:0 auto 14px">📅</div><h2>Compliance Calendar</h2>`;
  const forms = {
    login: `${head}<p class="sub">Sign in to your workspace</p>
      <input id="aEmail" type="email" placeholder="E-mail" autocomplete="username"><input id="aPw" type="password" placeholder="Password" autocomplete="current-password">
      <button class="btn primary" id="aGo">Sign in</button><p class="rem">Forgot your password? Ask your workspace admin for a new invite link.</p>
      ${extra.signupOpen ? '<p class="sub" style="margin-top:12px">New firm? <a href="#signup" onclick="setTimeout(()=>showAuth(\'signup\'),0)">Create an account</a></p>' : ''}`,
    join: `${head}<p class="sub">Create your account to join <b>${esc(extra.org || '')}</b>.</p>
      <input id="aName" placeholder="Your name"><input id="aMobile" type="tel" placeholder="Mobile number"><input id="aEmail" type="email" placeholder="Your e-mail" autocomplete="username">
      <input id="aPw" type="password" placeholder="Choose a password (min 8 characters)" autocomplete="new-password"><input id="aPw2" type="password" placeholder="Repeat password" autocomplete="new-password">
      <button class="btn primary" id="aGo">Create account</button><p class="rem">Already have an account? <a href="#" onclick="location.hash='';showAuth('login');return false">Sign in</a></p>`,
    signup: `${head}<p class="sub">Create your firm's workspace — free trial, no card needed.</p>
      <input id="aFirm" placeholder="Firm / company name"><input id="aName" placeholder="Your name"><input id="aMobile" type="tel" placeholder="Mobile number"><input id="aEmail" type="email" placeholder="Work e-mail" autocomplete="username">
      <input id="aPw" type="password" placeholder="Choose a password (min 8 characters)" autocomplete="new-password"><input id="aPw2" type="password" placeholder="Repeat password" autocomplete="new-password">
      <button class="btn primary" id="aGo">Start free trial</button><p class="rem">Already have an account? <a href="#" onclick="location.hash='';showAuth('login');return false">Sign in</a></p>`,
    setup: `${head}<p class="sub"><b>First-time setup.</b> Create the platform owner account (you). You'll manage your team and client workspaces from it.</p>
      <input id="aName" placeholder="Your name"><input id="aMobile" type="tel" placeholder="Mobile number"><input id="aEmail" type="email" placeholder="Your e-mail" autocomplete="username">
      <input id="aPw" type="password" placeholder="Choose a password (min 8 characters)" autocomplete="new-password"><input id="aPw2" type="password" placeholder="Repeat password" autocomplete="new-password">
      <button class="btn primary" id="aGo">Create owner account</button>`,
    invite: `${head}<p class="sub">You've been invited to <b>${esc(extra.org || '')}</b> as <b>${esc(extra.email || '')}</b>. Choose a password to activate your account.</p>
      <input id="aName" placeholder="Your name" value="${esc(extra.name || '')}"><input id="aMobile" type="tel" placeholder="Mobile number"><input id="aPw" type="password" placeholder="Choose a password (min 8 characters)" autocomplete="new-password"><input id="aPw2" type="password" placeholder="Repeat password" autocomplete="new-password">
      <button class="btn primary" id="aGo">Activate account</button>`
  };
  box.innerHTML = `<div class="authcard">${forms[mode]}<div id="aErr" class="aerr"></div></div>`;
  const err = m => ($('#aErr').textContent = m);
  const go = async () => {
    try {
      if (mode !== 'login' && $('#aPw').value !== $('#aPw2').value) return err('Passwords do not match');
      if (mode === 'login') await api('/api/auth/login', { method: 'POST', body: { email: $('#aEmail').value, password: $('#aPw').value } });
      if (mode === 'setup') await api('/api/auth/setup', { method: 'POST', body: { name: $('#aName').value, mobile: $('#aMobile').value, email: $('#aEmail').value, password: $('#aPw').value } });
      if (mode === 'invite') await api('/api/auth/invite/' + extra.token, { method: 'POST', body: { name: $('#aName').value, mobile: $('#aMobile').value, password: $('#aPw').value } });
      if (mode === 'join') await api('/api/auth/join/' + extra.code, { method: 'POST', body: { name: $('#aName').value, mobile: $('#aMobile').value, email: $('#aEmail').value, password: $('#aPw').value } });
      if (mode === 'signup') await api('/api/auth/signup', { method: 'POST', body: { firm: $('#aFirm').value, name: $('#aName').value, mobile: $('#aMobile').value, email: $('#aEmail').value, password: $('#aPw').value } });
      location.hash = ''; box.classList.add('hidden'); startApp();
    } catch (e) { err(e.message); }
  };
  $('#aGo').onclick = go;
  box.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
  box.querySelector('input')?.focus();
}

/* ─────────── Log ─────────── */
function renderLog(v) {
  v.innerHTML = `<div class="tablecard">${S.logs.map(l => `<div class="logline"><span class="mono" style="color:var(--muted)">${new Date(l.at).toLocaleString('en-IN')}</span><span class="ty ${l.type}">${esc(l.type)}</span><span>${esc(l.message)}</span></div>`).join('') || '<div class="empty">No activity yet.</div>'}</div>`;
}

/* ─────────── boot ─────────── */
$('#tabs').onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); };
$('#companySel').onchange = e => { S.companyId = e.target.value; lsSet('company', S.companyId); S.filter.q = null; S.editCompany = null; refresh(); };
$('#fySel').onchange = e => { S.fy = +e.target.value; lsSet('fy', S.fy); refresh(); };
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); };
$('#orgSel').onchange = e => switchOrg(e.target.value);
document.addEventListener('click', e => { if (!e.target.closest('#userMenu')) $('#umPop')?.classList.add('hidden'); });
let streaming = false;
function startApp() { refresh().then(() => { if (!streaming) { streaming = true; connectStream(); } }).catch(e => toast(e.message, true)); }
(async () => {
  const inv = /#invite=([\w-]+)/.exec(location.hash);
  if (inv) {
    try { const d = await api('/api/auth/invite/' + inv[1]); return showAuth('invite', { ...d, token: inv[1] }); }
    catch (e) { showAuth('login'); return toast(e.message, true); }
  }
  const join = /#join=([\w-]+)/.exec(location.hash);
  if (join) {
    try { const d = await api('/api/auth/join/' + join[1]); return showAuth('join', { ...d, code: join[1] }); }
    catch (e) { showAuth('login'); return toast(e.message, true); }
  }
  const me = await api('/api/auth/me');
  if (me.needsSetup) return showAuth('setup');
  if (/#signup/.test(location.hash) && !me.user) return me.signupOpen ? showAuth('signup') : (showAuth('login'), toast('New sign-ups are closed — ask the provider for an invite', true));
  if (!me.user) return showAuth('login', { signupOpen: me.signupOpen });
  startApp();
})();
setInterval(() => { if (S.meta && !S.editing && !document.activeElement?.matches('input,textarea,select')) refresh(); }, 5 * 60 * 1000);
