# Field & Domain Reference — SchoolMate Admin CRM (complete)

**Date:** 2026-06-09 · **Repo:** `sms-admin` (React 19 · Vite 6 · TypeScript 5.7)
**Purpose:** A complete, nothing-omitted inventory of **every data field, every table column, every form input, and every flow** in the app, plus the gaps to close for a production system serving teacher/student/parent/staff on the **same backend API**.

## How to read this
- **Part A — Domain entities** (the data models, every field).
- **Part B — Files 1–22** (each screen: gating · every column · every form field with type/options/default/validation · full flow · gaps).
- **Part C — Exam flow** (all 9 phases, fields at each).
- **Part D — Backend API** (existing + needed endpoints).

**Legend:** 🟢 exists · 🔴 gap for production · Caps `V`=View `E`=Edit `A`=Approve · Roles `admin`/`principal`/`vice_principal`/`teacher` (+ `Owner`) · Tiers `silver`<`gold`<`platinum`. **`required` = marked required in the form; `*` next to a field name = required.**

> **Architecture note.** Today = a single admin CRM, 4 staff roles, **no real backend** (in-memory mock `src/data/mockDb.ts` behind a **read-only** `Api`). No teacher/student/parent apps. Every form below is **toast-only — it does not persist** unless stated. Building the customer apps = finish the entities (Part A) + add write/auth endpoints (Part D) + add `student`/`parent` roles.

---

# Part A — Domain Entities

Source: `src/types/index.ts`; seed shapes: `src/data/mockDb.ts`.

## A.1 Enums
| Type | Values |
|---|---|
| `Tier` | `silver` `gold` `platinum` |
| `Role` | `admin` `principal` `vice_principal` `teacher` (🔴 no `student`/`parent`) |
| `Cap` | `V` `E` `A` |
| `ConsoleKind` | `owner` `school` |
| `SchoolStatus` | `active` `trial` `past_due` |
| `FeeStatus` | `paid` `partial` `due` |
| `ActiveStatus` | `active` `inactive` |
| `BusStatus` | `on_route` `at_stop` `delayed` `idle` `maintenance` |
| `ExamStatus` | `scheduled` `completed` `marks_entry` `draft` |
| `ComplaintStatus` | `open` `in_progress` `resolved` |

## A.2 School — `School`
`id` `name` `city` `plan`(Tier) `students` `staff` `status`(SchoolStatus) `mrr` `attendance` `fees` `payroll` `currency` `tz` `logo` `color` — all 🟢.
🔴 Add: `address` `phone` `email` `board` `academicYear` `gstId` `principalName` `establishedYear` `affiliationNo`.

## A.3 Student — `Student`
`id` `adm` `name` `gender`(`M`/`F`) `grade` `section` `cls` `roll` `guardian` `phone` `attendance` `feeStatus`(FeeStatus) `feeDue` `status`(ActiveStatus) `house` `avatarHue` — all 🟢.
🔴 Add: `dob` `bloodGroup` `email` `address` `admissionDate` `category` `religion` `nationality` `aadhaar` `photoUrl` `fatherName` `motherName` `guardianRelation` `fatherPhone` `motherPhone` `emergencyContact` `parentUserId` `previousSchool` `transferCert` `medicalNotes` `transportRoute` `busStopId`.

## A.4 Teacher — `Teacher`
`id` `name` `gender` `dept` `desig` `subjects`(string[]) `classTeacher`(string\|null) `phone` `email` `exp` `rating` `attendance` `result` `load` `status`(ActiveStatus) `avatarHue` `top`(bool) — all 🟢.
🔴 Add: `dob` `joiningDate` `qualification` `address` `aadhaar` `salary` `userId` `photoUrl` `bloodGroup` `emergencyContact`.

## A.5 Staff — `Staff`
`id` `name` `gender` `role` `cat`(transport/security/academic/admin/support) `dept` `phone` `shift` `route`(string\|null) `attendance` `status`(ActiveStatus) `avatarHue` — all 🟢.
🔴 Add: `email` `joiningDate` `salary` `userId` `dob` `address`.

## A.6 Parent — 🔴 NO ENTITY
Only a local UI shape in `people.tsx`: `Parent {id name phone hue wards:{name,cls}[] due}`, derived by grouping students on `guardian` name.
🔴 Production: real `Parent {id name email phone relation wardStudentIds[] userId address}` + real Student↔Parent FK.

## A.7 Bus — `Bus`
`id` `no` `label` `driver` `conductor` `route` `capacity` `students` `stops` `status`(BusStatus) `speed` `eta` `fuel` `color` — 🟢.
🔴 Add: `driverStaffId` `conductorStaffId` `gpsDeviceId` `lat` `lng` `routeStops:Stop[]` `geofenceRadius`.

## A.8 Exam — `Exam`
`id` `name` `type`(Term/Unit Test/Periodic/Board Prep) `grades` `from` `to` `subjects`(count) `status`(ExamStatus) `marksEntered`(%) `published`(bool) — 🟢.
🔴 Add: `academicYear` `term` `maxMarksPerSubject` `passingMarks` `weightage` `datesheet:Paper[]` `gradingSchemeId`.

## A.9 Approval — `Approval`
`id` `type` `module` `cap`(Cap) `title` `detail` `requester` `role` `amount`(number\|null) `age` `priority`(high/medium/low) `forRoles`(Role[]) — 🟢.
🔴 Add: `createdAt` `status` `decidedBy` `decidedAt` `entityRef`.

## A.10 Notification — `AppNotification`
`id`(number) `icon` `tone` `title` `body` `time` `unread`(bool) — 🟢.
🔴 Add: `userId` `createdAt` `link` `category` `channel`.

## A.11 Complaint — `Complaint`
`id` `subject` `from` `cat` `priority`(high/medium/low) `status`(ComplaintStatus) `age` `assignee` `body` — 🟢.
🔴 Add: `createdAt` `raisedByUserId` `assigneeUserId` `resolutionNote` `attachments[]`.

## A.12 Messaging — `Thread` / `ThreadMsg`
`Thread {id(number) parent student teacher unread(number) last time hue msgs:ThreadMsg[]}` · `ThreadMsg {me(bool) t(text) at(time)}` — 🟢.
🔴 Add: `fromUserId`/`toUserId` (replace `me`), `createdAt` `readAt` `attachments` `threadType`.

## A.13 Academic computation — `format.ts`
`ReportRow {subject max marks grade gpa pass}` · `Report {rows total maxTotal pct grade gpa result('PASS'|'COMPARTMENT')}` · `RankInfo {rank classSize}` · `MonthValue {label value}` — 🟢.
🔴 Marks are **hashed, not stored** → add `Mark {examId studentId subjectId marks maxMarks grade enteredBy enteredAt}`.

## A.14 Query options
`ListStudentsOpts {q? grade? status? fee?}` · `ListTeachersOpts {q? dept? status?}` · `ListStaffOpts {q? cat?}` — 🟢. 🔴 No pagination/sort params.

---

# Part B — Files (every column, every field, every flow)

## Foundation

### 1. `src/types/index.ts` — Domain types
All Part A entities + enums. 🔴 Add `student`/`parent` roles; the missing fields above; new entities `Mark` `Paper` `Stop` `FeeInvoice` `PayrollRun` `Parent` `Timetable`.

### 2. `src/data/mockDb.ts` — Seed + config tables
Exports config: `TIERS` `TIER_META` `FEATURE_TIER` `ROLES` `ROLE_META` `PERMS`; lists `sections`(A–D) `grades`(Nursery…XII) `subjects`(English/Hindi/Mathematics/Science/Social Studies/Computer) `depts`(8); seed arrays: schools×7, students×240, teachers×48, staff×56, buses×7, exams×6, approvals×6, notifications×5, complaints×6, threads×3.

**`FEATURE_TIER`:** silver → `sis academics attendance exams fees communication operations library transport hostel sports`; gold → `hr_payroll analytics.weak_students reporting.advanced`; platinum → `attendance.geofence transport.gps support.dedicated`.

**`ROLE_META`:** admin "Admin/AD — Day-to-day setup & data entry" · principal "Principal/PR — Final approver + all reports" · vice_principal "Vice-Principal/VP — Academic owner, no financial authority" · teacher "Teacher/TE — Marks, attendance & homework for own classes".

**`PERMS` (module → role → caps):**

| Module | admin | principal | vice_principal | teacher |
|---|---|---|---|---|
| setup | E | V,E | V | — |
| dashboard | V | V | V | V |
| identity | E | V,E | V | — |
| sis | E | V,E | V,E | V |
| academics | E | V,A | E,A | V,E |
| attendance | E | V,A | V,E,A | V,E |
| exams | E | A | A | V,E |
| fees | E | A | V | — |
| hr | E | A | A | — |
| communication | E | E,A | E | E |
| operations | E | V | V | — |
| settings | E | V | V | — |

🔴 Gating is **UI-only** — the backend must enforce the same matrix.

### 3. `src/lib/api.ts` → **Part D**

### 4. `src/lib/format.ts`
`fmtMoney(n,cur='₹')` `fmtNum(n)` `gradeFor(p)` `gpaFor(g)` `studentSubjectMarks(stu,subj,examId)` `reportFor(stu,examId)` `classRank(stu,examId)` `attendanceMonths(stu)`.
**Grades:** A1≥91 · A2≥81 · B1≥71 · B2≥61 · C1≥51 · C2≥41 · D≥33 · E<33. **GPA:** A1=10 A2=9 B1=8 B2=7 C1=6 C2=5 D=4 E=3. **Pass=33.**
🔴 Hard-coded CBSE scheme; ignores Owner "Grading scheme" setting.

### 5. `src/lib/gating.ts`
`tierIncludes(plan,feature)` `requiredTier(feature)` `can(role,module,cap)` `caps(role,module)`. 🔴 Add `student`/`parent` to PERMS; enforce server-side.

### 6. `src/lib/timetable.ts`
`Cell {subject teacherId}` · `Grid=Record<cellKey,Cell|null>` · `Grids=Record<class,Grid>`. Fns: `cellKey(d,p)` `clashingClasses` `clashingClass` `teacherBusyElsewhere` `pickTeacher` `conflictsFor` `teacherLoads` `clashingTeachers`. 🔴 Timetables never persisted; add `Timetable` entity.

### 7. `src/context/AppProvider.tsx`
`DemoAccount {email name role console hue}` · `AppUser {name email role hue}`.
State: `loggedIn user consoleKind role schoolId ownerViewingSchool lang dir view mobileNav focus intent` + derived `school plan`.
Actions: `login(email)` `logout` `go(view,{focus,intent})` `clearIntent` `setSchoolId` `enterSchool(id)` `exitToOwner` `upgrade(tier)` `setLang(l)` `setMobileNav(open)`.
**5 demo accounts:** anil@schoolmate.io (Anil Mehta, admin, owner, hue250) · admin@greenwood.edu (Ravi Menon, admin, school, 200) · principal@greenwood.edu (Sunita Rao, principal, 330) · vp@greenwood.edu (Arjun Banerjee, vice_principal, 150) · teacher@greenwood.edu (Meera Krishnan, teacher, 20).
🔴 `login` = email only, **no password/auth**; no student/parent routing.

### 8. `src/router.tsx`
`ViewMeta {title sub? phase}`. Views (key → title · phase):
Owner: `owner.dashboard` Portfolio overview·4 · `owner.schools` Schools·4 · `owner.create` Create school·4 · `owner.reports` Cross-school reports·4 · `owner.billing` Subscriptions & billing·4 · `owner.users` Users & roles·4 · `owner.settings` Owner settings·4.
School: `school.dashboard` Dashboard·1 · `school.approvals` Approvals·1 · `school.sis` Students·1 · `school.student` Student profile·1 · `school.teachers` Teachers·3 · `school.staff` Staff·3 · `school.parents` Parents·3 · `school.academics` Academics·2 · `school.calendar` Calendar·2 · `school.exams` Exams·2 · `school.attendance` Attendance·3 · `school.fees` Fees·3 · `school.hr` HR & Payroll·3 · `school.comm` Communication·3 · `school.ops` Operations·3 · `school.gps` Live bus tracking·3 · `school.reports` Reports·5 · `school.identity` Identity & access·5 (Admin-only) · `school.settings` Settings·5.

---

## School console

### 9. `src/screens/LoginScreen.tsx` — Login
**Gating:** none. Calls `app.login(email)`.
**Form fields:**
| Field | Type | Default | Notes |
|---|---|---|---|
| Email address | email (icon user) | `admin@greenwood.edu` | placeholder `you@school.edu` |
| Password | password (toggle show/hide, icon lock) | `demo1234` | eye button toggles |
| Remember me | checkbox | on | |
| Forgot password? | link | — | 🔴 no handler |
| Sign in | submit | — | Spinner + "Signing in…", `app.login` after 450ms |

**Demo picker** ("or try a demo account"): 5 chips from `DEMO_ACCOUNTS` (Avatar+name+role label; owner chip shows "Owner").
**Left panel POINTS:** "Two-console SaaS — Owner + School" · "Tier & role-based access control" · "Real-time attendance, fees & transport". Footer "© 2026 SchoolMate · A multi-tenant school management SaaS".
**Flow:** type email/password (or click demo) → Sign in → `AppProvider.login` routes owner-domain emails to owner console, others to school console.
🔴 Gaps: no password check, no SSO, no forgot-password, no signup, no student/parent demo accounts.

### 10. `src/screens/school/dashboard.tsx` — Dashboard + Approvals
Exports `school.dashboard` (`SchoolDashboard`), `school.approvals` (`ApprovalsInbox`).
**Gating:** none via `can()`; approvals filtered by `a.forRoles.includes(app.role) && !acted.has(a.id)`.

**SchoolDashboard — KPI row (5 `Kpi`: label/value/delta/deltaDir/foot):**
| KPI | Value | Delta | Foot |
|---|---|---|---|
| Total enrollment | `fmtNum(s.students)` | 3.8% ↑ | `{grades.length} grades · {staff} staff` |
| Today's attendance | `s.attendance%` | 0.7% ↑ | `{studentsPresent} of {students} present` |
| Fees collected today | `fmtMoney(feesToday)` | 12.4% ↑ | `{s.fees}% of annual target met` |
| Outstanding dues | `fmtMoney(outstanding)` | 4.1% ↓ | `{100−fees}% of families pending` |
| Staff present | `{staffPresent}/{staff}` | 1.2% ↑ | `{staffOnLeave} on leave today` |

**People-at-a-glance (3 `PeopleCard`: count/sub/rate/present/total, clickable):** Students (count `students`, sub `Student–teacher ratio {ratio}:1`, rate `attendance`) → `school.sis` · Teachers (count `teacherCount`, sub "Across 8 departments", rate 97) → `school.teachers` · Support staff (count `supportCount`, sub "Transport · security · admin", rate 94) → `school.staff`.
**Charts:** Attendance trend (LineChart, "Attendance %", months Nov–Jun, yMax 100) · Fee collection (Donut: Collected `s.fees` / Pending `100−fees`; Legend Collected `fmtMoney(feesToday*64)`, Outstanding `fmtMoney(outstanding)`) · Enrolment by stage (Donut: Pre-primary .14, Primary .34, Middle .30, Secondary .22) · Gender ratio (Donut: Boys `genderBoys` / Girls `genderGirls`, center ratio %) · Result distribution (Bars `RESULT_BANDS` A1 14, A2 22, B1 26, B2 18, C1 11, C2 6, D 2, E 1).
**Lists:** Live activity (`ACTIVITY[]` time,text) · Announcements (`ANNOUNCEMENTS[]` tag,tone,title,when — tags Exam/Event/Fees/Notice).
**Derived:** `feesToday=round(students*920)` · `outstanding=round(students*(100−fees)*145)` · `staffPresent=round(staff*96.5%)` · `staffOnLeave=staff−staffPresent` · `teacherCount=round(staff*0.62)` · `supportCount=staff−teacherCount` · `studentsPresent=round(students*attendance%)` · `ratio=round(students/teacherCount)` · `genderBoys=round(students*0.53)` · `genderGirls=students−genderBoys`.

**ApprovalsInbox — per card:** priority badge (`PRIORITY_TONE` high→danger solid, medium→warning, low→neutral) · type badge · id · `{age} ago` · title · detail · requester (Avatar+name) · role · amount (`fmtMoney(amount, currency)` only if `amount!=null`). Empty state "All caught up". Actions Reject / Approve → toast + add id to `acted`.
🔴 Gaps: all KPIs derived from `students`/`staff` formulas; Approve/Reject don't persist.

### 11. `src/screens/school/sis.tsx` — Students (SIS) + Student 360
Exports `school.sis` (`StudentsScreen`), `school.student` (`Student360`).
**Gating:** `canEdit(role)` = admin/principal/vice_principal → Add/Import/Promote buttons; else `Badge "View only"`.

**StudentsScreen — filter bar:** Search (name/admission no/class) · grade Select (`['all',...grades.slice(4)]`) · status Select (all/active/inactive) · fee Select (all/paid/partial/due). Sub: `{rows.length} of {students.length} students · {school.name}`.
**Student table (`Column<Student>`, pageSize 12, sort name asc, bulk):**
| Column | Renders |
|---|---|
| Student | Avatar + `s.name`; sub `{s.adm} · {Male/Female}` |
| Class | `s.cls`; sub `Roll {s.roll}` |
| Guardian | `s.guardian`; sub `s.phone` |
| Attendance | Progress bar `s.attendance` (attColor) + `{s.attendance}%` |
| Fees | Badge `feeLabel[feeStatus]` + `fmtMoney(feeDue)` if `feeDue>0` |
| Status | Badge Active/Inactive |

Row click → `school.student {focus:s.id}`. Bulk: Message / Promote / Clear. `attColor`: ≥90 success, ≥80 brand, ≥75 warning, else danger.

**Student360 header:** Avatar · `name` · status badge · `adm` · `Class {cls} · Roll {roll}` · `{house} House` · `{guardian} · {phone}`. StatTiles: Attendance `{attendance}%` · `Rank · {rank}/{classSize}` (`{report.pct}%`) · Fee status `feeLabel`. Message button.
**Tabs:** overview · academics · attendance · fees · documents · timeline.
- **Overview:** "Performance by subject" Bars (per `report.rows`: label `subject.slice(0,4)`, value `marks`); Snapshot: Overall `{pct}% · {grade}`, Class rank `{rank}/{classSize}`, GPA `{gpa}`, Result badge, Attendance trend Spark, Outstanding fees `fmtMoney(feeDue)`.
- **Academics:** table **Subject / Marks / Max / Grade / Result** (`r.subject r.marks r.max r.grade r.pass`); Total row `total maxTotal grade pct%`.
- **Attendance:** "Monthly attendance" Bars (`attendanceMonths`); StatTiles Best month, Lowest month, Trend (Improving if last≥first else Declining).
- **Fees:** ledger table **Invoice / Description / Amount / Paid / Balance / Date** — rows INV-2026-T1 (Term 1 tuition 48000/48000), INV-2026-T2 (Term 2; paid = 48000 | 48000−feeDue | 0 by status; date pending if due), INV-2026-TR (Transport annual 18000/18000). 🔴 hard-coded.
- **Documents:** Birth certificate, Aadhaar card, Previous report card, Medical record (Pending), Passport photo — each name/type/size/Verified|Pending; Upload button. 🔴 static.
- **Timeline:** Fee payment received, Promoted to {cls}, Late arrival, Won inter-house quiz ({house}), Enrolled ({adm}). 🔴 synthetic.

**Form A — AddStudentDrawer** ("Add student / Create a new enrolment record"):
| Field | Type | Options | Validation |
|---|---|---|---|
| Full name* | text (icon user) | — | `!name.trim()` → toast "Name required" |
| Class & section | Select | `grades.slice(4)`×`sections` → `g-S` (default `grades[8]+'-A'`) | — |
| Guardian | text | — | optional |
| Phone | text (placeholder `+91 9XXXXXXXXX`, hint "Used for fee + attendance alerts.") | — | optional |

Success → toast "Student added — {name} enrolled in {cls}", resets, closes. 🔴 does not persist; only 4 of ~20 SIS fields.

**Form B — ImportDrawer (3 steps `Upload`/`Map columns`/`Done`):**
- Upload: CSV/XLSX dropzone, "(Name, Class, Guardian, Phone…)", Max 5,000 rows, Download template; shows `students_2026.csv · 36 rows detected`.
- Map columns: Column A→Name, B→Class, C→Guardian, D→Phone — each Select with options **Name / Class / Guardian / Phone / Admission no / Ignore**.
- Done: "Ready to import — 36 valid rows · 0 errors · 0 duplicates"; Finish → toast "Import complete — 36 students imported, 0 errors." 🔴 no real parsing.

**Flow:** list → filter (search/grade/status/fee) → row → Student 360 (6 tabs) → Message/Promote (toast). Add or Import via drawers.

### 12. `src/screens/school/exams.tsx` — Exams & grading → **full flow in Part C**
Exports `school.exams`. **Tabs:** `exams` Exams & tests · `marks` Marks entry · `reports` Report cards.
**Gating:** `can(role,'exams','A')`→Publish datesheet; `can(role,'exams','E')`→Create exam & edit marks. (admin E, teacher E; principal/VP A only → **cannot edit marks**, **can** publish.)

**Tab 1 ExamsListTab (`Column<Exam>`, pageSize 10, sort dates asc):**
| Column | Renders |
|---|---|
| Exam | `e.name`; sub `{e.id} · {e.grades}` |
| Type | Badge `e.type` |
| Dates | `{fmtDate(from)} – {fmtDate(to)}` |
| Papers | `e.subjects` |
| Marks entered | Progress `e.marksEntered` (≥90 success, >0 warning) + `%` |
| Status | Badge: scheduled→Scheduled/info, completed→Completed/success, marks_entry→Marks entry/warning, draft→Draft/neutral |
| Published | Badge Published/success or Pending/neutral |
| (actions) | Datesheet button, Report cards button (→ reports tab) |

**Tab 2 MarksEntryTab:** selectors grade (`grades.slice(4)`) · section (`sections`) · subject (`subjects`); `cls=grade-section`; roster sorted by roll. Summary: Class average `{avg}%` + `gradeFor(avg)` badge, Passing `{passCount}/{roster.length}`. Table **Roll / Student / Marks /100 / Grade / Result** — Marks = number Input (clamp 0–100, `disabled={!editable}`), Grade = `gradeFor(m)` badge, Result = `m>=33` Pass/Fail.

**Tab 3 ReportCardsTab:** class Select (`clsOptions`); grid of cards per student — `name`, `Roll {roll} · Rank {rank}/{classSize}`, result badge, `{pct}% · {grade}`, `GPA {gpa}`, Progress (≥60 success else warning). Click → ReportCardModal.

**Form A — CreateExamModal:**
| Field | Type | Options | Default | Validation |
|---|---|---|---|---|
| Exam name* | text | — | "" | `!name.trim()` → "Name required" |
| Type | Select | Term / Unit Test / Periodic / Board Prep | Term | — |
| Grades | Select | I–V / VI–X / VI–XII / XII | VI–XII | — |
| From | date | — | 2026-09-08 | — |
| To | date | — | 2026-09-20 | `to<from` → "Invalid dates — End date cannot be before the start date." |

Success → toast "Exam created — {name} ({type}) scheduled for {grades}". 🔴 doesn't persist.

**Form B — DatesheetDrawer (width 620):** header `{name} · {grades} · {papers.length} papers`. Papers = `subjects.slice(0,exam.subjects)`, first at `exam.from`, each +2 days, slot "09:30 – 12:30". Per paper card: subject · `fmtDate(date)` · `Paper {id+1}` badge · row of:
| Field | Type | Options |
|---|---|---|
| Room / hall | text (placeholder "e.g. Hall 1") | — |
| Invigilator 1 | Select (error "Clash" if dup) | `['',...TEACHER_POOL]`, blank → "— Select —" |
| Invigilator 2 | Select (error "Clash" if dup) | same pool |

`TEACHER_POOL` = R. Kumar, S. Rao, M. Krishnan, A. Banerjee, P. Nair, V. Reddy, L. Iyer, K. Das, N. Sharma, D. Menon. Seed: room `Hall {i+1}`, inv1 `pool[(i*2)%len]`, inv2 `pool[(i*2+1)%len]`.
Footer: status `{n} clash(es) to resolve` / "No invigilator clashes"; Close; **Publish datesheet** (only if `canPublish`, `disabled` while clashes>0) → toast "Datesheet published — … sent to staff & parents." 🔴 not persisted; toast only.

**Form C — ReportCardModal (printable, read-only):** header `school.name`, "Academic Year 2026–27 · Term Report Card", result badge. Meta grid: Student `name`, Admission no `adm`, Class·Roll `{cls} · {roll}`, Guardian `guardian`, Attendance `{attendance}%`, Class rank `{rank}/{classSize}`. Subject table **Subject / Marks / Max / Grade / GPA / Result** + Total (`total maxTotal grade gpa pct%`). Summary: Percentage `{pct}%`, Overall grade `{grade}`, GPA `{gpa}`, Result `{result}`. Footer "Generated {today}" + "Class teacher · Principal signature". Print → `window.print()`.
🔴 `result==='COMPARTMENT'` renders as plain fail (UI only tests `==='PASS'`).

### 13. `src/screens/school/academics.tsx` — Academics (5 tabs)
**Gating:** `editable = can(role,'academics','E')` → header "Editing enabled"/"View only".
**Module-level:** `classList = grades.slice(8)`×`sections` → `g-S`.
**Tabs:** `classes` · `timetable` · `periods` · `subjects` · `homework`.

**Tab 1 Classes (`ClassRow {name grade section teacherId students room}`):**
Table (`DataTable<ClassRow>`, pageSize 12, sort name asc): **Class** (name + `Grade {grade} · Sec {section}`) · **Class teacher** (Badge `teacherName` or "Assign"/"Unassigned") · **Students** (count) · **Room** · **(action)** edit class-teacher.
- Form **Assign class teacher**: Teacher Select (`teacherOpts` = `{value:t.id, label:"{name} · {dept}"}`).
- Form **Add class**: Grade Select (`grades`, default `grades[8]`) · Section Select (`sections`) · Room text (icon building, hint "Optional — e.g. Room 204"). Validation: duplicate name → toast "Class exists"; empty room → "—".

**Tab 2 Timetable builder:** `DAYS=Mon–Fri`, `PERIODS=8`, `LUNCH_AFTER=4`, `TOTAL_SLOTS=40`, `ERASE='__erase'`.
- Toolbar: Class Select (`classList`); `Class teacher: {name}` badge; in build mode `{filled}/40 periods set`, clash badge or "No clashes", buttons Re-generate / Restart / Save.
- Choice screen (editable): cards "Auto-generate" (badge recommended) + "Build manually".
- Subject palette: per-subject card (color swatch, name, `TeacherChips` 1–3 teachers add/remove), Erase toggle, Clear all.
- Weekly grid: day columns; rows P1–P8 + a "Lunch break" row after P4; cell shows `subject` + `teacherName`; clash cell red border + alert + tooltip `Also in {class} · {day} P{n}`; empty = `+`/`·`.
- Teacher-load overview (when filled>0): per teacher `name`, clash badge, `{n}/wk` (from `teacherLoads`).
- Form **Auto-generate config** (size lg): Class teacher Select (`['— Select —',...teacherOpts]`); per subject row: periods-per-week Select (`0/week`…`10/week`) + `TeacherChips`; footer `{cfgTotal}/40 periods` (· perfect fit / over capacity / free periods left); Generate.
- Form **Change teacher** (per-cell, size sm): lists `qualified(subject)` teachers (name, `{dept} · {loads}/wk`, busy/free badge); Save.
- Form **Teacher already assigned** clash-confirm (size sm): names teacher + classes; Cancel / Assign anyway.
- Shapes: `editCell {key d p subject current}`, `clashPrompt {d p subject tid others[] onConfirm}`; state `grids mode classTeachers subjTeachers ppw placeCounts`.

**Tab 3 Periods (`PeriodRow {label start end type}`, `PTYPES=Class/Break/Assembly`):** table **Label / Start / End / Type / Duration / (delete)** — Label text, Start/End `time` inputs, Type Select (read-only Badge brand/warning/info), Duration computed `durOf`. Buttons Add period (new "Period {n}", 45-min default) / Save. Seed 9 rows (Assembly, Period 1–6, Short break, Lunch).

**Tab 4 Subjects (`list:string[]`):** cards (color swatch + name + `qualified(s).length` badge). Form **Add subject**: Subject name* (icon book, placeholder "e.g. Physics"). Validation: empty → "Name required"; duplicate → "Already exists".

**Tab 5 Homework (`Hw {id cls subject title due status}`, `hwTone` Assigned brand/Submitted info/Graded success/Overdue danger):** table (`DataTable<Hw>`, pageSize 10, sort due asc) **Class** (Badge) · **Subject** · **Title** · **Due** · **Status** (Badge). Form **Assign homework**: Class Select (`classList`) · Subject Select (`subjects`) · Title* (icon clipboard, "e.g. Chapter 5 exercises") · Due date `date` (default 2026-06-15). Validation: empty title → "Title required"; new rows `status:'Assigned'`. Seed 5 rows.
🔴 Gaps: nothing persists; homework has no attachments/submissions (student app); no syllabus/lesson-plan entity.

### 14. `src/screens/school/calendar.tsx` — Academic calendar
**Gating:** `editable = can(role,'academics','E')` → Add event.
**Shapes:** `Ev {date type title desc?}`; `EvType` holiday/exam/fee/ptm/event; `Channel` app/push/email; `EVENT_META` holiday(Holiday,#16a34a,sparkle)/exam(Exam,#dc2626,clipboard)/fee(Fee due,#d97706,rupee)/ptm(PTM,#0ea5e9,users)/event(Event,#7c3aed,calendar).
**Views:** Segmented Month/Agenda; type-filter chips per `EvType` (toggle `enabled` Set).
**Month grid:** `WEEKDAYS=Sun…Sat`; day cells with day number (today highlighted) + up to 3 event pills + `+{n} more`. **Agenda:** rows day#+weekday, color dot, title, type Badge.
**Form — Day detail** (size sm): lists that day's events (icon, title, type, desc); footer "Add event" (editable) pre-fills date.
**Form — Add event** (size sm):
| Field | Type | Options | Notes |
|---|---|---|---|
| Date | date | — | |
| Type | Select | Holiday / Exam / Fee due / PTM / Event | |
| Title* | text (icon calendar) | — | empty → "Title required" |
| Description | Textarea | — | optional → stored `undefined` if empty |
| Notify via | 3 Checkboxes | In-app(`app`) / Push / Email | default `['app']`; toast lists channels |

**Flow:** land current month → prev/next/Today → toggle filters → Month/Agenda → click day → Add event (date/type/title/desc/channels) → save appends to `extra` + toast. 🔴 not persisted; notify channels don't actually send.

### 15. `src/screens/school/attendance.tsx` — Attendance
**Gating:** `editable = can(role,'attendance','E')` → Correct/Submit/Mark-all/Segmented; `TierGate feature="attendance.geofence"` (platinum) → Geo view.
**Shapes:** `Group` students/teachers/staff/period/geo; `AttStatus` present/late/absent (`STATUS_TONE` success/warning/danger); `Person {id name hue group sub status checkin}`; `TtSlot {period subject teacherId teacherName}`; `GEO_CHECKINS` {name within status(inside/edge/outside)}.
**Top:** 3 SummaryCards (Students/Teachers/Staff: icon, `{rate}%`, present label, meter, `{present} of {total}`). Segmented `GROUP_OPTS`: Students/Teachers/Staff/Subject-wise/Geo-fence.
**Roster (`DataTable<Person>`, pageSize 8):** **Name** (Avatar+name+id) · **`SUB_LABEL`** (Class/Department/Role) · **Check-in** · **Status** (Badge) · **(action)** Correct (editable→toast) or "—". CardHead controls: grade Select + section Select (students only) + Search + status-filter Select (`filterOpts` with live counts). Footer "Marking is live — changes save automatically." + Submit attendance (disabled if !editable).
**Subject-wise:** class Select + period Select (`P{n} · {subject}` from `classTimetable`). Period band: `Period {n}`, `{subject} · {teacherName}`, `{presentCount}/{roster.length} present`. Per student: Avatar+name+`{id} · {cls}` + Segmented Present/Late/Absent (or Badge). Mark all present; footer "{present} present · {absent} absent" + Submit.
**Geo-fence:** "Geo-fenced check-in / Auto check-in for teachers & staff entering campus", Live badge; `{inside} of {force.length} teachers & staff inside`; radius map "Campus geo-fence · radius 250 m"; list Main Gate (142, inside), Staff Parking (38, inside), Sports Ground (6, edge), Off-campus (3, outside).
**Derived:** `statusOf(id,attendance)` hash → absent/late/present; `checkIn` deterministic time; `classTimetable(cls)` deterministic subject+teacher per period.
🔴 Gaps: status hashed not real; Submit/Correct don't persist; geo static; no leave/holiday integration.

### 16. `src/screens/school/people.tsx` — Teachers / Staff / Parents
Exports `school.teachers` `school.staff` `school.parents`.
**Gating:** `editable = can(role,'sis','E')` → Add teacher (Teachers only). Staff & Parents ungated.

**Teachers:** Top-4 performers cards (Avatar, name, dept, `rating.toFixed(1)` gold sparkle, `{result}% result` badge).
Table (`Column<Teacher>`, pageSize 10, sort rating desc): **Teacher** (Avatar+name+sparkle if `top`+id) · **Department** (dept, desig) · **Subjects** (badges or —) · **Class teacher** (badge or —) · **Experience** (`{exp} yrs`) · **Rating** (sparkle+`rating`) · **Result** (`{result}%`) · **Load** (`{load}/wk`) · **Status** (badge) · **(actions)** Message.
Profile drawer (read-only): header Avatar, name, "Top performer" if `top`, dept, gender; Card1 Designation/Subjects/Class teacher/Experience/Email/Status; Card2 Rating/Result+Progress/Attendance+Progress/Teaching load. Footer Close / Message.
Form **AddTeacherDrawer** (icon cap):
| Field | Type | Options | Validation |
|---|---|---|---|
| Full name* | text (icon user, "e.g. Rajesh Kumar") | — | `!name.trim()` → "Name required" |
| Department* | Select | `depts` (default `depts[0]`) | |
| Designation* | Select | Senior Teacher/Teacher/HOD/PGT/TGT/Assistant Teacher (default Teacher) | |
| Subjects | text (icon book, "Mathematics, Science", hint "Comma-separated…") | — | optional |

🔴 toast only; 4 of ~15 fields.

**Staff:** 5 category cards (Transport/Security/Academic/Admin/Support — toggle filter, `counts[cat]`). Table (`Column<Staff>`, pageSize 10, sort name asc): **Staff** (Avatar+name+`id · gender`) · **Role** (role, dept) · **Shift** (badge) · **Route** (badge or —) · **Attendance** (Progress+%) · **Status** · **(actions)** Message. 🔴 no add-staff form.

**Parents (`Parent {id name phone hue wards[] due}`, `Ward {name cls}`):** derived by grouping `students` on `guardian`. Table (`Column<Parent>`, pageSize 10, sort name asc): **Parent / guardian** (Avatar+name+`{wards} ward(s)`) · **Wards** (per ward name + `cls` badge) · **Phone** · **Outstanding dues** (danger `fmtMoney(due)` or "Cleared") · **(actions)** Message. 🔴 not a real entity; no add/edit.

### 17. `src/screens/school/finance.tsx` — Fees + HR/Payroll
Exports `school.fees` (`FeesScreen`), `school.hr` (`PayrollScreen`, `TierGate feature="hr_payroll"` gold).
**Gating:** fees `E`→Record (`canRecord`), `A`→Waiver (`canWaive`, if due>0); hr `E`→Run payroll (`canRun`), `A`→Approve (`canApprove`).

**Fees:** live cue card (if `latest`): "Payment received · {amount} · {name} ({cls}) · just now via UPI", Live badge.
KPIs: Collected today (`fmtMoney(collectedToday)`, `{todays.length} payments`) · Collected this term (`totals.paid`, `{pct}% up`, `of {billed} billed`) · Outstanding dues (`totals.due`) · Defaulters (`totals.defaulters`).
"Collection by class" Bars (`byClass` per grade `value%`, `n>0`).
Table (`Column<FeeRow>`, pageSize 10, sort due desc): **Student** (Avatar+name+`{cls} · Roll {roll}`) · **Term fee** (`fmtMoney(term)`) · **Paid** · **Due** (danger if >0) · **Status** (Paid/Partial/Due) · **(actions)** Record (if canRecord) / Waiver (if canWaive && due>0) / —.
Header: Send reminders → `app.go('school.communication',{intent:'fee-reminder'})`; Export (stub). Search (student/class/admission) + status Select.
Form **PaymentModal** (icon rupee, size sm; sub `{name} · {cls} · Outstanding {due}`):
| Field | Type | Options | Default | Validation |
|---|---|---|---|---|
| Amount* | number (icon rupee) | — | `due||term` | `<=0`/NaN → "Amount required" |
| Payment mode* | Select | Cash/UPI/Card/Bank transfer/Cheque | UPI | |
| Reference / receipt no. | text (icon clipboard) | — | — | optional |

Form **WaiverModal** (icon shield, size sm; banner "Waivers require Principal approval and are written to the audit trail."):
| Field | Type | Options | Default | Validation |
|---|---|---|---|---|
| Waiver amount* | number (icon rupee, hint "Outstanding due {due}") | — | `due` | `<=0`/NaN → "Amount required" |
| Reason* | Select | Financial hardship/Staff ward concession/Sibling discount/Scholarship/Merit award | Financial hardship | |

🔴 both toast only.

**Payroll (`PayRow {id name role dept hue gross ded net}`):** header status badge (Approved / Awaiting Principal approval / Awaiting Admin to run). KPIs: Staff on payroll (`count`) · Gross payroll (`gross`) · Net payable (`net`, `{ded} deductions`) · Pending (`0` if approved else `net`). Table (pageSize 10, sort net desc): **Staff** (Avatar+name+id) · **Role / Dept** · **Gross** · **Deductions** (`− {ded}`) · **Net pay** (bold). Search (name/role/dept). Actions: Run payroll (disabled `!canRun||ran`) → toast; Approve (disabled `!canApprove||!ran||approved`) → toast "Payroll approved · June 2026 · {net} net cleared".
**Derived:** `termFeeFor(grade)=36000+index*1200`; `teacherPay`=`28000+exp*1600+desigBump+round(rating*1000)`, ded 12%; `staffPay`=base+shiftBump, ded 9%.
🔴 Gaps: FeeRow/PayRow computed from formulas; no invoice/payment-ledger/receipt/gateway/payslip entities.

### 18. `src/screens/school/operations.tsx` — Communication / Operations / GPS
Exports `school.comm` `school.ops` `school.gps`.
**Gating:** `TierGate feature="transport.gps"` (platinum) → live map; `app.plan!=='platinum'` → Upgrade button; `app.upgrade('platinum')`.

**CommunicationScreen tabs:** messenger (count = Σ`threads.unread`) · complaints · announcements.
- **Messenger:** thread list rows (Avatar, parent, time, student, last, unread badge); conversation header (Avatar, parent, `{student} · {teacher}`, "Message only" badge); bubbles `m.t`+`m.at` (right if `m.me`); composer text Input (icon message) + Send. **New chat Modal** (size sm): Search `contactQ` + contact buttons (`filteredContacts`: Avatar, name, role) → `startChat` (local thread `id=1001+...`, toast). 🔴 `me` boolean can't span apps.
- **Complaints:** KPIs Total/Open/In progress/Resolved. Table (`Column<Complaint>`, pageSize 8, sort priority asc): **Complaint** (subject + `{id} · {from} · {cat}`) · **Priority** (badge) · **Assignee** · **Age** · **Status** (badge) · **(action)** Resolve (inline, toast) / check if resolved. 🔴 no detail/assign form.
- **Announcements:** recent list (id/title/audience/when/`{reach} reached`/channels). Form **AnnouncementModal** (size lg, steps Compose/Audience/Channels/Review):
  - Compose: Title* (icon bell) · Message* (Textarea rows 6, hint `{n} characters`). canNext both non-empty.
  - Audience: 8 cards `AudienceKey` parents/students/teachers/staff/everyone/grades/defaulters/specific (label/icon/desc + recipient count). If grades → grade chip multi-select (`selGrades`); if specific → `SpecificPeoplePicker` (Students/Teachers/Staff tabs, search, checkbox list). canNext: grades→size>0, specific→people>0, else true.
  - Channels: 3 toggles Push notification (free, default on) / SMS (₹0.20/recipient) / Email (₹0.05/recipient) + estimated cost. canNext channels>0.
  - Review: read-only Title/Body + rows Audience/Recipients/Channels/Estimated cost → Send announcement (toast).

**OperationsScreen tabs (KPI grids, mostly hard-coded):**
- Library: Catalogue 12,480 · Members 2,332 · Issued 486 · Fines due ₹8,420.
- Transport: Vehicles `buses.length` · Routes 18 · Students 1,284 · Stops 142 + `BusFleet` + Platinum upsell.
- Hostel: Blocks 4 · Rooms 186 · Residents 412 · Occupancy 88%.
- Sports: Teams 22 · Events 14 · Athletes 640 · Medals '26 38.
**BusFleet (`DataTable<Bus>`, pageSize 8, sort status asc):** **Bus** (icon+label+no) · **Route** (route+`{id} · {stops} stops`) · **Driver / conductor** (driver+conductor or —) · **Occupancy** (meter `students/capacity`) · **Speed** (live `{liveSpeed} km/h` or —) · **ETA** (`{eta} AM` or —) · **Fuel** (`{fuel}%`, red<30/amber<50) · **Live status** (Badge `BUS_META`).
**GpsScreen:** KPIs Vehicles/On route/Delayed/Students riding + BusFleet + Form **AddVehicleModal** (size md):
| Field | Type | Options | Validation |
|---|---|---|---|
| Bus name / number* | text (icon bus, "e.g. Bus 24") | — | required |
| Registration no* | text (forced uppercase, "e.g. KA-01-F-0000") | — | required |
| Route | Select | (Assign route…)/Indiranagar loop/Whitefield express/Koramangala/HSR Layout/Marathahalli/Jayanagar/Electronic City | |
| Seating capacity | number | default 42 | |
| No. of stops | number | "e.g. 10" | |
| Driver | Select | (Assign driver…) + staff role 'Bus Driver' (first 8) | |
| Conductor | Select | (Assign conductor…) + staff role 'Bus Conductor' (first 8) | |

Note "GPS pairing requires Platinum". Save disabled if `!label||!no` → toast "Vehicle added". Then TierGate live map (pins exclude maintenance).
🔴 Gaps: messages/announcements/complaints don't persist or send; Library/Hostel/Sports have no data model.

### 19. `src/screens/school/admin.tsx` — Reports / Settings / Identity
Exports `school.reports` `school.settings` `school.identity`.
**Gating:** `tierIncludes(app.plan, key)` for feature groups (`sis` silver, `hr_payroll` gold, `transport.gps` platinum); Identity is Admin-only (router-guarded).

**A. SchoolReports:** Period Select (`Term 1 · 2026` / `Term 2 · 2026` / `Mid-Term · 2026` / `Full Year · 2025-26`); 4 category tabs each with report defs `{name desc}` + Export Excel (toast):
- Academic: Consolidated mark sheet · Class performance summary · Weak-student tracker · Subject analysis.
- Attendance: Daily attendance register · Monthly attendance summary · Chronic absentee list · Staff attendance report.
- Finance: Fee collection summary · Outstanding dues register · Daily collection report · Payroll register.
- Operations: Transport route manifest · Library circulation report · Inventory & assets · Visitor & gate log.

**B. SettingsScreen panels:**
- School profile & branding: logo swatch (read-only) · School name (text, default `school.name`) · City (text, icon pin) · Timezone (text, icon globe) · Save → toast "Profile saved".
- Localization: Default language Select (en/hi/ar/ta) · Right-to-left layout Toggle (auto for ar/ur) · Dark mode Toggle.
- Plan & feature visibility: per-tier `FEATURE_GROUPS` (Included/Locked via `tierIncludes`) — silver(`sis`): SIS·Academics·Attendance / Examinations & report cards / Fees & online payments / Communication & complaints; gold(`hr_payroll`): HR & Payroll / Weak-student analytics / Advanced reporting; platinum(`transport.gps`): Geo-fenced attendance / Live GPS bus tracking / Dedicated support. Upgrade button (hidden on platinum) → `app.upgrade(nextTier)`.

**C. IdentityScreen (4 tabs):**
- **users** (`SchoolUser {id name email role hue status('active'|'invited'|'suspended') last}`): Search + Role filter Select + Invite user. Table (pageSize 10, sort name asc): **User** (Avatar+name+email) · **Role** (Badge) · **Status** (Badge active success/invited warning/suspended danger) · **Last active** · **(actions)** Edit + Restore/Suspend. Form **Invite**: Work email* (email, "name@school.edu") · Role* (Select, hint `ROLE_META.desc`, default teacher). Validation: email must contain `@` → "Valid email required".
- **roles** (matrix): cap legend `V · View`/`E · Edit`/`A · Approve`; table Module (`MODULE_LABEL`) + locked **Owner** column (all V/E/A) + one column per role; `CapChip` toggles; Reset → "Matrix reset", Save → "Permissions saved". `MODULE_LABEL`: setup→School setup, dashboard→Dashboard, identity→Identity & access, sis→Student information, academics→Academics, attendance→Attendance, exams→Exams & results, fees→Fees & finance, hr→HR & payroll, communication→Communication, operations→Operations, settings→Settings.
- **invites** (`Invite {id email role sent expires}`): INV-01 neha.joshi@school.edu/teacher/2 days ago/in 5 days · INV-02 sahil.verma@school.edu/admin/4 days/in 3 · INV-03 priya.nair@school.edu/vice_principal/6 days/in 1. Row: email, role Badge, `Sent {sent} · expires {expires}`, Resend/Revoke.
- **audit** (`AuditRow {id who hue action target module when tone}`): 7 rows (Granted Approve, Invited user, Published results, Suspended user, Revoked Edit, Updated branding, Changed language). Search + "Last 7 days" badge.
🔴 None persist.

---

## Owner console

### 20. `src/screens/owner/portfolio.tsx` — Portfolio / Schools / Create-school wizard
Exports `owner.dashboard` `owner.schools` `owner.create`.
**Pricing:** `PRICE_BANDS` per-student ₹/yr by max strength [silver,gold,platinum]: ≤500 [120,300,520] · ≤1500 [96,240,430] · ≤3000 [78,190,340] · ∞ [64,160,290]. `rateFor(strength,tier)`; `recommendedTier`: ≤500 silver, ≤2000 gold, else platinum. `STATUS_TONE/LABEL`: active success/Active, trial info/Trial, past_due danger/Past due.

**A. OwnerDashboard:** header "All schools" / "Create school". Totals: `students`=Σstudents, `staff`=Σstaff, `mrr`=Σmrr, `att`=avg. KPIs: Total schools (`schools.length`, `{platinum} Platinum · {gold} Gold · {silver} Silver`) · Total students (delta 4.2%↑, `{staff} staff`, spark) · Total MRR (`fmtMoney`, 6.1%↑, `{mrr*12} annual run-rate`, spark) · Avg attendance (`{att}%`). Charts: MRR & enrolment trend (Line) · Plan distribution (Donut, center `schools.length`) · Revenue by school (Bars `mrr` labeled `logo`). "Attention needed" alerts (`status!=='active'||fees<70`): Avatar(logo), name, city, reason Badge (Payment past due / On trial — convert to paid / Low fee collection — {fees}%), Open.

**B. OwnerSchools:** filter Search + Plan Select + Status Select. Table (`Column<School>`, pageSize 10, sort mrr desc, bulk): **School** (Avatar logo/color + name + `{city} · {tz}`) · **Plan** (TierPill) · **Students** · **Staff** · **Attendance** (`%`) · **Fees %** (warning if <70) · **MRR** (`fmtMoney(mrr,currency)`) · **Status** (Badge) · **(actions)** Upgrade (if not platinum) / Open / Account report. Bulk: Message / Export.
- Form **UpgradePlanModal**: title `Upgrade plan · {name}`, sub `{seats} students · currently {plan}`. Tier picker rows (TierPill, "Current" badge, `{annual}/yr` + `{seats} × {rate}/student/yr`; lower disabled). Summary "New annual value {newAnnual}/yr (+{diff})". Confirm disabled if `<= curIdx` → toast "Plan upgraded".
- Modal **AccountReportModal** (branded, printable): header Avatar, name, `{city} · {currency} · {tz}`, ref `AR-{ID}-{year}`, date. Subscription tiles Plan/Status/Annual value. Renewal line. Key metrics: Students enrolled/Staff/Attendance/Fee collection. Account details: Account manager Anil Mehta / Billing contact `accounts@{id}.edu` / MRR / Onboarded Apr 2024 / Support tier (Dedicated/Priority/Standard) / Time zone. Close / Print report.

**C. CreateSchoolWizard (5 steps):** `WizardData {name city tz adminName adminEmail adminPhone strength tier cycle modules}`. Initial: tz Asia/Kolkata, strength 800, tier gold, cycle yearly, modules {sis,attendance,exams,fees,communication}.
| Step | Fields |
|---|---|
| 0 Basics | School name* (text, icon building) · City* (text, icon pin) · Time zone (Select: Asia/Kolkata, Asia/Dubai, Asia/Singapore, Europe/London, America/New_York). canNext: name&city |
| 1 Admin contact | Administrator name* (text, icon user) · Email* (email, icon message) · Phone (text, icon phone). canNext: adminName&adminEmail |
| 2 Plan & tier | Expected student strength* (number min 1, icon users) · band display (Silver/Gold/Platinum ₹/student/yr) · Billing cycle Segmented (monthly ÷12 /mo, quarterly ÷4 /qtr, yearly ÷1 /yr) · 3 tier cards ("Recommended" on `recommendedTier`, price, `{strength} × {rate} = {total}/yr`). canNext: strength>0 |
| 3 Modules | toggle cards (locked if module tier > selected tier): sis/attendance/exams/fees/communication (silver) · hr_payroll/analytics (gold) · transport_gps (platinum) |
| 4 Review | read-only: School name/City/Time zone/Administrator/Admin email/Admin phone/Student strength/Plan/Billing cycle/Per-student rate/Billed {cycle}/Annual value/Modules enabled |

Footer all steps: Back (disabled step 0), running price summary, Next (disabled `!canNext`) or "Create school · {cyclePrice}{per}" → toast "School created" → `owner.schools`. `annual = strength × rateFor`; `cyclePrice = round(annual/div)`.

### 21. `src/screens/owner/billing.tsx` — Cross-school reports + Billing
Exports `owner.reports` `owner.billing`.
**Pricing:** `RATE_TABLE` ₹/student/yr by tier×band: silver [120,96,78,64], gold [300,240,190,160], platinum [520,430,340,290]; bands ≤500/≤1500/≤3000/3000+. `recommendedTier` ≤500 silver/≤1500 gold/else platinum. `TIER_FEATURES`: silver(Core SIS & academics / Attendance, exams & fees / Parent communication), gold(Everything in Silver / HR & Payroll / Advanced reporting & analytics), platinum(Everything in Gold / GPS transport & geofence / Dedicated success manager).

**A. OwnerReports:** Metric Segmented + Year Select. `METRIC_META`: attendance (base `s.attendance`, fmt `%`) · fees (`s.fees`, `%`) · enrolment (`s.students`, sum, `fmtNum`) · revenue (`s.mrr`, sum, compactMoney). `YEARS` 2024/2025/2026 (factor 0.9/0.95/1, label `FY {y}`). `ranked` = each school value sorted desc; `summary` agg/top/low/count. KPIs: Total/Average {short} · Top school · Lowest · Schools compared. Ranked HBars (per school, color `school.color`, labelWidth 200). Export → toast.

**B. OwnerBilling:** KPIs MRR (Σmrr) · ARR (mrr×12) · Paying tenants (`mrr>0`, `of {schools.length}`) · Overdue amount (Σmrr where past_due). Tabs subs/invoices/revenue/plans.
- **subs:** table (`Column<School>`, pageSize 10, sort mrr desc): **School** (avatar+name+city) · **Plan** (TierPill) · **Seats** (`fmtNum`) · **Per student** (`{rate}/yr`) · **Annual value** (`rate×students`) · **MRR** · **Status** (Badge) · **Renews** (`RENEW_DATES`) · **(actions)** Change plan. Form **ChangePlanModal**: title `Change plan · {name}`, sub `{seats} students · {bandLabel}`; tier buttons (TierPill, Current badge, `{annual}/yr`); Apply → toast "No change"/"Plan changed".
- **invoices** (`Invoice {id school amount issued due status('paid'|'issued'|'overdue')}`): `buildInvoices` 2 per paying school. Table (sort status asc): **Invoice** · **School** · **Amount** · **Issued** · **Due** · **Status** (Badge) · **(actions)** PDF (toast) + Remind (if not paid, toast).
- **revenue:** `growth` 12 months; `byPlan` Σmrr per tier. "MRR growth" Line (yFmt compactMoney) + "Revenue by plan" Donut (center compactMoney(totalMrr)) + per-tier legend.
- **plans** (PlanCalculator): Student strength (number + slider min 50/max 5000/step 50, hint `bandLabel`, default 800, clamp) · Billing Segmented (Annual/Monthly) · 3 tier cards (rate, annual, monthly, "Recommended", feature list, "Start 14-day trial" → toast, "Free for 14 days · no card required").

### 22. `src/screens/owner/workspace.tsx` — Users & roles + Owner settings
Exports `owner.users` `owner.settings`.

**OwnerUsers (4 tabs):**
- **team** (`TeamUser {id name email role scope hue status last}`): KPIs Total users / Administrators / Active now. Search + Role filter + Invite user. Table (sort name asc): **User** (Avatar+name+email) · **Role** (Badge) · **Scope** (icon globe if "All schools" else building + scope) · **Status** (Badge) · **Last active** · **(actions)** Edit + Restore/Suspend. `TEAM` 12 rows (U-01 Anil Mehta/admin/All schools/active … U-09 suspended, U-12 invited). Form **InviteModal**: Work email* (email, "name@schoolmate.io") · Role* (Select, hint desc, default admin) · Scope* (Select: All schools + each school name, default all) → toast "Invitation sent".
- **roles**: same matrix as admin.tsx; Save → "Role access updated across all schools."
- **invites** (`Invite {id email role scope sent expires}`): INV-01 diya.nair@schoolmate.io/teacher/Delhi Public Academy · INV-02 sahil.verma/admin/Horizon · INV-03 neha.joshi/vice_principal/Lotus. Row: email, role Badge + building scope, Sent/expires, Resend/Revoke.
- **audit** (`AuditRow`): 8 rows (incl. Changed plan "Sunrise International → Gold", Regenerated API key, Updated branding).

**OwnerSettings (4 tabs):**
- **company** (FormGrid 2-col): Organisation name* (default "SchoolMate Technologies Pvt. Ltd.") · GST / Tax ID (default 29ABCDE1234F1Z5) · Contact email* (default owner@schoolmate.io) · Contact phone (+91 98765 43210) · Website (https://schoolmate.io) · Registered address (4th Floor, Prestige Tech Park, Bengaluru 560103). Save → "Company profile saved".
- **branding**: Accent colour (swatches `#4f46e5/#16a34a/#0ea5e9/#f59e0b/#ec4899/#0d9488` + text, default #4f46e5) · Logo URL (https://cdn.schoolmate.io/logo.svg) · Favicon URL (placeholder) · Toggles: Default to dark theme (off) / Show individual school logos (on) / White-label (off). Save → "Branding saved".
- **policies**: Working days (`DAYS` Mon–Sun toggles, default all except Sun) · Grading scheme Select (cbse "CBSE (A1–E2)" / pct "Percentage (0–100)" / gpa "GPA (0–10)" / letter "Letter (A–F)", default cbse) · Week starts on Select (DAYS, default Mon) · School day starts (time 08:00) · School day ends (time 14:30) · Period length (number 45) · Lock attendance after school day ends (Toggle on). Save → "Policies saved".
- **api**: Production API key (readOnly, masked/reveal, default `smk_demo_0000…`) Reveal/Hide/Copy/Regenerate(→`smk_demo_`+32hex) · Endpoint URL (https://hooks.schoolmate.io/v1/events) · Signing secret (whsec_…) · Subscribed events Toggles `student.enrolled` (on) / `fee.paid` (on) / `attendance.submitted` (off) · Send test / Save changes.
🔴 Every save is toast-only; API keys/webhooks cosmetic.

---

# Part C — Exam Flow & Phases (end-to-end)

Spans `exams.tsx`, `format.ts`, `timetable.ts`, `dashboard.tsx` (approvals), `PERMS.exams`.

| # | Phase | Where | Who (cap) | Fields | 🔴 Gap |
|---|---|---|---|---|---|
| 1 | Create exam | CreateExamModal | admin/teacher `E` | name* · type (Term/Unit Test/Periodic/Board Prep) · grades (I–V/VI–X/VI–XII/XII) · from · to (`to>=from`) | no persist; missing academicYear/term/maxMarks/passingMarks/weightage |
| 2 | Build datesheet | DatesheetDrawer | view | auto papers (subjects, dates +2 days, slot 09:30–12:30); per paper Room/hall · Invigilator 1 · Invigilator 2 | papers client-side only; no `Paper` entity; fixed times |
| 3 | Assign invigilators + clash | DatesheetDrawer | view | clash keyed `date\|teacher`; same-paper clash if `inv1===inv2`; banner "{teacher} — {date}" | pool = 10 hard-coded names, not Teacher FKs |
| 4 | Publish datesheet | DatesheetDrawer footer | principal/vice_principal `A` | button only if `can(role,'exams','A')`, disabled while clashes>0 → toast | toast only; no notify |
| 5 | Marks entry | MarksEntryTab | admin/teacher `E` | per class+section+subject: Roll · Student · Marks /100 (0–100) · live Grade · live Result (≥33); avg + pass count | **marks not stored** (hashed); Save toast only |
| 6 | Grading (auto) | format.ts | system | gradeFor(pct) A1–E · gpaFor 10–3 · pass=33 | hard-coded CBSE; ignores Owner setting |
| 7 | Report cards | ReportCardsTab → ReportCardModal | view | subject table (Subject/Marks/Max/Grade/GPA/Result) + Total · pct · grade · gpa · result(PASS/COMPARTMENT) · rank · attendance; printable | COMPARTMENT renders as plain fail |
| 8 | Class rank | classRank | system | rank by descending pct within cls; {rank,classSize} | recomputed live; no tie-break |
| 9 | Publish results | Approvals inbox | principal/vice_principal `A` | Approval AP-3041 (type "Report Card Publish", module exams, cap A, forRoles principal/vice_principal); Approve/Reject | no persist; no parent/student notify; `Exam.published` never flips |

**Backend must own:** `Exam` (+academicYear/term/passingMarks/weightage) · `Paper` (examId, subjectId, date, startTime, endTime, room, invigilatorIds[]) · `Mark` (examId, studentId, subjectId, marks, maxMarks, enteredBy, enteredAt) · `GradingScheme` (bands) · `ResultPublication` (examId, classId, publishedBy, publishedAt).

---

# Part D — Backend API

## D.1 Exists today (`src/lib/api.ts`) — read-only
| Method | Returns | Future REST |
|---|---|---|
| `listSchools()` | School[] | `GET /schools` |
| `getSchool(id)` | School? | `GET /schools/{id}` |
| `listStudents(opts?)` | Student[] | `GET /students?q&grade&status&fee` |
| `getStudent(id)` | Student? | `GET /students/{id}` |
| `listTeachers(opts?)` | Teacher[] | `GET /teachers?q&dept&status` |
| `listStaff(opts?)` | Staff[] | `GET /staff?q&cat` |
| `listBuses()` | Bus[] | `GET /buses` |
| `listExams()` | Exam[] | `GET /exams` |
| `listApprovals(role)` | Approval[] | `GET /approvals?role=` |
| `notifications()` | AppNotification[] | `GET /notifications` |
| `listComplaints()` | Complaint[] | `GET /complaints` |
| `listThreads()` | Thread[] | `GET /threads` |
| `reportFor(studentId,examId?)` | Report? | `GET /students/{id}/report?examId=` |
| `classRank(studentId,examId?)` | RankInfo? | `GET /students/{id}/rank?examId=` |

## D.2 🔴 Needed for production (same API all apps call)
**Auth:** `POST /auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/forgot-password` · `GET /me` · `GET /me/permissions` · `POST /invitations`.
**Writes (none exist):** Students `POST/PUT/DELETE /students`, `/students/import`, `/students/{id}/promote`, `/students/{id}/documents` · Teachers/Staff `POST/PUT/DELETE /teachers` `/staff` · Parents `POST/PUT /parents`, `POST /parents/{id}/wards` · Attendance `POST /attendance` (bulk), `PUT /attendance/{id}`, `GET /attendance?class&date&period` · Exams `POST /exams`, `PUT /exams/{id}/datesheet`, `POST /exams/{id}/marks`, `POST /exams/{id}/publish` · Academics `PUT /classes/{id}/timetable`, `POST /classes`, `POST /homework`, `POST /homework/{id}/submissions` · Calendar `POST /events` · Fees `POST /fees/payments`, `/fees/waivers`, `GET /fees/invoices` · Payroll `POST /payroll/runs`, `/payroll/runs/{id}/approve` · Communication `POST /threads`, `/threads/{id}/messages`, `/announcements`, `/complaints`, `PUT /complaints/{id}` · Transport `POST /buses`, `GET /buses/{id}/location` · Approvals `POST /approvals/{id}/approve|reject` · Admin `PUT /schools/{id}`, `PUT /permissions`, `GET /audit`.
**Role-scoped reads (customer apps):** Teacher `GET /me/classes` `/me/timetable` `/me/students` `/me/homework` · Student `GET /me/timetable` `/me/attendance` `/me/marks` `/me/homework` `/me/fees` · Parent `GET /me/wards` `/me/wards/{id}/attendance|marks|fees` `/me/messages`.
**Cross-cutting:** server-side `PERMS`+`FEATURE_TIER` enforcement · pagination/sort · real timestamps · notification fan-out (in-app/push/email/SMS) · audit on writes · multi-tenant `schoolId` scoping.

---

# Top 10 production gaps
1. 🔴 **No backend / no writes** — `Api` read-only; every form is a toast. Build this first.
2. 🔴 **No auth** — login is email-only; no password, tokens, student/parent accounts.
3. 🔴 **No Parent entity / no Student↔Parent FK** — blocks the parent app.
4. 🔴 **Marks & attendance are hashed, not stored** — need `Mark`/`Attendance` entities.
5. 🔴 **Thin entities** — add-forms capture ~4 fields; need ~15–20 each.
6. 🔴 **Messaging can't go multi-app** — `ThreadMsg.me` must become sender/recipient IDs.
7. 🔴 **`student`/`parent` roles missing** from `Role`, `PERMS`, login routing.
8. 🔴 **Grading scheme hard-coded** (CBSE) despite an Owner setting.
9. 🔴 **Notify channels cosmetic** — no push/email/SMS pipeline.
10. 🔴 **Library / Hostel / Sports** have KPI numbers but no data model.
