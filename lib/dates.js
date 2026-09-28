// Date/time helpers. Everything uses the machine's LOCAL clock (never UTC),
// so "today", schedule dates and timestamps always match the system date/time.
// Dates are stored as ISO strings 'YYYY-MM-DD' (sortable) and formatted only for display.
const pad = (n) => String(n).padStart(2, '0');
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = (now = new Date()) => toISO(now);
export const parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const dayOffset = (n, now = new Date()) => addDays(todayISO(now), n);

// 'Sept 5'  |  'Fri, Sept 5'  |  'Sept 5, 2026'
export const fmtShort = (iso) => { const d = parseISO(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
export const fmtDay = (iso) => `${DAYS[parseISO(iso).getDay()]}, ${fmtShort(iso)}`;
export const fmtFull = (iso) => `${fmtShort(iso)}, ${parseISO(iso).getFullYear()}`;

// Times: the form uses 24h ('08:00'), the schedule stores 12h ('8:00 AM').
export const fmt12 = (h, m) => `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
export const to12 = (hhmm) => { if (!hhmm) return '—'; const [h, m] = hhmm.split(':').map(Number); return fmt12(h, m); };
export const to24 = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t || '');
  if (!m) return '';
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${pad(h)}:${m[2]}`;
};
export const toMin = (t) => { const s = /AM|PM/i.test(t) ? to24(t) : t; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
// Hours between a start and end time-of-day, correctly handling a shift that crosses midnight
// (end time-of-day is numerically before the start, e.g. the 3rd/overnight Shift: 11:30 PM -> 7:30 AM).
// Accepts either '8:00 AM' or '08:00' style strings (whatever toMin accepts).
export const durationHours = (start, end) => {
  const s = toMin(start), e = toMin(end);
  const diff = e > s ? e - s : e + 1440 - s; // wrap past midnight when end <= start
  return diff / 60;
};
export const fmtStamp = (d) => `${fmtFull(toISO(d))} · ${fmt12(d.getHours(), d.getMinutes())}`; // 'Sept 24, 2026 · 4:12 PM'
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

// 'Today' / 'Tomorrow' / 'Yesterday' tag relative to the given local "today".
export const relDay = (iso, today) => (iso === today ? 'Today' : iso === addDays(today, 1) ? 'Tomorrow' : iso === addDays(today, -1) ? 'Yesterday' : '');

// Two shifts overlap when they are on the same date and their time ranges intersect.
// Midnight-aware: a shift whose end time-of-day is <= its start (e.g. the overnight 3rd Shift,
// 11:30 PM -> 7:30 AM) is treated as ending the next calendar day for this comparison.
export const overlaps = (a, b) => {
  if (a.date !== b.date) return false;
  const sa = toMin(a.s), sb = toMin(b.s);
  const eaRaw = toMin(a.e), ebRaw = toMin(b.e);
  const ea = eaRaw <= sa ? eaRaw + 1440 : eaRaw;
  const eb = ebRaw <= sb ? ebRaw + 1440 : ebRaw;
  return sa < eb && sb < ea;
};

// [from, to] ISO range of the day / week (Mon–Sun) / month / year containing `iso`.
export function periodRange(iso, kind) {
  const d = parseISO(iso);
  if (kind === 'Day') return [iso, iso];
  if (kind === 'Week') { const s = addDays(iso, -((d.getDay() + 6) % 7)); return [s, addDays(s, 6)]; }
  if (kind === 'Month') return [toISO(new Date(d.getFullYear(), d.getMonth(), 1)), toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`];
}
