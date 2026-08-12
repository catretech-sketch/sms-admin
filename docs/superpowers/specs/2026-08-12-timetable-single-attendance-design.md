# Timetable-correct single daily attendance

**Date:** 2026-08-12  
**Status:** Draft (plan requested in chat)

## Problem

Class attendance is already **one mark per class + student + date** (`UQ_Attendance_Class_Student_Date`). Timetable is a separate weekly grid (class + day + period + teacher). They are not linked.

Today any authenticated caller who knows a `classId` can POST roll-call. Subject teachers overwrite the same daily row. Parent Home looks per-period but the API is daily. Student app only shows a term %. Teacher timetable fills empty periods, so the grid is not the published routine.

## Decision

Keep **one daily mark**. Do **not** add a period column. Use the **published timetable** to decide **who may write** that mark.

### Official roll-call slot

For a class on a calendar date:

1. Map date → weekday (`Mon`…`Sat`, invariant English, same as `TimetableSlots.Day`).
2. Load that class’s slots for the day.
3. Skip break/lunch/recess/assembly subjects (case-insensitive contains).
4. The **first remaining period number** is the roll-call slot.
5. Roll-call teacher = that slot’s `TeacherId`, else subject default teacher (`Subjects.TeacherId` where name matches).

If the class has no teaching slot that day: there is no first-period teacher. Class teacher + leadership can still mark.

Marking is allowed **all day**, not only during the bell time. Timetable answers **who**, not **when**.

### Who can WRITE (`POST /v1/classes/{classId}/attendance`)

| Caller | Allowed |
|--------|---------|
| `school.principal` / `school.admin` / `school.owner` | Always (override) |
| Class teacher (`Classes.ClassTeacherId` → `Teachers.UserId` = JWT) | Always for that class |
| First-period teacher of that date | Yes |
| Other subject teachers | **403** `not_roll_call_teacher` |
| Student / parent | **403** |

Re-save by an allowed caller updates the same daily row (existing MERGE). `MarkedBy` stays the last writer.

### Who can READ

- Staff (teacher/principal/admin/owner): class list + student history unchanged, except student/parent tokens may only read their own child.
- Student: own `GET /students/{id}/attendance` and `GET /students/me`.
- Parent: linked children only.

### New read API

`GET /v1/classes/{classId}/attendance/roll-call?date=YYYY-MM-DD`

Returns the window + `can_mark` for the caller so CRM / teacher / principal UIs do not guess.

Exam attendance, staff geo check-in, and CRM teacher/staff roll-call are **out of scope**.

## App behaviour

**CRM (sms-admin):** Day view shows “Roll-call · P{n} · {subject} · {teacher}”. Leadership always editable. CRM teacher role: editable only when `can_mark`. Submit still `{ date, records }` with no period.

**Teacher app:** Same `AttendanceScreen`. If `can_mark` is false: read-only + “Marked by class teacher / P1”. Do not default unmarked students to Present — unmarked stays unmarked until Submit. Stop inventing empty timetable cells on My Timetable.

**Principal app:** Same screen, always `can_mark`. Dashboard still uses `GET /principal/attendance` (daily). Show who should mark vs who marked.

**Student app:** Home/profile show **today’s** single status (present/late/absent/leave/not marked) from history API, plus existing %.

**Parent app:** Home “Today’s classes” is timetable only (no fake per-period Present/Late). One daily status chip. Wire navigate to the month calendar. Map `leave` (not to present).

## Non-goals

- Per-period student attendance
- Clock-window lock (must mark during P1 minutes)
- Changing `AttendanceRecords` unique key
- Auto-mark from geo for students
- Publishing timetable from CRM (already exists)
