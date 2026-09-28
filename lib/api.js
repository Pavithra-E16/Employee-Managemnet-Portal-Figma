import { USERS } from './data';
import { getState, setState } from './store';
import { incompleteTimesheetItems } from './hrm';

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// Demo identity: the browser sends the signed-in email. Replace with Microsoft Entra ID token validation in production.
export const whoami = (req) => {
  const e = (req.headers.get('x-user-email') || '').toLowerCase();
  return USERS[e] ? { email: e, ...USERS[e] } : null;
};

// What one signed-in user is allowed to see. This is enforced on the SERVER, not just in the UI:
// an Employee can never retrieve another employee's leave, swaps, timesheets or outstanding
// items by calling the API directly, and only an Admin receives the employee directory or audit log.
export const view = (s, u) => {
  const employees = (s.employees || []).map(({ pin, ...rest }) => rest); // never send PINs to the browser
  const base = { ...s, employees, tsSessions: { [u.email]: s.tsSessions?.[u.email] || 0 }, notifications: s.notifications.filter((n) => n.to === u.name), serverNow: Date.now() };
  if (u.role === 'Admin') return base;
  const mine = (name) => name === u.name;
  return {
    ...base,
    reqs: s.reqs.filter((r) => mine(r.emp)),
    swaps: s.swaps.filter((w) => mine(w.from) || mine(w.with)),
    timesheets: s.timesheets.filter((t) => mine(t.emp)),
    // "Incomplete Timesheet" items are computed fresh against the current clock every time state is
    // read, not stored - so a shift shows up the instant its end time passes, and disappears the
    // instant a matching timesheet is submitted or the day is covered by approved leave.
    todo: [...s.todo.filter((t) => mine(t.emp)), ...incompleteTimesheetItems(s, u.name)],
    submissions: s.submissions.filter((x) => mine(x.emp)),
    sched: s.sched.filter((x) => mine(x.emp) || (u.house && x.house === u.house)),
    auditLog: [], // audit history is Admin-only
    employees: [], // the employee directory is Admin-only
  };
};

export async function run(req, fn) {
  const u = whoami(req);
  if (!u) return json({ error: 'Sign in required' }, 401);
  const body = await req.json().catch(() => ({}));
  const r = fn(getState(), u, body);
  if (!r.ok) return json({ error: r.error }, r.status);
  setState(r.state);
  return json({ state: view(r.state, u), result: r.result });
}
