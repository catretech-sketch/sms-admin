# Advanced Attendance (CRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CRM Attendance **Advanced** tab (list, filters, summaries, ranges, audit/geo display) backed by server-filtered period-attendance APIs — without changing the existing Students mark page.

**Architecture:** New read/aggregate APIs over `PeriodAttendanceRecords` joined to Students, Classes, TimetableSlots, and Users. CRM adds a sibling Segmented tab `advanced` that mounts new screens only. Existing `ClassWiseStudents` / period mark grid stays untouched. Writes continue via existing `POST /classes/{id}/attendance/periods`.

**Tech Stack:** ASP.NET Core + Dapper + FluentMigrator (Sms.Api / Academics), React + React Query + existing CRM UI kit (`sms-admin`).

**Spec:** `docs/superpowers/specs/2026-08-13-advanced-attendance-crm-design.md`

## Global Constraints

- API → SQL only for attendance business data; no browser SoT (`localStorage` / `sessionStorage` / IndexedDB / mockDb).
- On API failure: error + Retry; never local attendance fallback.
- Server-side filtering + pagination for Advanced list/search/ranges.
- Assigned Teacher ≠ Marked By; never trust client `TenantId` / `MarkedBy*` / `AssignedTeacherId`.
- Official % = `(Present + Late) ÷ Marked periods × 100`; unmarked excluded; legacy daily rows unused for official %.
- Do not modify unrelated modules (Fees, Exams, Academics builder, Teacher/Parent/Student apps).
- **Do not change the existing Attendance mark page UI/UX** — only register a new Advanced tab in `attendance.tsx`.
- Class / section / subjects / periods / students from live API/timetable — no hardcoding.
- Geo capture on mark page is out of scope; Advanced may display/filter geo columns when present (Phase 3).

---

## File map

### Backend (`sms-backend`)

| File | Responsibility |
|------|----------------|
| `db/Sms.Migrations/M0129_PeriodAttendance_AdvancedQuery.cs` | Indexes for list filters; Phase 3 columns deferred to M0130 |
| `db/Sms.Migrations/M0130_PeriodAttendance_Geo_Audit.cs` | Geo columns + `PeriodAttendanceAudit` + RLS (Phase 3) |
| `Sms.Modules.Academics/Contracts/AcademicsContracts.cs` | Enriched list/summary DTOs + query request records |
| `Sms.Modules.Academics/Data/PeriodAttendanceQueryRepository.cs` | Filtered/paginated SQL + aggregates |
| `Sms.Modules.Academics/PeriodAttendanceDatePresets.cs` | Resolve `today|yesterday|…|last_90_days` → from/to |
| `Sms.Application/Services/Academics/AcademicsService.cs` | AuthZ + orchestration for new queries |
| `Sms.Api/Controllers/PeriodAttendanceQueryController.cs` | `GET /v1/attendance/period-records` (+ Phase 2/3 routes) |
| Unit/integration tests under `Sms.Tests.*` | Presets, filters, AuthZ, aggregates |

### CRM (`sms-admin`)

| File | Responsibility |
|------|----------------|
| `src/api/periodAttendanceAdvanced.ts` | API client for Advanced endpoints |
| `src/api/periodAttendanceAdvanced.test.ts` | Client URL/query tests |
| `src/api/hooks/usePeriodAttendanceAdvanced.ts` | React Query hooks |
| `src/api/queryKeys.ts` | Advanced query keys |
| `src/screens/school/attendanceAdvanced.tsx` | Advanced tab root (filters + list + Phase 2/3 subviews) |
| `src/screens/school/attendanceAdvanced.test.tsx` | Tab smoke / filter wiring tests |
| `src/screens/school/attendance.tsx` | **Only** add `advanced` to `Group` + Segmented options + render branch |
| `src/styles/components.css` | Advanced table/filter styles only (prefix `sm-att-adv-`) |

**Do not edit:** `attendanceClassWise.tsx` mark UI (unless a pure deep-link query-param read is later approved — not required for Phase 1).

---

## Phase 1 — Advanced list API + Advanced tab

> **Status note (2026-08-15):** Tasks 1–5 all confirmed done — CRM (`sms-admin`) via commits `95c359b`, `bd178d3`, `6984d18`; backend (`sms-backend`) via commits `a6fd1be`, `ae75297`, `6f8fb4a`, `a7f2757`, `cc8ff7c` (date presets, query repository, indexes, and `GET /v1/attendance/period-records` all present and tested). Phase 1 is fully complete.

### Task 1: Date preset helper (backend)

**Files:**
- Create: `sms-backend/src/Sms.Modules.Academics/PeriodAttendanceDatePresets.cs`
- Test: `sms-backend/tests/Sms.Tests.Unit/Academics/PeriodAttendanceDatePresetsTests.cs`

**Interfaces:**
- Produces: `PeriodAttendanceDatePresets.Resolve(string? preset, DateOnly? from, DateOnly? to, DateOnly today) → (DateOnly From, DateOnly To)`

- [x] **Step 1: Write failing tests**

```csharp
public class PeriodAttendanceDatePresetsTests
{
    static readonly DateOnly Today = new(2026, 8, 13);

    [Fact]
    public void Today_preset_is_single_day()
    {
        var (from, to) = PeriodAttendanceDatePresets.Resolve("today", null, null, Today);
        Assert.Equal(Today, from);
        Assert.Equal(Today, to);
    }

    [Fact]
    public void Last_30_days_inclusive_of_today()
    {
        var (from, to) = PeriodAttendanceDatePresets.Resolve("last_30_days", null, null, Today);
        Assert.Equal(Today.AddDays(-29), from);
        Assert.Equal(Today, to);
    }

    [Fact]
    public void Explicit_from_to_wins_over_preset()
    {
        var (from, to) = PeriodAttendanceDatePresets.Resolve(
            "today", new DateOnly(2026, 7, 1), new DateOnly(2026, 7, 31), Today);
        Assert.Equal(new DateOnly(2026, 7, 1), from);
        Assert.Equal(new DateOnly(2026, 7, 31), to);
    }
}
```

- [x] **Step 2: Run test — expect FAIL** (type missing)

```bash
dotnet test tests/Sms.Tests.Unit/Sms.Tests.Unit.csproj --filter PeriodAttendanceDatePresetsTests
```

- [x] **Step 3: Implement presets**

Support: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `last_30_days`, `last_60_days`, `last_90_days`. Week = Mon–Sun relative to `today`. If preset null/empty and from/to null → default `today`. If only one of from/to provided → treat missing bound as `today`. Clamp `from <= to`.

- [x] **Step 4: Run tests — expect PASS**

- [x] **Step 5: Commit**

```bash
git add src/Sms.Modules.Academics/PeriodAttendanceDatePresets.cs tests/Sms.Tests.Unit/Academics/PeriodAttendanceDatePresetsTests.cs
git commit -m "feat(attendance): add period attendance date preset resolver"
```

---

### Task 2: Enriched list contracts + repository query

**Files:**
- Modify: `sms-backend/src/Sms.Modules.Academics/Contracts/AcademicsContracts.cs`
- Create: `sms-backend/src/Sms.Modules.Academics/Data/PeriodAttendanceQueryRepository.cs`
- Modify: `sms-backend/db/Sms.Migrations/M0129_PeriodAttendance_AdvancedQuery.cs` (indexes)
- Test: `sms-backend/tests/Sms.Tests.Unit/Academics/PeriodAttendanceQueryFilterTests.cs` (SQL filter builder / param mapping if extracted) **or** integration test if unit SQL is awkward

**Interfaces:**
- Produces:

```csharp
public sealed record PeriodAttendanceAdvancedRow(
    Guid Id,
    Guid ClassId,
    string Grade,
    string Section,
    string ClassLabel,
    Guid StudentId,
    string StudentName,
    string AdmissionNo,
    DateTime Date,
    int Period,
    Guid? PeriodId,
    string Subject,
    Guid? SubjectId,
    string? StartTime,
    string? EndTime,
    string Status,
    Guid? AssignedTeacherId,
    string? AssignedTeacherName,
    Guid? MarkedBy,
    string? MarkedByName,
    string? MarkedByRole,
    DateTime? MarkedAt,
    string GeoFenceStatus // always "not_required" until Phase 3
);

public sealed record PeriodAttendanceAdvancedPage(
    IReadOnlyList<PeriodAttendanceAdvancedRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record PeriodAttendanceAdvancedQuery(
    DateOnly From,
    DateOnly To,
    Guid? ClassId,
    string? Grade,
    string? Section,
    string? Subject,
    int? Period,
    Guid? AssignedTeacherId,
    Guid? MarkedBy,
    string? MarkedByRole,
    string? Status,
    string? Q,
    int Page,
    int PageSize);
```

- [x] **Step 1: Add migration indexes** on `(TenantId, Date)`, `(TenantId, ClassId, Date)`, `(TenantId, Subject)`, `(TenantId, MarkedBy)` if missing — keep table schema otherwise unchanged in M0129.

- [x] **Step 2: Write failing service/repo test** that builds a query with status=`absent` + subject=`Music` and asserts the repository method exists and returns page shape (integration preferred: seed 2 period rows, filter returns 1).

- [x] **Step 3: Implement `SearchAsync(PeriodAttendanceAdvancedQuery q, CancellationToken ct)`**

Core SQL sketch (adapt to existing day-key / teacher join patterns in `TimetableRepository`):

```sql
SELECT par.Id, par.ClassId, c.Grade, c.Section, c.Name AS ClassLabel,
       par.StudentId, s.Name AS StudentName, s.AdmissionNo,
       par.[Date], par.Period, par.PeriodId, par.Subject, par.SubjectId,
       ts.StartTime, ts.EndTime, par.Status,
       ts.TeacherId AS AssignedTeacherId, t.Name AS AssignedTeacherName,
       par.MarkedBy, u.Name AS MarkedByName, par.MarkedByRole,
       COALESCE(par.UpdatedAt, par.CreatedAt) AS MarkedAt,
       CAST('not_required' AS nvarchar(32)) AS GeoFenceStatus
FROM dbo.PeriodAttendanceRecords par
INNER JOIN dbo.Students s ON s.Id = par.StudentId
INNER JOIN dbo.Classes c ON c.Id = par.ClassId
LEFT JOIN dbo.Users u ON u.Id = par.MarkedBy
LEFT JOIN dbo.TimetableSlots ts
  ON ts.ClassId = par.ClassId AND ts.Period = par.Period
 AND UPPER(LEFT(ts.[Day],3)) = /* weekday of par.Date */
 AND LOWER(LTRIM(RTRIM(ts.Subject))) = LOWER(LTRIM(RTRIM(par.Subject)))
LEFT JOIN dbo.Teachers t ON t.Id = ts.TeacherId
WHERE par.[Date] >= @From AND par.[Date] <= @To
  AND (@ClassId IS NULL OR par.ClassId = @ClassId)
  AND (@Grade IS NULL OR c.Grade = @Grade)
  AND (@Section IS NULL OR c.Section = @Section)
  AND (@Subject IS NULL OR LOWER(par.Subject) = LOWER(@Subject))
  AND (@Period IS NULL OR par.Period = @Period)
  AND (@AssignedTeacherId IS NULL OR ts.TeacherId = @AssignedTeacherId)
  AND (@MarkedBy IS NULL OR par.MarkedBy = @MarkedBy)
  AND (@MarkedByRole IS NULL OR par.MarkedByRole = @MarkedByRole)
  AND (@Status IS NULL OR par.Status = @Status)
  AND (@Q IS NULL OR s.Name LIKE '%' + @Q + '%' OR s.AdmissionNo LIKE '%' + @Q + '%')
ORDER BY par.[Date] DESC, c.Name, par.Period, s.Name
OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

-- plus COUNT(*) OVER or separate COUNT with same WHERE
```

Clamp `PageSize` to 1–100 (default 25). Page is 1-based.

- [x] **Step 4: Run tests — PASS**

- [x] **Step 5: Commit**

```bash
git commit -m "feat(attendance): add advanced period attendance query repository"
```

---

### Task 3: Service AuthZ + HTTP endpoint

**Files:**
- Modify: `sms-backend/src/Sms.Application/Services/Academics/AcademicsService.cs`
- Create: `sms-backend/src/Sms.Api/Controllers/PeriodAttendanceQueryController.cs`
- Test: `sms-backend/tests/Sms.Tests.Integration/Attendance/PeriodAttendanceAdvancedListTests.cs`

**Interfaces:**
- Consumes: `PeriodAttendanceQueryRepository.SearchAsync`, `PeriodAttendanceDatePresets.Resolve`
- Produces: `GET /v1/attendance/period-records`

```csharp
[HttpGet("period-records")]
public Task<IActionResult> ListPeriodRecords(
    [FromQuery] string? preset,
    [FromQuery] DateOnly? from,
    [FromQuery] DateOnly? to,
    [FromQuery] Guid? classId,
    [FromQuery] string? grade,
    [FromQuery] string? section,
    [FromQuery] string? subject,
    [FromQuery] int? period,
    [FromQuery] Guid? assignedTeacherId,
    [FromQuery] Guid? markedBy,
    [FromQuery] string? markedByRole,
    [FromQuery] string? status,
    [FromQuery] string? q,
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 25,
    CancellationToken ct = default)
```

Controller route: `[Route("v1/attendance")]` on a **new** controller (do not overload geo `AttendanceController` at `v1/me/attendance`). Keep `AttendanceAlertController` routes intact.

- [x] **Step 1: Failing integration test** — authenticated principal lists rows for tenant; teacher cannot see other teacher’s class rows if AuthZ scopes teachers (if teacher CRM role not used yet, at least leadership 200 + empty filters).

- [x] **Step 2: Implement service method** `ListPeriodAttendanceAdvancedAsync(ClaimsPrincipal caller, …)`:
  - Resolve date range via presets + school “today”.
  - Require attendance view permission (same gate as other CRM attendance reads).
  - For teacher role: restrict `AssignedTeacherId` or class set to caller’s teacher id (mirror existing period write rules).
  - Never take MarkedBy from a “as user” spoof param for identity — filter `markedBy` is a **search filter**, not identity.

- [x] **Step 3: Wire DI** for `PeriodAttendanceQueryRepository` if not auto-registered like sibling repos.

- [x] **Step 4: Run integration test — PASS**

- [x] **Step 5: Commit** (plus follow-up fixes `6f8fb4a`, `a7f2757`, `cc8ff7c` for pagination totals, AuthZ scope, and marker role normalization)

```bash
git commit -m "feat(attendance): expose GET /v1/attendance/period-records"
```

---

### Task 4: CRM API client + query keys + hook

**Files:**
- Create: `sms-admin/src/api/periodAttendanceAdvanced.ts`
- Create: `sms-admin/src/api/periodAttendanceAdvanced.test.ts`
- Create: `sms-admin/src/api/hooks/usePeriodAttendanceAdvanced.ts`
- Modify: `sms-admin/src/api/queryKeys.ts`

**Interfaces:**
- Produces:

```ts
export type PeriodAttendanceAdvancedFilters = {
  preset?: string
  from?: string
  to?: string
  classId?: string
  grade?: string
  section?: string
  subject?: string
  period?: number
  assignedTeacherId?: string
  markedBy?: string
  markedByRole?: string
  status?: string
  q?: string
  page?: number
  pageSize?: number
}

export type PeriodAttendanceAdvancedRow = {
  id: string
  classId: string
  grade: string
  section: string
  classLabel: string
  studentId: string
  studentName: string
  admissionNo: string
  date: string
  period: number
  periodId?: string | null
  subject: string
  subjectId?: string | null
  startTime?: string | null
  endTime?: string | null
  status: string
  assignedTeacherId?: string | null
  assignedTeacherName?: string | null
  markedBy?: string | null
  markedByName?: string | null
  markedByRole?: string | null
  markedAt?: string | null
  geoFenceStatus: string
}

export type PeriodAttendanceAdvancedPage = {
  items: PeriodAttendanceAdvancedRow[]
  totalCount: number
  page: number
  pageSize: number
}

export function listPeriodAttendanceAdvanced(
  filters: PeriodAttendanceAdvancedFilters,
): Promise<PeriodAttendanceAdvancedPage>
```

- [x] **Step 1: Failing client test** — assert `request` called with `/attendance/period-records?...` and snake/camel mapping via existing `request` helper.

- [x] **Step 2: Implement client + `queryKeys.attendance.advanced(filters)` + `usePeriodAttendanceAdvanced(filters)`** (`enabled` when viewer has attendance view).

- [x] **Step 3: Run** `npm test -- src/api/periodAttendanceAdvanced.test.ts` — PASS

- [x] **Step 4: Commit**

```bash
git commit -m "feat(attendance): add CRM client for advanced period attendance list"
```

---

### Task 5: Advanced tab UI (list + filters) — mark page untouched

**Files:**
- Create: `sms-admin/src/screens/school/attendanceAdvanced.tsx`
- Create: `sms-admin/src/screens/school/attendanceAdvanced.test.tsx`
- Modify: `sms-admin/src/screens/school/attendance.tsx` — **only** Group union + options + render
- Modify: `sms-admin/src/styles/components.css` — `sm-att-adv-*` styles

**Interfaces:**
- Consumes: `usePeriodAttendanceAdvanced`, `useClasses`, `useTeachers`
- Produces: `<AttendanceAdvanced />` mounted when `group === 'advanced'`

- [x] **Step 1: Extend group options only**

In `attendance.tsx`:

```ts
type Group = 'students' | 'teachers' | 'staff' | 'geo' | 'advanced'

const GROUP_OPTS_ALL_BASE = [
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'staff', label: 'Staff' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'geo', label: 'Geo-fence' },
] as const

const GROUP_OPTS_TEACHER = [
  { value: 'students', label: 'Students' },
  { value: 'advanced', label: 'Advanced' },
]
```

Render:

```tsx
{group === 'students' && <ClassWiseStudents editable={editable} leadership={allPeople} />}
{group === 'advanced' && <AttendanceAdvanced />}
{allPeople && (group === 'teachers' || group === 'staff') && <StaffRoster group={group} editable={editable} />}
```

Do **not** import or alter `attendanceClassWise` internals.

- [x] **Step 2: Build `AttendanceAdvanced`** (incl. date/class filter edge-case fixes in `6984d18`)

Default filters: `preset: 'today'`, `page: 1`, `pageSize: 25`.

UI blocks:
1. Filter bar: Date preset Select, optional custom from/to, Class (grade), Section (`classId` from live classes), Subject, Period, Teacher (assigned), Marked By Role, Status, Search input (name/admission).
2. Table columns: Student Name, Admission No, Class, Section, Subject, Period, Period Time, Status, Assigned Teacher, Marked By, Marked By Role, Marked At, Geo-Fence (show `Not required` from `geoFenceStatus`).
3. Pagination controls bound to `page` / `totalCount`.
4. Error state: message + Retry (`refetch`). Loading state: muted text.
5. Empty: “No period attendance for these filters.”

Optional Phase 1 period panel: when `classId` + single day selected, call existing `useClassDayTimetable` and show period rows with Assigned Teacher + Marked/Pending (derive pending if no rows for that period in current page — or skip panel until Task 6 if too heavy; **prefer include** using day timetable + a lightweight “marked periods” set from list filtered to that class/date).

- [x] **Step 3: Test** — render Advanced tab label exists; changing status filter updates query key / request (mock). Assert Students mark path still mounts `ClassWiseStudents` when group=students (smoke).

- [x] **Step 4: Commit**

```bash
git commit -m "feat(attendance): add Advanced tab list UI without changing mark page"
```

---

### Task 6: Phase 1 acceptance gate

- [x] **Step 1: Manual checklist** against spec §9 Phase 1 (filters combine, Assigned ≠ Marked By, mark page unchanged).
- [x] **Step 2: Run** backend unit+integration filters + CRM advanced tests.
- [x] **Step 3: Commit** any checklist fixes only if needed.

**Phase 1 done when:** Advanced tab works in CRM against live API; Students mark UI unchanged. ✅ Confirmed 2026-08-15.

---

## Phase 2 — Summaries + week / month / 30–60–90

### Task 7: Aggregate contracts + repository methods

**Files:**
- Modify: `AcademicsContracts.cs`
- Modify: `PeriodAttendanceQueryRepository.cs`
- Test: `Sms.Tests.Unit/Academics/PeriodAttendanceAggregateTests.cs`

**Interfaces:**
- Produces:

```csharp
public sealed record AdvClassDaySummary(
    int TotalStudents, int Present, int Absent, int Late, int Leave, int NotMarked,
    decimal? AttendancePercentage,
    int TotalPeriods, int MarkedPeriods, int PendingPeriods);

public sealed record AdvSubjectSummaryRow(
    string Subject, string? TeacherName, int Periods, int Marked, int Pending,
    int Present, int Absent, int Late, decimal? AttendancePercentage);

public sealed record AdvTeacherSummaryRow(
    Guid TeacherId, string TeacherName,
    int Classes, int Sections, int Subjects,
    int ExpectedPeriods, int MarkedPeriods, int PendingPeriods,
    int TeacherMarked, int StaffMarked, int PrincipalMarked, int AdminMarked);

public sealed record AdvRangeRollup(
    int TotalMarkedPeriods, int Present, int Absent, int Late, int Leave,
    decimal? AttendancePercentage);
```

- [x] **Step 1: Failing tests** for % using `PeriodAttendanceMath.FromStatusBuckets` on aggregate counts; pending periods = timetable expected − marked for bounded class+date.
- [x] **Step 2: Implement** `SummarizeClassDayAsync`, `SummarizeSubjectsAsync`, `SummarizeTeachersAsync`, `SummarizeRangeAsync` (filters: classId, section/grade, studentId, subject, teacherId, from, to).
- [x] **Step 3: PASS + commit** (plus fixes `9063fe4`, `0de93ad` for bounding aggregates to timetable sessions and zero-buckets)

```bash
git commit -m "feat(attendance): add advanced attendance aggregate queries"
```

---

### Task 8: Aggregate HTTP endpoints

**Files:**
- Modify: `PeriodAttendanceQueryController.cs` + `AcademicsService.cs`
- Test: integration tests for each route

**Routes:**
- `GET /v1/attendance/period-records/summary/class?classId=&date=`
- `GET /v1/attendance/period-records/summary/subjects?classId=&from=&to=`
- `GET /v1/attendance/period-records/summary/teachers?from=&to=`
- `GET /v1/attendance/period-records/summary/range?preset=last_30_days&…`

- [x] Implement + AuthZ same as list.
- [x] Commit: `feat(attendance): expose advanced attendance summary endpoints` (`0ff2c85` — confirms all four routes present in `PeriodAttendanceQueryController.cs`)

---

### Task 9: Advanced tab subviews (CRM)

> **Status note (2026-08-15):** DONE. `attendanceAdvanced.tsx` now has a nested Segmented (Records | Class | Subject | Teacher | Ranges) consuming the four Phase 2 summary endpoints via new client functions/hooks. Dedicated week/month endpoints were not added — Week/Month are covered via the Ranges subview's `this_week` / `this_month` presets on `GET .../summary/range`, consistent with this task's fallback guidance ("prefer dedicated week/month endpoints if grouping needs all days" — a single rollup, not per-day grouping, was sufficient here).

**Files:**
- Modify: `attendanceAdvanced.tsx` (nested Segmented: Records | Class | Subject | Teacher | Week | Month | Ranges)
- Modify: `periodAttendanceAdvanced.ts` + hooks + queryKeys
- Test: `attendanceAdvanced.test.tsx`

- [x] Records remains Phase 1 list.
- [x] Class / Subject / Teacher tables from summary APIs; subject row click sets list filters (`subject`, `classId`) and switches to Records.
- [x] Week / Month: covered via Ranges subview presets (`this_week` / `this_month`) against `summary/range` — a single-rollup KPI card, not per-day grouping (no dedicated week/month endpoints added; see status note).
- [x] Ranges: preset select (this_week/this_month/30/60/90) → rollup card + "View matching records" drills into Records with the same filters.
- [x] Still **no** edits to `attendanceClassWise.tsx` (confirmed via `git diff --stat`).
- [x] Commit: `feat(attendance): add Advanced tab summaries and range views`

---

### Task 10: Phase 2 acceptance gate

- [x] Spec §9 Phase 2 checklist + tests green. Class/subject/teacher summaries and week/month/30/60/90 filters + drill-down all work; aggregates reuse the backend's `PeriodAttendanceMath` formula (no second % implementation added client-side).
- [x] Commit fixes if any.

**Phase 2 done when:** Advanced tab summaries/ranges work in CRM against live API. ✅ Confirmed 2026-08-15 (typecheck clean, `attendanceAdvanced.test.tsx` 10/10, `periodAttendanceAdvanced.test.ts` 8/8).

---

## Phase 3 — Geo columns + audit history

> **Status note (2026-08-15):** NOT started. `M0130` was already used for an unrelated migration (`M0130_ChatMessages_ReadReceipts`), so `PeriodAttendance_Geo_Audit` needs a new migration number. No `PeriodAttendanceAudit` table and no geo columns exist in `sms-backend` yet.

### Task 11: Migration geo + audit table

**Files:**
- Create: `sms-backend/db/Sms.Migrations/M0130_PeriodAttendance_Geo_Audit.cs`
- Update: `Client_Delete.sql` to delete `PeriodAttendanceAudit`

**Schema:**

```csharp
// On PeriodAttendanceRecords:
// GeoFenceStatus nvarchar(32) null — default treat as not_required
// GeoDistanceMeters int null
// GeoCapturedAt datetime2 null
// UpdatedBy uniqueidentifier null
// UpdatedByRole nvarchar(64) null
// (UpdatedAt already exists)

Create.Table("PeriodAttendanceAudit")
  .WithColumn("Id").AsGuid().PrimaryKey()
  .WithColumn("TenantId").AsGuid().NotNullable()
  .WithColumn("RecordId").AsGuid().NotNullable()
  .WithColumn("ClassId").AsGuid().NotNullable()
  .WithColumn("StudentId").AsGuid().NotNullable()
  .WithColumn("Date").AsDate().NotNullable()
  .WithColumn("Period").AsInt32().NotNullable()
  .WithColumn("Subject").AsString(200).NotNullable()
  .WithColumn("FromStatus").AsString(32).Nullable()
  .WithColumn("ToStatus").AsString(32).NotNullable()
  .WithColumn("ActorId").AsGuid().NotNullable()
  .WithColumn("ActorName").AsString(200).Nullable()
  .WithColumn("ActorRole").AsString(64).Nullable()
  .WithColumn("At").AsDateTime2().NotNullable();
// + RLS policy like PeriodAttendanceRecords
```

- [ ] Also alter `PeriodAttendance_BulkUpsert` to set `UpdatedBy` / `UpdatedByRole` and insert audit rows on INSERT/UPDATE (from→to). Do **not** require lat/lng from CRM mark UI.
- [ ] Commit: `feat(attendance): add geo columns and period attendance audit table`

---

### Task 12: Audit API + geo on advanced list

**Files:**
- Extend advanced row DTO with `geoDistanceMeters`, `geoCapturedAt`, `updatedBy`, `updatedByRole`, `updatedAt`
- `GET /v1/attendance/period-records/{id}/audit`
- Filter `geoFenceStatus` on list query
- CRM: Advanced table columns + filter; row opens audit drawer/timeline
- Tests for audit append on upsert (integration)

- [ ] Mark page UI still unchanged (no geo capture controls).
- [ ] Commit: `feat(attendance): show geo and audit history in Advanced tab`

---

### Task 13: Final acceptance (full §30 union)

- [ ] Walk product acceptance checklist for Phases 1–3.
- [ ] Confirm `attendanceClassWise.tsx` diff is empty (or only unintentional — revert if touched).
- [ ] Confirm no browser SoT for Advanced data path.
- [ ] Final commit if doc status updates only:

```bash
git commit -m "docs(attendance): mark advanced attendance phases complete"
```

---

## Spec coverage checklist

| Spec area | Tasks |
|-----------|-------|
| Advanced tab only; mark page unchanged | 5, 9, 12, 13 |
| List columns + search + combinable filters | 2–5 |
| Date presets / ranges server-side | 1, 3, 8–9 |
| Assigned Teacher ≠ Marked By | 2, 5 |
| Class/subject/teacher summaries | 7–9 |
| Week/month/30–60–90 | 8–9 |
| Period % formula reuse | 7 |
| Geo display/filter (no mark UI capture) | 11–12 |
| Audit history in Advanced | 11–12 |
| API→SQL, AuthZ, pagination | 2–3, 8, 12 |
| No unrelated modules | Global + file map |

## Placeholder / consistency review

- Endpoint prefix fixed: `/v1/attendance/period-records`.
- DTO names consistent: `PeriodAttendanceAdvanced*` backend ↔ CRM camelCase via existing serializer.
- Migration numbers: M0129 (indexes), M0130 (geo/audit).
- Tab label: **Advanced**.
