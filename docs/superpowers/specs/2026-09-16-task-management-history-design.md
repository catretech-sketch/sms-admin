# Task Management + Role-wise / Person-wise Task History — Design

**Date:** 2026-09-16
**Status:** Draft, pending review
**Scope:** **sms-backend + sms-admin.** No sms-staff (mobile) changes — the existing
`/staff/tasks`, `/staff/tasks/{id}/complete`, `/staff/tasks/{id}/photo` contract the mobile app
consumes is untouched. This spec extends the CRM-facing (manager) surface only.

## 1. Objective

Turn the existing "Staff tasks" tab in `sms-admin` Operations → Communication into a full **Task
Management** experience: an admin can see a person's complete task history, a role's aggregate
task load, and drill down Role → Person → History, using real persisted backend data only. No new
audit/event system, no fabricated timeline events, no duplicate task API surface.

## 2. Ground truth (confirmed by investigation this session)

- `dbo.Tasks` columns: `Id, TenantId, Title, Detail, Category, AssignedToUserId,
  AssignedToRoleKey, Priority, Status, DueDate, Remarks, PhotoUrl, CreatedByUserId,
  CompletedByUserId, CreatedAt, CompletedAt`
  (`sms-backend/src/Sms.Modules.Tasks/TaskModule.cs`). `DueDate` is the only deadline field —
  real, persisted, usable for Overdue.
- `TaskEnums.ValidStatuses = ["pending", "in_progress", "completed"]`. **`in_progress` is
  currently unreachable** — no code path ever sets it; the only real transition is
  `pending → completed` via `Task_Complete`. There is **no `Cancelled` status** in the schema.
- `TaskEnums.ValidRoleKeys = ["driver", "conductor", "sweeper", "gardener", "guard", "peon"]` —
  the only six duty-role keys; a task assigned to a role is validated against exactly this list.
  A task can *also* be assigned to one specific `AssignedToUserId` of **any** staff role (the
  existing "New task" modal allows picking any staff member, not just the six duty roles).
- No reassignment path exists (`AssignedToUserId`/`AssignedToRoleKey` are set once at
  `Task_Create`, never mutated after). No `StartedAt` column. `dbo.AuditLogs`
  (`M0173_AuditLogs_Table.cs`) exists but nothing in the Tasks (or Issues) code path writes to it
  — dead infrastructure, out of scope here.
- `GET /v1/staff/tasks/all` (`TaskController.cs`, manager-only via `RoleChecks.IsTaskManager`)
  returns **all** tenant tasks, unfiltered, unpaginated, via `TaskRepository.ListAllAsync`.
- `TaskResponse` has no resolved names — `AssignedToUserId`/`CreatedByUserId`/
  `CompletedByUserId` are bare GUIDs. The sms-admin frontend model
  (`src/api/tasks.ts: StaffTask.assignedToUserName`) **already has an optional name field that the
  backend never populates** — this spec closes that gap rather than inventing a new one.
- `StaffResponse` (`StaffingContracts.cs`) has no `UserId` field, even though `dbo.Staff.UserId`
  exists and is already joined internally for other lookups — it's just never selected into the
  response DTO.
- `ReportingRepository` establishes the existing aggregate-query convention: raw Dapper SQL,
  `conn.QueryMultipleAsync`, `CASE WHEN ... SUM(...)` breakdowns, no explicit `TenantId` filter in
  SQL (relies on RLS session context).
- `CursorPage<T>` (`Sms.Shared.Kernel/Http/ErrorEnvelope.cs`) is a thin
  `record CursorPage<T>(IReadOnlyList<T> Data, string? NextCursor)` — declared but never really
  implemented (every existing repo returns `NextCursor: null`). This spec is its first real use.
- `RoleChecks.IsTaskManager` / `IsIssueManager` both now delegate to a shared
  `IsManagerTier` (SchoolAdmin/SchoolOwner/Principal/PlatformOnly exact match) — added during this
  session's Issues-branch merge. No narrower "read-only" tier exists; task visibility is binary
  manager/non-manager today, and this spec keeps it that way.
- Frontend drill-down precedent: `IssueDetailDrawer` (`operations.tsx`) uses local component state
  (`selectedIssueId`) + a `<Drawer>` component, fetching detail via `useIssue(id)` — no router
  route change. This spec's Person Detail follows the identical pattern.
- `PERMS.staffTasks` (`src/lib/mockDb.ts`) already gates `admin`/`principal`/`vice_principal` to
  `['V','E']` and `teacher`/`staff` to `[]` — reused as-is for the new sub-views.

## 3. Decisions (resolved with user, not invented)

1. **Timeline honesty**: only two real events exist — **Assigned** (`CreatedAt`) and
   **Completed** (`CompletedAt`, when present). No Started/Reassigned/Cancelled events are shown
   or fabricated. A future `TaskActivity`/audit table is explicitly out of scope.
2. **Overdue**: derived on read, never stored — `Status != 'completed' AND DueDate < today`. A
   task can move in/out of "overdue" purely by the clock.
3. **Completion rate**: `Completed ÷ Total` tasks assigned to that person/role in the selected
   window. Nothing is excluded (there is no Cancelled status to exclude).
4. **Pagination**: bounded default window (e.g. This Week) returns the full result in one call;
   wider ranges (This Month/Last Month/All Time/custom) use real keyset pagination on
   `(CreatedAt DESC, Id DESC)` via `CursorPage<T>`.
5. **People scope**: every staff member holding one of the six duty roles (shown even with 0
   tasks, since they're broadcast-eligible) **UNION** any other staff member directly assigned
   ≥1 task. Roles view stays limited to the six duty-role keys (the only real "role" grouping the
   Task data model has).
6. **"History" is not a separate tab** — once "All Tasks" has date-range filters, it *is* the
   history view. Top-level structure is **All Tasks | People | Roles**, not four sections.

## 4. Backend changes

### 4.1 Extend `GET /v1/staff/tasks/all` (no new generic history endpoint)

New optional query params, all additive — **zero params behaves exactly as today**:

| Param | Type | Effect |
| --- | --- | --- |
| `status` | `pending\|in_progress\|completed` | Exact match |
| `assigned_to_user_id` | guid | Exact match on `AssignedToUserId` |
| `assigned_to_role_key` | one of the six keys | Exact match on `AssignedToRoleKey` |
| `from` | date | `CreatedAt >= from` |
| `to` | date | `CreatedAt <= to` |
| `cursor` | opaque | Keyset continuation, `(CreatedAt, Id)` |

Serves All Tasks (existing table + new filters), Person Detail (`assigned_to_user_id` + range),
and Role→People pre-filter (`assigned_to_role_key`) — one code path, no duplicate endpoint.

### 4.2 `TaskResponse` — additive fields only

Add `AssignedToUserName`, `CreatedByUserName`, `CompletedByUserName`, resolved via `LEFT JOIN`
against `dbo.Staff`/`dbo.Users` (LEFT, so a task never disappears for a missing optional
identity). No existing field changes meaning or shape.

### 4.3 `StaffResponse` — add `UserId`

Select the already-joined `dbo.Staff.UserId` into the response. Purely additive; existing
`useStaff()` consumers unaffected.

### 4.4 New: `GET /v1/staff/tasks/summary/people`

Raw-Dapper aggregate, `ReportingRepository`-style, tenant-scoped via RLS. One row per person in
scope (§3.5): `UserId, StaffId, Name, DutyRoleKey, TotalTasks, PendingTasks, CompletedTasks,
OverdueTasks, LastActivityAt`. `OverdueTasks` computed via the `DueDate` predicate in §3.2 — never
fabricated if `DueDate` were absent (it isn't; it's a real column).

### 4.5 New: `GET /v1/staff/tasks/summary/roles`

Same convention, one row per `TaskEnums.ValidRoleKeys` entry (exactly six, tenant-scoped
headcount): `RoleKey, Headcount, TotalTasks, PendingTasks, CompletedTasks, OverdueTasks,
LastActivityAt`. No `RoleName` field — the friendly label ("Cleaner" for `sweeper`, etc.) already
lives in the frontend's `STAFF_DUTY_ROLE_LABELS` map (`src/api/tasks.ts`); duplicating it
server-side would just be a second source of truth that can drift.

### 4.6 RBAC

All four endpoints (extended list + 2 summaries + StaffResponse UserId is inside the existing
gated `/staff` endpoint already) gated by existing `RoleChecks.IsTaskManager`/`IsManagerTier`. No
new tier introduced.

## 5. Frontend changes (sms-admin)

- Rename `StaffTasksTab` tab label "Staff tasks" → "Task Management"; inner sub-tabs **All Tasks |
  People | Roles**.
- **All Tasks**: existing table, filters moved server-side (status/role/assignee/date-range),
  replacing today's client-side status-only filter. Existing create/search/status-update behavior
  preserved.
- **People**: card/table from `summary/people`; click → `PersonDetailDrawer` (new, modeled on
  `IssueDetailDrawer`) — summary cards, quick-range chips (Today/Yesterday/This Week/This
  Month/Last Month/All Time/Custom), 2-event timeline from the extended list endpoint filtered by
  `assigned_to_user_id`.
- **Roles**: cards from `summary/roles`; click a role → People view pre-filtered by
  `assigned_to_role_key` → same `PersonDetailDrawer` on person click. No duplicated component —
  both drill-down paths render the identical `PersonDetailDrawer`.
- New API modules: extend `src/api/tasks.ts` (filter params, name fields already declared),
  add `listPeopleSummary`/`listRoleSummary` + hooks in `src/api/hooks/useTasks.ts`.

## 6. Testing

- Backend: integration tests extending the existing Task/Issue endpoint test pattern
  (`IssueEndpointTests.cs`) — no-filter backward-compat, each filter individually and combined,
  cursor determinism, resolved names, RBAC (authorized/unauthorized), tenant isolation on all
  three endpoints, empty results.
- Frontend: extend `operations.test.tsx` — regression on existing create/status/search, new
  filters, People rendering + counts, Drawer open/close, Roles→People→Person flow, empty/loading/
  error states, no duplicate requests.
- Full backend + frontend build and typecheck.

## 7. Explicitly out of scope

- Any new `Status` value (`cancelled`, etc.) or `StartedAt` column.
- Any reassignment feature or event.
- A generic `TaskActivity`/audit table (future work if deeper history is ever needed).
- sms-staff (mobile) changes of any kind.
