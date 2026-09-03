# Bus capacity enforcement — design

## Context

This is sub-project A of a larger route-based transport redesign ask. The
full ask ("Student → Route → Stop → Bus, auto-resolved, with capacity
validation, route sections, a transport dashboard, and a student transport
profile") was decomposed into independent sub-projects because most of the
target hierarchy already exists:

- `TransportRoutes` + ordered `RouteStops` (route → stops, already real)
- `Buses.RouteId` / `DriverStaffId` / `ConductorStaffId` (bus → route,
  driver, attendant)
- `StudentBusAssignments` — already enforces one active assignment per
  student (unique constraint on `TenantId, StudentId`), already carries an
  optional `StopId`
- `BusDriverAssignments` — full audit history of driver/conductor changes
- Tenant RLS security policies on every transport table

The one genuine, load-bearing gap that blocks everything else in the larger
ask is: **buses have no capacity, and nothing stops over-assigning a bus.**
This spec covers only that gap. Route sections, the route-centric assignment
UX, the student transport profile, and the transport dashboard are separate
sub-projects to be brainstormed individually afterward.

## Goal

A bus can optionally have a capacity. Assigning a student to a bus that is
already at capacity is rejected with a clear error — never silently allowed.
Buses with no capacity set behave exactly as today (unlimited).

## Non-goals

- Route sections / multiple buses per route (separate sub-project)
- Route-centric assignment UX (student → route → stop → auto-resolved bus)
  (separate sub-project)
- Transport dashboard / fleet-wide warnings (separate sub-project)
- Student transport profile UI (separate sub-project)
- Broadening "attendant" beyond `Staff` to include `Teachers` (flagged as an
  open question in the parent ask; not addressed here)

## Approach

Enforce capacity in the C# service layer (`StudentBusService.AssignAsync`),
not in SQL. Every other validation in this service (`not_found`,
`forbidden`, feature-gate checks) already happens here, before the DB call,
returning `ApiResult.Fail(new Error(...), statusCode)`. A capacity check
fits that exact pattern. The alternative — raising inside
`StudentBus_Assign` and catching/parsing `SqlException` in the repository —
would be more atomic under concurrent writes, but nothing else in this
codebase parses SQL errors, and transport assignment volume doesn't justify
introducing that pattern here.

## Database changes

New migration (`sms-backend/db/Sms.Migrations`):

- `ALTER TABLE dbo.Buses ADD Capacity int NULL` (nullable — existing buses
  stay unenforced until an admin sets a value; no backfill/default).
- `Bus_Create` and `Bus_Update` procs (both already re-declared in
  `M0169_DriverProfileFields_AssignmentHistory.cs`): add an optional
  `@Capacity int = NULL` parameter, persist it, and include `Capacity` in
  the result row each proc already `SELECT`s.

No changes to `StudentBus_Assign` — it stays a plain upsert; the capacity
check happens before it's called.

## API / service changes

`Sms.Modules.Transport`:
- `CreatedBusRow`, `UpdatedBusRow`, `TransportBusResponse`, `FleetBusResponse`:
  add `int? Capacity`.
- `BusRepository`: add
  `Task<(int? Capacity, int Occupied)> GetCapacityAndOccupancyAsync(Guid busId, CancellationToken ct)`
  — one query, `Capacity` from `Buses`, `Occupied` as
  `COUNT(*) FROM StudentBusAssignments WHERE BusId = @busId`.

`Sms.Application.Services.Transport.StudentBusService.AssignAsync`:
after the existing `bus`/`student` existence checks and before calling
`repo.AssignAsync`:

```
var (capacity, occupied) = await busRepo.GetCapacityAndOccupancyAsync(busId, ct);
var alreadyOnThisBus = await repo.IsStudentOnBusAsync(studentId, busId, ct); // new small helper
if (capacity is int cap && occupied >= cap && !alreadyOnThisBus)
    return ApiResult.Fail(new Error("capacity_reached", $"Bus capacity reached ({occupied}/{cap})"), 409);
```

`alreadyOnThisBus` exists so that re-saving a student who is already seated
on this exact bus (e.g. changing only their stop) never false-blocks on a
full bus.

Controllers/DTOs elsewhere (`TransportController`) need no signature
changes — `AssignStudentBusRequest` is unchanged; only the response shapes
gain the new optional `Capacity` field, which is additive.

## Frontend changes (`sms-admin`)

`src/api/transport.ts`:
- `CreateBusInput`, `UpdateBusInput`: add `capacity?: number | null`.
- `TransportBus`, `FleetBus`: add `capacity?: number | null`.
- `createBus`/`updateBus`: pass `capacity` through in the request body
  (snake_case mapping already handled by the existing `camelToSnake`
  helper).

`src/screens/school/transport.tsx` (`BusEditModal`):
- Add an optional "Capacity" number field alongside Bus number/Route.
  Empty = unlimited (send `null`).

`src/screens/school/transport.tsx` (`TransportBusesBody` table):
- Add a "Capacity" column rendering `${studentsAssigned} / ${capacity ?? '∞'}`.

`src/screens/school/operations.tsx` (`BusRidersModal`):
- Show the bus's occupied/capacity next to the existing rider list.
- Disable the "Assign" action when `ridersQ.data.length >= bus.capacity`
  (proactive UX — avoids a round trip for the common case).
- The existing `onError: (e) => toast.danger(...)` handler already surfaces
  the 409's message verbatim, so no new error-handling code is needed for
  the case where the proactive check is stale (e.g. two admins assigning
  concurrently).

`FleetBus` (used by `BusRidersModal`) needs `capacity` added too, since
that modal takes a `FleetBus`, not a `TransportBus`.

## Validation rules (summary)

- `Capacity` is optional; `NULL` means unlimited (unchanged/back-compat
  default for every existing bus).
- A student can never be assigned to a bus at or over capacity, unless
  they are already assigned to that same bus (stop-only edits never
  false-block).
- No change to the existing "one active bus per student" constraint —
  this spec doesn't touch `StudentBusAssignments`' unique key.

## Testing

Backend (`tests/Sms.Tests.Integration/Transport`, alongside the existing
`BusAssignedTests.cs`):
- Assign under capacity succeeds.
- Assign at capacity fails with 409 and the capacity_reached error code.
- Bus with `Capacity = NULL` always succeeds regardless of occupancy.
- Re-assigning (e.g. stop change) a student already on a full bus succeeds.

Frontend (`src/api/transport.test.ts`, extending the existing
`createBus`/`updateBus` tests):
- `capacity` passed through on create.
- `capacity` passed through (including explicit `null` to clear it) on
  update.

## Remaining risks

- Capacity check has a small TOCTOU race under concurrent assignment
  requests for the same bus (two admins assigning the last seat at once).
  Accepted per the design approach above — matches the precision level of
  existing similar checks in this codebase (e.g. the driver/conductor
  "steal from another bus" logic in `Bus_Update`), and transport-admin
  write volume is low.
- This does not address route sections or the route-centric assignment
  flow from the original ask — those remain separate, unscoped
  sub-projects.
