// Date helpers. All dates are 'YYYY-MM-DD' strings in IST; time-of-day handled separately.

export const ymd = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

export const addDays = (s, n) => {
  const dt = new Date(s + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

export const diffDays = (a, b) =>
  Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);

export const isWorkingDay = (s, holidays = []) => {
  const dow = new Date(s + 'T00:00:00Z').getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.includes(s);
};

// Move n working days forward (n>0) or backward (n<0), skipping weekends + holidays.
export const addWorkingDays = (s, n, holidays = []) => {
  let cur = s;
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    cur = addDays(cur, step);
    if (isWorkingDay(cur, holidays)) left--;
  }
  return cur;
};

export const nowIST = () => new Date(Date.now() + 5.5 * 3600 * 1000);
export const todayIST = () => nowIST().toISOString().slice(0, 10);
export const timeIST = () => nowIST().toISOString().slice(11, 16);

export const minDate = (...ds) => ds.filter(Boolean).sort()[0];
export const maxDate = (...ds) => ds.filter(Boolean).sort().slice(-1)[0];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtLong = s => {
  if (!s) return '--';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d} ${MONTHS[+m - 1]} ${y}`;
};
export const monthName = m => MONTHS[m - 1];

// Financial year helpers (April–March). fy = start year, e.g. 2026 => FY 2026-27.
export const fyLabel = fy => `FY ${fy}-${String(fy + 1).slice(2)}`;
export const quarterEnds = fy => [ymd(fy, 6, 30), ymd(fy, 9, 30), ymd(fy, 12, 31), ymd(fy + 1, 3, 31)];
export const quarterStarts = fy => [ymd(fy, 4, 1), ymd(fy, 7, 1), ymd(fy, 10, 1), ymd(fy + 1, 1, 1)];
export const QUARTER_NAMES = ['June', 'September', 'December', 'March'];

// Which FY quarter bucket (1..4) a date falls into; dates outside the FY are clamped.
export const bucketOf = (date, fy) => {
  if (date < ymd(fy, 7, 1)) return 1;
  if (date < ymd(fy, 10, 1)) return 2;
  if (date < ymd(fy + 1, 1, 1)) return 3;
  return 4;
};

export const fyOfDate = s => {
  const [y, m] = s.split('-').map(Number);
  return m >= 4 ? y : y - 1;
};
