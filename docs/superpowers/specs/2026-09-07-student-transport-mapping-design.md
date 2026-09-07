# Student Transport Mapping — Design Spec

Date: 2026-09-07
Status: Approved (pending implementation plan)

## Problem

Today, admins can add/edit a student, and separately manage transport
(routes, stops, buses) — but there is no way to map a student to school
transport (route, stop, bus, and a transport fee tag) as part of the
Student Add/Edit flow. The only student-to-bus mapping surface today
is the per-bus roster modal (`BusRidersModal` in `operations.tsx`),
which requires navigating to the Transport module and picking a bus
directly, bypassing route/stop selection.

Additionally, `StudentTransport_OptIn`/`StudentTransport_OptOut` stored
procs exist in the database (migration M0107) but are wired to zero
API endpoints — there is currently no admin-facing way to opt a
student in or out of transport at all.

## Goals

- Let an admin complete transport mapping (opt-in, fee head, route,
  stop) while adding or editing a student — no separate trip to the
  Transport module required for the common case.
- Student admission must never fail because of bus capacity. Bus
  assignment is best-effort; a student can be saved as "opted in,
  route/stop selected, no bus yet" (**Pending Bus Assignment**).
- Reuse existing Finance (`FeeHeads`) and Transport (`TransportRoutes`,
  `RouteStops`, `Buses`, capacity enforcement) structures. Do not
  create a new Transport Fee Plan entity or pickable fee amounts.
- Provide a new Transport Students list so admins can see mapping
  status across all opted-in students and act on pending ones.
- Do not change or regress existing Student Add/Edit or Finance
  behavior.

## Non-goals

- No new Finance pricing/invoice concepts. `FeeHeads` remains a plain
  named category with no amount.
- No change to how buses are assigned a route, or to existing
  Transport module bus/route/stop management screens beyond what's
  needed to support the new list's manual-assign action.
- No bulk/CSV student transport mapping (a possible future project,
  out of scope here).

## Data model changes

All changes are additive (new migration in `sms-backend`).

### `StudentBusAssignments`

| Column | Change |
|---|---|
| `BusId` | Make **nullable** (was `NOT NULL`). `NULL` = opted in, route/stop chosen, no bus assigned yet ("Pending Bus Assignment"). |
| `RouteId` | **New column, `uuid NOT NULL`.** The route is chosen before a bus exists, so it must always be present once a row exists at all. |
| `FeeHeadId` | **New column, `uuid NULL`.** Nullable — a school may not have configured a transport fee head yet; don't force selection. |
| `StopId` | Unchanged (already nullable). |

The existing unique constraint `(TenantId, StudentId)` is unchanged —
a student has exactly one transport-mapping row (whether or not a bus
is assigned), matching the current "opted in ⇒ at most one row" model.

### `FeeHeads`

| Column | Change |
|---|---|
| `IsTransportFeeHead` | **New column, `bit NOT NULL DEFAULT 0`.** Admin marks one or more existing fee heads as transport-eligible in Fee settings. Student Add's Transport Fee dropdown filters on this flag. |

No new tables. `StudentTransportOptOut` is reused as-is (no schema
change needed there).

## Backend API / service changes

### `PUT /v1/students/{id}/transport`

Body: `{ optedIn: bool, routeId?: guid, stopId?: guid, feeHeadId?: guid }`

- `optedIn: false` → call `dbo.StudentTransport_OptOut` (existing
  proc — inserts the opt-out row **and** deletes any
  `StudentBusAssignments` row for the student, so this single call
  handles "remove assignment + opt-out state" together, per the
  existing proc's behavior). Return `{ optedIn: false }`.
- `optedIn: true`:
  1. Validate `routeId` is required (400 if missing — route is
     mandatory for opt-in, per the `NOT NULL` schema decision above).
  2. If `feeHeadId` is provided, validate server-side that it
     references a `FeeHeads` row for this tenant with
     `IsTransportFeeHead = 1`. Reject with 400
     `invalid_fee_head` if not — **do not rely on frontend filtering
     alone**, since the endpoint is a trust boundary.
  3. Call `dbo.StudentTransport_OptIn` (clears any opt-out row).
  4. Upsert the `StudentBusAssignments` row with `RouteId`,
     `StopId`, `FeeHeadId` (via a new/extended proc, e.g.
     `StudentBus_AssignPending` or an extended `StudentBus_Assign`
     that accepts `BusId = NULL`).
  5. Attempt auto-assignment (below). Return:
     - On success: `{ optedIn: true, assigned: true, busId, routeId, stopId, feeHeadId }`
     - On no capacity: `{ optedIn: true, assigned: false, status: "pending", pendingReason: { code: "no_capacity", message: "No bus currently has available capacity on this route." }, routeId, stopId, feeHeadId }`
  - This call **never returns a hard failure for capacity** — only
    for validation errors (bad route/stop/fee-head references) or
    genuine server errors.

### Auto-assignment logic (extends `StudentBusService`)

- Query buses where `Buses.RouteId = @routeId` and tenant matches.
- For each candidate, compute free seats: `Capacity IS NULL` ⇒
  treated as unlimited (always eligible, effectively infinite free
  seats for ranking purposes); otherwise `free = Capacity - Occupied`.
- Filter to buses with `Capacity IS NULL OR free > 0`.
- **Least-loaded selection**: pick the bus with the highest `free`
  seat count (unlimited-capacity buses sort first/highest, ties
  broken by bus id for determinism).
- If a bus is found: call existing `StudentBus_Assign` (now also
  passing `RouteId`/`FeeHeadId` through to the upsert), return
  `assigned: true`.
- If none found: upsert the `StudentBusAssignments` row with
  `BusId = NULL`, return `assigned: false` / pending.

### `FeeHeadController`

- Create/update payloads accept `isTransportFeeHead: bool`.
- `GET /fees/heads` response includes `isTransportFeeHead` so the
  frontend can filter the Student Add dropdown.

## Frontend changes

### Student Add/Edit (`StudentFormScreen`)

New **Transport** section, placed after existing sections, before
save:

```
Uses School Transport: [ No | Yes ]

  (if Yes)
  Transport Fee Head: [ dropdown, filtered isTransportFeeHead=true ]
  Route:              [ dropdown, existing TransportRoutes ]
  Pickup Stop:        [ dropdown, filtered to selected route,
                         reuses useRouteStops(routeId) ]
```

- If no `FeeHeads` have `isTransportFeeHead = true`, the dropdown
  shows empty/disabled with a hint ("No transport fee head configured
  — ask your admin to mark one in Fee settings"). Selection stays
  optional; this never blocks opt-in.
- Save sequencing mirrors the existing best-effort extras pattern in
  `studentAdd.tsx`:
  1. `createStudent`/`updateStudent` runs first, exactly as today —
     unaffected by anything in the Transport section.
  2. On success, call `PUT /v1/students/{id}/transport` with the
     section's current state (`optedIn`, `routeId`, `stopId`,
     `feeHeadId`).
  3. If the call reports `assigned: false` (pending), show
     `toast.warning("Student added. No bus currently has capacity on
     this route — bus assignment is pending.")`.
  4. If the call hard-fails (network/500), show the same
     "saved but transport failed" toast pattern already used for
     extras — **never blocks navigation** to the student profile.
- **Yes → No** (on edit): call the endpoint with `optedIn: false`,
  which removes the existing assignment row and sets opt-out state
  (per the proc's existing behavior).
- **No → Yes** (on edit): call with `optedIn: true` and the
  newly-entered route/stop/fee-head — creates a fresh mapping row and
  attempts assignment, exactly like the Add flow.

### Transport Students list (new screen, `school.transport.students`)

- **Default filter: opted-in students only** (students with a
  `StudentBusAssignments` row; opted-out students are excluded by
  default, not shown with a third status).
- Columns: Student, Class/Section, Transport Fee Head, Route, Stop,
  Bus, Driver, Conductor, Capacity/status, Mapping status.
- Mapping status values (opted-in students only):
  - **Mapped** — `BusId IS NOT NULL`.
  - **Pending Bus Assignment** — `BusId IS NULL`.
- Filters: Route, Stop, Bus, Class, Transport Fee Head,
  Mapped/Pending.
- For a **Pending Bus Assignment** row, the admin gets two actions:
  - **Retry auto-assignment** — re-runs the same least-loaded
    auto-assign logic used at save time (useful after capacity opens
    up or a new bus is added).
  - **Select bus manually** — same direct-assign flow as the existing
    `BusRidersModal` "add a student" action, scoped to buses on the
    student's already-chosen route (still subject to the same
    server-side capacity check).

## Error handling summary

| Scenario | Behavior |
|---|---|
| Student create/update fails | Unchanged — existing validation/error handling, transport section not yet touched. |
| Transport opt-in, no capacity on route | Student save succeeds; row saved with `BusId = NULL`; warning toast; shows as Pending in the list. |
| Transport opt-in, invalid/foreign fee head | 400 `invalid_fee_head` from the endpoint — surfaced as a form error, does not affect the already-saved student record. |
| Transport call network/server error | Toast "saved but transport failed" (matches existing extras-save pattern); navigation to student profile proceeds. |
| Opt-out (Yes → No) | Assignment row deleted, opt-out row inserted — single proc call, no partial-failure case (single transaction). |

## Testing plan

- **Backend**: unit tests for (a) least-loaded bus selection including
  the `Capacity IS NULL` = unlimited case and tie-breaking, (b) nullable
  `BusId` upsert path, (c) `StudentTransport_OptIn/OptOut` wiring
  (currently has zero test coverage since unwired), (d) server-side
  `IsTransportFeeHead` validation rejecting a non-flagged/foreign fee
  head id.
- **Frontend**: extend `studentAdd.test.tsx` coverage — Transport
  section hidden fields toggle correctly on Yes/No, Route/Stop
  dropdowns filter correctly, pending-assignment toast renders on
  `assigned: false`, Yes→No and No→Yes edit transitions call the
  right payload. New test file for the Transport Students list
  (filters, status column, retry/manual-assign actions).
- Existing Student Add/Edit and Finance/Transport module test suites
  must continue passing unchanged — this is additive only.
