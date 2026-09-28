# Starcare HRM – Employee Management Portal (Next.js)

A role-based Employee Management Portal for Starcare's residential care houses.
The **Manager role has been completely removed**. There are now exactly **two
application roles**: **Employee** and **Admin**.

## Run locally
1. Install Node.js LTS (https://nodejs.org).
2. Open this folder in a terminal.
3. Run: `npm install`
4. Run: `npm run dev`
5. Open http://localhost:3000

## Run the tests
    npm test
**77 automated tests** (3 files, all passing) cover login/role rules, the
3-House model, schedules, leave, timesheets, swaps (including the
approval-time recheck), employee management, reports/audit data, API-level
403 enforcement, and employee data-privacy isolation.

## Run a production build
    npm run build
    npm run start

## Demo logins (login screen shows this same list automatically)

**7 Employees:**

| Name | Email | Password | Position | House |
|---|---|---|---|---|
| Pavithra Edha | pavithra@starcare.demo | Employee@123 | Caregiver | House A |
| Chaitanya Katta | chaitanya@starcare.demo | Employee@123 | Geriatric Caregiver | House A |
| Eswari Reddy | eswari@starcare.demo | Employee@123 | Caregiver | House B |
| Divya Prasad | divya@starcare.demo | Employee@123 | Caregiver | House B |
| Ramesh Naidu | ramesh@starcare.demo | Employee@123 | Geriatric Caregiver | House B |
| Sunitha Rao | sunitha@starcare.demo | Employee@123 | Caregiver | House C |
| Vijay Kumar | vijay@starcare.demo | Employee@123 | Geriatric Caregiver | House C |

**1 Admin:**

| Name | Email | Password |
|---|---|---|
| Amrutavalli Kella (Amrutha) | amrutha@starcare.demo | Admin@123 |

No Manager account exists anywhere in the system, the seed data, the UI, or
the tests.

### Timesheet sign-in (separate from the login above)
Uses Employee ID + PIN, never DOB alone:

| Person | Employee ID | PIN |
|---|---|---|
| Pavithra Edha | 4821 | 2580 |
| Chaitanya Katta | 4822 | 1357 |
| Eswari Reddy | 4823 | 2468 |
| Divya Prasad | 4825 | 3691 |
| Ramesh Naidu | 4826 | 7412 |
| Sunitha Rao | 4827 | 8523 |
| Vijay Kumar | 4828 | 9630 |
| Amrutavalli Kella | 4824 | 1470 |

## Roles and Workspaces

### Employee Workspace
Dashboard, My Schedule, House Schedule (own House only), Leave, Shift Swap,
Timesheets, My Hours, Outstanding Items.

Employees **cannot**: approve leave, approve swaps, modify schedules, modify
other employees, access Recruitment, access all-employee Reports, access the
Audit Trail, access Admin/Employee Management pages, or view another
employee's private requests, timesheets or todo items.

### Admin Workspace
Everything in the Employee Workspace, plus: Approval Center (Leave + Swap
decisions, with training-required gating), Recruitment, Employee Management
(add/deactivate/reactivate employees), Reports (hours/leave by employee,
House, and date range), Audit Trail, and Excel (CSV) export.

The top-right of the app always shows the signed-in person's **name, role,
and workspace**, and the navigation only ever lists modules that role is
allowed to open.

## Houses
The app supports exactly **House A, House B, and House C**, driven from one
`HOUSES` list in `lib/data.js`. Schedules, House Schedule, swaps (cover must
belong to the shift's House), timesheets, leave, reports, audit, and Admin
filters all work identically across all three Houses — nothing is
hardcoded to two Houses anywhere.

## Standard 3-shift daily schedule
Every shift in the app comes from one `SHIFTS` catalog in `lib/data.js` —
there are no other shift times anywhere in the seed data:

| Shift | Time |
|---|---|
| 1st Shift | 7:30 AM – 3:30 PM |
| 2nd Shift | 3:30 PM – 11:30 PM |
| 3rd Shift | 11:30 PM – 7:00 AM (**overnight**, crosses midnight) |

The 7 employees are assigned across all 3 Houses using these 3 shifts, with
every standard shift (including the overnight one) represented at least
once: Pavithra and Eswari and Sunitha work the 1st Shift; Chaitanya and
Divya work the 2nd Shift; Ramesh and Vijay work the overnight 3rd Shift.
Every shift, on every date, is 1st/2nd Shift = 8 hours, 3rd Shift (overnight)
= 7.5 hours — computed correctly across midnight rather than as a negative
or zero duration.

**Midnight-safe by construction, everywhere hours or overlaps are computed:**
- `lib/dates.js` exports `durationHours(start, end)`, which wraps past
  midnight when the end time-of-day is not after the start time-of-day, and
  a midnight-aware `overlaps()` used for shift-swap conflict detection.
- Leave hour calculation (`calcHours`), Timesheet hour calculation
  (`timesheetChecks`), My Schedule, House Schedule, and the Shift Swap
  dropdowns all read shift times directly from the schedule and use this
  same midnight-safe math, so the overnight shift behaves correctly
  end-to-end rather than needing special-casing per screen.
- An employee whose scheduled shift that day is the overnight 3rd Shift can
  submit a timesheet with an end time that is numerically "before" the
  start time (e.g. 11:30 PM → 7:00 AM) without being incorrectly rejected;
  a non-overnight employee still gets the normal "End time must be after
  start time" validation, so a genuine data-entry mistake is still caught.

## Schedule dates (system clock, nothing hardcoded)
- Every date comes from the machine's **local** clock (`lib/dates.js`), never
  UTC, so "today", "past" and "future" always line up with the real system
  date.
- The seed schedule (21 shifts across all 7 employees and 3 Houses, built
  from the standard 3-shift catalog above, no employee double-booked),
  leave requests, outstanding items, and hours history are all built as
  "today ± N days" when the server starts.
- Restart `npm run dev` on a new day to re-anchor the demo data.

## Leave
Supports Vacation, Sick, Bereavement, Work Excuse, and Half Day. **Everything
is stored and tracked in hours, never days:**
- **Standard leave** (Vacation/Sick/Bereavement/Work Excuse): hours are
  auto-calculated from the employee's **actual scheduled shift hours**
  across the From→To range (not a flat "8h × number of days" guess). If the
  published schedule doesn't reach that far out yet (e.g. a vacation
  requested months ahead), it falls back to a standard 8-hour workday per
  calendar day so far-future planning still works.
- **Half Day**: requires a Start Time and an End Time; hours are the exact
  difference between them.
- Total Available, Used, and Remaining hours are always kept in sync and
  shown on three live-updating balance cards (Vacation/Sick/Bereavement;
  Work Excuse and Half Day are uncapped but still fully tracked and
  reported).

**Validation**, enforced identically in the form (live, before submit) and
in the API (final say, so the two can never disagree):
- From date cannot be after the To date.
- Half-day leave must have both a Start Time and an End Time, with End after
  Start.
- A request whose hours exceed the employee's remaining balance for that
  leave type is blocked, both live on the form ("Fix these before
  submitting") and again server-side, with a readable message
  (e.g. "Not enough vacation balance (32h left)").
- Rejects duplicate/overlapping leave requests for the same employee.

Only Admin can approve or deny, and Admin cannot approve their own request.
Every decision is written to the Audit Trail and shown back to the employee
with the Admin's remark.

## Leave + Timesheet conflict
If an employee has **approved leave** on a date, opening the Timesheet for
that date shows, and the API enforces:

> "You are on approved {type} leave on {date}. You cannot submit a
> worked-hours timesheet for this date."

The Submit button is disabled client-side and the same rule is enforced
again in the API/business layer — the frontend never relies on itself alone.

## Timesheets
Employee ID + PIN sign-in (10-minute session), then Initials, Date, Start,
End, Hours (auto-calculated, not editable), House, timestamp, notes, and a
required sign-off. A live **"Before you submit"** checklist mirrors the
exact same rules enforced by the API: scheduled that day, no approved-leave
conflict, no duplicate timesheet for that date, valid times, valid House,
initials match, sign-off confirmed. Future dates are rejected. The same
validation functions run in the UI and in `lib/hrm.js`, so the two can never
disagree.

**No Admin approval step for worked hours.** Once a valid timesheet is
submitted it is immediately final with status **Completed** — there is no
"Awaiting approval" status and nothing for an Admin to approve or deny on a
worked-hours timesheet. "My Hours" and the Admin's "Timesheet & Hours Audit"
both show the **Completed** badge for these rows. A day with **approved
leave** (Sick/Vacation/Bereavement) still shows that leave type as the
status badge instead, with Start, End and Hours displayed as "—", and a
timesheet still cannot be submitted for a day already covered by approved
leave. Completed hours roll straight into the Dashboard's **Hours today**,
**Hours this week**, and **Hours this month** totals, and into "My Hours"
and every Admin report/export.

### "Incomplete Timesheet" outstanding items are computed live, not seeded
The Dashboard's "Outstanding items" never stores a fixed "you're missing a
timesheet" card. Instead, every time the Dashboard loads it checks, for each
of the employee's own shifts:
- **Has the shift actually ended?** A same-day shift counts once its end
  time has passed (e.g. after 3:30 PM for a 1st Shift); the overnight 3rd
  Shift only counts once its end time has passed on the *next* calendar day.
  A future shift, or today's shift while still in progress, is never shown.
- **Is there already a submitted timesheet for that date?** If so, nothing
  is shown - there is no separate "done" flag to flip, because the item
  simply stops being computed the instant a real timesheet record exists.
- **Is that date covered by approved leave** (Sick/Vacation/Bereavement)?
  If so, it is excluded even though no timesheet was submitted, since the
  employee wasn't expected to work.

Each item's "Submit Timesheet" button goes straight to the Timesheets page
with that date pre-filled. This logic lives in `incompleteTimesheetItems()`
in `lib/hrm.js` and is shared by the Dashboard, "My Hours", and the Admin's
"Timesheet & Hours Audit" and Reports pages, so all four always agree.

### "My Hours" is a till-date record, not a forward planner
"My Hours" never shows a row for a date after today - not a future
scheduled shift, and not even a future date that happens to fall inside an
approved leave request (e.g. an upcoming vacation next month). The "Around
date" picker itself cannot be set past today, so browsing by week, month or
year always stays on or before the current date. This is the
`tillToday()` helper in `lib/hrm.js`, applied only on "My Hours" - the
Admin's Reports and Audit Trail deliberately keep future-dated approved
leave visible, since Admin needs it for staffing/planning.

## Shift Swap
Two supported flows, both restricted to the same House and to **future
dates only** (today and past dates are excluded from every shift picker):
- **Direct Swap (Exchange)** — Employee A gives up their shift and takes a
  **specific shift of Employee B's in return** (e.g. A's 1st Shift for B's
  2nd Shift on the same date). Both schedules change on approval.
- **Cover-Only** — Employee A hands off their shift to Employee B with no
  return shift. This requires B to actually be **off** that day: if B
  already has a *different* shift scheduled on that same date — even one
  that doesn't overlap in time, like a 1st Shift and a 2nd Shift — the
  request is blocked with *"{cover} is already scheduled to work a
  different shift on {date}. Choose a shift of theirs to take in return to
  set up a Direct Swap instead."* This is the same rule the seed data is
  built to demonstrate: each House has one date where two employees are
  both already scheduled (a Direct Swap candidate) alongside plenty of
  dates where the co-worker is genuinely free (a Cover-Only candidate).

Before submitting, a **Current Schedule vs Proposed Schedule** preview shows
exactly what changes for both people. Validated at submission time
(ownership, future dates only, no self-swap, reason required, cover has no
leave/overlap conflict, no existing open swap on the shift, cover must
belong to the shift's House, cover must be off for a Cover-Only request)
**and re-validated again in full when Admin clicks Approve**, since the
schedule may have changed in the meantime — a stale approval is blocked with
a specific reason (e.g. "X is not assigned to House Y" or a scheduling
conflict). Admin can also require training before approving. On approval,
both employees' schedules update immediately (both sides for a Direct Swap,
one side for a Cover-Only request), both people are notified, and it's
written to the Audit Trail.

## Reports (Admin only)
Filter by **Employee**, **House**, and **Date range, Month, or Year** (pick
the filter mode and the matching date controls appear). Shows, for the
selected window:
- Hours worked per employee and per House.
- Leave usage broken out by **all four types** — Vacation, Sick,
  Bereavement, and Work Excuse — both per employee and as an org-wide total.
- Employees with incomplete timesheets, and requests still awaiting a
  decision.
- A full **Leave requests** audit list for the same filters: every leave
  record (any status) with Employee, House, Type, From, To, Hours, Status,
  Decided by, and Remarks — this is the leave-record-level audit view.

Two separate **Export to Excel** (CSV) buttons: one for the per-employee
summary (hours worked plus all four leave-type totals), and one for the
detailed leave-requests list — so both the aggregate and the individual
records leave the app in a form Excel can open directly.

## Audit Trail (Admin only)
Every mutating action — leave submit/approve/deny, swap submit/approve/deny,
training required, timesheet submit, employee add/update — is appended to a
server-side audit log with who did it, what changed, the target, and a
timestamp. Employees never see this log (their API view always returns an
empty audit list).

## Employee Management (Admin only)
Add a new employee (name, email, position, House, PIN) or deactivate /
reactivate an existing one, from a dedicated Admin page — enforced
server-side as Admin-only.

## API security / data privacy
Every API route re-checks role and ownership on the server — the UI never
"decides" access on its own:
- Employee-only endpoints (leave/swap **decision**, Reports, Audit Trail,
  Employee Management) return **403** for an Employee caller.
- `GET /api/hrm` filters server-side per caller: an Employee only ever
  receives their **own** leave/swap/timesheet/todo records and their **own
  House's** schedule — other employees' private data is never sent to the
  client, even if the client tried to request it directly. An Admin
  receives the full state with employee PINs stripped from every record.

## Recruitment (Admin only)
Visible only inside the Admin Workspace; not present anywhere in the
Employee Workspace, and not reachable by an Employee even by direct
API/page access.

## Project map
- `app/page.js` — UI: login, dashboards, schedules, leave, swap, timesheets,
  Employee Management, Reports, Audit Trail (all role-gated)
- `app/api/hrm/route.js` — main state feed (privacy-filtered per caller)
- `app/api/swaps`, `app/api/swaps/[id]` — swap create / approve-deny (with recheck)
- `app/api/leave`, `app/api/leave/[id]` — leave create / approve-deny
- `app/api/timesheets`, `app/api/timesheets/verify` — timesheet submit / PIN sign-in
- `app/api/todo` — outstanding items
- `app/api/employees`, `app/api/employees/[empId]` — Admin employee management
- `lib/hrm.js` — all business rules: permissions, validation, swap/leave/timesheet
  logic, audit logging, employee management (single source of truth, shared by
  UI and API)
- `lib/data.js` — HOUSES, USERS/EMPLOYEES/ADMIN, seed schedule/leave/timesheets/todo
- `lib/dates.js` — local-clock date/time helpers (no UTC bugs)
- `lib/store.js` — in-memory server store (resets on server restart)
- `tests/` — Vitest: `hrm.test.js` (business rules), `api.test.js` (routes,
  role security, privacy), `dates.test.js` (date helpers)
- `app/globals.css` — styles (cards, badges, tables, toasts, responsive layout)

Data is kept on the server in memory and resets when you restart the server.
For production: replace the hardcoded login with real authentication (e.g.
Microsoft Entra ID) and persist state in a database instead of memory.
