import { describe, it, expect } from 'vitest';
import { seed } from '../lib/store';
import {
  authenticate, createSwap, actOnSwap, createLeave, decideLeave, balances, calcHours,
  completeTodo, verifyTimesheetPin, submitTimesheet, timesheetChecks, hoursLedger, incompleteTimesheetItems, hasShiftEnded, tillToday,
  addEmployee, updateEmployee, PERMS, can,
} from '../lib/hrm';
import { addDays, todayISO, toMin } from '../lib/dates';
import { USERS, STAFF, HOUSES, EMPLOYEES, ADMIN_NAME, SHIFTS } from '../lib/data';

const as = (e, pw) => authenticate(e, pw);
const pavithra = () => as('pavithra@starcare.demo', 'Employee@123'); // House A
const chaitanya = () => as('chaitanya@starcare.demo', 'Employee@123'); // House A
const eswari = () => as('eswari@starcare.demo', 'Employee@123'); // House B
const divya = () => as('divya@starcare.demo', 'Employee@123'); // House B
const ramesh = () => as('ramesh@starcare.demo', 'Employee@123'); // House B, overnight 3rd Shift
const vijay = () => as('vijay@starcare.demo', 'Employee@123'); // House C
const amrutha = () => as('amrutha@starcare.demo', 'Admin@123'); // Admin
const today = () => todayISO();
const mine = (s, name) => s.sched.filter((x) => x.emp === name).map((x) => x.id).sort((a, b) => a - b);
// shift 1 = Pavithra today (House A, blocked for swaps - today is not a future date), shift 2 = Pavithra +2d,
// shift 3 = Pavithra -1d, shift 5 = Chaitanya +1d, shift 7 = Chaitanya -2d
const coverOnly = { shiftId: 2, cover: 'Chaitanya Katta', reason: 'Family event' };
const exchange = { shiftId: 2, cover: 'Chaitanya Katta', returnShiftId: 5, reason: 'Family event' };
// timesheet sign-in first (Employee ID + PIN), then submit
const verified = (s, u) => verifyTimesheetPin(s, u, { employeeId: u.empId, pin: u.pin }).state;

describe('roles: only Employee and Admin exist', () => {
  it('there is no Manager role anywhere', () => {
    expect(Object.values(USERS).map((u) => u.role).sort()).toEqual(['Admin', 'Employee', 'Employee', 'Employee', 'Employee', 'Employee', 'Employee', 'Employee']);
    expect(PERMS.Manager).toBeUndefined();
  });
  it('exactly 7 Employee demo accounts and exactly 1 Admin (Amrutha)', () => {
    expect(EMPLOYEES).toHaveLength(7);
    expect(Object.values(USERS).filter((u) => u.role === 'Admin')).toHaveLength(1);
    expect(ADMIN_NAME).toBe('Amrutavalli Kella');
    expect(STAFF).not.toContain('Amrutavalli Kella'); // Admin never appears as a normal employee
  });
  it('accepts every demo account and rejects wrong passwords / unknown "Manager" logins', () => {
    expect(pavithra().role).toBe('Employee');
    expect(chaitanya()).toMatchObject({ name: 'Chaitanya Katta', role: 'Employee' });
    expect(amrutha().role).toBe('Admin');
    expect(as('pavithra@starcare.demo', 'wrong')).toBeNull();
    expect(as('nobody@starcare.demo', 'x')).toBeNull();
    expect(as('eswari@starcare.demo', 'Manager@123')).toBeNull(); // the old Manager password no longer works
  });
  it('an Employee cannot approve leave, approve swaps, or manage employees; only Admin can', () => {
    expect(can(pavithra(), 'leave:decide')).toBe(false);
    expect(can(pavithra(), 'swap:decide')).toBe(false);
    expect(can(pavithra(), 'employee:manage')).toBe(false);
    expect(can(amrutha(), 'leave:decide')).toBe(true);
    expect(can(amrutha(), 'swap:decide')).toBe(true);
    expect(can(amrutha(), 'employee:manage')).toBe(true);
  });
});

describe('Houses: A, B and C all work', () => {
  it('exactly three Houses exist and every employee is assigned to one', () => {
    expect(HOUSES).toEqual(['House A', 'House B', 'House C']);
    expect(EMPLOYEES.every((e) => HOUSES.includes(e.house))).toBe(true);
  });
  it('the seed schedule covers all three Houses', () => {
    const s = seed();
    expect(new Set(s.sched.map((x) => x.house))).toEqual(new Set(HOUSES));
  });
  it('no employee is double-booked: every shift for one employee is on a different date', () => {
    const s = seed();
    for (const name of STAFF) {
      const dates = s.sched.filter((x) => x.emp === name).map((x) => x.date);
      expect(new Set(dates).size).toBe(dates.length);
    }
  });
});

describe('standard 3-shift daily schedule', () => {
  it('defines exactly the 3 standard shift times', () => {
    expect(SHIFTS[1]).toMatchObject({ s: '7:30 AM', e: '3:30 PM' });
    expect(SHIFTS[2]).toMatchObject({ s: '3:30 PM', e: '11:30 PM' });
    expect(SHIFTS[3]).toMatchObject({ s: '11:30 PM', e: '7:00 AM' }); // overnight
  });
  it('every seeded shift, for all 7 employees across all 3 Houses, uses one of the 3 standard shift times', () => {
    const s = seed();
    const canonical = Object.values(SHIFTS).map((x) => `${x.s}|${x.e}`);
    expect(s.sched.length).toBeGreaterThan(0);
    for (const row of s.sched) {
      expect(canonical).toContain(`${row.s}|${row.e}`);
    }
  });
  it('all 3 shift times, including the overnight 3rd Shift, appear somewhere in the seed', () => {
    const s = seed();
    for (const shiftNo of [1, 2, 3]) {
      const { s: st, e: et } = SHIFTS[shiftNo];
      expect(s.sched.some((row) => row.s === st && row.e === et)).toBe(true);
    }
  });
  it('the 1st and 2nd Shifts are 8 hours; the overnight 3rd Shift is 7.5 hours (11:30 PM - 7:00 AM)', () => {
    const expected = { 1: 8, 2: 8, 3: 7.5 };
    for (const shiftNo of [1, 2, 3]) {
      const { s: st, e: et } = SHIFTS[shiftNo];
      const raw = toMin(et) - toMin(st);
      const wrapped = raw > 0 ? raw : raw + 1440;
      expect(wrapped / 60).toBe(expected[shiftNo]);
    }
  });
  it('exactly 7 Employee accounts + 1 Admin remain, each assigned to a House and a standard shift', () => {
    expect(EMPLOYEES).toHaveLength(7);
    const s = seed();
    for (const name of STAFF) {
      const rows = s.sched.filter((x) => x.emp === name);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => HOUSES.includes(r.house))).toBe(true);
    }
  });
});

describe('schedule dates come from the local system date (nothing hardcoded)', () => {
  it('re-anchors every seeded date to whatever "today" is', () => {
    const s = seed(new Date(2031, 0, 15, 10, 0));
    expect(s.sched.find((x) => x.id === 1).date).toBe('2031-01-15');
    expect(s.sched.find((x) => x.id === 2).date).toBe('2031-01-17');
    expect(JSON.stringify(s)).not.toMatch(/2026/);
  });
  it('the real seed starts today on the machine clock', () => {
    expect(seed().sched.find((x) => x.id === 1).date).toBe(today());
  });
});

describe('shift swap: Pavithra <-> Chaitanya (both House A)', () => {
  it('true exchange: after approval BOTH schedules change', () => {
    const s0 = seed();
    const before = { p: mine(s0, 'Pavithra Edha'), c: mine(s0, 'Chaitanya Katta') };
    let s = createSwap(s0, pavithra(), exchange).state;
    expect(s.swaps.at(-1)).toMatchObject({ from: 'Pavithra Edha', with: 'Chaitanya Katta', shiftId: 2, returnShiftId: 5, st: 'Pending' });
    expect(mine(s, 'Pavithra Edha')).toEqual(before.p); // nothing moves until an Admin approves
    s = actOnSwap(s, amrutha(), s.swaps.at(-1).id, 'approve').state;
    expect(s.sched.find((x) => x.id === 2)).toMatchObject({ emp: 'Chaitanya Katta', pos: 'Geriatric Caregiver' });
    expect(s.sched.find((x) => x.id === 5)).toMatchObject({ emp: 'Pavithra Edha', pos: 'Caregiver' });
    expect(mine(s, 'Pavithra Edha')).toEqual([...before.p.filter((i) => i !== 2), 5].sort((a, b) => a - b));
    expect(mine(s, 'Chaitanya Katta')).toEqual([...before.c.filter((i) => i !== 5), 2].sort((a, b) => a - b));
    const to = (name) => s.notifications.filter((x) => x.to === name && /Approved/.test(x.text));
    expect(to('Pavithra Edha')).toHaveLength(1);
    expect(to('Chaitanya Katta')).toHaveLength(1);
  });
  it('cover only: just the one shift moves', () => {
    let s = createSwap(seed(), pavithra(), coverOnly).state;
    expect(s.swaps.at(-1).returnShiftId).toBeNull();
    s = actOnSwap(s, amrutha(), 1, 'approve').state;
    expect(s.sched.find((x) => x.id === 2).emp).toBe('Chaitanya Katta');
  });
  it('the request also works in the other direction (Chaitanya to Pavithra)', () => {
    let s = createSwap(seed(), chaitanya(), { shiftId: 5, cover: 'Pavithra Edha', returnShiftId: 2, reason: 'Appointment' }).state;
    s = actOnSwap(s, amrutha(), 1, 'approve').state;
    expect(s.sched.find((x) => x.id === 5).emp).toBe('Pavithra Edha');
    expect(s.sched.find((x) => x.id === 2).emp).toBe('Chaitanya Katta');
  });
  it('validates ownership, cover, reason and unknown shifts', () => {
    expect(createSwap(seed(), pavithra(), { ...exchange, shiftId: 5 })).toMatchObject({ ok: false, status: 403 }); // shift 5 is Chaitanya's
    expect(createSwap(seed(), pavithra(), { ...exchange, reason: '  ' })).toMatchObject({ ok: false, status: 400 });
    expect(createSwap(seed(), pavithra(), { ...exchange, cover: 'Pavithra Edha' })).toMatchObject({ ok: false, status: 400 });
    expect(createSwap(seed(), pavithra(), { ...exchange, shiftId: 999 })).toMatchObject({ ok: false, status: 404 });
    expect(createSwap(seed(), pavithra(), { ...exchange, returnShiftId: 999 })).toMatchObject({ ok: false, status: 404 });
    expect(createSwap(seed(), pavithra(), { ...exchange, returnShiftId: 8 })).toMatchObject({ ok: false, status: 400 }); // shift 8 is Eswari's, not Chaitanya's
  });
  it('rejects a shift that already passed', () => {
    const r = createSwap(seed(), pavithra(), { shiftId: 3, cover: 'Chaitanya Katta', reason: 'x' });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.error).toMatch(/future dates/);
  });
  it('rejects a shift scheduled for today: only strictly future dates are swappable', () => {
    // shift 1 = Pavithra's shift for today
    const r = createSwap(seed(), pavithra(), { shiftId: 1, cover: 'Chaitanya Katta', reason: 'x' });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.error).toBe('You can only request shift swaps for future dates.');
  });
  it('rejects a return shift scheduled for today or in the past', () => {
    // shift 5 = Chaitanya's future shift (valid primary), shift 7 = Chaitanya's past shift (invalid return)
    const r = createSwap(seed(), pavithra(), { shiftId: 2, cover: 'Chaitanya Katta', returnShiftId: 7, reason: 'x' });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.error).toBe('You can only request shift swaps for future dates.');
  });
  it('blocks a swap across Houses: cover must belong to the shift House', () => {
    const r = createSwap(seed(), pavithra(), { shiftId: 2, cover: 'Eswari Reddy', reason: 'x' }); // Eswari is House B, shift is House A
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.error).toMatch(/not assigned to House A/);
  });
  it('blocks a second open request for the same shift', () => {
    const s1 = createSwap(seed(), pavithra(), exchange).state;
    expect(createSwap(s1, pavithra(), exchange)).toMatchObject({ ok: false, status: 409 });
    expect(createSwap(s1, chaitanya(), { shiftId: 5, cover: 'Pavithra Edha', reason: 'x' })).toMatchObject({ ok: false, status: 409 }); // shift 5 is already part of an open swap
  });
  it('blocks double-booking: cover already works at that time', () => {
    // Eswari's shift 9 (House B, +3d, future) - add a same-day/time clash for Divya, the proposed cover:
    const s = seed();
    const clash = { ...s, sched: [...s.sched, { id: 999, date: s.sched.find((x) => x.id === 9).date, emp: 'Divya Prasad', house: 'House B', s: '7:30 AM', e: '3:30 PM', pos: 'x' }] };
    const r = createSwap(clash, eswari(), { shiftId: 9, cover: 'Divya Prasad', reason: 'x' });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.error).toMatch(/already scheduled/);
  });
  it('blocks a cover who has approved leave that day', () => {
    const base = seed();
    const shift2date = base.sched.find((x) => x.id === 2).date;
    const withLeave = { ...base, reqs: [...base.reqs, { id: 999, emp: 'Chaitanya Katta', house: 'House A', type: 'Sick', from: shift2date, to: shift2date, hrs: 8, reason: 'x', st: 'Approved', by: 'Amrutavalli Kella', cm: '' }] };
    const r = createSwap(withLeave, pavithra(), { shiftId: 2, cover: 'Chaitanya Katta', reason: 'x' });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.error).toMatch(/approved sick leave/);
  });
  it('Admin cannot be selected as a swap cover (Admin is not staff)', () => {
    const r = createSwap(seed(), pavithra(), { shiftId: 2, cover: 'Amrutavalli Kella', reason: 'x' });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

describe('Direct Swap (same-day exchange) vs Cover-Only', () => {
  // Seed shifts 22 (Pavithra, 1st Shift) and 23 (Chaitanya, 2nd Shift) share the SAME future date -
  // the canonical "both already scheduled that day, different shifts" demo scenario.
  it('same-day Direct Swap (Exchange): Employee A (1st Shift) <-> Employee B (2nd Shift) on the same date', () => {
    const s0 = seed();
    const a = s0.sched.find((x) => x.id === 22), b = s0.sched.find((x) => x.id === 23);
    expect(a.date).toBe(b.date); // same day, by construction
    expect(a).toMatchObject({ s: '7:30 AM', e: '3:30 PM' });
    expect(b).toMatchObject({ s: '3:30 PM', e: '11:30 PM' });
    let s = createSwap(s0, pavithra(), { shiftId: 22, cover: 'Chaitanya Katta', returnShiftId: 23, reason: 'Same-day exchange' }).state;
    s = actOnSwap(s, amrutha(), s.swaps.at(-1).id, 'approve').state;
    expect(s.sched.find((x) => x.id === 22).emp).toBe('Chaitanya Katta'); // Pavithra's 1st Shift slot now worked by Chaitanya
    expect(s.sched.find((x) => x.id === 23).emp).toBe('Pavithra Edha'); // Chaitanya's 2nd Shift slot now worked by Pavithra
  });
  it('Cover-Only requires the co-worker to actually be OFF that day - blocked when they are already working a DIFFERENT (non-overlapping) shift, even without a time clash', () => {
    // Chaitanya already works shift 23 on the same date as Pavithra's shift 22 (a different, non-overlapping shift time).
    const r = createSwap(seed(), pavithra(), { shiftId: 22, cover: 'Chaitanya Katta', reason: 'x' }); // no returnShiftId -> Cover-Only
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.error).toMatch(/already scheduled to work a different shift/);
    expect(r.error).toMatch(/Direct Swap/);
  });
  it('Cover-Only still works normally when the co-worker is genuinely OFF that day', () => {
    // shift 2 (Pavithra, offset +2) is a date where Chaitanya has no shift at all.
    const r = createSwap(seed(), pavithra(), { shiftId: 2, cover: 'Chaitanya Katta', reason: 'x' });
    expect(r).toMatchObject({ ok: true });
  });
});

describe('swap approval rules', () => {
  const posted = () => createSwap(seed(), pavithra(), exchange).state;
  const id = (s) => s.swaps.at(-1).id;
  it('only an Admin can decide (an Employee gets 403)', () => {
    const s = posted();
    expect(actOnSwap(s, pavithra(), id(s), 'approve').status).toBe(403);
    expect(actOnSwap(s, chaitanya(), id(s), 'approve').status).toBe(403);
  });
  it('blocks approval until required training is marked complete', () => {
    let s = actOnSwap(posted(), amrutha(), 1, 'train').state;
    expect(s.swaps.at(-1).st).toBe('Training required');
    expect(actOnSwap(s, amrutha(), 1, 'approve')).toMatchObject({ ok: false, status: 409 });
    s = actOnSwap(s, amrutha(), 1, 'trained').state;
    const r = actOnSwap(s, amrutha(), 1, 'approve');
    expect(r.ok).toBe(true);
    expect(r.state.sched.find((x) => x.id === 2).emp).toBe('Chaitanya Katta');
  });
  it('denying leaves both schedules unchanged and closes the request', () => {
    const s = posted();
    const r = actOnSwap(s, amrutha(), id(s), 'deny');
    expect(r.state.sched.find((x) => x.id === 2).emp).toBe('Pavithra Edha');
    expect(r.state.sched.find((x) => x.id === 5).emp).toBe('Chaitanya Katta');
    expect(actOnSwap(r.state, amrutha(), id(s), 'approve').status).toBe(409);
  });
  it('re-checks the schedule at approval time (no stale swaps)', () => {
    const s = posted();
    // meanwhile Chaitanya is given a shift that overlaps the one he would cover
    const stale = { ...s, sched: [...s.sched, { id: 999, date: s.sched.find((x) => x.id === 2).date, emp: 'Chaitanya Katta', house: 'House A', s: '9:00 AM', e: '1:00 PM', pos: 'x' }] };
    const r = actOnSwap(stale, amrutha(), id(s), 'approve');
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.error).toMatch(/Cannot approve/);
  });
  it('rejects unknown actions and unknown requests', () => {
    const s = posted();
    expect(actOnSwap(s, amrutha(), id(s), 'explode').status).toBe(400);
    expect(actOnSwap(s, amrutha(), 999, 'approve').status).toBe(404);
  });
  it('every approve/deny/train action is written to the audit trail', () => {
    const s = posted();
    const r = actOnSwap(s, amrutha(), id(s), 'approve');
    expect(r.state.auditLog.some((a) => a.action === 'swap:approve' && a.actor === 'Amrutavalli Kella')).toBe(true);
  });
});

describe('leave', () => {
  it('calculates full-day and half-day hours (falls back to a standard 8h/day when nothing is scheduled that far out)', () => {
    expect(calcHours({ from: '2026-10-12', to: '2026-10-16' })).toBe(40);
    expect(calcHours({ half: true, hs: '08:00', he: '12:00' })).toBe(4);
    expect(calcHours({ from: '2026-10-16', to: '2026-10-12' })).toBe(0);
  });
  it('uses the employee\'s ACTUAL scheduled shift hours across the range when the schedule covers it, not a flat 8h/day guess', () => {
    const s = seed();
    // Pavithra: shift 1 = today (8h), shift 2 = +2d (8h). No shift on the day in between for her.
    const from = s.sched.find((x) => x.id === 1).date;
    const to = s.sched.find((x) => x.id === 2).date;
    expect(calcHours({ sched: s.sched, name: 'Pavithra Edha', from, to })).toBe(16); // only her 2 actually-scheduled shifts count, not all 3 calendar days x 8h
  });
  it('correctly counts 7.5 hours for an overnight (3rd Shift) scheduled day, not a negative or zero value', () => {
    const s = seed();
    // Ramesh Naidu (House B) is scheduled on the overnight 3rd Shift (11:30 PM -> 7:00 AM).
    const nightShift = s.sched.find((x) => x.emp === 'Ramesh Naidu');
    expect(nightShift).toMatchObject({ s: '11:30 PM', e: '7:00 AM' });
    expect(calcHours({ sched: s.sched, name: 'Ramesh Naidu', from: nightShift.date, to: nightShift.date })).toBe(7.5);
  });
  it('is stored and tracked in HOURS, not days, and total/used/remaining stay in sync', () => {
    const before = balances(seed().reqs, 'Pavithra Edha').find((x) => x[0] === 'Sick');
    const s = createLeave(seed(), pavithra(), { type: 'Sick', from: '2026-10-12', to: '2026-10-12', reason: 'x' }).state;
    const approved = decideLeave(s, amrutha(), s.reqs.at(-1).id, 'Approved').state;
    const after = balances(approved.reqs, 'Pavithra Edha').find((x) => x[0] === 'Sick');
    expect(after[3]).toBe(before[3] + 8); // used (hours) went up by exactly the requested hours
    expect(after[1]).toBe(after[2] - after[3]); // remaining = available - used, always
  });
  it('half-day leave requires a Start Time and an End Time, and End must be after Start', () => {
    expect(createLeave(seed(), pavithra(), { type: 'Half day', from: '2026-10-12', half: true, reason: 'x' })).toMatchObject({ ok: false, status: 400 });
    expect(createLeave(seed(), pavithra(), { type: 'Half day', from: '2026-10-12', half: true, hs: '12:00', he: '08:00', reason: 'x' })).toMatchObject({ ok: false, status: 400 });
    const r = createLeave(seed(), pavithra(), { type: 'Half day', from: '2026-10-12', half: true, hs: '08:00', he: '12:00', reason: 'x' });
    expect(r).toMatchObject({ ok: true });
    expect(r.result.hrs).toBe(4);
  });
  it('requires a valid type, a reason, and rejects a From date after the To date', () => {
    expect(createLeave(seed(), pavithra(), { type: 'Nonsense', from: '2026-10-12', to: '2026-10-12', reason: 'x' })).toMatchObject({ ok: false, status: 400 });
    expect(createLeave(seed(), pavithra(), { type: 'Vacation', from: '2026-10-12', to: '2026-10-12', reason: '' })).toMatchObject({ ok: false, status: 400 });
    const r = createLeave(seed(), pavithra(), { type: 'Vacation', from: '2026-10-16', to: '2026-10-12', reason: 'x' });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.error).toMatch(/From date cannot be after the To date/);
  });
  it('rejects a request larger than the remaining balance, with a readable message', () => {
    const r = createLeave(seed(), pavithra(), { type: 'Vacation', from: '2026-11-02', to: '2026-12-13', reason: 'Trip' });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.error).toMatch(/Not enough vacation/i);
  });
  it('rejects overlapping/duplicate leave requests for the same employee', () => {
    const s = createLeave(seed(), pavithra(), { type: 'Vacation', from: '2026-10-12', to: '2026-10-16', reason: 'Trip' }).state;
    const r = createLeave(s, pavithra(), { type: 'Sick', from: '2026-10-14', to: '2026-10-14', reason: 'Overlaps' });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
  it('Admin approves leave and the balance drops; an Employee cannot approve', () => {
    let s = createLeave(seed(), pavithra(), { type: 'Vacation', from: '2026-10-12', to: '2026-10-16', reason: 'Trip' }).state;
    const id = s.reqs.at(-1).id;
    expect(decideLeave(s, pavithra(), id, 'Approved').status).toBe(403);
    expect(decideLeave(s, chaitanya(), id, 'Approved').status).toBe(403); // another employee cannot approve anyone's leave
    s = decideLeave(s, amrutha(), id, 'Approved').state;
    expect(balances(s.reqs, 'Pavithra Edha')[0][1]).toBe(60);
    expect(decideLeave(s, amrutha(), id, 'Denied')).toMatchObject({ ok: false, status: 409 });
  });
  it('Admin cannot approve her own leave request', () => {
    const s = createLeave(seed(), amrutha(), { type: 'Sick', from: '2026-10-05', to: '2026-10-05', reason: 'x' }).state;
    const id = s.reqs.at(-1).id;
    expect(decideLeave(s, amrutha(), id, 'Approved')).toMatchObject({ ok: false, status: 403 });
  });
  it('every create/approve/deny is written to the audit trail', () => {
    const s = createLeave(seed(), pavithra(), { type: 'Vacation', from: '2026-10-12', to: '2026-10-16', reason: 'Trip' }).state;
    expect(s.auditLog.some((a) => a.action === 'leave:create' && a.actor === 'Pavithra Edha')).toBe(true);
    const id = s.reqs.at(-1).id;
    const s2 = decideLeave(s, amrutha(), id, 'Approved').state;
    expect(s2.auditLog.some((a) => a.action === 'leave:approved')).toBe(true);
  });
});

describe('timesheet sign-in (Employee ID + PIN)', () => {
  it('accepts the right ID and PIN, rejects anything else', () => {
    expect(verifyTimesheetPin(seed(), pavithra(), { employeeId: '4821', pin: '2580' }).ok).toBe(true);
    expect(verifyTimesheetPin(seed(), pavithra(), { employeeId: '4821', pin: '0000' })).toMatchObject({ ok: false, status: 403 });
    expect(verifyTimesheetPin(seed(), pavithra(), { employeeId: '4822', pin: '2580' })).toMatchObject({ ok: false, status: 403 }); // someone else's ID
  });
  it('submitting without a verified session is refused', () => {
    const ts = { date: seed().sched.find((x) => x.id === 3).date, start: '08:00', end: '16:00', house: 'House A', initials: 'PE', signoff: true };
    expect(submitTimesheet(seed(), pavithra(), ts)).toMatchObject({ ok: false, status: 401 });
  });
  it('the session ends after 10 minutes', () => {
    const s = verified(seed(), pavithra());
    const ts = { date: seed().sched.find((x) => x.id === 3).date, start: '08:00', end: '16:00', house: 'House A', initials: 'PE', signoff: true };
    expect(submitTimesheet(s, pavithra(), ts, new Date(Date.now() + 11 * 60 * 1000)).status).toBe(401);
    expect(submitTimesheet(s, pavithra(), ts).ok).toBe(true);
  });
});

describe('timesheet rules ("Before you submit")', () => {
  const d3 = () => seed().sched.find((x) => x.id === 3).date; // Pavithra worked yesterday, House A
  const ts = () => ({ date: d3(), start: '08:00', end: '16:00', house: 'House A', initials: 'PE', notes: '', signoff: true });
  const go = (u, data, s = seed()) => submitTimesheet(verified(s, u), u, data);

  it('checklist mirrors the form: missing end time, house and sign-off block submit', () => {
    const c = timesheetChecks(seed(), pavithra(), { date: d3(), start: '08:00', initials: 'PE' });
    expect(c.ok).toBe(false);
    expect(c.items.filter((i) => !i.ok).map((i) => i.key)).toEqual(['time', 'house', 'signoff']);
    expect(c.items.find((i) => i.key === 'scheduled')).toMatchObject({ ok: true });
    expect(timesheetChecks(seed(), pavithra(), ts()).ok).toBe(true);
  });
  it('hours are calculated from start and end', () => {
    expect(timesheetChecks(seed(), pavithra(), ts()).hours).toBe(8);
    expect(timesheetChecks(seed(), pavithra(), { ...ts(), start: '07:00', end: '15:30' }).hours).toBe(8.5);
    expect(timesheetChecks(seed(), pavithra(), { ...ts(), end: '' }).hours).toBeNull();
  });
  it('an overnight (3rd Shift) timesheet is accepted and computes 7.5 hours, even though the typed end time is numerically before the start time', () => {
    const s = seed();
    const nightShift = s.sched.find((x) => x.id === 15); // Ramesh Naidu, offset -3d (past, so it's submittable)
    const data = { date: nightShift.date, start: '23:30', end: '07:00', house: 'House B', initials: 'RN', notes: '', signoff: true };
    const c = timesheetChecks(s, ramesh(), data);
    expect(c.ok).toBe(true);
    expect(c.hours).toBe(7.5);
  });
  it('a NON-overnight employee still gets rejected for an end time before the start time (no false wraparound)', () => {
    expect(timesheetChecks(seed(), pavithra(), { ...ts(), end: '07:00' }).items.find((i) => i.key === 'time')).toMatchObject({ ok: false });
  });
  it('server enforces the same rules as the UI checklist', () => {
    expect(go(pavithra(), { ...ts(), end: '' }).error).toMatch(/end time/i);
    expect(go(pavithra(), { ...ts(), house: '' }).error).toMatch(/house/i);
    expect(go(pavithra(), { ...ts(), end: '07:00' }).error).toMatch(/after start/i);
    expect(go(pavithra(), { ...ts(), signoff: false }).status).toBe(400);
    expect(go(pavithra(), { ...ts(), initials: 'XX' }).error).toMatch(/must match/i);
  });
  it('only scheduled employees can submit worked hours, with a human-readable message', () => {
    const r = go(chaitanya(), { ...ts(), initials: 'CK' }); // Chaitanya was not scheduled on Pavithra's day
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.error).toMatch(/not scheduled to work/);
  });
  it('cannot submit a future date', () => {
    expect(go(pavithra(), { ...ts(), date: addDays(today(), 2) }).error).toMatch(/future/);
  });
  it('a valid timesheet is saved as "Completed" immediately (no Admin approval step); the matching Incomplete-Timesheet item disappears; it is not accepted twice', () => {
    const s = verified(seed(), pavithra());
    expect(incompleteTimesheetItems(s, 'Pavithra Edha').some((x) => x.date === d3())).toBe(true); // incomplete beforehand
    const r = submitTimesheet(s, pavithra(), ts());
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ emp: 'Pavithra Edha', kind: 'timesheet', data: { hours: 8, st: 'Completed' } });
    expect(incompleteTimesheetItems(r.state, 'Pavithra Edha').some((x) => x.date === d3())).toBe(false); // gone immediately, no "done" flag needed
    expect(r.state.timesheets.at(-1)).toMatchObject({ emp: 'Pavithra Edha', date: d3(), hours: 8, st: 'Completed' });
    expect(submitTimesheet(r.state, pavithra(), ts())).toMatchObject({ ok: false, status: 409 });
  });
  it('approved leave blocks a worked-hours timesheet with a clear message; an Employee cannot self-override', () => {
    const sickDate = seed().sched.find((x) => x.id === 4).date; // Pavithra scheduled AND has approved sick leave that day
    const data = { date: sickDate, start: '08:00', end: '16:00', house: 'House A', initials: 'PE', signoff: true };
    const r = go(pavithra(), data);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.error).toMatch(/approved sick leave/i);
    expect(go(pavithra(), { ...data, override: true }).status).toBe(409); // an employee's own override flag has no effect
  });
  it('Admin override works ONLY for Admin, and only when explicitly checked', () => {
    const s = verified(seed(), amrutha());
    const data = { date: today(), start: '09:00', end: '17:00', house: 'House A', initials: 'AK', signoff: true }; // Amrutha has no schedule of her own
    expect(submitTimesheet(s, amrutha(), data)).toMatchObject({ ok: false, status: 409 }); // "not scheduled"
    const ok = submitTimesheet(s, amrutha(), { ...data, override: true });
    expect(ok.ok).toBe(true);
    expect(ok.state.timesheets.at(-1).override).toBe(true);
  });
  it('/api/todo no longer handles timesheets - they are submitted only via /api/timesheets, never through completeTodo', () => {
    const s = verified(seed(), pavithra());
    // There is no numeric todo item for a timesheet anymore (Incomplete-Timesheet items are computed
    // on the fly, not stored), so an old-style itemId for one simply is not found.
    expect(completeTodo(s, pavithra(), { itemId: 1, data: ts() }).status).toBe(404);
  });
  it("cannot complete another employee's outstanding item", () => {
    // itemId 6 = Chaitanya Katta's training acknowledgment
    expect(completeTodo(verified(seed(), pavithra()), pavithra(), { itemId: 6, data: { acknowledged: true } }).status).toBe(403);
  });
});

describe('outstanding items: shift, training and time-off', () => {
  it('shift confirmation and training acknowledgment', () => {
    expect(completeTodo(seed(), pavithra(), { itemId: 2, data: { answer: 'Maybe' } }).status).toBe(400);
    expect(completeTodo(seed(), pavithra(), { itemId: 2, data: { answer: 'Confirm' } }).ok).toBe(true);
    expect(completeTodo(seed(), pavithra(), { itemId: 3, data: { acknowledged: false } }).status).toBe(400);
    expect(completeTodo(seed(), pavithra(), { itemId: 3, data: { acknowledged: true } }).ok).toBe(true);
  });
  it('every one of the 7 employees has their own outstanding items', () => {
    const s = seed();
    for (const name of STAFF) {
      expect(s.todo.some((t) => t.emp === name)).toBe(true);
    }
    expect(completeTodo(s, chaitanya(), { itemId: 6, data: { acknowledged: true } }).ok).toBe(true);
  });
  it('an open "leave" outstanding item (if one exists) closes when the leave request is submitted', () => {
    // The seed data no longer ships a demo "Time-off request" card, but createLeave still closes
    // one automatically if an open leave-kind todo item exists for that employee.
    const base = seed();
    const withItem = { ...base, todo: [...base.todo, { id: 999, emp: 'Pavithra Edha', kind: 'leave', title: 'Time-off request', sub: 'Return date is missing', label: 'Missing information', tone: 'a', done: false }] };
    expect(completeTodo(withItem, pavithra(), { itemId: 999, data: {} }).status).toBe(400); // can't complete a leave item directly - must use the Leave form
    const s = createLeave(withItem, pavithra(), { type: 'Vacation', from: '2026-10-12', to: '2026-10-14', reason: 'x' }).state;
    expect(s.todo.find((x) => x.id === 999).done).toBe(true);
  });
  it('the seed data does not ship a "Time-off request / Return date is missing" card on the Dashboard', () => {
    const s = seed();
    expect(s.todo.some((t) => t.kind === 'leave')).toBe(false);
  });
});

describe('"Incomplete Timesheet" is computed dynamically (not seeded), against the real clock', () => {
  it('a past shift with no submitted timesheet and no approved leave is flagged Incomplete', () => {
    const s = seed();
    const items = incompleteTimesheetItems(s, 'Pavithra Edha');
    expect(items.some((x) => x.shiftId === 3)).toBe(true); // shift 3 = yesterday, no timesheet submitted, no leave that day
  });
  it('a past shift covered by approved leave is EXCLUDED, even though no timesheet was submitted', () => {
    const s = seed();
    const items = incompleteTimesheetItems(s, 'Pavithra Edha');
    expect(items.some((x) => x.shiftId === 4)).toBe(false); // shift 4 has Pavithra's approved Sick leave on the same date
  });
  it('a future shift is EXCLUDED, even far in advance', () => {
    const s = seed();
    const items = incompleteTimesheetItems(s, 'Pavithra Edha');
    expect(items.some((x) => x.shiftId === 2)).toBe(false); // shift 2 = +2 days, hasn't happened yet
  });
  it("today's shift is EXCLUDED while still in progress, but INCLUDED once its end time has passed", () => {
    const s = seed();
    const todayShift = s.sched.find((x) => x.id === 1); // Pavithra, today, 1st Shift 7:30 AM - 3:30 PM
    const beforeEnd = new Date(`${todayShift.date}T10:00:00`); // 10 AM - still on shift
    const afterEnd = new Date(`${todayShift.date}T16:00:00`); // 4 PM - shift has ended
    expect(incompleteTimesheetItems(s, 'Pavithra Edha', beforeEnd).some((x) => x.shiftId === 1)).toBe(false);
    expect(incompleteTimesheetItems(s, 'Pavithra Edha', afterEnd).some((x) => x.shiftId === 1)).toBe(true);
  });
  it('an overnight (3rd Shift) shift is only considered ended once its end time on the NEXT calendar day has passed', () => {
    const s = seed();
    const nightShift = s.sched.find((x) => x.id === 15); // Ramesh Naidu, offset -3d, 11:30 PM - 7:00 AM
    const stillOvernight = new Date(`${nightShift.date}T23:59:00`); // same date, 11:59 PM - shift only just started, not ended
    const nextMorningBeforeEnd = new Date(`${addDays(nightShift.date, 1)}T06:00:00`); // next day, 6 AM - not ended yet
    const nextMorningAfterEnd = new Date(`${addDays(nightShift.date, 1)}T08:00:00`); // next day, 8 AM - ended
    expect(hasShiftEnded(nightShift, stillOvernight)).toBe(false);
    expect(hasShiftEnded(nightShift, nextMorningBeforeEnd)).toBe(false);
    expect(hasShiftEnded(nightShift, nextMorningAfterEnd)).toBe(true);
  });
  it('submitting the timesheet removes the item immediately - no separate "done" flag, and it reappears nowhere', () => {
    const s = verified(seed(), pavithra());
    const before = incompleteTimesheetItems(s, 'Pavithra Edha');
    expect(before.some((x) => x.shiftId === 3)).toBe(true);
    const r = submitTimesheet(s, pavithra(), { date: s.sched.find((x) => x.id === 3).date, start: '07:30', end: '15:30', house: 'House A', initials: 'PE', signoff: true });
    expect(r.ok).toBe(true);
    expect(incompleteTimesheetItems(r.state, 'Pavithra Edha').some((x) => x.shiftId === 3)).toBe(false);
  });
  it('each item points at the Timesheets page with the right date, for a direct "Submit Timesheet" action', () => {
    const s = seed();
    const item = incompleteTimesheetItems(s, 'Pavithra Edha').find((x) => x.shiftId === 3);
    expect(item).toMatchObject({ kind: 'timesheet', date: s.sched.find((x) => x.id === 3).date, label: 'Incomplete' });
  });
});

describe('"My Hours" is a till-date record: never shows a row for a date after today', () => {
  it('tillToday keeps past and today rows, and drops every future-dated row', () => {
    const t = today();
    const rows = [
      { date: addDays(t, -5), st: 'Completed' },
      { date: t, st: 'Sick' },
      { date: addDays(t, 1), st: 'Vacation' }, // future - an approved leave row that reaches ahead
      { date: addDays(t, 10), st: 'Completed' },
    ];
    expect(tillToday(rows, t).map((r) => r.date)).toEqual([addDays(t, -5), t]);
  });
  it('a future-dated approved leave request never appears in the ledger once tillToday is applied', () => {
    const s = createLeave(seed(), pavithra(), { type: 'Vacation', from: addDays(today(), 5), to: addDays(today(), 7), reason: 'Trip' }).state;
    const approved = decideLeave(s, amrutha(), s.reqs.at(-1).id, 'Approved').state;
    const rows = hoursLedger(approved, new Date(), ['Pavithra Edha']).filter((r) => r.emp === 'Pavithra Edha');
    expect(rows.some((r) => r.date > today())).toBe(true); // present in the raw ledger (Admin Reports still needs it)
    expect(tillToday(rows, today()).some((r) => r.date > today())).toBe(false); // but never in the till-date "My Hours" view
  });
});

describe('hours ledger (My Hours + Admin audit/reports) is built from real records', () => {
  it('shows submitted hours as "Completed", approved sick days, and incomplete timesheets', () => {
    const rows = hoursLedger(seed());
    expect(rows.filter((r) => r.emp === 'Pavithra Edha').map((r) => r.st).sort()).toEqual(['Completed', 'Incomplete', 'Sick']);
    const sick = rows.find((r) => r.st === 'Sick' && r.emp === 'Pavithra Edha');
    expect(sick.date).toBe(seed().sched.find((x) => x.id === 4).date);
  });
  it('an approved-leave day shows the leave type as the status badge with Start/End/Hours as "—" (blank/zero)', () => {
    const rows = hoursLedger(seed());
    const sick = rows.find((r) => r.st === 'Sick' && r.emp === 'Pavithra Edha');
    expect(sick).toMatchObject({ start: '', end: '', hours: 0 });
  });
  it('the "Awaiting approval" status no longer exists anywhere in the seed data', () => {
    const s = seed();
    expect(s.timesheets.every((t) => t.st !== 'Awaiting approval')).toBe(true);
    expect(hoursLedger(s).every((r) => r.st !== 'Awaiting approval')).toBe(true);
  });
  it('a submitted timesheet moves from Incomplete to Completed immediately - no Admin approval step', () => {
    const s = verified(seed(), pavithra());
    const d = s.sched.find((x) => x.id === 3).date;
    const r = submitTimesheet(s, pavithra(), { date: d, start: '08:00', end: '16:00', house: 'House A', initials: 'PE', signoff: true });
    const row = hoursLedger(r.state).filter((x) => x.emp === 'Pavithra Edha' && x.date === d);
    expect(row.map((x) => x.st)).toEqual(['Completed']);
  });
});

describe('employee management (Admin only)', () => {
  it('only an Admin can add or update employees', () => {
    expect(addEmployee(seed(), pavithra(), { name: 'X', empId: '9999', house: 'House A' }).status).toBe(403);
  });
  it('Admin can add a new employee to the roster', () => {
    const r = addEmployee(seed(), amrutha(), { name: 'Kiran Shah', email: 'kiran@starcare.demo', empId: '9001', pin: '1111', position: 'Caregiver', house: 'House C' });
    expect(r.ok).toBe(true);
    expect(r.state.employees.some((e) => e.empId === '9001' && e.name === 'Kiran Shah')).toBe(true);
    expect(r.state.auditLog.some((a) => a.action === 'employee:create')).toBe(true);
  });
  it('rejects a duplicate Employee ID and an invalid House', () => {
    const s = addEmployee(seed(), amrutha(), { name: 'A', empId: '9002', house: 'House A' }).state;
    expect(addEmployee(s, amrutha(), { name: 'B', empId: '9002', house: 'House A' })).toMatchObject({ ok: false, status: 409 });
    expect(addEmployee(seed(), amrutha(), { name: 'C', empId: '9003', house: 'House Z' })).toMatchObject({ ok: false, status: 400 });
  });
  it('Admin can update an existing employee', () => {
    const r = updateEmployee(seed(), amrutha(), '4821', { position: 'Senior Caregiver', house: 'House B' });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ position: 'Senior Caregiver', house: 'House B' });
  });
});
