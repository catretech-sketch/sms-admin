# Browser SoT → SQL Production Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every CRM business feature currently backed by browser storage, migrate each to production API → SQL Server, then remove browser as Source of Truth.

**Architecture:** Extend existing `sms-backend` (ASP.NET + Dapper + FluentMigrator + RLS tenant policies). Do not invent EF Core. Reuse existing controllers/services where APIs already exist; add migrations + procs for gaps. Frontend must fail closed on API errors (no local business fallback success).

**Tech Stack:** sms-admin (React/TS), sms-backend (C# / Dapper / FluentMigrator / SQL Server), Vitest + xUnit integration tests.

## Global Constraints

- Never delete a business feature — migrate it.
- Never: API fail → localStorage save → Success toast.
- Browser SoT allowed only for theme/UI prefs/temp state.
- Tenant isolation via existing RLS + `ITenantContext`.
- AuthZ via existing `Policies.*`.
- Next migration id starts at **M0121**.
- Do not trust client-supplied tenant ids.
- Prefer improving existing endpoints over duplicates.
- Backend is Dapper (not EF) — user “EF migration” means FluentMigrator + SQL.

## Module order

1. Calendar (extend existing + wire admin)
2. Houses (new)
3. Fee heads + structure (new) + remove fee LS fallbacks
4. Attendance (class/people/exam + alert config) — remove LS SoT
5. Timetable publish (API SoT; keep draft optional in-memory only until publish)
6. Academic periods + class tests (new)
7. Exam `class_ids` (extend exams)
8. Person extras + documents (new JSON + documents table)

---

### Task 1: Calendar DELETE + admin API client

**Files:**
- Create: `sms-backend/db/Sms.Migrations/M0121_CalendarEvent_Delete.cs`
- Modify: `CalendarRepository.cs`, `IAcademicsService.cs`, `AcademicsService.cs`, `CalendarController.cs`, `CalendarTests.cs`
- Modify: `sms-admin/src/api/calendarEvents.ts`, `src/screens/school/calendar.tsx`, tests

**Contracts:** Keep `GET/POST /v1/calendar`. Add `DELETE /v1/calendar/{id}` (Principal). Map admin fields: `title`, `date`, `type`, `description` ← `desc`. Channels/attachments stay announcement-side (already API).

- [ ] Add `CalendarEvent_Delete` proc + DELETE endpoint
- [ ] Integration test create → delete → list empty of that id
- [ ] Rewrite admin `calendarEvents.ts` to call API; remove localStorage SoT
- [ ] One-time migrate: on first load, if `sms_calendar_events:{tenant}` has rows, POST each then clear key
- [ ] Admin UI: await API before success; refetch list from GET

---

### Task 2: Houses catalog API

**Files:**
- Create: `M0122_SchoolHouses.cs`, Houses repo/contracts, controller endpoints (or Academics)
- Modify: `sms-admin/src/api/schoolHouses.ts`, academics houses UI

**API:** `GET/PUT /v1/houses` (replace list), or `GET` + `POST` + `PATCH` + `DELETE`. Prefer `GET /houses` + `PUT /houses` with `{ names: string[] }` for simplicity matching `saveSchoolHouses`.

- [ ] Table `dbo.SchoolHouses (Id, TenantId, Name)` + RLS + Replace proc
- [ ] Wire admin; migrate local `sms_houses:{tenant}` once then clear
- [ ] Remove local SoT

---

### Task 3: Fee heads + fee structure

**Files:**
- Create: `M0123_FeeHeads_Structure.cs`, repos, extend `FeeController`/`FeeService`
- Modify: `feeHeads.ts`, `feeStructure.ts`, `feeInvoices.ts`, `feePayments.ts` — remove 404 local fallback writes

**API (match admin clients):**
- `GET/POST /v1/fees/heads`, `PATCH/DELETE /v1/fees/heads/{id}`
- `GET/PUT /v1/fees/structure`
- Keep existing invoice/pay; improve pay body if needed; **no local generate on 404**

- [ ] Tables `FeeHeads`, `FeeStructures` (JSON amounts or child rows)
- [ ] Implement endpoints + tests
- [ ] Frontend: throw on missing API; migrate LS once via POST/PUT then clear
- [ ] Remove `saveLocal` as SoT (optional read-through cache OK only after successful GET)

---

### Task 4: Attendance — require API success

**Files:**
- Modify: `attendance.ts`, `peopleAttendance.ts`, `examAttendance.ts`, `attendanceAlerts.ts` (+ screens)
- Backend already has endpoints — verify only

- [ ] Remove write-on-404 local SoT
- [ ] People attendance: save only after `POST /staff-attendance` succeeds; local may cache after success
- [ ] Alert config: require `PUT /attendance/alert-config`
- [ ] Exam attendance: require `PUT /exam-papers/{id}/attendance`
- [ ] Update tests accordingly

---

### Task 5: Timetable publish = API SoT

**Files:**
- Modify: `academics.tsx` publish flow; optionally add `PUT /v1/timetable/replace` bulk in backend (`M0124`)
- Keep draft in localStorage **only as draft cache** OR memory — publish must succeed on API first

- [ ] Prefer bulk replace endpoint for atomic publish
- [ ] Toast success only after API OK; on failure keep draft, show error
- [ ] After publish, reload from `GET /timetable`

---

### Task 6: Academic periods + class tests

**Files:**
- Create: `M0125_AcademicPeriods_ClassTests.cs` + APIs
- Modify: `academicsPublish.ts` consumers / PeriodsTab / TestsTab

**API:**
- `GET/PUT /v1/academic-periods` (JSON schedule rows)
- `GET/POST/PATCH/DELETE /v1/class-tests` (or publish snapshot `PUT /v1/class-tests/publish`)

- [ ] Migrate `sms_academics_pub:*:periods|tests` once
- [ ] Remove publish SoT from localStorage

---

### Task 7: Exam class_ids

**Files:**
- Create: `M0126_ExamClassIds.cs` (junction `ExamClasses`)
- Modify: Exam create/update contracts + `exams.ts` / `examClasses.ts`

- [ ] Persist class ids on create/update; stop stripping from wire
- [ ] Migrate `sms_exam_classes:*` once
- [ ] Remove local SoT

---

### Task 8: Person extras + documents

**Files:**
- Create: `M0127_PersonExtras_Documents.cs`
- APIs: `GET/PUT /v1/students/{id}/extras`, same for teachers/staff; `POST .../documents` upload returning URL
- Modify: `studentExtras.ts`, `teacherExtras.ts`, `staffExtras.ts`, add forms

- [ ] Store extras JSON + document metadata/URLs (reuse photo upload patterns)
- [ ] Migrate local extras keys once
- [ ] Remove local SoT (cache after GET OK only)

---

### Task 9: Verification matrix + deliverable table

- [ ] Run admin vitest + backend integration tests for touched modules
- [ ] Fill DONE/PARTIAL/BLOCKED table in final response
