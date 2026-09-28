// Business rules for the HRM prototype. Pure functions: (state, user, input) -> result.
// No date is hardcoded anywhere: "today" always comes from the machine's local clock (lib/dates.js).
// Only two roles exist: Employee and Admin. There is no Manager role anywhere in this file.
import { USERS, BASE, HOUSES, STAFF, ADMINS, ADMIN_NAME, posOf, houseOf } from './data';
import { todayISO, addDays, fmtShort, fmtDay, overlaps, to24, toMin, durationHours, nowMinutes } from './dates';

export const PERMS = {
  Employee: ['swap:create', 'leave:create', 'timesheet:submit'],
  Admin: ['swap:create', 'leave:create', 'leave:decide', 'swap:decide', 'recruitment', 'audit', 'timesheet:submit', 'employee:manage', 'reports'],
};
export const can = (u, action) => !!u && !!PERMS[u.role]?.includes(action);

export const LEAVE_TYPES = ['Vacation', 'Sick', 'Bereavement', 'Work excuse', 'Half day'];

const fail = (status, error) => ({ ok: false, status, error });
const done = (state, result) => ({ ok: true, state, result });
const nextId = (list) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
const OPEN = ['Pending', 'Training required'];
export const SESSION_MS = 10 * 60 * 1000; // timesheet PIN session length

// notifications: one row per recipient, shown under the bell icon
const notify = (s, to, text, now = new Date()) => ({ ...s, notifications: [...(s.notifications || []), { id: nextId(s.notifications || []), to, text, at: now.toISOString() }] });
const notifyAll = (s, list, text, now) => [...new Set(list)].reduce((acc, to) => notify(acc, to, text, now), s);

// audit trail: who did what, to whom, and what changed. Admin-only to view (see lib/api.js).
const logAudit = (s, actor, action, target, detail, now = new Date()) => ({
  ...s,
  auditLog: [...(s.auditLog || []), { id: nextId(s.auditLog || []), at: now.toISOString(), actor, action, target, detail: detail || '' }],
});

const shiftLabel = (x) => `${fmtDay(x.date)} · ${x.s}–${x.e} · ${x.house}`;
const snap = (x) => (x ? { id: x.id, date: x.date, s: x.s, e: x.e, house: x.house } : null);
const leaveOn = (s, name, date) => s.reqs.find((r) => r.emp === name && r.st === 'Approved' && r.from <= date && date <= r.to);
export const initialsOf = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();

export function authenticate(email, pw) {
  const key = (email || '').trim().toLowerCase();
  const u = USERS[key];
  return u && u.pw === pw ? { email: key, ...u } : null;
}

// Leave is always stored and tracked in HOURS, never days.
// Half-day: exact hours between the chosen start and end time.
// Standard leave (Vacation / Sick / Bereavement / Work excuse): the REAL hours the employee is
// actually scheduled to work across the From-To range (sum of their scheduled shift hours on
// each date in range) - not a flat "8h x number of days" guess. If the published schedule does not
// yet reach that far out (e.g. a vacation requested months ahead of the visible roster), we fall
// back to a standard 8-hour workday per calendar day so far-future planning still works.
export function calcHours(f) {
  if (f.half) {
    const [a, b] = (f.hs || '').split(':').map(Number), [c, d] = (f.he || '').split(':').map(Number);
    const v = (c * 60 + d - (a * 60 + b)) / 60;
    return isNaN(v) ? 0 : Math.max(0, v);
  }
  const from = f.lf || f.from, to = f.lr || f.to || from;
  if (!from || !to || to < from) return 0;
  const sched = f.sched || [];
  const scheduled = sched.filter((s) => s.emp === f.name && s.date >= from && s.date <= to);
  if (scheduled.length) {
    return scheduled.reduce((sum, s) => sum + durationHours(s.s, s.e), 0);
  }
  const days = (new Date(to) - new Date(from)) / 864e5 + 1;
  return isNaN(days) ? 0 : Math.max(0, days) * 8;
}

export function balances(reqs, name) {
  const ok = reqs.filter((r) => r.emp === name && r.st === 'Approved' && BASE[r.type]);
  return Object.keys(BASE).map((k) => {
    const used = BASE[k][1] + ok.filter((r) => r.type === k).reduce((a, r) => a + r.hrs, 0);
    return [k, BASE[k][0] - used, BASE[k][0], used];
  });
}

// ---------- shift swaps ----------
// One rule-set used by BOTH the form (live preview) and the server (create + approve),
// so what the employee sees is exactly what the server will accept.
// A swap is either  "cover only"  (returnShiftId empty)  or a true exchange:
//   requester's shift -> cover,   cover's returnShift -> requester   (both schedules change).
export function checkSwap(s, { shiftId, cover, returnShiftId, ignoreSwapId }, who, today) {
  const bad = (status, error) => ({ error: { status, error } });
  const sh = s.sched.find((x) => x.id === Number(shiftId));
  if (!sh) return bad(404, 'Shift not found');
  if (sh.emp !== who) return bad(403, 'You can only swap your own shift');
  if (sh.date <= today) return bad(400, 'You can only request shift swaps for future dates.');
  if (!cover || cover === who) return bad(400, 'Choose another employee to cover the shift');
  if (!STAFF.includes(cover)) return bad(400, 'Unknown employee');
  if (houseOf(cover) && houseOf(cover) !== sh.house) return bad(400, `${cover} is not assigned to ${sh.house}`);
  let back = null;
  if (returnShiftId !== undefined && returnShiftId !== null && returnShiftId !== '') {
    back = s.sched.find((x) => x.id === Number(returnShiftId));
    if (!back) return bad(404, 'Return shift not found');
    if (back.id === sh.id) return bad(400, 'Choose a different shift to take in return');
    if (back.emp !== cover) return bad(400, `${cover} does not own that shift`);
    if (back.date <= today) return bad(400, 'You can only request shift swaps for future dates.');
  }
  // Cover-Only requests need the co-worker to actually be OFF that day. If they already have a
  // different shift on the same date, this must be set up as a Direct Swap (Exchange) instead -
  // even when the two shifts don't overlap in time (e.g. a 1st Shift and a 2nd Shift same day).
  if (!back) {
    const coverBusySameDay = s.sched.some((x) => x.emp === cover && x.date === sh.date);
    if (coverBusySameDay) return bad(409, `${cover} is already scheduled to work a different shift on ${fmtShort(sh.date)}. Choose a shift of theirs to take in return to set up a Direct Swap instead.`);
  }
  const taken = (id) => s.swaps.some((w) => w.id !== ignoreSwapId && OPEN.includes(w.st) && (w.shiftId === id || w.returnShiftId === id));
  if (taken(sh.id) || (back && taken(back.id))) return bad(409, 'This shift already has an open swap request');
  const l1 = leaveOn(s, cover, sh.date);
  if (l1) return bad(409, `${cover} has approved ${l1.type.toLowerCase()} leave on ${fmtShort(sh.date)}`);
  const l2 = back && leaveOn(s, who, back.date);
  if (l2) return bad(409, `You have approved ${l2.type.toLowerCase()} leave on ${fmtShort(back.date)}`);
  const staying = s.sched.filter((x) => x.id !== sh.id && (!back || x.id !== back.id)); // shifts that do not move
  if (staying.some((x) => x.emp === cover && overlaps(x, sh))) return bad(409, `${cover} is already scheduled for another shift during this time`);
  if (back && staying.some((x) => x.emp === who && overlaps(x, back))) return bad(409, `You are already scheduled for another shift during this time`);
  return { sh, back };
}

export function createSwap(s, u, { shiftId, cover, returnShiftId, reason } = {}, now = new Date()) {
  if (!can(u, 'swap:create')) return fail(403, 'You are not allowed to request a swap');
  const c = checkSwap(s, { shiftId, cover, returnShiftId }, u.name, todayISO(now));
  if (c.error) return fail(c.error.status, c.error.error);
  if (!reason || !reason.trim()) return fail(400, 'Add a reason for the request');
  const { sh, back } = c;
  const swap = { id: nextId(s.swaps), shiftId: sh.id, returnShiftId: back ? back.id : null, from: u.name, with: cover, orig: snap(sh), repl: snap(back), house: sh.house, reason: reason.trim(), st: 'Pending', by: '', at: now.toISOString(), decidedAt: '' };
  let ns = { ...s, swaps: [...s.swaps, swap] };
  const what = back ? `swap ${shiftLabel(sh)} for ${cover}'s ${shiftLabel(back)}` : `have ${cover} cover ${shiftLabel(sh)}`;
  ns = notifyAll(ns, ADMINS, `${u.name} asked to ${what}. Waiting for your decision.`, now);
  ns = notify(ns, cover, `${u.name} asked you to ${back ? 'swap shifts' : 'cover a shift'}. An Admin will decide.`, now);
  ns = logAudit(ns, u.name, 'swap:create', cover, `${shiftLabel(sh)}${back ? ` <-> ${shiftLabel(back)}` : ' (cover only)'}`, now);
  return done(ns, swap);
}

export function actOnSwap(s, u, id, action, now = new Date()) {
  if (!can(u, 'swap:decide')) return fail(403, 'Only an Admin can decide swap requests');
  const sw = s.swaps.find((x) => x.id === id);
  if (!sw) return fail(404, 'Swap request not found');
  if (!OPEN.includes(sw.st)) return fail(409, `This request is already ${sw.st.toLowerCase()}`);
  const both = [sw.from, sw.with];
  let patch, ns = s;
  if (action === 'deny') {
    patch = { st: 'Denied', by: u.name, decidedAt: now.toISOString() };
    ns = notifyAll(ns, both, `Swap denied by ${u.name}. Schedules are unchanged.`, now);
    ns = logAudit(ns, u.name, 'swap:deny', sw.from, `Swap with ${sw.with} denied`, now);
  } else if (action === 'train') {
    if (sw.st !== 'Pending') return fail(409, 'Training is already required');
    patch = { st: 'Training required' };
    ns = notify(ns, sw.from, 'Individual specific training is required before your swap can be approved.', now);
    ns = logAudit(ns, u.name, 'swap:require-training', sw.from, `Swap with ${sw.with}`, now);
  } else if (action === 'trained') {
    if (sw.st !== 'Training required') return fail(409, 'No training is pending');
    patch = { st: 'Pending' };
    ns = logAudit(ns, u.name, 'swap:training-complete', sw.from, `Swap with ${sw.with}`, now);
  } else if (action === 'approve') {
    if (sw.st === 'Training required') return fail(409, 'Training must be completed before approval');
    // the schedule may have changed since the request was posted: check EVERYTHING again before touching it
    const c = checkSwap(s, { shiftId: sw.shiftId, cover: sw.with, returnShiftId: sw.returnShiftId, ignoreSwapId: sw.id }, sw.from, todayISO(now));
    if (c.error) return fail(409, `Cannot approve this swap. ${c.error.error}.`);
    patch = { st: 'Approved', by: u.name, decidedAt: now.toISOString() };
    const { sh, back } = c;
    ns = { ...ns, sched: s.sched.map((x) => (x.id === sh.id ? { ...x, emp: sw.with, pos: posOf(sw.with) } : back && x.id === back.id ? { ...x, emp: sw.from, pos: posOf(sw.from) } : x)) };
    ns = notify(ns, sw.with, `Approved by ${u.name}. Your schedule now includes ${shiftLabel(sh)}${back ? ` and no longer includes ${shiftLabel(back)}` : ''}.`, now);
    ns = notify(ns, sw.from, `Approved by ${u.name}. ${shiftLabel(sh)} is now ${sw.with}'s${back ? `, and you now work ${shiftLabel(back)}` : ''}.`, now);
    ns = logAudit(ns, u.name, 'swap:approve', sw.from, `${shiftLabel(sh)} -> ${sw.with}${back ? `; ${shiftLabel(back)} -> ${sw.from}` : ''}`, now);
  } else return fail(400, 'Unknown action');
  const swaps = s.swaps.map((x) => (x.id === id ? { ...x, ...patch } : x));
  return done({ ...ns, swaps }, swaps.find((x) => x.id === id));
}

// ---------- leave ----------
export function createLeave(s, u, { type, from, to, half, hs, he, reason } = {}, now = new Date()) {
  if (!can(u, 'leave:create')) return fail(403, 'You are not allowed to request leave');
  if (!LEAVE_TYPES.includes(type)) return fail(400, 'Choose a valid leave type');
  if (!from) return fail(400, 'Choose a From date');
  const toDate = half ? from : (to || from);
  if (!half && toDate < from) return fail(400, 'The From date cannot be after the To date');
  if (half && (!hs || !he)) return fail(400, 'Choose a Start Time and an End Time for half-day leave');
  if (half && toMin(he) <= toMin(hs)) return fail(400, 'End Time must be after Start Time');
  if (!reason || !reason.trim()) return fail(400, 'Add a reason for your leave request');
  const hrs = calcHours({ half, hs, he, from, to: toDate, sched: s.sched, name: u.name });
  if (hrs <= 0) return fail(400, 'Check your dates or times');
  const b = balances(s.reqs, u.name).find((x) => x[0] === type);
  if (b && hrs > b[1]) return fail(400, `Not enough ${type.toLowerCase()} balance (${b[1]}h left)`);
  const overlap = s.reqs.find((r) => r.emp === u.name && r.st !== 'Denied' && !(toDate < r.from || from > r.to));
  if (overlap) return fail(409, `You already have a ${overlap.st.toLowerCase()} ${overlap.type.toLowerCase()} request that overlaps these dates`);
  const house = houseOf(u.name) || HOUSES[0];
  const req = { id: nextId(s.reqs), emp: u.name, house, type, from, to: toDate, hrs, reason: reason.trim(), st: 'Pending', by: '', cm: '' };
  const open = s.todo.find((t) => t.emp === u.name && t.kind === 'leave' && !t.done);
  let ns = { ...s, reqs: [...s.reqs, req], todo: s.todo.map((t) => (t === open ? { ...t, done: true } : t)) };
  ns = notifyAll(ns, ADMINS, `${u.name} requested ${type.toLowerCase()} leave (${fmtShort(from)}${from !== toDate ? ' – ' + fmtShort(toDate) : ''}).`, now);
  ns = logAudit(ns, u.name, 'leave:create', u.name, `${type} ${fmtShort(from)}${from !== toDate ? ' – ' + fmtShort(toDate) : ''} (${hrs}h)`, now);
  return done(ns, req);
}

export function decideLeave(s, u, id, status, comment, now = new Date()) {
  if (!can(u, 'leave:decide')) return fail(403, 'Only an Admin can decide leave requests');
  if (!['Approved', 'Denied'].includes(status)) return fail(400, 'Status must be Approved or Denied');
  const r = s.reqs.find((x) => x.id === id);
  if (!r) return fail(404, 'Request not found');
  if (r.st !== 'Pending') return fail(409, `This request is already ${r.st.toLowerCase()}`);
  if (r.emp === u.name) return fail(403, 'You cannot approve your own leave request. Another Admin must decide it');
  const upd = { ...r, st: status, by: u.name, cm: (comment || '').trim() };
  let ns = notify({ ...s, reqs: s.reqs.map((x) => (x.id === id ? upd : x)) }, r.emp, `Your ${r.type.toLowerCase()} request (${fmtShort(r.from)}) was ${status.toLowerCase()} by ${u.name}.`, now);
  ns = logAudit(ns, u.name, `leave:${status.toLowerCase()}`, r.emp, `${r.type} ${fmtShort(r.from)}${r.from !== r.to ? ' – ' + fmtShort(r.to) : ''}${upd.cm ? ` — "${upd.cm}"` : ''}`, now);
  return done(ns, upd);
}

// ---------- timesheets ----------
export const sessionLeft = (s, u, nowMs = Date.now()) => Math.max(0, (s.tsSessions?.[u.email] || 0) - nowMs);

// Separate timesheet sign-in: Employee ID + PIN (DOB alone is never a credential).
export function verifyTimesheetPin(s, u, { employeeId, pin } = {}, now = new Date()) {
  if (String(employeeId || '').trim() !== u.empId || String(pin || '') !== u.pin) return fail(403, 'Employee ID or PIN is not correct');
  const exp = now.getTime() + SESSION_MS;
  return done({ ...s, tsSessions: { ...(s.tsSessions || {}), [u.email]: exp } }, { expiresAt: exp });
}

// The "Before you submit" checklist. Used by the form (live) and by the server (final say) -
// the exact same function, so the UI and the API can never disagree.
export function timesheetChecks(s, u, f = {}, now = new Date()) {
  const today = todayISO(now);
  const date = f.date || '';
  const override = u.role === 'Admin' && f.override === true;
  const shift = date ? s.sched.find((x) => x.emp === u.name && x.date === date) : null;
  const leave = date ? leaveOn(s, u.name, date) : null;
  const init = String(f.initials || '').replace(/[^a-z]/gi, '').toUpperCase();
  const items = [];

  const basics = !date ? 'Date is missing' : date > today ? 'Date cannot be in the future' : !init ? 'Initials are missing'
    : init !== initialsOf(u.name) ? `Initials must match your name (${initialsOf(u.name)})` : '';
  items.push({ key: 'basics', ok: !basics, label: basics || 'Date and initials added' });

  items.push(!date ? { key: 'scheduled', ok: false, label: 'Pick a date to check your schedule' }
    : shift ? { key: 'scheduled', ok: true, label: `You were scheduled on ${fmtShort(date)}` }
      : override ? { key: 'scheduled', ok: true, label: `Not scheduled on ${fmtShort(date)}: Admin override` }
        : { key: 'scheduled', ok: false, label: `You cannot submit this timesheet because you are not scheduled to work on ${fmtShort(date)}` });

  let hours = null, time;
  const overnight = !!(shift && toMin(shift.e) <= toMin(shift.s)); // this employee's scheduled shift that day crosses midnight (the 3rd Shift)
  if (!f.start) time = 'Start time is missing';
  else if (!f.end) time = 'End time is missing';
  else if (f.end === f.start) time = 'End time must be after start time';
  else if (!overnight && f.end < f.start) time = 'End time must be after start time';
  else {
    hours = Math.round(durationHours(f.start, f.end) * 100) / 100;
  }
  items.push({ key: 'time', ok: !time, label: time || 'Start and end time added' });

  items.push(HOUSES.includes(f.house) ? { key: 'house', ok: true, label: `Worked at ${f.house}` } : { key: 'house', ok: false, label: 'Select the House you worked at (House A, House B or House C)' });
  items.push(f.signoff === true ? { key: 'signoff', ok: true, label: 'Sign-off confirmed' } : { key: 'signoff', ok: false, label: 'Sign-off is not checked' });

  if (leave) items.push(override
    ? { key: 'leave', ok: true, label: 'Admin override applied' }
    : { key: 'leave', ok: false, label: `You are on approved ${leave.type.toLowerCase()} leave on ${fmtShort(date)}. You cannot submit a worked-hours timesheet for this date.` });
  if (date && (s.timesheets || []).some((t) => t.emp === u.name && t.date === date)) items.push({ key: 'dup', ok: false, label: `A timesheet for ${fmtShort(date)} was already submitted` });

  return { items, ok: items.every((i) => i.ok), hours, shift, conflict: leave || null, override };
}

export function submitTimesheet(s, u, data = {}, now = new Date()) {
  if (!can(u, 'timesheet:submit')) return fail(403, 'You are not allowed to submit timesheets');
  if (sessionLeft(s, u, now.getTime()) <= 0) return fail(401, 'Timesheet session ended. Verify your Employee ID and PIN again');
  const c = timesheetChecks(s, u, data, now);
  const bad = c.items.find((i) => !i.ok);
  if (bad) return fail(['scheduled', 'leave', 'dup'].includes(bad.key) ? 409 : 400, bad.label);
  // Worked-hours timesheets no longer go through an Admin approval step: once an employee submits
  // a valid timesheet it is immediately final, status "Completed" - there is no "Awaiting approval".
  const rec = { id: nextId(s.timesheets), emp: u.name, date: data.date, house: data.house, start: data.start, end: data.end, hours: c.hours, initials: String(data.initials).trim().toUpperCase(), notes: (data.notes || '').trim(), override: c.override && (!c.shift || !!c.conflict), st: 'Completed', at: now.toISOString() };
  const sub = { id: nextId(s.submissions), emp: u.name, kind: 'timesheet', title: `Timesheet for ${fmtShort(rec.date)}`, data: { ...rec }, at: rec.at, timesheetId: rec.id };
  // The matching "Incomplete Timesheet" outstanding item is not a stored row to flip a "done" flag
  // on - it is computed fresh from s.timesheets every time (incompleteTimesheetItems), so simply
  // adding this record here is what makes it disappear from the Dashboard automatically.
  let ns = { ...s, timesheets: [...s.timesheets, rec], submissions: [...s.submissions, sub] };
  ns = notifyAll(ns, ADMINS, `${u.name} submitted a timesheet for ${fmtShort(rec.date)} (${rec.hours} h, ${rec.house}).`, now);
  ns = logAudit(ns, u.name, 'timesheet:submit', u.name, `${fmtShort(rec.date)} · ${rec.hours}h · ${rec.house}${rec.override ? ' · Admin override' : ''}`, now);
  return done(ns, sub);
}

// A shift has "ended" once its actual end moment has passed - midnight-aware, so the overnight
// 3rd Shift's true end (the next calendar day) is compared correctly rather than against its own date.
const shiftEndDate = (sh) => (toMin(sh.e) <= toMin(sh.s) ? addDays(sh.date, 1) : sh.date);
export function hasShiftEnded(sh, now = new Date()) {
  const endDate = shiftEndDate(sh);
  const today = todayISO(now);
  return endDate < today || (endDate === today && nowMinutes(now) >= toMin(sh.e));
}

// Every PAST scheduled shift for this employee (including today's, once its end time has passed)
// that has no matching timesheet AND is not covered by approved leave is an "Incomplete Timesheet".
// Computed fresh from real records every time (schedule vs timesheets vs leave vs the clock) -
// never a static seeded item - so it always reflects the current time and disappears the instant
// a matching timesheet is submitted, with nothing to separately mark "done".
export function incompleteTimesheetItems(s, name, now = new Date()) {
  const onApprovedLeave = (date) => s.reqs.some((r) => r.emp === name && r.st === 'Approved' && ['Vacation', 'Sick', 'Bereavement'].includes(r.type) && date >= r.from && date <= r.to);
  return s.sched
    .filter((sh) => sh.emp === name && hasShiftEnded(sh, now))
    .filter((sh) => !s.timesheets.some((t) => t.emp === name && t.date === sh.date))
    .filter((sh) => !onApprovedLeave(sh.date))
    .map((sh) => ({
      id: `ts-${sh.id}`, emp: name, kind: 'timesheet', date: sh.date, shiftId: sh.id,
      title: `Timesheet for ${fmtShort(sh.date)}`, sub: `${sh.house} · ${sh.s} - ${sh.e} · shift has ended`,
      label: 'Incomplete', tone: 'a', done: false,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// One list of "what happened on each day" built from real records: submitted timesheets,
// approved vacation/sick/bereavement days, and timesheets still outstanding. Nothing is hardcoded.
// `names` scopes which employees to compute "Incomplete Timesheet" rows for - defaults to everyone
// (what Admin needs); callers with a privacy-filtered state (an Employee's own client state, which
// only has THEIR OWN timesheets/leave visible) should pass just that one employee's name.
export function hoursLedger(s, now = new Date(), names = STAFF) {
  const rows = (s.timesheets || []).map((t) => ({ key: 't' + t.id, date: t.date, emp: t.emp, house: t.house, start: t.start, end: t.end, hours: t.hours, st: t.st }));
  for (const r of s.reqs.filter((x) => x.st === 'Approved' && ['Vacation', 'Sick', 'Bereavement'].includes(x.type))) {
    for (let d = r.from, i = 0; d <= r.to && i < 60; d = addDays(d, 1), i++) rows.push({ key: `l${r.id}-${d}`, date: d, emp: r.emp, house: r.house, start: '', end: '', hours: 0, st: r.type });
  }
  for (const name of names) {
    for (const item of incompleteTimesheetItems(s, name, now)) {
      const sh = s.sched.find((x) => x.id === item.shiftId);
      rows.push({ key: 'o' + item.id, date: item.date, emp: name, house: sh?.house || '', start: sh ? to24(sh.s) : '', end: '', hours: 0, st: 'Incomplete' });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.emp.localeCompare(b.emp));
}

// "My Hours" is a till-date record, not a forward planner: it never shows a row for a date after
// today, even a future date that happens to fall inside an approved leave request. (Admin Reports
// and the Audit Trail deliberately keep future-dated rows for planning, so this is applied only on
// the "My Hours" page, not inside hoursLedger itself.)
export const tillToday = (rows, today) => rows.filter((r) => r.date <= today);

// ---------- outstanding items (timesheet, shift confirmation, training) ----------
export function completeTodo(s, u, { itemId, data = {} } = {}, now = new Date()) {
  const item = s.todo.find((t) => t.id === Number(itemId));
  if (!item) return fail(404, 'Item not found');
  if (item.emp !== u.name) return fail(403, 'This item belongs to another employee');
  if (item.done) return fail(409, 'This item is already completed');
  if (item.kind === 'shift') {
    if (!['Confirm', 'Cannot attend'].includes(data.answer)) return fail(400, 'Choose Confirm or Cannot attend');
  } else if (item.kind === 'training') {
    if (data.acknowledged !== true) return fail(400, 'Tick the box to acknowledge the training');
  } else return fail(400, 'Use the Leave form to finish this item');
  const sub = { id: nextId(s.submissions), emp: u.name, kind: item.kind, title: item.title, data: { ...data }, at: now.toISOString() };
  const ns = logAudit({ ...s, todo: s.todo.map((t) => (t.id === item.id ? { ...t, done: true } : t)), submissions: [...s.submissions, sub] }, u.name, `${item.kind}:complete`, u.name, item.title, now);
  return done(ns, sub);
}

// ---------- employee management (Admin only) ----------
export function addEmployee(s, u, data = {}, now = new Date()) {
  if (!can(u, 'employee:manage')) return fail(403, 'Only an Admin can manage employees');
  const { name, email, empId, pin, position, house } = data;
  if (!name || !name.trim()) return fail(400, 'Employee name is required');
  if (!empId || !String(empId).trim()) return fail(400, 'Employee ID is required');
  if (!HOUSES.includes(house)) return fail(400, 'Choose a valid House (House A, House B or House C)');
  if ((s.employees || []).some((e) => e.empId === String(empId).trim())) return fail(409, 'An employee with this ID already exists');
  const rec = { empId: String(empId).trim(), name: name.trim(), email: (email || '').trim().toLowerCase(), pin: pin ? String(pin).trim() : '', position: (position || '').trim() || 'Caregiver', house, initials: initialsOf(name), active: true };
  const ns = logAudit({ ...s, employees: [...(s.employees || []), rec] }, u.name, 'employee:create', rec.name, `${rec.position} · ${rec.house}`, now);
  return done(ns, rec);
}

export function updateEmployee(s, u, empId, data = {}, now = new Date()) {
  if (!can(u, 'employee:manage')) return fail(403, 'Only an Admin can manage employees');
  const rec = (s.employees || []).find((e) => e.empId === String(empId));
  if (!rec) return fail(404, 'Employee not found');
  if (data.house && !HOUSES.includes(data.house)) return fail(400, 'Choose a valid House (House A, House B or House C)');
  const upd = {
    ...rec,
    ...('name' in data && data.name ? { name: data.name.trim(), initials: initialsOf(data.name) } : {}),
    ...('position' in data && data.position ? { position: data.position.trim() } : {}),
    ...('house' in data && data.house ? { house: data.house } : {}),
    ...('active' in data ? { active: !!data.active } : {}),
  };
  const ns = logAudit({ ...s, employees: s.employees.map((e) => (e.empId === rec.empId ? upd : e)) }, u.name, 'employee:update', upd.name, `${upd.position} · ${upd.house}${upd.active ? '' : ' · inactive'}`, now);
  return done(ns, upd);
}
