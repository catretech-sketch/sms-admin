# Timetable-correct single daily attendance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one attendance mark per class per student per day, and let the published timetable decide who may write that mark — then show that same daily status in CRM, teacher, principal, student, and parent apps.

**Architecture:** No schema change to `AttendanceRecords`. Add `AttendanceRollCall` resolver (first teaching period of the day + class teacher + leadership). Gate `POST /classes/{id}/attendance`. Expose `GET /classes/{id}/attendance/roll-call`. Clients stay on `{ date, records }`.

**Tech Stack:** ASP.NET + SQL Server (existing procs), sms-admin React/Vite, sms-teacher-app React Native, sms-student React Native. Tests: xUnit integration, Vitest, existing RN test patterns.

**Spec:** `docs/superpowers/specs/2026-08-12-timetable-single-attendance-design.md`

## Global Constraints

- One mark per `(TenantId, ClassId, StudentId, Date)` — do not add `Period` / `TimetableSlotId`.
- POST body stays `{ date, records: [{ student_id, status }] }` — no period field.
- Statuses remain `present | absent | late | leave` (teacher app already sends `leave` as `V`).
- Weekday labels are invariant English `Mon`…`Sat`, matching `TimetableSlots.Day`.
- First teaching period = lowest `Period` for that class+day whose `Subject` does not contain `lunch`, `break`, `recess`, or `assembly` (case-insensitive).
- Leadership = JWT roles `school.principal`, `school.admin`, `school.owner` (same last-segment parse as `ListClassesAsync`).
- Repos: `sms-backend`, `sms-admin`, `sms-teacher-app`, `sms-student`. Commit in the repo you edit.
- Do not change exam attendance, staff geo check-in, or CRM teacher/staff people attendance.

## File map

| File | Responsibility |
|------|----------------|
| `sms-backend/src/Sms.Modules.Academics/Contracts/AcademicsContracts.cs` | `AttendanceRollCallResponse` DTO |
| `sms-backend/src/Sms.Modules.Academics/Data/TimetableRepository.cs` | `ListForClassDayAsync` → `ClassDaySlotRow` |
| `sms-backend/src/Sms.Application/Services/Academics/AttendanceRollCall.cs` | Pure resolver: slot + `CanMark` |
| `sms-backend/src/Sms.Application/Services/Academics/AcademicsService.cs` | Gate POST; GET roll-call |
| `sms-backend/src/Sms.Api/Controllers/ClassController.cs` | New GET route |
| `sms-backend/tests/Sms.Tests.Unit/Academics/AttendanceRollCallTests.cs` | Resolver unit tests |
| `sms-backend/tests/Sms.Tests.Integration/Academics/AttendanceRollCallTests.cs` | HTTP 204/403 + GET shape |
| `sms-admin/src/api/attendance.ts` | `getAttendanceRollCall` |
| `sms-admin/src/screens/school/attendanceClassWise.tsx` | Chip + `can_mark` |
| `sms-teacher-app/src/data/http/attendance.repo.ts` | `rollCall` |
| `sms-teacher-app/src/screens/AttendanceScreen.tsx` | Read-only when `!can_mark`; no default Present |
| `sms-teacher-app/src/screens/ScheduleScreen.tsx` | Empty periods stay empty |
| `sms-student/src/services/http/mappers.ts` | Daily status + `leave` |
| `sms-student/src/features/parent/screens/ParentHomeScreen.tsx` | One daily chip, not per-period attn |
| `sms-student/src/features/student/screens/HomeScreen.tsx` | Today’s mark |

---

### Task 1: Roll-call resolver (unit)

**Files:**
- Create: `sms-backend/src/Sms.Application/Services/Academics/AttendanceRollCall.cs`
- Create: `sms-backend/tests/Sms.Tests.Unit/Academics/AttendanceRollCallTests.cs`
- Modify: `sms-backend/src/Sms.Modules.Academics/Contracts/AcademicsContracts.cs` (append records)

**Interfaces:**
- Consumes: `TimetableSlotResponse` (`Day`, `Period`, `Subject`, `ClassId`, `TeacherId` is not on the list DTO today — resolver takes a small input record, not the HTTP DTO).
- Produces: `AttendanceRollCall.Resolve(slots, date)` → first teaching slot; `CanMark(isLeadership, callerTeacherId, classTeacherId, rollCallTeacherId)`.

- [ ] **Step 1: Write the failing unit tests**

```csharp
using FluentAssertions;
using Sms.Application.Services.Academics;
using Xunit;

namespace Sms.Tests.Unit.Academics;

public class AttendanceRollCallTests
{
    [Fact]
    public void First_teaching_period_skips_assembly_and_lunch()
    {
        var slots = new[]
        {
            Slot(1, "Assembly"),
            Slot(2, "Mathematics"),
            Slot(4, "Lunch"),
            Slot(5, "English"),
        };
        var got = AttendanceRollCall.FirstTeachingSlot(slots);
        got!.Period.Should().Be(2);
        got.Subject.Should().Be("Mathematics");
    }

    [Fact]
    public void Weekday_is_invariant_english_three_letter()
    {
        AttendanceRollCall.DayKey(new DateTime(2026, 8, 12)).Should().Be("Wed");
        AttendanceRollCall.DayKey(new DateTime(2026, 8, 15)).Should().Be("Sat");
    }

    [Fact]
    public void Subject_teacher_cannot_mark_when_not_p1_or_class_teacher()
    {
        AttendanceRollCall.CanMark(
            isLeadership: false,
            callerTeacherId: Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            classTeacherId: Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
            rollCallTeacherId: Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"))
            .Should().BeFalse();
    }

    [Fact]
    public void Class_teacher_and_p1_teacher_and_leadership_can_mark()
    {
        var classT = Guid.NewGuid();
        var p1 = Guid.NewGuid();
        AttendanceRollCall.CanMark(false, classT, classT, p1).Should().BeTrue();
        AttendanceRollCall.CanMark(false, p1, classT, p1).Should().BeTrue();
        AttendanceRollCall.CanMark(true, Guid.NewGuid(), classT, p1).Should().BeTrue();
    }

    static AttendanceRollCall.SlotInput Slot(int period, string subject) =>
        new("Wed", period, subject, Guid.Empty, null);
}
```

- [ ] **Step 2: Run tests — expect FAIL** (`AttendanceRollCall` missing)

Run from `sms-backend`:

```bash
dotnet test tests/Sms.Tests.Unit/Sms.Tests.Unit.csproj --filter AttendanceRollCallTests
```

- [ ] **Step 3: Implement resolver**

Append to `AcademicsContracts.cs`:

```csharp
public sealed record AttendanceRollCallResponse(
    DateTime Date,
    string Day,
    int? Period,
    string? Subject,
    string? StartTime,
    string? EndTime,
    Guid? TeacherId,
    string? TeacherName,
    Guid? ClassTeacherId,
    string? ClassTeacherName,
    bool CanMark,
    string Reason,
    bool Marked);
```

Create `AttendanceRollCall.cs`:

```csharp
using System.Globalization;

namespace Sms.Application.Services.Academics;

public static class AttendanceRollCall
{
    public sealed record SlotInput(
        string Day, int Period, string? Subject, Guid? ClassId, Guid? TeacherId,
        string? StartTime = null, string? EndTime = null, string? TeacherName = null);

    public static string DayKey(DateTime date) =>
        date.ToString("ddd", CultureInfo.InvariantCulture);

    public static bool IsNonTeaching(string? subject)
    {
        var s = (subject ?? "").Trim().ToLowerInvariant();
        return s.Contains("lunch") || s.Contains("break") || s.Contains("recess") || s.Contains("assembly");
    }

    public static SlotInput? FirstTeachingSlot(IEnumerable<SlotInput> slots)
    {
        return slots
            .Where(s => !IsNonTeaching(s.Subject))
            .OrderBy(s => s.Period)
            .FirstOrDefault();
    }

    public static bool CanMark(
        bool isLeadership, Guid? callerTeacherId, Guid? classTeacherId, Guid? rollCallTeacherId)
    {
        if (isLeadership) return true;
        if (callerTeacherId is null) return false;
        if (classTeacherId is { } ct && ct == callerTeacherId) return true;
        if (rollCallTeacherId is { } rt && rt == callerTeacherId) return true;
        return false;
    }

    public static string Reason(bool isLeadership, Guid? callerTeacherId, Guid? classTeacherId, Guid? rollCallTeacherId)
    {
        if (isLeadership) return "leadership";
        if (callerTeacherId is { } id && classTeacherId == id) return "class_teacher";
        if (callerTeacherId is { } id2 && rollCallTeacherId == id2) return "first_period";
        return "not_assigned";
    }
}
```

- [ ] **Step 4: Re-run unit tests — expect PASS**

```bash
dotnet test tests/Sms.Tests.Unit/Sms.Tests.Unit.csproj --filter AttendanceRollCallTests
```

- [ ] **Step 5: Commit**

```bash
git add src/Sms.Application/Services/Academics/AttendanceRollCall.cs src/Sms.Modules.Academics/Contracts/AcademicsContracts.cs tests/Sms.Tests.Unit/Academics/AttendanceRollCallTests.cs
git commit -m "feat(attendance): resolve first-period roll-call teacher from timetable"
```

---

### Task 2: List class-day timetable slots (include TeacherId)

**Files:**
- Modify: `sms-backend/src/Sms.Modules.Academics/Contracts/ScheduleContracts.cs`
- Modify: `sms-backend/src/Sms.Modules.Academics/Data/TimetableRepository.cs`

**Interfaces:**
- Produces: new DTO `ClassDaySlotRow` (do **not** add columns to `TimetableSlotResponse` — Dapper picks a constructor by column count; Create/Get still return 10 columns + optional `TeacherName`).
- Produces: `TimetableRepository.ListForClassDayAsync(Guid classId, string day)`.

`TimetableSlotResponse` stays as-is (10-col primary + 11-col `TeacherName` ctor).

Add to `ScheduleContracts.cs`:

```csharp
/// One published slot for a class on one weekday, with teacher resolved for roll-call.
public sealed record ClassDaySlotRow(
    int Period, string? Subject, Guid? TeacherId, string? TeacherName,
    string? StartTime, string? EndTime);
```

Add to `TimetableRepository`:

```csharp
public Task<IReadOnlyList<ClassDaySlotRow>> ListForClassDayAsync(
    Guid classId, string day, CancellationToken ct = default) =>
    QueryInlineAsync<ClassDaySlotRow>(@"
SELECT ts.Period, ts.Subject,
       COALESCE(ts.TeacherId, t2.Id) AS TeacherId,
       COALESCE(t1.Name, t2.Name) AS TeacherName,
       ts.StartTime, ts.EndTime
FROM dbo.TimetableSlots ts
LEFT JOIN dbo.Teachers t1 ON t1.Id = ts.TeacherId
LEFT JOIN dbo.Subjects sub ON sub.Name = ts.Subject
LEFT JOIN dbo.Teachers t2 ON t2.Id = sub.TeacherId
WHERE ts.ClassId = @classId AND ts.[Day] = @day
ORDER BY ts.Period", new { classId, day }, ct);
```

`COALESCE(ts.TeacherId, t2.Id)` uses the slot teacher, then the subject default (same fallback as timetable list).

- [ ] **Step 1: No HTTP test yet** — Task 3 GET roll-call covers this query. Implement the method so Task 3 compiles.

- [ ] **Step 2: Implement DTO + SQL**

- [ ] **Step 3: `dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter TimetableTeacherFilterTests` — existing tests still PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(timetable): list class-day slots with resolved TeacherId"
```

---

### Task 3: Gate POST + GET roll-call

**Files:**
- Modify: `sms-backend/src/Sms.Application/Services/Academics/IAcademicsService.cs`
- Modify: `sms-backend/src/Sms.Application/Services/Academics/AcademicsService.cs`
- Modify: `sms-backend/src/Sms.Api/Controllers/ClassController.cs`
- Create: `sms-backend/tests/Sms.Tests.Integration/Academics/AttendanceRollCallHttpTests.cs`
- Modify: `sms-backend/src/Sms.Modules.Staffing/Data/StaffingRepositories.cs` only if there is no `GetByUserId` — add a one-line query on `Teachers` instead of a new repo:

In `AcademicsService`, query teacher id with existing factory or add to `ClassRepository`:

```csharp
public Task<Guid?> TeacherIdForUserAsync(Guid userId, CancellationToken ct) =>
    QueryInlineAsync<Guid?>(
        "SELECT TOP 1 Id FROM dbo.Teachers WHERE UserId = @userId",
        new { userId }, ct).ContinueWith(t => t.Result.FirstOrDefault(), ct);
```

Prefer putting `TeacherIdForUserAsync` + `ClassTeacherId` read on `ClassRepository` (`SELECT ClassTeacherId FROM dbo.Classes WHERE Id = @id`).

**Interfaces:**
- Produces: `GetAttendanceRollCallAsync(classId, date, caller)` → `AttendanceRollCallResponse`. `BulkUpsertAttendanceAsync` takes `ClaimsPrincipal caller` and returns 403 when `!CanMark`.

- [ ] **Step 1: Write failing HTTP tests**

```csharp
[Fact]
public async Task Subject_teacher_gets_403_when_not_first_period_or_class_teacher()
{
    // tenant + class + class teacher Tclass + P1 teacher Tp1 (Math) + P2 teacher Tsubj (English)
    // POST as Tsubj → 403
}

[Fact]
public async Task First_period_teacher_can_upsert_and_get_shows_can_mark()
{
    // POST as Tp1 → 204
    // GET /v1/classes/{id}/attendance/roll-call?date=2026-08-12
    //   period=1, can_mark=true, reason=first_period, marked=true
}

[Fact]
public async Task Admin_can_always_upsert()
{
    // existing AcademicsTests client (admin JWT) still 204 — keep Roll_call_bulk_upsert_is_idempotent_and_updates green
}
```

Seed pattern: copy `TimetableTeacherFilterTests` SQL inserts (`Users`, `Teachers.UserId`, `Classes.ClassTeacherId`, `TimetableSlots` with `Period`, `Subject`, `TeacherId`, `Day='Wed'` for 2026-08-12). Issue JWT with `Policies.Teacher` and that `UserId`.

POST body:

```json
{ "date": "2026-08-12", "records": [{ "student_id": "<guid>", "status": "present" }] }
```

Expect 403 body error code `not_roll_call_teacher` (match existing `Error("not_roll_call_teacher", "...")` → whatever JSON shape `FromResult` already uses).

- [ ] **Step 2: Run — FAIL** (GET 404, POST still 204 for subject teacher)

- [ ] **Step 3: Implement**

`IAcademicsService`:

```csharp
Task<ApiResult> BulkUpsertAttendanceAsync(
    Guid classId, BulkAttendanceRequest req, ClaimsPrincipal caller, CancellationToken ct = default);
Task<ApiResult<AttendanceRollCallResponse>> GetAttendanceRollCallAsync(
    Guid classId, DateTime date, ClaimsPrincipal caller, CancellationToken ct = default);
```

`ClassController`:

```csharp
[HttpGet("classes/{classId:guid}/attendance/roll-call")]
public async Task<IActionResult> GetAttendanceRollCall(
    Guid classId, [FromQuery] DateTime date, CancellationToken ct) =>
    FromResult(await academics.GetAttendanceRollCallAsync(classId, date, User, ct));

[HttpPost("classes/{classId:guid}/attendance")]
public async Task<IActionResult> BulkUpsertAttendance(
    Guid classId, [FromBody] BulkAttendanceRequest req, CancellationToken ct) =>
    FromResult(await academics.BulkUpsertAttendanceAsync(classId, req, User, ct));
```

`AcademicsService.BulkUpsertAttendanceAsync`: after tenant check, `if (await classes.GetAsync(classId, ct) is null) return 404`. Compute leadership with the same last-segment parse as `ListClassesAsync`. Load slots `ListForClassDayAsync(classId, AttendanceRollCall.DayKey(req.Date))`. Map each `ClassDaySlotRow` to `SlotInput` (`Day`, `Period`, `Subject`, `ClassId`, `TeacherId`). `FirstTeachingSlot`. Resolve caller `Teachers.Id` from `tenant.UserId`. If `!CanMark` return `ApiResult.Fail(new Error("not_roll_call_teacher", "only the class teacher, first-period teacher, or leadership can mark this day"), 403)`. Else existing `BulkUpsertAsync`.

`GetAttendanceRollCallAsync`: same resolution; `Marked` = `ListAsync(classId, date)` has any row; `Reason` from `AttendanceRollCall.Reason`.

Student/parent POST: they are not leadership and have no `Teachers` row → `CanMark` false → 403. Add a test with `Policies.StudentOrParent` if a helper exists; otherwise skip and cover in Task 4.

- [ ] **Step 4: Run integration tests PASS**, including existing `AcademicsTests.Roll_call_bulk_upsert_is_idempotent_and_updates` (admin JWT).

```bash
dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter "FullyQualifiedName~Academics"
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(attendance): gate daily roll-call to timetable first period and class teacher"
```

---

### Task 4: Scope student/parent attendance history

**Files:**
- Modify: `sms-backend/src/Sms.Application/Services/Academics/AcademicsService.cs` (`ListAttendanceForStudentAsync`)
- Modify: `sms-backend/src/Sms.Api/Controllers/StudentController.cs` (pass `User`)
- Create or extend: `sms-backend/tests/Sms.Tests.Integration/Academics/StudentAttendanceScopeTests.cs`

**Rule:** If caller last-segment role is `student` or `parent` (or policy `student.parent`): allow only when `Users.StudentId` matches that student’s `AdmissionNo` **or** `Users.StudentId` equals the student guid string used in this tenant. Look up how `GetMyStudentAsync` links the user — **reuse that same match**, do not invent a second rule.

If `GetMyStudentAsync` returns the roster row, compare `me.Id == studentId`. Parents with multiple children: if the codebase already lists linked students, allow any linked id; if it is 1:1 via `Users.StudentId`, keep 1:1.

Staff roles: unchanged (any student id).

- [ ] **Step 1: Test** — parent token for student A, `GET /v1/students/{B}/attendance` → 403. Own id → 200.

- [ ] **Step 2: Implement**

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(attendance): students and parents can only read their own daily marks"
```

---

### Task 5: CRM — roll-call chip and can_mark

**Files:**
- Modify: `sms-admin/src/api/attendance.ts`
- Modify: `sms-admin/src/api/attendance.test.ts`
- Modify: `sms-admin/src/api/hooks/useAttendance.ts`
- Modify: `sms-admin/src/screens/school/attendanceClassWise.tsx`

**Interfaces:**
- Produces: `getAttendanceRollCall(classId, date): Promise<AttendanceRollCall>`  
  `{ date, day, period, subject, startTime, endTime, teacherId, teacherName, classTeacherId, classTeacherName, canMark, reason, marked }` via existing `snakeToCamel`.

- [ ] **Step 1: Failing client test**

```ts
it('GET /classes/{id}/attendance/roll-call?date=', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
    data: { date: '2026-08-12', day: 'Wed', period: 1, subject: 'Math', can_mark: true, reason: 'first_period', marked: false },
  })))
  const row = await getAttendanceRollCall('c1', '2026-08-12')
  expect(row.canMark).toBe(true)
  expect(row.period).toBe(1)
  expect(row.reason).toBe('first_period')
})
```

Keep existing test: save body has **no** `period`.

- [ ] **Step 2: Implement `getAttendanceRollCall`** next to `listAttendance` (`GET /classes/${classId}/attendance/roll-call`, query `date: toAttendanceDate(date)`).

- [ ] **Step 3: Hook `useAttendanceRollCall(classId, date)`** — `enabled` when class expanded.

- [ ] **Step 4: UI** — above the student list: `Roll-call · P{period} · {subject} · {teacherName}`. If `!canMark`, hide Submit / All present / All absent and show `View only — {classTeacherName || teacherName} takes this class today`. Leadership CRM roles already use `canMarkAttendance`; **AND** with API `canMark` for teacher role only (admin/principal/owner ignore API false? **No** — trust API: leadership always gets `can_mark: true` from backend).

- [ ] **Step 5: `npx vitest run src/api/attendance.test.ts` PASS**

- [ ] **Step 6: Commit in sms-admin**

```bash
git commit -m "feat(attendance): show timetable roll-call window and honour can_mark"
```

---

### Task 6: Teacher + principal app — mark only when allowed

**Files:**
- Modify: `sms-teacher-app/src/data/http/attendance.repo.ts`
- Modify: `sms-teacher-app/src/data/http/attendance.repo.test.ts` (if present) or `mappers`
- Modify: `sms-teacher-app/src/data/repositories/types.ts`
- Modify: `sms-teacher-app/src/features/attendance/hooks.ts`
- Modify: `sms-teacher-app/src/screens/AttendanceScreen.tsx`
- Modify: `sms-teacher-app/src/screens/ScheduleScreen.tsx` (`cellFor` — return empty, do not rotate other lessons)

**Interfaces:**
- Produces: `attendance.rollCall(classId, date)` → `{ canMark, period, subject, teacherName, reason, marked }`.

- [ ] **Step 1: Repo test** — GET `/classes/{id}/attendance/roll-call?date=` parsed.

- [ ] **Step 2: `AttendanceScreen`**
  - Load roll-call for `classId` + `date`.
  - Banner: `P{n} {subject} · {teacherName}`.
  - If `!canMark`: disable status taps, hide Mark All Present / Submit; text `Only the class teacher or P{n} teacher can mark today`.
  - **Stop defaulting unmarked students to `P`.** Init map from records only; students without a row have no status until the teacher taps (or Mark All Present). Submit must not invent Present for untouched rows — send only students in `attendance` state, or require every student marked before Submit (prefer: Submit disabled until every roster id has a status).
  - On 403, show the API message (already have error toast).

- [ ] **Step 3: `ScheduleScreen.cellFor`** — if no slot for that day+period, render empty cell. Do not fill from other lessons.

- [ ] **Step 4: Principal uses the same screen** — backend `can_mark: true`; no extra principal UI required beyond the banner.

- [ ] **Step 5: Run teacher-app tests for attendance + schedule**

- [ ] **Step 6: Commit in sms-teacher-app**

```bash
git commit -m "feat(attendance): timetable roll-call gate and honest empty timetable cells"
```

---

### Task 7: Student + parent apps — one daily status

**Files:**
- Modify: `sms-student/src/services/http/mappers.ts` (`toAttendanceFromRecords`)
- Modify: `sms-student/src/services/http/index.ts` (`childToday`)
- Modify: `sms-student/src/features/parent/screens/ParentHomeScreen.tsx`
- Modify: `sms-student/src/features/parent/screens/ParentAttendanceScreen.tsx` (month title from current month)
- Modify: parent navigator / Home — `navigate('Attendance')` on the daily chip
- Modify: `sms-student/src/features/student/screens/HomeScreen.tsx`

**Interfaces:**
- `toAttendanceFromRecords`: `leave` / `v` → calendar kind `off` (or add `leave` if `AttendanceDay['kind']` allows; if the union is `present|absent|late|off|future`, map leave → `off`).
- Collapse duplicate dates: last row wins (still one cell per day).
- `childToday`: keep timetable blocks; set a sibling field `todayAttn: 'present'|'absent'|'late'|'leave'|null` from `GET /students/{id}/attendance?from=today&to=today` (first record’s status). Do **not** set `cl.attn` per period.
- Parent Home: one chip `Present today` / `Absent` / `Late` / `On leave` / `Not marked`. Period list shows subject + time only.
- Student Home: same chip next to existing %.

- [ ] **Step 1: Mapper unit test** — `leave` is not present; two rows same date → one day.

- [ ] **Step 2: Implement mapper + `childToday`**

- [ ] **Step 3: Wire `navigate('Attendance')`** from the chip (and Progress if it already shows %).

- [ ] **Step 4: Fix calendar title** — `format(new Date(), 'MMMM yyyy')` (or existing date helper), not hardcoded `April 2026`.

- [ ] **Step 5: Run sms-student tests**

- [ ] **Step 6: Commit in sms-student**

```bash
git commit -m "feat(attendance): show one daily mark on parent and student home"
```

---

### Task 8: End-to-end check (manual + API)

- [ ] **Step 1: Publish a timetable** in CRM for I-A: Wed P1 Math = Teacher A, P2 English = Teacher B, class teacher = Teacher A.

- [ ] **Step 2: Teacher B** opens I-A attendance today → view only, cannot submit.

- [ ] **Step 3: Teacher A** marks Ankit Present → 204. CRM I-A today shows Present. `GET /principal/attendance` counts him. Parent calendar + student home show Present. Parent period pills stay unmarked (timetable only).

- [ ] **Step 4: Principal** can change Ankit to Late; parent/student update to Late. `MarkedBy` is principal.

- [ ] **Step 5: Confirm POST body still has no `period`.** Unique row count for Ankit that day is 1.

No extra commit unless a bugfix is needed.

---

## Self-review

| Spec rule | Task |
|-----------|------|
| One mark, no period column | Global + Task 3 (unchanged MERGE) |
| First teaching period skips assembly/lunch | Task 1 |
| Who can write | Task 3 |
| GET roll-call | Task 3, 5, 6 |
| CRM chip + can_mark | Task 5 |
| Teacher read-only + no fake Present | Task 6 |
| Honest timetable grid | Task 6 |
| Principal override | Task 3 + 6 |
| Student today mark | Task 7 |
| Parent daily not per-period; calendar reachable; leave mapped | Task 7 |
| Parent/student cannot read other children | Task 4 |

No per-period storage. No clock-window lock.
