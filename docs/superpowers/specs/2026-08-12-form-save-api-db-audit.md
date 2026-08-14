# Form Save → API → Database Audit

**Date:** 2026-08-12  
**Repos:** `sms-admin` (CRM), mapped to `sms-backend` (ASP.NET + Dapper + SQL Server — not EF Core).  
**Sibling apps:** `sms-teacher-app`, `sms-student`, `sms-staff` (quick scan).  
**Status:** Audit only — no code changes yet.

## Verdict

**FAIL overall.** Core CRUD for students/teachers/staff/classes/subjects/exams/transport often **PASS**. Multiple CRM forms still use **localStorage as source of truth** or **404 fallback**, and some required backend endpoints are **MISSING**.

## Status legend

| Status | Meaning |
|--------|---------|
| PASS | Submit requires successful API write; no business local SoT |
| FAIL | Saves only in browser (or toast-only fake mutate) |
| PARTIAL | API exists but browser fallback/SoT remains |
| N/A | Read-only / export / mailto (not a business DB write form) |

## CRM forms (`sms-admin`)

| Form | API Endpoint | Controller | Service | Repository | Database Table | Status |
|------|--------------|------------|---------|------------|----------------|--------|
| Student Add/Update (core) — `studentAdd.tsx:374–411` | `POST/PATCH /v1/students` | `StudentController` | `SisService` | `StudentRepository` | `dbo.Students` | **PASS** |
| Student extras/parents/docs — `studentAdd.tsx:183–199`, `studentExtras.ts:53–55` | *(none)* | — | — | — | — | **FAIL** |
| Teacher Add/Update (core) — `teacherAdd.tsx:499–522` | `POST/PATCH /v1/teachers` | `TeacherController` | `StaffingService` | Staffing repos | `dbo.Teachers` | **PASS** |
| Teacher photo — `teacherAdd.tsx:470` | `PATCH /v1/teachers/{id}` | `TeacherController` | `StaffingService` | — | `dbo.Users`/`Teachers` | **PASS** |
| Teacher extras/docs — `teacherExtras.ts:189–200` | *(none)* | — | — | — | — | **FAIL** |
| Teacher salary profile — `teacherAdd.tsx:451` | `PUT /v1/payroll/salary-profiles/...` | Payroll controller | Fee/Payroll services | — | payroll tables | **PASS** |
| Staff Add/Update (core) — `staffAdd.tsx:423–433` | `POST/PATCH /v1/staff` | `StaffController` | `StaffingService` | Staffing repos | `dbo.Staff` | **PASS** |
| Staff extras/docs — `staffExtras.ts:171–183` | *(none)* | — | — | — | — | **FAIL** |
| Class Add/Edit — `academics.tsx:152–289` | `POST/PATCH /v1/classes` | `ClassController` | `AcademicsService` | Class repos | `dbo.Classes` | **PASS** |
| Class subjects — `classSubjects.ts:215–232` | `PUT /v1/classes/{id}/subjects` | `ClassController` | `AcademicsService` | `ClassSubjectRepository` | `dbo.ClassSubjects` | **PASS** (cache map OK) |
| Subjects CRUD — `academics.tsx:1551–1582` | `POST/PATCH/DELETE /v1/subjects` | Subjects controller | `AcademicsService` | — | subjects table | **PASS** |
| Timetable draft — `academics.tsx:880–886` | *(local only)* | — | — | — | — | **FAIL** |
| Timetable publish — `academics.tsx:887–920` | best-effort `/v1/timetable` | `TimetableController` | `AcademicsService` | `TimetableRepository` | `dbo.TimetableSlots` | **PARTIAL** (local SoT) |
| Periods draft/publish — `academics.tsx:1424–1432` | *(none)* | — | — | — | — | **FAIL** |
| Class tests draft/publish — `academics.tsx:1843–1851` | *(none)* | — | — | — | — | **FAIL** |
| Houses CRUD — `academics.tsx:2001–2030`, `schoolHouses.ts` | *(none)* | — | — | — | — | **FAIL** |
| Homework assign — `academics.tsx:1732–1751` | `POST /v1/assignments` (+ homework) | Assignments | — | — | assignments | **PASS** |
| Class attendance save — `attendanceClassWise.tsx` + `attendance.ts:197–219` | `POST /v1/classes/{id}/attendance` | `ClassController` | `AcademicsService` | `AttendanceRepository` | `dbo.AttendanceRecords` | **PARTIAL** (local on 404) |
| Teacher/staff attendance — `attendance.tsx:345–348`, `peopleAttendance.ts` | `POST /v1/staff-attendance` | `StaffAttendanceController` | `AcademicsService` | `StaffAttendanceRepository` | `dbo.StaffAttendanceRecords` | **PARTIAL** (local SoT) |
| Alert config — `attendanceAlerts.ts` + `attendanceAlertConfig.ts` | `PUT /v1/attendance/alert-config` | `AttendanceAlertController` | `AttendanceAlertConfigService` | `AttendanceAlertConfigRepository` | `dbo.AttendanceAlertConfigs` | **PARTIAL** |
| Exam create/update — `exams.tsx` / `exams.ts:59–82` | `POST/PATCH /v1/exams` | `ExamController` | `AcademicsService` | `ExamRepository` | `dbo.Exams` | **PASS** (core) |
| Exam classIds — `examClasses.ts` + `exams.ts:39–82` | *(stripped from body)* | — | — | — | — | **FAIL** |
| Exam papers CRUD | `/v1/exam-papers` | `ExamPaperController` | `AcademicsService` | `ExamRepository` | `dbo.ExamPapers` | **PASS** |
| Marks / grades — `exams.tsx:2500–2519` | `PUT /v1/grades` | `GradeController` | `AcademicsService` | `ExamRepository` | `dbo.Grades` | **PASS** |
| Exam paper attendance — `examAttendance.ts:90–112` | `PUT /v1/exam-papers/{id}/attendance` | `ExamPaperController` | `AcademicsService` | `ExamRepository` | `dbo.ExamAttendanceRecords` | **PARTIAL** |
| Fee heads CRUD — `feeHeads.ts` | `/v1/fees/heads` | — | — | — | — | **PARTIAL** (API expected; **backend MISSING**; local fallback) |
| Fee structure — `feeStructure.ts:172–198` | `PUT /v1/fees/structure` | — | — | — | — | **PARTIAL** (**backend MISSING**; local fallback) |
| Fee invoice generate — `feeInvoices.ts:202–229` | `POST /v1/fees/invoices/generate` | `FeeController` (partial) | `FeeService` | Finance repos | `dbo.FeeInvoices` | **PARTIAL** (local generate on 404) |
| Fee pay / waiver — `feePayments.ts:53–84` | `POST /v1/fees/invoices/{id}/pay` | `FeeController` | `FeeService` | — | `dbo.FeePayments` | **PARTIAL** (local on 404) |
| Fee reminders / Razorpay | `/fees/reminders`, razorpay order/verify | `FeeController` | `FeeService` | — | fees tables | **PASS** |
| Calendar add/delete — `calendar.tsx:131–227`, `calendarEvents.ts` | admin uses **local only**; backend has `GET/POST /v1/calendar` | `CalendarController` | `AcademicsService` | `CalendarRepository` | `dbo.CalendarEvents` | **FAIL** (admin not wired; no DELETE) |
| Approvals approve/reject — `dashboard.tsx:638–672` | `PATCH /v1/approvals/{id}` | Approvals | — | — | approvals | **PASS** |
| Announcements — `operations.tsx` | `POST /v1/announcements` | — | — | — | announcements | **PASS** |
| Complaints — `operations.tsx` | `POST/PATCH /v1/complaints` | — | — | — | complaints | **PASS** |
| Transport CRUD — `transport.tsx` | `/v1/transport/*` | Transport | — | — | transport tables | **PASS** |
| Hostel / Sports — `operations.tsx` | `/v1/hostel/*`, `/v1/sports/*` | Ops | — | — | hostel/sports | **PASS** |
| Users / invites / roles — `admin.tsx` | `/v1/users`, `/invitations`, `/roles/permissions` | Users/Roles | — | — | users/roles | **PASS** |
| Integrations / geo-fence / profile | school integrations & location APIs | — | — | — | — | **PASS** |
| Payroll run/approve/structure | `/v1/payroll/*` | Payroll | — | — | payroll | **PASS** |
| SIS Promote / Import — `sis.tsx:79,430,493` | *(toast only)* | — | — | — | — | **FAIL** (fake) |
| Login Remember me password — `LoginScreen.tsx:66–86` | *(local password)* | — | — | — | — | **FAIL** (credentials) |

## Sibling apps (quick)

| App | Business form local SoT? | Status |
|-----|--------------------------|--------|
| `sms-teacher-app` | Auth/session only | **PASS** for domain writes (no business LS SoT found) |
| `sms-student` | Auth + login prefs only | **PASS** for domain writes |
| `sms-staff` | **Mock mode** stores attendance/leave/trip in AsyncStorage (`sms.mock.*`) | **PARTIAL/FAIL** in mock; live auth OK |

## Backend gaps blocking true PASS

These admin forms cannot become PASS without new backend work:

1. Student/teacher/staff **document extras** (and rich parent records)
2. **Houses** catalog API
3. **Periods** / class-tests publish APIs
4. Fee **heads** + **structure** APIs (admin already calls them; backend missing)
5. Exam **`class_ids`** field
6. Calendar **DELETE** (and admin must switch from local to `GET/POST /calendar`)

## Fix candidates that can be done with existing APIs (frontend-first)

1. Calendar → wire to `GET/POST /v1/calendar` (delete may need backend)
2. People attendance → require `POST /staff-attendance` success; remove local SoT
3. Class attendance → remove 404 local fallback
4. Exam attendance → API-first, no soft local success
5. Alert config → require `PUT /attendance/alert-config`
6. Timetable publish → require `/timetable` sync success before toast
7. Fees → remove local fallback (fail closed when API missing)
8. Login → stop storing plaintext password
9. SIS Promote/Import → disable or wire real API

---

*Next: user chooses fix scope before implementation.*
