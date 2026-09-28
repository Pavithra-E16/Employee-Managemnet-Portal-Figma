import { dayOffset } from './dates';

// ---------- HOUSES ----------
// Single source of truth for every House used anywhere in the app.
export const HOUSES = ['House A', 'House B', 'House C'];

// ---------- STANDARD 3-SHIFT DAILY SCHEDULE ----------
// Single source of truth for every shift time used anywhere in the app (seed data, My Schedule,
// House Schedule, Shift Swap, Leave hour calculations, Timesheet auto-hour calculations).
// The 3rd shift crosses midnight (11:30 PM -> 7:00 AM the next calendar day, 7.5h); every place in
// the codebase that computes a duration or checks for overlap between two shifts is midnight-aware.
export const SHIFTS = {
  1: { s: '7:30 AM', e: '3:30 PM', label: '1st Shift (7:30 AM - 3:30 PM)' },
  2: { s: '3:30 PM', e: '11:30 PM', label: '2nd Shift (3:30 PM - 11:30 PM)' },
  3: { s: '11:30 PM', e: '7:00 AM', label: '3rd Shift (11:30 PM - 7:00 AM)' },
};

// ---------- HARDCODED DEMO USERS (prototype only) ----------
// Only TWO roles exist in this application: Employee and Admin.
// There is no Manager role anywhere - not in login, permissions, workspace or navigation.
// empId + pin = the separate Timesheet sign-in ("Verified with your Employee ID and PIN").
export const USERS = {
  'pavithra@starcare.demo': { pw: 'Employee@123', name: 'Pavithra Edha', role: 'Employee', empId: '4821', pin: '2580', pos: 'Caregiver', house: 'House A', wb: ['Employee Portal'] },
  'chaitanya@starcare.demo': { pw: 'Employee@123', name: 'Chaitanya Katta', role: 'Employee', empId: '4822', pin: '1357', pos: 'Geriatric Caregiver', house: 'House A', wb: ['Employee Portal'] },
  'eswari@starcare.demo': { pw: 'Employee@123', name: 'Eswari Reddy', role: 'Employee', empId: '4823', pin: '2468', pos: 'Caregiver', house: 'House B', wb: ['Employee Portal'] },
  'divya@starcare.demo': { pw: 'Employee@123', name: 'Divya Prasad', role: 'Employee', empId: '4825', pin: '3691', pos: 'Caregiver', house: 'House B', wb: ['Employee Portal'] },
  'ramesh@starcare.demo': { pw: 'Employee@123', name: 'Ramesh Naidu', role: 'Employee', empId: '4826', pin: '7412', pos: 'Geriatric Caregiver', house: 'House B', wb: ['Employee Portal'] },
  'sunitha@starcare.demo': { pw: 'Employee@123', name: 'Sunitha Rao', role: 'Employee', empId: '4827', pin: '8523', pos: 'Caregiver', house: 'House C', wb: ['Employee Portal'] },
  'vijay@starcare.demo': { pw: 'Employee@123', name: 'Vijay Kumar', role: 'Employee', empId: '4828', pin: '9630', pos: 'Geriatric Caregiver', house: 'House C', wb: ['Employee Portal'] },
  // The ONLY Admin account. Amrutha is Administration staff, not a caregiver with shifts of her own,
  // so she does not get the Employee Portal workspace — her home base is the Approval Center.
  'amrutha@starcare.demo': {
    pw: 'Admin@123', name: 'Amrutavalli Kella', role: 'Admin', empId: '4824', pin: '1470', pos: 'Administrator', house: '',
    wb: ['Approval Center', 'Recruitment', 'Timesheet & Hours Audit', 'Employee Management', 'Reports', 'Audit Trail'],
  },
};

export const TABS = {
  'Employee Portal': ['Dashboard', 'My Schedule', 'House Schedule', 'Leave', 'Shift Swap', 'Timesheets', 'My Hours'],
  Recruitment: ['Dashboard', 'Jobs', 'Candidates', 'Pipeline', 'Interviews', 'Emails', 'Templates'],
  'Approval Center': ['Leave Requests', 'Swap Requests'],
  'Timesheet & Hours Audit': [],
  'Employee Management': [],
  Reports: [],
  'Audit Trail': [],
};

// Employee directory: EXCLUDES Admin. Always exactly 7 Employee accounts.
export const EMPLOYEES = Object.entries(USERS)
  .filter(([, u]) => u.role === 'Employee')
  .map(([email, u]) => ({ ...u, email }));
export const STAFF = EMPLOYEES.map((u) => u.name);
export const ADMIN_NAME = Object.values(USERS).find((u) => u.role === 'Admin').name;
export const ADMINS = Object.values(USERS).filter((u) => u.role === 'Admin').map((u) => u.name);

export const BASE = { Vacation: [100, 0], Sick: [40, 0], Bereavement: [24, 0] };
export const posOf = (name) => Object.values(USERS).find((u) => u.name === name)?.pos || '';
export const houseOf = (name) => Object.values(USERS).find((u) => u.name === name)?.house || '';
const initials = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();

// ---------- seed data: EVERY date is computed from the system's local date ----------
// buildSeed(now) -> today is `now` (defaults to the real clock), offsets are days from today.
// Every shift uses one of the 3 standard SHIFTS defined above - shiftNo is 1, 2 or 3.
export function buildSeed(now = new Date()) {
  const d = (n) => dayOffset(n, now);
  const shift = (id, off, emp, shiftNo) => ({ id, date: d(off), emp, house: houseOf(emp), s: SHIFTS[shiftNo].s, e: SHIFTS[shiftNo].e, pos: posOf(emp) });

  // Every employee has a valid, non-overlapping schedule: each employee's shifts sit on
  // different dates, so nobody is ever double-booked. All three Houses are represented, and all
  // three standard shifts (1st/2nd/3rd, including the overnight 3rd shift) are represented too.
  // Each House also gets one EXTRA future date (offset +5) where TWO employees are both
  // scheduled on different shifts - the canonical "Direct Swap (Exchange)" demo scenario -
  // alongside the existing dates, which stay single-employee "Cover-Only" (co-worker is off).
  const sched = [
    // House A - Pavithra Edha (1st Shift) & Chaitanya Katta (2nd Shift)
    shift(1, 0, 'Pavithra Edha', 1),
    shift(2, 2, 'Pavithra Edha', 1),
    shift(3, -1, 'Pavithra Edha', 1),
    shift(4, -3, 'Pavithra Edha', 1),
    shift(5, 1, 'Chaitanya Katta', 2),
    shift(6, 3, 'Chaitanya Katta', 2),
    shift(7, -2, 'Chaitanya Katta', 2),
    shift(22, 5, 'Pavithra Edha', 1),
    shift(23, 5, 'Chaitanya Katta', 2), // same date as shift 22 -> Direct Swap demo (1st <-> 2nd)
    // House B - Eswari Reddy (1st Shift), Divya Prasad (2nd Shift) & Ramesh Naidu (3rd/overnight Shift)
    shift(8, 0, 'Eswari Reddy', 1),
    shift(9, 3, 'Eswari Reddy', 1),
    shift(10, -2, 'Eswari Reddy', 1),
    shift(11, 1, 'Divya Prasad', 2),
    shift(12, 4, 'Divya Prasad', 2),
    shift(13, -1, 'Divya Prasad', 2),
    shift(14, 2, 'Ramesh Naidu', 3),
    shift(15, -3, 'Ramesh Naidu', 3),
    shift(24, 5, 'Eswari Reddy', 1),
    shift(25, 5, 'Divya Prasad', 2), // same date as shift 24 -> Direct Swap demo (1st <-> 2nd)
    // House C - Sunitha Rao (1st Shift) & Vijay Kumar (3rd/overnight Shift)
    shift(16, 0, 'Sunitha Rao', 1),
    shift(17, 2, 'Sunitha Rao', 1),
    shift(18, -2, 'Sunitha Rao', 1),
    shift(19, 1, 'Vijay Kumar', 3),
    shift(20, 4, 'Vijay Kumar', 3),
    shift(21, -1, 'Vijay Kumar', 3),
    shift(26, 5, 'Sunitha Rao', 1),
    shift(27, 5, 'Vijay Kumar', 3), // same date as shift 26 -> Direct Swap demo (1st <-> 3rd/overnight)
  ];

  const reqs = [
    { id: 1, emp: 'Chaitanya Katta', house: 'House A', type: 'Vacation', from: d(18), to: d(22), hrs: 40, reason: 'Family trip out of state', st: 'Pending', by: '', cm: '' },
    { id: 2, emp: 'Divya Prasad', house: 'House B', type: 'Sick', from: d(4), to: d(4), hrs: 8, reason: 'Doctor appointment', st: 'Pending', by: '', cm: '' },
    { id: 3, emp: 'Sunitha Rao', house: 'House C', type: 'Half day', from: d(6), to: d(6), hrs: 4, reason: 'Personal errand', st: 'Pending', by: '', cm: '' },
    // approved sick leave that lands on a day Pavithra was also scheduled: the canonical
    // "leave blocks the timesheet" example used across the Leave/Timesheet screens.
    { id: 4, emp: 'Pavithra Edha', house: 'House A', type: 'Sick', from: d(-3), to: d(-3), hrs: 8, reason: 'Fever', st: 'Approved', by: 'Amrutavalli Kella', cm: 'Get well soon' },
    { id: 5, emp: 'Pavithra Edha', house: 'House A', type: 'Work excuse', from: d(-17), to: d(-17), hrs: 4, reason: 'Car trouble', st: 'Denied', by: 'Amrutavalli Kella', cm: 'No coverage available that day' },
    // same conflict scenario for Vijay, at House C.
    { id: 6, emp: 'Vijay Kumar', house: 'House C', type: 'Sick', from: d(-1), to: d(-1), hrs: 8, reason: 'Migraine', by: 'Amrutavalli Kella', st: 'Approved', cm: 'Rest well' },
  ];

  const sh = (id) => sched.find((x) => x.id === id);
  // NOTE: "Incomplete Timesheet" outstanding items are NOT seeded here anymore - they are computed
  // dynamically (see incompleteTimesheetItems in lib/hrm.js) from real schedule + timesheet + leave
  // data against the current clock, so they always reflect reality and never need a "done" flag.
  const confirm = (id, emp, shiftId) => ({ id, emp, kind: 'shift', shiftId, title: `Shift confirmation`, sub: `${sh(shiftId).house} - ${sh(shiftId).s} to ${sh(shiftId).e}`, label: 'Required', tone: 'r', done: false });
  const training = (id, emp) => ({ id, emp, kind: 'training', title: 'Training acknowledgment', sub: 'Medication safety refresher', label: 'Required', tone: 'r', done: false });

  const todo = [
    confirm(2, 'Pavithra Edha', 2),
    training(3, 'Pavithra Edha'),
    training(6, 'Chaitanya Katta'),
    confirm(7, 'Eswari Reddy', 9),
    training(8, 'Eswari Reddy'),
    training(10, 'Divya Prasad'),
    training(12, 'Ramesh Naidu'),
    training(14, 'Sunitha Rao'),
    training(16, 'Vijay Kumar'),
  ];

  // already-submitted timesheets (history for "My Hours" and the Admin audit/reports).
  // Times match each employee's assigned standard shift (Ramesh's is the overnight 3rd shift).
  // Worked-hours timesheets have no approval step - every submitted one is "Completed".
  const rec = (id, emp, off, house, start, end, hours, st) => ({ id, emp, date: d(off), house, start, end, hours, initials: '', notes: '', st, at: '' });
  const timesheets = [
    rec(1, 'Pavithra Edha', -7, 'House A', '07:30', '15:30', 8, 'Completed'),
    rec(2, 'Eswari Reddy', -6, 'House B', '07:30', '15:30', 8, 'Completed'),
    rec(3, 'Sunitha Rao', -5, 'House C', '07:30', '15:30', 8, 'Completed'),
    rec(4, 'Chaitanya Katta', -4, 'House A', '15:30', '23:30', 8, 'Completed'),
    rec(5, 'Ramesh Naidu', -6, 'House B', '23:30', '07:00', 7.5, 'Completed'),
  ];

  // Employee directory shown/edited on the Admin "Employee Management" screen.
  // PINs are never sent to the browser (see lib/api.js view()).
  const employees = EMPLOYEES.map((e) => ({ empId: e.empId, name: e.name, email: e.email, pin: e.pin, position: e.pos, house: e.house, initials: initials(e.name), active: true }));

  return { v: 6, reqs, sched, swaps: [], todo, timesheets, submissions: [], notifications: [], tsSessions: {}, auditLog: [], employees };
}

export const CANDS = [
  ['Meena Iyer', 'meena.iyer@example.com', 'Senior Pediatric Nurse', 'Geriatric Caregiver', '15 yrs', ['Paediatric assessment', 'Vitals monitoring', 'Growth-chart tracking']],
  ['Arjun Rao', 'arjun.rao@example.com', 'Geriatric Caregiver', 'Geriatric Caregiver', '14 yrs', ['Daily living support', 'Mobility transfers', 'Fall prevention']],
  ['Kavya Nair', 'kavya.nair@example.com', 'Caregiver', 'Caregiver', '6 yrs', ['Medication reminders', 'Companionship', 'Light housekeeping']],
];
