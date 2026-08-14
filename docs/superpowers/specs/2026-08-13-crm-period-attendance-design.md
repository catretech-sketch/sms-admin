# CRM period + subject attendance (timetable-driven)

**Date:** 2026-08-13  
**Status:** Draft — awaiting user review  
**Scope (v1):** CRM (`sms-admin`) only — Owner / Admin / Principal  
**Out of scope (v1):** Teacher app, student/parent apps, migrating daily rows into P1

## Problem

CRM attendance today is **one mark per class + student + date**. Timetable defines periods and subjects, but attendance does not store period/subject. Leadership needs:

**Today → Class → Section → Timetable periods → Take attendance → Save to SQL**

with a separate SQL row per subject/period (P1 Music ≠ P2 Maths).

## Goals

1. Keep the existing CRM attendance shell (summary, class-wise cards, date picker).
2. After opening a **grade** then a **section**, load **today’s timetable** for that section only.
3. Periods/subjects come **only** from timetable (no hardcoded P1–P8 / subject lists).
4. Highlight **CURRENT** period by school timezone + wall clock; leadership may still open any period.
5. Mark/edit Present / Absent / Late / Leave; save via production API → SQL; refetch.
6. Fail closed: no localStorage / sessionStorage / mockDb as source of truth.
7. Keep existing daily attendance rows as **legacy** (do not delete, do not migrate into P1).

## Non-goals (v1)

- Teacher/principal mobile apps consuming period marks
- Student/parent period chips
- Soft delete / undo
- Bulk “mark all periods present”

---

## Domain mapping (existing CRM model)

| Spec word | Existing model |
|-----------|----------------|
| Class (I, II, IV…) | Grade group on `Classes.Grade` |
| Section (IV-B) | One `Classes` row (`Id` = **ClassId**) |
| Period | `TimetableSlots.Period` (+ slot `Id`) |
| Subject | `TimetableSlots.Subject` (resolve `Subjects.Id` when name matches) |
| Today | Date picker default = local school calendar date |

There is **no separate SectionId** table today. **ClassId = section instance** (IV-B). Unique key uses that ClassId; do not invent a second section GUID.

---

## Data model

### Keep

`AttendanceRecords` with current unique key `(TenantId, ClassId, StudentId, Date)` — **legacy daily** rows (`Period` null / 0). Leave untouched.

### Add

New table **`PeriodAttendanceRecords`** (preferred over mutating daily unique key — avoids breaking teacher/student daily APIs in v1):

| Column | Notes |
|--------|--------|
| Id | uniqueidentifier PK |
| TenantId | RLS |
| ClassId | section (`Classes.Id`) |
| StudentId | |
| Date | date |
| Period | int (from timetable) |
| TimetableSlotId | uniqueidentifier NULL → FK-ish to slot when present |
| Subject | nvarchar (snapshot from timetable) |
| SubjectId | uniqueidentifier NULL (resolved from `Subjects` by name) |
| Status | present / absent / late / leave |
| MarkedBy | user id |
| CreatedAt / UpdatedAt | |

**Unique index (prevent duplicates):**

`(TenantId, ClassId, StudentId, Date, Period, SubjectId)`  
with a filtered/computed rule: when `SubjectId` is null, uniqueness is `(TenantId, ClassId, StudentId, Date, Period, Subject)` (normalized).

**Practical uniqueness for v1:**  
`(TenantId, ClassId, StudentId, Date, Period, Subject)` case-insensitive — matches “P1 Music” vs “P2 Maths” even without SubjectId.

Do **not** overwrite another subject/period.

Legacy daily `AttendanceRecords` remain for history / old UI paths until a later cutover.

---

## API (CRM v1)

Reuse tenants, auth, students, classes, timetable list.

### New / extended

1. **`GET /v1/classes/{classId}/timetable/day?date=YYYY-MM-DD`**  
   Teaching slots for that class on that weekday (skip lunch/break/recess/assembly).  
   Returns: `period`, `subject`, `subject_id?`, `start_time`, `end_time`, `timetable_slot_id`, `teacher_id?`, `teacher_name?`, `is_current` (server or client can compute current).

2. **`GET /v1/classes/{classId}/attendance/periods?date=&period=&subject=`**  
   Marks for that period/subject. Empty → not marked.

3. **`POST /v1/classes/{classId}/attendance/periods`**  
   Body: `{ date, period, subject, subject_id?, timetable_slot_id?, records: [{ student_id, status }] }`  
   Upsert by unique key. Auth: Owner / Admin / Principal (v1).  
   Validate: class in tenant; students belong to class; period+subject exist on that day’s timetable (or allow edit of prior day slots that still match timetable definition).

4. Existing daily `GET/POST .../attendance` unchanged for legacy.

### Authorization

- Write period attendance: `school.owner` | `school.admin` | `school.principal` (v1).  
- Reject forged class/student/period not in tenant timetable.

---

## CRM UI (progressive, same screen)

Keep: date control, hero summary, grade cards.

**Flow:**

```
Today (date)
  → Grade (I, II, IV…)          [existing cards]
  → Section (IV-A, IV-B…)       [existing expand]
  → Today's Timetable           [NEW under open section]
       P1 08:00–08:40 Music  [Take Attendance]  [CURRENT badge if now]
       P2 … Mathematics      [Take Attendance]
  → Student list for that period
  → Mark / Edit → Save → refetch
```

- Do not ask user to type subject; subject is fixed by the chosen timetable row.
- Leadership may open any period (not only CURRENT).
- If marks exist: show Present/Absent/Late/Leave and allow edit.
- If none: Not marked → mark → save.
- On API failure: error + retry; no success toast; no local persist as SoT.

Month mode (v1): keep date picker / day chips; period list still loads for the **selected date** (not a new month matrix of periods).

---

## CURRENT period

Using school timezone (CRM school `tz` / tenant):

`now` falls in `[start_time, end_time)` → that slot gets **CURRENT** badge.

If outside all periods: no CURRENT badge; user still picks any slot.

---

## Test plan (acceptance)

1. Today → Class IV → IV-B → timetable → P1 Music → mark → save → SQL row exists.  
2. Same path → P2 Mathematics → mark → save → **second** row; P1 unchanged.  
3. Refresh CRM → both load from API.  
4. Re-open P1 → statuses appear → edit → save → SQL updated.  
5. Legacy daily IV-B day mark still present in `AttendanceRecords` (untouched).  
6. No subjects/periods invented when timetable empty (empty state).

---

## Risks / follow-ups

- IV-B sample timetable may list the same subject every period — UI still shows each period row separately (correct per unique Period+Subject).  
- Teacher app still posts **daily** attendance until a later phase.  
- `SubjectId` may be null if Academics has no matching subject name — uniqueness falls back to Subject text.

## Approval

Please confirm this spec (or list changes). After approval → implementation plan → build.
