# Browser SoT → SQL migration status (2026-08-12)

Overall: **DONE for CRM admin Option B** — migrations applied through M0126 on local Sql `Sms`; API rebuilt & listening; fee generate + SQL integration checks green. Remaining: optional blob store for docs; sibling-app re-audit.

| Module | Old Browser Storage | API | DB Table | Migration Done | Browser SoT Removed | Tests |
|--------|---------------------|-----|----------|----------------|---------------------|-------|
| Calendar | `sms_calendar_events:*` | GET/POST/DELETE `/v1/calendar` | `dbo.CalendarEvents` (+ ChannelsJson) | M0121 + legacy POST migrate | Yes (legacy one-shot) | Admin vitest PASS; backend delete test added |
| Houses | `sms_houses:*` | GET/PUT `/v1/houses` | `dbo.SchoolHouses` | M0122 + legacy PUT migrate | Yes | Code complete |
| Fee heads | `sms_fee_heads:*` | GET/POST/PATCH/DELETE `/v1/fees/heads` | `dbo.FeeHeads` | M0123 + legacy migrate | Yes | Unit paths updated |
| Fee structure | `sms_fee_structure:*` | GET/PUT `/v1/fees/structure` | `dbo.FeeStructures` | M0123 + legacy migrate | Yes | Unit paths updated |
| Fee invoices/pay | local generate/pay on 404 | `POST /fees/invoices/generate` + list/pay | `FeeInvoices`/`FeePayments` | Generate implemented | Yes (fail-closed) | FeesTests + feeInvoices.test PASS |
| Class attendance | `sms_attendance:*` on 404 | POST `/classes/{id}/attendance` | `AttendanceRecords` | Fail-closed + cache after OK | Write SoT removed | attendance.test PASS |
| People attendance | local authoritative | POST `/staff-attendance` | `StaffAttendanceRecords` | Fail-closed | Write SoT removed | peopleAttendance.test PASS |
| Exam attendance | soft local success | PUT `/exam-papers/{id}/attendance` | `ExamAttendanceRecords` | Fail-closed | Soft-local success removed | examAttendance.test PASS |
| Timetable publish | local publish then best-effort | POST/DELETE `/timetable` | `TimetableSlots` | Publish waits for API | Publish SoT inverted | Manual/UI |
| Exam class_ids | `sms_exam_classes:*` | exam create/update `class_ids` | `dbo.ExamClasses` | M0124 | API primary; legacy read/migrate | examClasses.test PASS |
| Periods / class tests | `sms_academics_pub:*` | GET/PUT `/v1/academic-periods`, `/v1/class-tests` | `AcademicPeriodSchedules`, `ClassTestSchedules` | M0125 applied | Yes (timetable draft local until publish) | academicsPublish + PublishAndExtrasTests PASS |
| Student/Teacher/Staff extras+docs | `sms_*_extras:*` | GET/PUT `/v1/{students\|teachers\|staff}/{id}/extras` | `dbo.PersonExtras` | M0126 applied | Yes | teacherExtras + PublishAndExtrasTests PASS |
| Login remember | plaintext password | — | — | N/A | Password storage removed (id only) | — |

## Verification (2026-08-13)

- FluentMigrator CLI against `appsettings.Development.json` → **Migrations applied successfully** (through M0126).
- `Sms.Api` rebuilt and listening on `http://localhost:5162` (`/health` 200).
- Integration: `PublishAndExtrasTests` + `FeesTests` → **Passed: 4, Failed: 0**.
- Admin vitest: `feeInvoices.test.ts` → **6 passed**.

## DONE / PARTIAL / BLOCKED

- **DONE:** All CRM browser-SoT FAIL modules above; fee invoice generate; local SQL migrations; API restart; focused SQL integration suite.
- **PARTIAL (non-blocking):** Timetable *draft* may still use local cache until publish; extras/docs stored as JSON (incl. data URLs), not a dedicated blob store.
- **Out of scope here:** Sibling apps (teacher/student/staff) full re-audit.
