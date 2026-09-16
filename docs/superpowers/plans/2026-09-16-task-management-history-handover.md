# Task Management / Role-wise / Person-wise Task History — Handover

**Date:** 2026-09-16
**Status:** Implemented. Backend uncommitted on `phase-0-foundation` until this wrap-up commit; frontend on `feat/task-management-history`.
**Spec:** `sms-admin/docs/superpowers/specs/2026-09-16-task-management-history-design.md` (approved — source of truth for scope/decisions).

---

## Current state (2026-09-16 evening)

Backend (`D:\SMS\sms-project\sms-backend`, branch `phase-0-foundation`):

- `GET /v1/staff/tasks/all` filters + cursor pagination, resolved `*UserName` fields
- `GET /v1/staff/tasks/summary/people` and `.../summary/roles`
- `StaffResponse.UserId` selected on list/get
- Dapper record constructors: `TaskResponse` 16-col proc ctor; `StaffResponse` 16-col proc ctor
- **GET /v1/staff 500:** `s.UserId` was selected *before* `PhotoUrl`, so Dapper's constructor type sequence was `..., Email, UserId, PhotoUrl` vs `..., Email, PhotoUrl, UserId`. Fixed by selecting `s.UserId` last (same order as `TeacherRepository.ListAsync`)
- Task integration tests: 40 passed. Staff list/create: `List_staff_ok_on_platinum_plan` and `Staff_create_and_list_filter_by_category` passed

Frontend (`sms-admin`, branch `feat/task-management-history`):

- Communication tab **Task Management** with **All Tasks | People | Roles**
- Server-side status/role/assignee/date-range; client search on the loaded page
- New task assigns by login `userId`, skips staff with no login
- Person drawer: summary cards, date chips, Assigned + Completed only
- Roles → People (role filter) → same drawer
- Typecheck + production build passed; task/issues UI tests 41 passed

**Not live-verified in the browser** (login wall; port 5162 held by another session). Restart `Sms.Api` from this backend tree, then Communication → Task Management.

**Rulings:** `PersonTaskSummary` has no `StaffId` (UI keys off `userId`). All Tasks defaults to All Time; Person detail defaults to This Week. Person history is `assigned_to_user_id` only — role broadcasts count on People cards but not in that person's timeline.

---

## Addendum (earlier same day) — Task_Create root cause + GET /v1/staff

`TaskResponse` is a C# record. Optional trailing `*Name` fields still produce a 19-parameter constructor. `Task_Create`/`Task_Complete`/`Task_AttachPhoto` return the original 16 columns, so Dapper cannot materialize the row. Fix: explicit 16-parameter constructor delegating to the primary with null names. Same class of bug on `StaffResponse` for `Staff_Create` (proc stops at `PhotoUrl`).

Live `GET /v1/staff` 500 was a **column-order** mismatch after adding `UserId` in the middle of the SELECT (before `PhotoUrl`), not a stale binary. SignalR hub failure was likely downstream of that 500.

---

## 6. Quick reference

- Six canonical duty-role keys: `driver, conductor, sweeper, gardener, guard, peon`
- Manager-tier RBAC: `RoleChecks.IsTaskManager` / `IsManagerTier`
- Overdue = derived: `Status != 'completed' AND DueDate < today`
- Completion rate = `Completed ÷ Total` in the selected window
- Cursor pagination: keyset on `(CreatedAt DESC, Id DESC)`, page size 200
