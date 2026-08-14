# Advanced Attendance (CRM) — Design Spec

**Date:** 2026-08-13  
**Status:** Approved — implementation plan next  
**Approved UI rule:** Keep existing Attendance mark page unchanged; add Advanced tab only.  
**Scope:** CRM (`sms-admin`) Attendance module + supporting production API/SQL only  
**Out of scope:** Teacher / Student / Parent app UI changes; Academics builder; Fees; Exams; Messenger; unrelated modules  
**Product choice:** Option **C** — full north-star (user plan §§1–30) delivered as **one mega-plan with three phases**  
**UI rule (locked):** **Do not change the existing Attendance mark page.** Keep current mark flow/UI as-is. **Only add** a new Attendance **tab** (e.g. “Advanced”) for list / filters / summaries / range views.

---

## 1. Problem

Leadership needs a production Advanced Attendance surface that answers, for any filtered slice:

class → section → student → subject → period → assigned teacher → who marked → role → when → status → % → geo (if required) → 30/60/90 history

Today CRM can open a class/section/date and mark period attendance, but it lacks a server-filtered advanced list, summaries, week/month/range drill-downs, geo metadata on period marks, and full edit audit.

---

## 2. Non-negotiables (global)

Copied from the product plan; every phase inherits these:

1. **API → SQL only** for attendance business data. No `localStorage` / `sessionStorage` / IndexedDB / AsyncStorage / `mockDb` as source of truth. React Query = cache after successful API only.
2. **On API failure:** show error + Retry. Never fall back to local attendance.
3. **Server-side filtering + pagination** for list/search/range views. Never download-all then filter in React.
4. **Assigned Teacher ≠ Marked By.** Timetable teacher stays assigned; marker is the authenticated actor.
5. **Never trust frontend** for `TenantId`, `MarkedByUserId`, `MarkedByRole`, `AssignedTeacherId`. Derive from auth + timetable/SQL.
6. **Official %** = `(Present + Late) ÷ Marked periods × 100`. Unmarked excluded. Legacy daily `AttendanceRecords` never used for official %.
7. **Do not modify unrelated modules.** Reuse existing APIs/tables/RBAC/audit where possible; add only when genuinely missing.
8. **Class / section / subjects / periods / students** come from live school data + timetable — no hardcoding.
9. **Keep the existing Attendance mark page unchanged** (`ClassWiseStudents` / period mark grid). Advanced features live in a **new Attendance tab only** — additive CRM UI, not a redesign of mark.

---

## 3. Domain mapping

| UI word | System |
|--------|--------|
| Class (IV) | `Classes.Grade` group |
| Section (B / IV-B) | One `Classes` row (`Id` = ClassId) |
| Student | `Students` (`AdmissionNo` → CRM `adm`) |
| Period / Subject / Assigned Teacher | `TimetableSlots` for that ClassId + weekday |
| Attendance row | `PeriodAttendanceRecords` |
| Official % | Existing period summary math / endpoints |
| Tenant audit (coarse) | `AuditLog` |
| Period edit history (fine) | New `PeriodAttendanceAudit` (Phase 3) |
| Geo on mark | New nullable columns on period mark (Phase 3); not a separate geo attendance product |

Legacy daily `AttendanceRecords` remain untouched (history / old paths). Advanced Attendance is **period-based only**.

---

## 4. What already exists (reuse)

| Capability | Location |
|------------|----------|
| Period marks table + bulk upsert + RLS | `PeriodAttendanceRecords`, `PeriodAttendance_BulkUpsert` (M0128) |
| Day timetable | `GET /v1/classes/{id}/timetable/day` |
| List/upsert period marks for class+date(+period+subject) | `GET/POST /v1/classes/{id}/attendance/periods` |
| Class / student period % summary | `GET …/attendance/summary` |
| MarkedBy / MarkedByRole on upsert | Set from caller claims today |
| CRM class-wise mark UI | `attendanceClassWise.tsx` |
| Feature flag for attendance geofence | `attendance.geofence` (Platinum); school location APIs |
| Coarse ops audit | `dbo.AuditLog` |

### Current DTO gap

`PeriodAttendanceRecordResponse` today is thin (ids + period/subject/status/MarkedBy*). Advanced list needs joined names, admission no, times, assigned teacher, marked-at, later geo + updated-by.

---

## 5. Target architecture

```
CRM Advanced Attendance
  → Production API (filtered/paginated queries + existing upsert)
  → SQL (PeriodAttendanceRecords ⋉ Students ⋉ Classes ⋉ TimetableSlots [+ geo/audit in Phase 3])
```

### Canonical data flow (Advanced tab = read / analyze; mark page = existing write UI)

```
EXISTING MARK PAGE (unchanged)
  DATE → CLASS → SECTION → TIMETABLE → PERIOD → STUDENTS → API → SQL

NEW ADVANCED TAB (additive)
  FILTERS / SEARCH / SUMMARIES / RANGES
  → GET period-records + aggregate APIs
  → SQL joins (students, classes, timetable, marker, later geo/audit)
  → CRM list & drill-down (no redesign of mark page)
```

Marking attendance continues only on the **existing** mark page / APIs. The Advanced tab is primarily **view / filter / summarize**. Optional deep-link “Open mark for this period” may navigate to the existing mark page with query params — without changing that page’s layout or controls.

### “Not Marked” rule

- Do **not** materialize Not Marked rows for every student×period×day in SQL.
- **Marked list views:** return only stored period rows.
- **Pending / Not Marked:** compute for a **bounded** scope (selected class+section+date, or selected period) as `timetable slots × roster − marked`, server-side.
- Summaries expose `notMarked` / `pendingPeriods` counts from that bounded computation.

---

## 6. Phased delivery (Option C)

### Phase 1 — Advanced tab: list + who marked (mark page untouched)

**Covers product §§:** 1–10, 14 (read-only class slice later in P2), 17 (as list/period panel **inside Advanced tab**), 18 (reuse %), 25–28, 29 (questions 1–10), relevant §30 checks.

**Backend**

1. **`GET /v1/attendance/period-records`**  
   Query params (all combinable, server-side):  
   `from`, `to` (or `preset=today|yesterday|this_week|…|last_90_days`),  
   `classId` / `grade`+`section`, `subject`, `period`,  
   `assignedTeacherId`, `markedBy`, `markedByRole`, `status`,  
   `q` (student name OR admission no),  
   `page`, `pageSize`  
   Date presets resolved on server in school/tenant timezone.  
   **Do not** accept client-supplied marker identity.

2. **Enriched row shape** (camelCase via existing serializer):  
   studentId, studentName, admissionNo, classId, grade, section, classLabel,  
   date, subject, subjectId?, period, periodId?, startTime?, endTime?,  
   status (`present|absent|late|leave`; UI adds Not Marked only in pending views),  
   assignedTeacherId?, assignedTeacherName?,  
   markedBy?, markedByName?, markedByRole?, markedAt? (`UpdatedAt` or `CreatedAt`),  
   geoFenceStatus = `not_required` stub until Phase 3  

3. **Join assigned teacher** from timetable for `(classId, date→weekday, period, subject)` on read. Optional write-time snapshot columns `AssignedTeacherId/Name` may be added if timetable churn is a risk; default = join.

4. **Do not change** existing mark-page request/response contracts unless a **backward-compatible** enrichment is required for other clients. Prefer new Advanced list DTO only.

5. **AuthZ for reads** on the new list API: leadership/staff with attendance view; teachers only rows for classes/periods they are allowed to see (timetable + RBAC).  
   **Write AuthZ** stays on existing upsert (unchanged mark UI); harden server rules without CRM mark UI changes.

**CRM UI**

1. In Attendance screen tabs (Students / Teachers / Staff / …), **add a new tab** e.g. **Advanced** (exact label TBD in plan: “Advanced” or “Records”).  
2. **Do not modify** the existing Students class-wise **mark** page UI/UX (period strip, roster, save bar) beyond the minimum needed to register the new sibling tab in `attendance.tsx`.  
3. Advanced tab contents (Phase 1): Class, Section, Date (default **Today**), search, combinable filters, paginated **list** with columns from product §2 (geo = Not Required until Phase 3).  
4. Optional period panel **inside Advanced tab only** (Assigned Teacher, Completed/Pending, Marked By) — not on the mark page.  
5. No browser SoT; error + Retry.

**Explicitly deferred to Phase 2/3:** week/month matrices, 30/60/90 dashboards, subject/teacher summary boards, geo filter values other than Not Required, fine-grained edit history UI, any mark-page redesign.

---

### Phase 2 — Summaries + week / month / 30–60–90

**Covers product §§:** 14–16, 19–21, remaining §29 Q11/Q13, matching §30 summary checks.

**Backend (new aggregate endpoints; no full-table download)**

1. **Class summary** — selected date + classId:  
   totalStudents, present, absent, late, leave, notMarked, attendance%,  
   totalPeriods, markedPeriods, pendingPeriods  

2. **Subject summary** — classId + date range (default today or selected range):  
   subject, teacher, periods, marked, pending, present, absent, late, attendance%  
   Click → filtered period-records (Phase 1 API).

3. **Teacher summary** — date range:  
   teacher, classes, sections, subjects, expectedPeriods, markedPeriods, pendingPeriods,  
   counts by marker role: teacherMarked / staffMarked / principalMarked / adminMarked  

4. **Range rollups** — presets 30 / 60 / 90 (+ week / month):  
   Filters: class, section, student, subject, teacher  
   Totals: totalPeriods (marked), present, absent, late, leave, attendance%  
   Drill-down: range → date → class → section → subject → period → students via Phase 1 list API  

**CRM UI**

- All summary / week / month / 30–60–90 UI lives **only under the Advanced tab** (sub-views or nested tabs inside Advanced).  
- **Still no changes** to the existing mark page.  
- Summary cards / tables for class, subject, teacher  
- Week view rows (date, class, section, subject, period, teacher, taken/pending)  
- Month view with per-day aggregates  
- 30/60/90 controls wired to range APIs  

**%:** call / reuse existing period summary math; do not invent a second formula.

---

### Phase 3 — Geo-fence metadata + fine audit

**Covers product §§:** 22–24, geo filters in §4/§23, Updated By fields, remaining §30 geo/audit checks.

**Geo (validation layer only)**

1. Persist/display geo on period records when data exists; list/filter in **Advanced tab**.  
2. **Do not change the mark page UI** to collect location in this epic unless product later explicitly asks. If mark-time capture is required later, it is a separate additive change to the mark submit payload only after approval.  
3. Until capture exists on write path: stored/default status remains `not_required` / `unavailable` as appropriate.  
4. When feature `attendance.geofence` enabled **and** fence configured **and** a future write path sends lat/lng: server validates distance vs school centre/radius.  
5. Columns e.g. `GeoFenceStatus` (`valid|outside|not_required|unavailable`), `GeoDistanceMeters`, `GeoCapturedAt`.  
6. Advanced tab shows only: status, distance, captured-at. **No** continuous tracking. **No** separate geo attendance system.

**Audit**

1. On insert/update of period marks (existing upsert), append **`PeriodAttendanceAudit`** (or equivalent):  
   recordId, tenantId, studentId, classId, date, period, subject,  
   fromStatus?, toStatus, actorId, actorName, actorRole, at  
2. Also write a coarse `AuditLog` entry when that pattern is already used elsewhere for school actions.  
3. **Advanced tab** shows Marked By / Role / Marked At and edit history drawer — **not** on the mark page.  
4. Columns `UpdatedBy` / `UpdatedByRole` / `UpdatedAt` on `PeriodAttendanceRecords` if needed — prefer explicit columns **plus** history rows.

---

## 7. CRM information architecture

Attendance screen keeps existing tabs (Students mark, Teachers, Staff, …) **unchanged in behavior**.

| Tab / view | Change? | Purpose |
|------------|---------|---------|
| Students (existing mark) | **No** — keep same | Class → Section → Date → Timetable periods → mark students |
| Teachers / Staff (existing) | **No** — keep same | People attendance (unchanged) |
| **Advanced (NEW)** | **Add only** | Filterable list, summaries, week/month/30–60–90, audit drawer |

Inside **Advanced** only:

| Sub-view | Phase | Purpose |
|----------|-------|---------|
| Records list | 1 | Filterable/paginated period records |
| Period panel | 1 | Optional day/period status for selected class |
| Class / Subject / Teacher summary | 2 | KPI boards |
| Week / Month / 30–60–90 | 2 | Range analytics + drill-down |
| Audit drawer | 3 | History for a selected mark |

Default date on Advanced: **Today**. Live classes/sections from API.

---

## 8. Security

| Rule | Enforcement |
|------|-------------|
| Tenant isolation | RLS + auth tenant context |
| Role | Existing school roles + attendance permissions |
| Class/section access | Leadership: tenant; Teacher: timetable assignment; Staff: RBAC grants |
| Subject/period | Must exist on that day’s timetable for class (write validation) |
| Marker identity | From `ClaimsPrincipal` only |
| Assigned teacher | From timetable (or server snapshot), never from client override |

Teacher must **not** access another teacher’s attendance by changing frontend params — backend reject.

---

## 9. Acceptance matrix (by phase)

### Phase 1 PASS

- Class / section / date / subject / period / teacher / marked-by / role / status filters work and combine  
- Student search (name + admission) works with filters  
- Date presets + custom range via API (no full browser load)  
- Assigned Teacher displayed separately from Marked By / Role / Marked At  
- Teacher / Staff / Principal / Admin marks show correct Marked By Role when those roles mark  
- Period-wise Completed/Pending + marker line **in Advanced tab**  
- Period % formula unchanged / reused  
- API→SQL only; error+Retry; no mock SoT  
- Tenant + RBAC + server pagination  
- **Existing mark page visually/behaviorally unchanged** (only sibling tab added)  

### Phase 2 PASS

- Class / subject / teacher summaries  
- Week / month / 30 / 60 / 90 filters + drill-down  
- Aggregates match period formula  

### Phase 3 PASS

- Geo status/distance/captured-at where applicable; geo filter  
- Edit audit history; Updated By fields  
- No continuous location tracking  

Full product §30 checklist is the **union** of all three phases.

---

## 10. Explicit non-goals (this epic)

- **Redesigning or rewriting the existing Attendance mark page**  
- Changing Teacher / Parent / Student app screens (parity follow-up)  
- Migrating or deleting legacy daily `AttendanceRecords`  
- Soft-delete / undo beyond audit history  
- Hardcoded class/section/subject/period catalogs  
- Browser-side official % recalculation  
- Separate Geo-Fence attendance product  
- Collecting geo on the mark page UI in this epic (display/filter in Advanced only unless later approved)  

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Huge “Not Marked” cartesian product | Bounded pending computation only |
| Timetable changes after mark | Prefer read-time join; optional snapshot in Phase 1 if needed |
| AdmissionNo empty in SIS | Show “—”; search still matches name |
| Geo feature tier | Gate on `attendance.geofence` + school location |
| Mega-plan thrash | Ship Phase 1 to production acceptance before Phase 2 UI |

---

## 12. Approval

Please review this file and reply:

- **Approved** — proceed to implementation plan (`writing-plans`) covering Phases 1→2→3 as one mega-plan with sequenced tasks  
- **Changes** — list edits (especially Phase boundaries or geo/audit timing)

No code until the implementation plan is written and you ask to execute.
