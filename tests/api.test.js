import { describe, it, expect, beforeEach } from 'vitest';
import { resetState, getState } from '../lib/store';
import { GET as getHrm } from '../app/api/hrm/route.js';
import { POST as postSwap } from '../app/api/swaps/route.js';
import { POST as postLeave } from '../app/api/leave/route.js';
import { PATCH as patchLeave } from '../app/api/leave/[id]/route.js';
import { POST as postTodo } from '../app/api/todo/route.js';
import { POST as postVerify } from '../app/api/timesheets/verify/route.js';
import { POST as postTimesheet } from '../app/api/timesheets/route.js';
import { PATCH as patchSwap } from '../app/api/swaps/[id]/route.js';
import { POST as postEmployee } from '../app/api/employees/route.js';
import { PATCH as patchEmployee } from '../app/api/employees/[empId]/route.js';

const call = (fn, email, method, body, params) =>
  fn(new Request('http://localhost/api', { method, headers: { 'content-type': 'application/json', ...(email ? { 'x-user-email': email } : {}) }, body: body ? JSON.stringify(body) : undefined }), { params });
const PAV = 'pavithra@starcare.demo', CHA = 'chaitanya@starcare.demo', ADM = 'amrutha@starcare.demo', ESW = 'eswari@starcare.demo';
const swapBody = { shiftId: 2, cover: 'Chaitanya Katta', returnShiftId: 5, reason: 'Family event' }; // shift 2 = Pavithra +2d (future)

beforeEach(() => resetState());

describe('swap request API (push -> review -> approve)', () => {
  it('returns 401 when not signed in', async () => {
    expect((await call(getHrm, null, 'GET')).status).toBe(401);
    expect((await call(postSwap, null, 'POST', swapBody)).status).toBe(401);
  });
  it('Chaitanya can sign in to the API and sees his own data only', async () => {
    const d = await (await call(getHrm, CHA, 'GET')).json();
    expect(d.todo.every((t) => t.emp === 'Chaitanya Katta')).toBe(true);
    expect(typeof d.serverNow).toBe('number');
  });
  it('full flow: Pavithra posts, admin trains + approves, BOTH Pavithra and Chaitanya see the new schedule', async () => {
    const created = await call(postSwap, PAV, 'POST', swapBody);
    expect(created.status).toBe(200);
    const id = (await created.json()).state.swaps.at(-1).id;

    expect((await call(patchSwap, PAV, 'PATCH', { action: 'approve' }, { id })).status).toBe(403);
    expect((await call(patchSwap, ADM, 'PATCH', { action: 'train' }, { id })).status).toBe(200);
    const locked = await call(patchSwap, ADM, 'PATCH', { action: 'approve' }, { id });
    expect(locked.status).toBe(409);
    expect((await locked.json()).error).toMatch(/training/i);

    await call(patchSwap, ADM, 'PATCH', { action: 'trained' }, { id });
    expect((await call(patchSwap, ADM, 'PATCH', { action: 'approve' }, { id })).status).toBe(200);

    const p = await (await call(getHrm, PAV, 'GET')).json();
    const c = await (await call(getHrm, CHA, 'GET')).json();
    expect(p.sched.find((x) => x.id === 5).emp).toBe('Pavithra Edha');
    expect(c.sched.find((x) => x.id === 2).emp).toBe('Chaitanya Katta');
    expect(c.notifications.some((n) => /Approved/.test(n.text))).toBe(true);
    expect(p.notifications.every((n) => n.to === 'Pavithra Edha')).toBe(true); // nobody sees others' notifications
    expect(getState().swaps.at(-1).st).toBe('Approved');
  });
  it('validation errors come back as 400 with a readable message', async () => {
    const r = await call(postSwap, PAV, 'POST', { ...swapBody, reason: '' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/reason/i);
  });
  it('rejects a swap request for today\'s shift with a readable future-dates-only message', async () => {
    // shift 1 = Pavithra's shift for today
    const r = await call(postSwap, PAV, 'POST', { shiftId: 1, cover: 'Chaitanya Katta', reason: 'x' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('You can only request shift swaps for future dates.');
  });
});

describe('Direct Swap vs Cover-Only, via the real /api/swaps route', () => {
  it('a same-day Direct Swap (Exchange) is created and, on approval, updates BOTH schedules', async () => {
    // shift 22 = Pavithra 1st Shift, shift 23 = Chaitanya 2nd Shift - same future date (House A).
    const created = await call(postSwap, PAV, 'POST', { shiftId: 22, cover: 'Chaitanya Katta', returnShiftId: 23, reason: 'Same-day exchange' });
    expect(created.status).toBe(200);
    const id = (await created.json()).state.swaps.at(-1).id;
    expect((await call(patchSwap, ADM, 'PATCH', { action: 'approve' }, { id })).status).toBe(200);
    const state = getState();
    expect(state.sched.find((x) => x.id === 22).emp).toBe('Chaitanya Katta');
    expect(state.sched.find((x) => x.id === 23).emp).toBe('Pavithra Edha');
  });
  it('Cover-Only is rejected via the API when the co-worker already has a different shift that same day', async () => {
    const r = await call(postSwap, PAV, 'POST', { shiftId: 22, cover: 'Chaitanya Katta', reason: 'x' }); // no returnShiftId
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/already scheduled to work a different shift/);
  });
  it('Cover-Only via the API still succeeds when the co-worker is genuinely off that day', async () => {
    const r = await call(postSwap, PAV, 'POST', { shiftId: 2, cover: 'Chaitanya Katta', reason: 'x' });
    expect(r.status).toBe(200);
  });
});

describe('leave request API: hours-based validation', () => {
  it('half-day leave with a valid Start/End time is created with exact hours', async () => {
    const r = await call(postLeave, PAV, 'POST', { type: 'Half day', from: '2026-10-12', half: true, hs: '08:00', he: '12:00', reason: 'Appointment' });
    expect(r.status).toBe(200);
    expect((await r.json()).state.reqs.at(-1)).toMatchObject({ type: 'Half day', hrs: 4 });
  });
  it('half-day leave missing a Start/End time is rejected with a readable message', async () => {
    const r = await call(postLeave, PAV, 'POST', { type: 'Half day', from: '2026-10-12', half: true, reason: 'Appointment' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Start Time and an End Time/);
  });
  it('a From date after the To date is rejected with a readable message', async () => {
    const r = await call(postLeave, PAV, 'POST', { type: 'Vacation', from: '2026-10-16', to: '2026-10-12', reason: 'x' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/From date cannot be after the To date/);
  });
  it('a request larger than the remaining balance is rejected before it is saved', async () => {
    const r = await call(postLeave, PAV, 'POST', { type: 'Vacation', from: '2026-11-02', to: '2026-12-13', reason: 'Trip' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Not enough vacation/i);
  });
});

describe('role-based API security: an Employee is rejected from every Admin-only action', () => {
  it('POST /api/swaps/[id] approve as an Employee -> 403', async () => {
    const created = await call(postSwap, PAV, 'POST', swapBody);
    const id = (await created.json()).state.swaps.at(-1).id;
    expect((await call(patchSwap, CHA, 'PATCH', { action: 'approve' }, { id })).status).toBe(403);
  });
  it('PATCH /api/leave/[id] as an Employee -> 403', async () => {
    const created = await call(postLeave, PAV, 'POST', { type: 'Vacation', from: '2026-11-02', to: '2026-11-03', reason: 'x' });
    const id = (await created.json()).state.reqs.at(-1).id;
    expect((await call(patchLeave, CHA, 'PATCH', { status: 'Approved' }, { id })).status).toBe(403);
  });
  it('POST /api/employees (Employee Management) as an Employee -> 403', async () => {
    expect((await call(postEmployee, PAV, 'POST', { name: 'X', empId: '9999', house: 'House A' })).status).toBe(403);
  });
  it('PATCH /api/employees/[empId] as an Employee -> 403', async () => {
    expect((await call(patchEmployee, PAV, 'PATCH', { position: 'Manager' }, { empId: '4822' })).status).toBe(403);
  });
  it('Admin can add and update employees', async () => {
    const created = await call(postEmployee, ADM, 'POST', { name: 'Kiran Shah', empId: '9010', house: 'House C', position: 'Caregiver' });
    expect(created.status).toBe(200);
    const updated = await call(patchEmployee, ADM, 'PATCH', { position: 'Lead Caregiver' }, { empId: '9010' });
    expect(updated.status).toBe(200);
    expect((await updated.json()).result.position).toBe('Lead Caregiver');
  });
});

describe('employee data privacy: an Employee cannot read another employee\'s private data via the API', () => {
  it('leave requests, timesheets and outstanding items returned to Pavithra never include another employee\'s records', async () => {
    const d = await (await call(getHrm, PAV, 'GET')).json();
    expect(d.reqs.every((r) => r.emp === 'Pavithra Edha')).toBe(true);
    expect(d.timesheets.every((t) => t.emp === 'Pavithra Edha')).toBe(true);
    expect(d.todo.every((t) => t.emp === 'Pavithra Edha')).toBe(true);
  });
  it('the schedule returned to an Employee only covers their own shifts and their own House', async () => {
    const d = await (await call(getHrm, PAV, 'GET')).json(); // Pavithra is House A
    expect(d.sched.every((x) => x.emp === 'Pavithra Edha' || x.house === 'House A')).toBe(true);
    expect(d.sched.some((x) => x.house === 'House B' || x.house === 'House C')).toBe(false);
  });
  it('the employee directory and audit log are Admin-only', async () => {
    const emp = await (await call(getHrm, PAV, 'GET')).json();
    expect(emp.employees).toEqual([]);
    expect(emp.auditLog).toEqual([]);
    const adm = await (await call(getHrm, ADM, 'GET')).json();
    expect(adm.employees.length).toBe(7);
    expect(adm.employees.every((e) => !('pin' in e))).toBe(true); // PINs are never sent to the browser
  });
  it('an Admin sees every House and every employee\'s records', async () => {
    const d = await (await call(getHrm, ADM, 'GET')).json();
    expect(new Set(d.sched.map((x) => x.house))).toEqual(new Set(['House A', 'House B', 'House C']));
    expect(new Set(d.reqs.map((r) => r.emp)).size).toBeGreaterThan(1);
  });
});

describe('Timesheet API: PIN sign-in then submit', () => {
  it('needs a verified session, then saves the record as "Completed" and clears the Incomplete-Timesheet item from the Dashboard', async () => {
    const date = getState().sched.find((x) => x.id === 3).date;
    const data = { date, start: '08:00', end: '16:00', house: 'House A', initials: 'PE', signoff: true };
    expect((await call(postTimesheet, PAV, 'POST', data)).status).toBe(401);
    expect((await call(postVerify, PAV, 'POST', { employeeId: '4821', pin: '9999' })).status).toBe(403);
    const v = await call(postVerify, PAV, 'POST', { employeeId: '4821', pin: '2580' });
    expect(v.status).toBe(200);
    expect((await v.json()).state.tsSessions['pavithra@starcare.demo']).toBeGreaterThan(Date.now());
    const before = await call(postVerify, PAV, 'POST', { employeeId: '4821', pin: '2580' }); // re-fetch to read current todo
    expect((await before.json()).state.todo.some((t) => t.kind === 'timesheet' && t.date === date)).toBe(true); // Incomplete beforehand
    const r = await call(postTimesheet, PAV, 'POST', data);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.result).toMatchObject({ kind: 'timesheet', data: { hours: 8, st: 'Completed' } }); // immediately Completed - no Admin approval step
    expect(body.state.todo.some((t) => t.kind === 'timesheet' && t.date === date)).toBe(false); // gone immediately - no "done" flag to flip
  });
  it('/api/todo no longer accepts a timesheet item - it is not found (submit via /api/timesheets instead)', async () => {
    await call(postVerify, PAV, 'POST', { employeeId: '4821', pin: '2580' });
    const r = await call(postTodo, PAV, 'POST', { itemId: 1, data: { start: '08:00', initials: 'PE' } });
    expect(r.status).toBe(404);
  });
  it("someone else's PIN session does not unlock my timesheet", async () => {
    await call(postVerify, CHA, 'POST', { employeeId: '4822', pin: '1357' });
    const date = getState().sched.find((x) => x.id === 3).date;
    expect((await call(postTimesheet, PAV, 'POST', { date, start: '08:00', end: '16:00', house: 'House A', initials: 'PE', signoff: true })).status).toBe(401);
    expect(ESW).toBeTruthy();
  });
});
