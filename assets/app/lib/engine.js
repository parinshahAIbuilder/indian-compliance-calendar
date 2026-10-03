// Builds the compliance calendar (instances with due dates + status) for one company and FY.
import { TEMPLATES, EVENT_TEMPLATES } from './master.js';
import {
  addDays, addWorkingDays, diffDays, ymd, quarterEnds, quarterStarts, QUARTER_NAMES,
  bucketOf, fyLabel, monthName, todayIST
} from './dates.js';

const FREQ = { Q: 'Quarterly', H: 'Half-Yearly', A: 'Annual', M: 'Monthly', E: 'Event Based' };
const val = (v, arg) => (typeof v === 'function' ? v(arg) : v);

export const qtrLabel = (fy, q) => {
  const end = quarterEnds(fy)[q - 1];
  return `Q${q} · ${QUARTER_NAMES[q - 1]} ${end.slice(0, 4)}`;
};

export function contexts(state, c, fy) {
  const holidays = state.settings.holidays || [];
  const wd = (s, n) => addWorkingDays(s, n, holidays);
  const ev = state.events[c.id]?.[fy] || {};
  const agm = ev.agm || ymd(fy, 9, 30);
  const qs = [1, 2, 3, 4].map(q => {
    const qEnd = quarterEnds(fy)[q - 1];
    const e = ev['Q' + q] || {};
    return {
      c, fy, q, qEnd, qStart: quarterStarts(fy)[q - 1], wd, agm,
      bm: e.bm || null, call: e.call || null,
      resultsLatest: addDays(qEnd, q === 4 ? 60 : 45)
    };
  });
  return { qs, annual: { c, fy, wd, agm, agmSet: !!ev.agm }, ev };
}

function decorate(item, state, cid, today) {
  const st = state.status[cid]?.[item.key] || {};
  item.submittedAt = st.submittedAt || null;
  item.submissionSource = st.source || null;
  item.ref = st.ref || null;
  item.snoozeUntil = st.snoozeUntil || null;
  item.note = st.note || '';
  const days = item.due ? diffDays(item.due, today) : null;
  item.daysLeft = days;
  if (item.submittedAt) item.state = 'done';
  else if (days === null) item.state = 'nodate';
  else if (days < 0) item.state = 'overdue';
  else if (days === 0) item.state = 'today';
  else if (days <= 7) item.state = 'soon';
  else item.state = 'upcoming';
  const rd = state.settings.reminderDays ?? 5;
  item.inReminderWindow = !item.submittedAt && days !== null && days <= rd &&
    !(item.snoozeUntil && item.snoozeUntil > today);
  return item;
}

export function buildCalendar(state, c, fy, today = todayIST()) {
  const { qs, annual, ev } = contexts(state, c, fy);
  const disabled = new Set(c.disabledTemplates || []);
  const items = [];
  const push = it => items.push(decorate(it, state, c.id, today));

  for (const t of TEMPLATES) {
    if (!t.applies(c) || disabled.has(t.id)) continue;
    const base = { tplId: t.id, origin: 'master', kind: t.kind, frequency: FREQ[t.kind], cat: t.cat, reg: t.reg || '', portal: t.portal || '', verify: !!t.verify, hasBse: !!t.bse && !!c.bseCode, order: t.order };
    if (t.kind === 'Q') {
      for (const x of qs) {
        const due = t.due(x);
        push({
          ...base, key: `${fy}|${t.id}|Q${x.q}`, pkey: 'Q' + x.q, bucket: x.q, period: qtrLabel(fy, x.q),
          title: val(t.title, x), timeline: val(t.timeline, x), due, est: t.est ? !!t.est(x) : false,
          eventField: t.eventField || null,
          eventValue: t.eventField ? (ev['Q' + x.q]?.[t.eventField] || null) : null,
          eventSource: t.eventField ? (ev['Q' + x.q]?.[t.eventField + 'Src'] || null) : null
        });
      }
    } else if (t.kind === 'A') {
      const x = annual;
      const due = t.due(x);
      push({
        ...base, key: `${fy}|${t.id}|A`, pkey: 'A', bucket: bucketOf(due, fy),
        period: t.forPrevFY ? `for ${fyLabel(fy - 1)}` : fyLabel(fy),
        title: val(t.title, x), timeline: val(t.timeline, x), due, est: t.est ? !!t.est(x) : false,
        eventField: t.eventField || null, eventValue: t.eventField ? (ev[t.eventField] || null) : null,
        eventSource: t.eventField ? (ev[t.eventField + 'Src'] || null) : null
      });
    } else if (t.kind === 'H') {
      t.halves(fy).forEach((due, i) => push({
        ...base, key: `${fy}|${t.id}|H${i + 1}`, pkey: 'H' + (i + 1), bucket: bucketOf(due, fy),
        period: i === 0 ? `H2 of ${fyLabel(fy - 1)}` : `H1 of ${fyLabel(fy)}`,
        title: val(t.title, i + 1), timeline: t.timeline, due, est: false
      }));
    } else if (t.kind === 'M') {
      for (let i = 0; i < 12; i++) {
        const m = ((3 + i) % 12) + 1; // Apr..Mar
        const y = m >= 4 ? fy : fy + 1;
        const due = t.dueFor(y, m);
        push({
          ...base, key: `${fy}|${t.id}|M${m}`, pkey: 'M' + m, bucket: bucketOf(due, fy),
          period: `${monthName(m)} ${y}`, title: val(t.title, `${monthName(m)} ${y}`), timeline: t.timeline, due, est: false
        });
      }
    }
  }

  // Manual entries
  for (const m of state.manual[c.id] || []) {
    if (+m.fy !== +fy) continue;
    for (const d of m.dates || []) {
      if (!d.due) continue;
      push({
        tplId: 'manual', origin: 'manual', manualId: m.id, kind: 'X', frequency: m.frequency, cat: m.category || 'Manual',
        reg: m.dueRule || '', portal: m.portal || '', verify: false, hasBse: false, order: 200,
        key: `M:${m.id}|${d.pkey}`, pkey: d.pkey, bucket: d.pkey?.startsWith('Q') ? +d.pkey[1] : bucketOf(d.due, fy),
        period: d.label || '', title: m.title, timeline: m.timeline || '', due: d.due, est: false
      });
    }
  }

  // Event-based occurrences
  for (const o of state.occurrences[c.id] || []) {
    const t = EVENT_TEMPLATES.find(e => e.id === o.tplId);
    const holidays = state.settings.holidays || [];
    const due = t ? (t.offsetWD ? addWorkingDays(o.eventDate, t.offsetWD, holidays) : addDays(o.eventDate, t.offset || 0)) : o.due;
    if (due < ymd(fy, 4, 1) || due > ymd(fy + 1, 3, 31)) continue;
    push({
      tplId: o.tplId, origin: 'event', occurrenceId: o.id, kind: 'E', frequency: 'Event Based', cat: t?.cat || 'Event',
      reg: '', portal: '', verify: !!t?.verify, hasBse: false, order: 150,
      key: `E:${o.id}`, pkey: 'E', bucket: bucketOf(due, fy), period: `${t?.eventLabel || 'Event'}: ${o.eventDate}`,
      title: (t?.title || 'Event') + (o.note ? ` — ${o.note}` : ''), timeline: t?.timeline || '', due, est: false
    });
  }

  // Items due before the company's tracking start date (e.g. pre-listing / pre-onboarding) are not tracked
  if (c.trackFrom) for (let i = items.length - 1; i >= 0; i--) if (items[i].due && items[i].due < c.trackFrom) items.splice(i, 1);

  items.sort((a, b) => a.bucket - b.bucket || (a.due || '9').localeCompare(b.due || '9') || a.order - b.order);
  return items;
}

export function stats(items) {
  const s = { total: items.length, today: 0, week: 0, overdue: 0, done: 0, pending: 0, reminders: 0 };
  for (const i of items) {
    if (i.state === 'done') s.done++; else s.pending++;
    if (i.state === 'today') s.today++;
    if (i.state === 'soon') s.week++;
    if (i.state === 'overdue') s.overdue++;
    if (i.inReminderWindow) s.reminders++;
  }
  s.pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  s.quarters = [1, 2, 3, 4].map(q => {
    const qi = items.filter(i => i.bucket === q);
    return { q, total: qi.length, done: qi.filter(i => i.state === 'done').length, overdue: qi.filter(i => i.state === 'overdue').length };
  });
  return s;
}
