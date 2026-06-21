# SchoolMate Admin — Live API Binding (School console)

**Date:** 2026-06-20
**Goal:** Replace the mock data layer in `sms-admin` with real, end-to-end calls to the
live **School Admin API** (`sms-backend`, `/swagger/school-admin`), production-grade and
scalable — **without changing any view/UI**. Mirror the proven binding pattern already
shipped in the sibling `sms-catreadmin` app.

## Scope (locked with the user)

- **Data-binding only.** UI/screens stay exactly as-is. No design re-import, no JSX changes
  beyond swapping the data source. The whole admin UI is camelCase and **stays camelCase** —
  conversion happens only at the HTTP boundary.
- **School console only.** The Owner/platform console (portfolio, billing, workspace) is
  out of scope here — it belongs to the platform/tenancy API consumed by `sms-catreadmin`.
  It stays on mock and gets a "Demo data" marker.
- **Bind everything that has an endpoint; flag the rest.** Screens with no matching
  School Admin endpoint keep mock data behind a visible **"Demo data"** badge.
- **Auth: OTP primary, password fallback.**

## Backend facts (verified against `sms-backend`)

- Base URL (dev): `http://localhost:5162/v1` (https `7162`). Config key `VITE_API_BASE`.
- **JWT Bearer**: access ~15 min, **rotating** refresh ~30 days (old refresh revoked on use).
- **Wire is snake_case** both ways. Envelopes: single `{ "data": {…} }`,
  list `{ "data": [...], "next_cursor": "…"|null }`, error `{ "error": { code, message, details } }`.
- **Tenant scoping**: send `X-Tenant-Id: <tenant_id>` (from `/auth/me`) on every `/v1/*` call
  except the auth bootstrap routes.
- Cursor paging fields exist; `next_cursor` may be `null` today (build forward-compatible).
- Auth routes rate-limited to 5 req/min/IP (`429 rate_limited`). Standard error codes:
  `invalid_credentials`, `invalid_code`, `unauthorized`, `forbidden`, `not_found`,
  `validation_error`, `conflict`, `rate_limited`, `internal_error`.
- Dev OTP shortcut: backend logs `[DEV OTP/email] <id> -> <code>` to its console.

## 1. New `src/api/` layer (the seam)

```
src/api/
  config.ts            # VITE_API_BASE (default http://localhost:5162/v1)
  ApiError.ts          # { status, code, message, details } — copied from catreadmin
  client.ts            # fetch wrapper: Bearer + X-Tenant-Id injection, {data}/{error} unwrap,
                       #   401 → refresh-rotate → retry-once → setOnAuthFailure(); request()+listRequest()
  mapper.ts            # snake_case ⇄ camelCase per-resource maps (boundary only)
  auth/tokenStore.ts   # access in memory, refresh in localStorage (key: sms_admin_refresh), tenantId
  auth.ts              # otpRequest, otpVerify, login(password), refresh, me, logout, setPassword
  queryKeys.ts         # central key factory for cache invalidation
  <resource>.ts        # students, teachers, staff, classes, subjects, exams, examPapers,
                       #   grades, fees, payslips, leave, approvals, attendance, threads,
                       #   complaints, announcements, notifications, users
  hooks/               # useStudents.ts + useStudentMutations.ts, … one pair per resource
```

`src/lib/api.ts` (`MockApi`) and `src/data/mockDb.ts` are **retained** as the test double and
the source of static reference data. Screens consume **hooks**, not `export const api`.

## 2. Auth + tenant + token lifecycle

- **OTP (primary):** `POST /auth/otp/request {identifier}` → `POST /auth/otp/verify {identifier, code}`
  → `{ access_token, refresh_token }`. Persist both (access in memory, refresh in localStorage).
- **Password (fallback):** `POST /auth/login {email, password}` → tokens. `POST /auth/set-password`
  (Bearer) enables it after first OTP login.
- After tokens: `GET /auth/me` → `{ id, tenant_id, roles }`. `tenant_id` → `tokenStore.tenantId`
  (sent as `X-Tenant-Id`). `roles` → app `role`. Owner-domain email → `owner` console
  (kept on mock, per scope); otherwise `school` console.
- **Refresh rotation:** on `401`, `POST /auth/refresh {refresh_token}` → new pair (persist new
  refresh), retry once; on failure clear tokens + `onAuthFailure()` (logout → login screen).
- **Logout:** `POST /auth/logout {refresh_token}` then clear store.
- `AppProvider.login/logout` become **async**, API-backed. The five demo accounts / role-lock
  UI behavior is preserved; identity now comes from `/auth/me`.

## 3. Boundary mapper (snake ⇄ camel)

Per-resource bidirectional field maps applied in `<resource>.ts` after `request()`/before POST.
Representative pairs (from backend `admin-api.md` §3/§7):

`adm↔admission_no`, `cls↔class_label`, `feeStatus↔fee_status`, `feeDue↔fee_due`,
`avatarHue↔avatar_hue`, `classTeacher↔class_teacher`, `dept↔department`, `desig↔designation`,
`cat↔category`, `no↔bus_no`, `from↔from_date`, `to↔to_date`, `subjects(count)↔subject_count`,
`marksEntered↔marks_entered_pct`, `mode↔method`, `tz↔timezone`, `plan↔tier`,
`students↔students_count`, `staff↔staff_count`, `attendance↔attendance_pct`,
`dateOfJoining↔date_of_joining`, etc. Money treated as exact decimal. Dates ISO-8601.

## 4. Screen-by-screen binding map + gap policy

| Screen | Binds to | Notes |
|---|---|---|
| `dashboard` | `/students`,`/teachers`,`/staff`,`/approvals`,`/notifications` | KPI counts derived from lists; trend charts that have no series endpoint → flagged |
| `sis` + `studentAdd` | `GET/POST/PATCH /students`, `GET /students/{id}`, `POST /students/import` | filters `q/grade/status/fee` |
| `people` + `teacherAdd` + `staffAdd` | `/teachers`, `/staff` (list/get/create/patch) | Parents tab derived from student guardian fields |
| `attendance` | `GET/POST /classes/{classId}/attendance`, `GET /classes` | class roll-call |
| `academics` | `GET/POST /classes`, `/subjects` | timetable builder, periods, homework → **gap (mock-flag)** |
| `exams` | `/exams` (CRUD), `/exam-papers` (list/get/create), `GET /exam-papers/{id}/grades`, `PUT /grades` | adapt datesheet + marks-grid UI to exam-papers+grades model; report-card/rank computed client-side from real grades |
| `finance` | `/fees/payments`, `/fees/invoices`, `POST /fees/invoices/{id}/pay`, `/payslips`, `/leave` | fee-structure/heads config → **gap (mock-flag)** |
| `operations` | `/complaints`, `/threads` (+`/messages`), `/announcements`, `/notifications` | live bus/GPS tracking → **gap (mock-flag)** |
| `admin` | `POST /users`, `POST /users/import`, `/approvals` (+`PATCH`) | RBAC matrix (`PERMS`) stays static reference; school-settings PATCH not in surface → gap |
| `calendar` | — | no endpoint → **gap (mock-flag)** |
| owner/* | — | out of scope → **gap (mock-flag)** |

**Gap policy:** a small reusable **"Demo data"** badge marks any screen/section still on mock.
Static reference data (`grades`, `sections`, `depts`, `ROLE_META`, `ROLES`, `PERMS`,
`TIER_META`, `TIERS`, `FEATURE_TIER`) keeps importing from `mockDb.ts` — these are enums, not
"mock bindings."

## 5. State migration (`AppProvider`)

- Stop importing seed arrays (`students/teachers/staff/exams`) from `mockDb`.
- Rosters/exams/fees move to **React Query** caches via hooks; in-session `addX` becomes
  **mutations** with query invalidation (optimistic where it helps UX).
- `AppProvider` keeps UI/session state only: `consoleKind`, `role`, `schoolId`/tenant, `lang`,
  `view`/nav, `plan` override. Auth actions become async.

## 6. Tests strategy

- Keep `MockApi` + `mockDb` as the **test double**. Default/dev-without-`VITE_API_BASE` and the
  Vitest suite run against the mock; real `RestApi` is selected when `VITE_API_BASE` is set.
- Hook/screen tests wrap a fresh test `QueryClient`; HTTP is mocked at `fetch`.
- All existing tests stay green; tests asserting direct mock-array reads are updated to the
  hook/mocked-fetch path. Each new `src/api/*` module gets a co-located test (mirror catreadmin).

## 7. Env / wiring

- `.env.example` → `VITE_API_BASE=http://localhost:5162/v1`.
- `main.tsx` wraps the app in `QueryClientProvider`; `client.ts` `setOnAuthFailure` → logout +
  route to login. Add `@tanstack/react-query` dependency (as in catreadmin).

## 8. Phasing (each phase ends green: `npm test` + `npm run build`)

0. **Infra + auth** — `api/` client, config, ApiError, tokenStore, mapper, QueryClientProvider,
   `.env`, `setOnAuthFailure`; auth module; bind login (OTP + password), me/refresh/logout;
   async `AppProvider`.
1. **Read-only binds** — dashboard counts, students/SIS list + Student 360, teachers, staff,
   approvals list, notifications.
2. **Mutations** — student/teacher/staff add + edit, `users` + import, approvals PATCH.
3. **Academics + attendance** — classes, subjects, roll-call.
4. **Exams** — exams + exam-papers + grades; adapt datesheet/marks UI; report cards from real grades.
5. **Finance + comms** — payments, invoices, pay, payslips, leave; threads, complaints, announcements.
6. **Gap-flagging pass** — "Demo data" badges on mock-only screens (buses/GPS, timetable,
   homework, fee-structure, calendar, owner console, derived parents); cleanup + docs.

## Out of scope / honest limitations

- Owner/platform console, live GPS, timetable builder, homework, fee-structure config,
  school-settings PATCH, report-card/rank endpoints — no School Admin endpoint today; remain mock.
- Payments stubbed server-side; SMS OTP stubbed (use email OTP in dev).
- Cursor paging may return a single page until the server emits cursors.

## Live vs Demo — final binding status (Phases 0–6)

**Live-bound (real API):**
- Auth: OTP + password login, /auth/me, refresh, logout (Phase 0)
- Reads: students + Student 360, teachers, staff, approvals, notifications, complaints, threads, announcements, fee payments, classes, subjects, exams (Phases 1, 3, 4, 5)
- Mutations: add student/teacher/staff (POST), approvals act-on (PATCH), user invite (POST), create class/subject (POST), submit attendance (POST), create/update exam (POST/PUT), create announcement (POST), pay invoice (POST) (Phases 2–5)

**Demo data (no live endpoint — flagged with DemoBadge):**
- Dashboard synthetic KPI counts; timetable builder, bell-schedule periods, homework, class tests, class-teacher assign; exam marks-entry grid, per-student grades, exam-papers, exam attendance, datesheet, report cards/ranks; attendance status pre-fill / bulk roster / geo-fence; messenger send + new-thread + unread badge; complaint resolve; fee waiver; fee-structure config; payroll run/approve; payslips + leave (no UI); bus fleet + live GPS; calendar; owner console.

**Deferred for a dedicated effort (needs real backend contract + sanctioned UI changes):** the exam-papers + grades model pivot (marks grid → paper-picker), and AppProvider seed-state removal (still consumed by the demo surfaces above).
</content>
</invoke>
