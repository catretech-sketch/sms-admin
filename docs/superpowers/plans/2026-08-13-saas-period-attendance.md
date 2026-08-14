# Period attendance — inspection report + implementation plan

**Date:** 2026-08-13  
**Status:** Implemented (backend + CRM + teacher + student/parent clients)  

## PHASE 1–2 — Inspection (reuse vs extend)

### 1. Existing attendance API
| Endpoint | File | Role |
|----------|------|------|
| `GET/POST /v1/classes/{id}/attendance` | `ClassController.cs` | Daily `AttendanceRecords` |
| `GET .../attendance/roll-call` | same | Who may mark daily |
| `GET /v1/students/{id}/attendance` | `StudentController.cs` | Daily history (scoped for student/parent) |
| `GET /v1/principal/attendance` | `ReportingController.cs` | Daily school summary |
| Staff / exam / geo | separate | **Do not reuse for period marks** |

**Reuse:** Academics attendance service/repo pattern, roll-call non-teaching skip, tenant RLS.  
**Extend:** Same Academics domain with **new** `PeriodAttendanceRecords` + period routes under `/v1/classes/{id}/…` (not `/crm-attendance`).

### 2. Timetable API
`GET /v1/timetable` + `TimetableRepository.ListForClassDayAsync(classId, day)` (Period, Subject, TeacherId, Start/End).  
**Extend:** expose `GET /v1/classes/{id}/timetable/day?date=` (wraps existing repo).

### 3. Student / class / teacher
Classes = section (`IV-B` = one ClassId). Students list + `GetMyStudentAsync` (Users.StudentId = admission). Teachers via `Teachers.UserId`.

### 4. Parent–child
No ParentChildren table — same admission link as student. Reuse `GetMyStudentAsync` for read scope.

### 5. Tenant / RBAC
`TenantResolutionMiddleware` + RLS `fn_tenant_predicate`. Policies: Principal, TeacherApp, StudentOrParent. Never trust client tenantId.

### 6. Daily DB model
`AttendanceRecords` + `UQ_Attendance_Class_Student_Date` — **leave unchanged** (legacy).

### 7–10. Change list
| Item | Action |
|------|--------|
| Migration `M0128_PeriodAttendance_Tables` | **New** table + TVP + MERGE + RLS |
| `AcademicsContracts` / `PeriodAttendanceRepository` / `AcademicsService` | **Extend** |
| `ClassController` | **Extend** day timetable + period GET/POST |
| `StudentController` | **Extend** period history query (or filter on student attendance) |
| CRM `attendance.ts` + `attendanceClassWise.tsx` | **Extend** UI under ClassPanel |
| Teacher / student / parent apps | Same period endpoints |
| `Client_Delete.sql` | Include new table |

**Do NOT create:** `/crm-attendance`, `/teacher-attendance`, duplicate tenant logic, or mutate daily unique key.

---

## Implementation phases

1. DB migration + proc  
2. Backend contracts/repo/service + ClassController  
3. Student period history + teacher auth on write  
4. CRM UI  
5. Teacher app  
6. Student + parent apps  
7. Tests + E2E  

Unique key: `(TenantId, ClassId, StudentId, Date, Period, Subject)` (+ `SubjectId` nullable, `TimetableSlotId` / Period as period id).
