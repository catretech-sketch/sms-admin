# SchoolMate Admin — React Frontend (Foundation Phase) — Design

_Date: 2026-06-08_
_Status: Approved (design); pending implementation plan_

## 1. Context & goal

Build the **SchoolMate Admin** web app — a two-console, multi-tenant school-management SaaS
admin panel — as a production-grade, scalable **React** frontend. The backend (a **.NET Core 10**
REST API over **SQL Server**) will be built later; this project delivers the **frontend only**,
structured so the future API drops in behind a single data-access seam.

The design to implement comes from a Claude Design handoff bundle (`admin-school/`): a README,
a full chat transcript, and 6 source files. The product was prototyped in HTML/CSS/JS; our job is
to recreate it faithfully in modern React.

### Two realities recorded during exploration

1. **Large product.** ~30 real screens across an Owner console and a School console. Too big for a
   single plan, so the work is **phased** (Section 3). This spec covers **Phase 0 — Foundation** only.
2. **Incomplete export.** The prototype's `index.html` loads ~30 files; only **6** were included in the
   bundle:
   - `app/data.jsx` — full mock data model + service layer (tiers, roles, permission matrix, schools,
     students, teachers, staff, buses, exams, complaints, threads, approvals, notifications, report/grade/rank math).
   - `app/components.css` — complete component stylesheet.
   - `app/app.jsx` — root, router, and the Operations & Settings screens (+ BusList, AddVehicle).
   - `app/icons.jsx`, `app/charts.jsx`, `app/common.jsx` — foundation helpers.

   **Missing:** `tokens.css` (exact color values), `layout.css` (sidebar/topbar/table/dashboard layout),
   `ui.jsx` (component library), `table.jsx` (DataTable), `shell.jsx` (Sidebar/Topbar/AppProvider), and
   **all screen files** (`screens_*.jsx`, wizards, login, tweaks).

   **Consequence:** the design system and screens are **reconstructed** from the rich chat transcript +
   `components.css` (which references every needed CSS variable by name) + the data model — a
   high-fidelity rebuild, not a byte-for-byte copy of missing source. Brand defaults to **indigo**
   (`--brand-600 ≈ #4f46e5`, matching the prototype's described system and St. Xavier's brand color).

## 2. Product overview (full target, for context)

- **Owner console** — portfolio overview; schools list + 5-step create-school wizard with
  student-strength-based pricing; cross-school reports (year filter, Excel export); subscriptions &
  billing + interactive plan calculator; users & roles; owner settings; branded customer (account) report.
- **School console** — dashboard (KPI row incl. total enrollment, sparkline stat tiles, attendance/fee
  charts, composition donuts/bars, people-at-a-glance, live activity feed); approvals inbox;
  Students/SIS + Student 360 + bulk-import wizard + class promotion; Teachers; Staff & support; Parents
  (each a separate sidebar item, no in-page tab bar); Academics (classes, interactive timetable builder,
  periods/bell schedule, subjects, homework); Attendance (students/teachers/staff/period-wise/geofence,
  with search + status filter); Exams (scheduling, datesheet + invigilator allocation, marks grid,
  report cards); Fees collection; HR/Payroll (HR owned by Admin); Communication (messenger —
  message-only, no calling; complaints; announcements with per-group + specific-people targeting);
  Operations (library/transport/hostel/sports); Live GPS bus tracking; Identity & access (RBAC, Admin-only);
  Reports (own sidebar tab); Settings; Tweaks panel.
- **Cross-cutting** — Silver/Gold/Platinum **tier gating** (lock-gate + upgrade); Admin/Principal/
  Vice-Principal/Teacher **role gating** via a permission matrix, plus an **Owner** super-role; light/dark
  theming; RTL + i18n (English/Hindi/Arabic/Tamil); login with role-locked demo accounts; India-flavored
  data (₹). Owner entering a school keeps Owner identity (does not become Admin).

## 3. Phasing roadmap

Each phase is its own spec → plan → implementation cycle.

| Phase | Scope |
|---|---|
| **0 — Foundation** *(this spec)* | Scaffold, design system, app shell, UI component library, DataTable, mock API + types, auth/login, theming + Tweaks, role/tier gating, routing with placeholder screens. Result: a running, themeable, navigable app with placeholder screens. |
| 1 — School flagship | Dashboard, Approvals, SIS + Student 360 + import + promotion. |
| 2 — Academics & Exams | Classes, timetable builder, periods, subjects; exam scheduling, datesheet, marks grid, report cards. |
| 3 — People & Ops | Teachers, Staff, Parents; Attendance; Fees; HR/Payroll; Operations + Live GPS; Communication. |
| 4 — Owner console | Portfolio, schools + create wizard, cross-school reports, billing + plan calculator, users & roles, settings, customer report. |
| 5 — Reports, Settings, polish | Reports tab, Settings, i18n/RTL pass, accessibility pass. |

## 4. Phase 0 — Foundation

### 4.1 Stack

- **React 19** (latest) + **Vite 6** + **TypeScript 5.x**.
- **React Router v7** for routing.
- **Context** for app/theme/toast state (read-mostly app; no Redux).
- **Vitest** + **@testing-library/react** for tests.
- Modern React 19 idioms: `ref` as a prop (no `forwardRef`); Actions / `useActionState` /
  `useFormStatus` for the login form and client mutations; `use()` for context/promises where it reads
  cleaner; `useOptimistic` reserved for later mutation-heavy screens. Function components only.

### 4.2 Project structure

```
sms-admin/
├─ index.html
├─ vite.config.ts            # React plugin + "@/" path alias to src/
├─ tsconfig.json
├─ package.json
├─ vitest.config.ts
└─ src/
   ├─ main.tsx               # ReactDOM.createRoot → <App/>
   ├─ App.tsx                # providers + <RouterProvider/>
   ├─ router.tsx             # route table (every screen, placeholders for unbuilt)
   ├─ styles/
   │  ├─ tokens.css          # reconstructed CSS custom properties (light/dark, accents)
   │  ├─ components.css       # ported verbatim from bundle
   │  ├─ layout.css           # reconstructed shell/table/dashboard layout
   │  └─ login.css            # reconstructed login styles
   ├─ types/                 # School, Student, Teacher, Staff, Bus, Exam, Approval, … + role/tier/perm
   ├─ data/
   │  └─ mockDb.ts           # seeded deterministic dataset (port of data.jsx)
   ├─ lib/
   │  ├─ api.ts              # Api interface + MockApi (async); RestApi seam for later
   │  ├─ gating.ts           # tierIncludes, can, caps, requiredTier
   │  ├─ format.ts           # fmtMoney, fmtNum, grade/gpa/report/rank helpers
   │  └─ hooks.ts            # useApp, useToast, small shared hooks
   ├─ context/
   │  ├─ AppProvider.tsx     # view/console/role/school/plan/theme/lang/dir/loggedIn + go()/upgrade()
   │  ├─ ToastProvider.tsx
   │  └─ ThemeProvider.tsx   # data-theme + accent/density/corners/canvas variables
   ├─ components/
   │  ├─ ui/                 # component library (Section 4.4)
   │  ├─ charts/             # line/area/donut/bars/sparkline/gauge (port of charts.jsx)
   │  ├─ table/DataTable.tsx # sort/paginate/bulk-select/column-visibility
   │  └─ shell/             # Sidebar, Topbar, Tweaks, TierGate, RoleGate
   └─ screens/
      ├─ LoginScreen.tsx
      └─ placeholders/       # one labeled placeholder per route ("Coming in Phase N")
```

### 4.3 Design system (ported, not redesigned)

- Port `components.css` verbatim.
- **Reconstruct `tokens.css`**: brand scale (default indigo, `--brand-50…900`), ink/text scale
  (`--text`, `--text-2`, `--text-3`, `--ink-150/300/400/900`), surfaces (`--surface`, `--surface-2/3`,
  `--bg`, `--bg-elev`), borders (`--border`, `--border-2`), semantic colors + `*-bg` variants
  (success/warning/danger/info), tier colors (`--silver/gold/platinum` + `-bg`), radii
  (`--r-xs/sm/md/lg/xl/pill`), shadows (`--sh-xs/sm/md/lg/xl`), z-index (`--z-modal/pop/toast`),
  ring (`--ring`), fonts (`--font-display`, `--font-ui`). Defined for `[data-theme=light]` and
  `[data-theme=dark]`; RTL handled via `[dir=rtl]` rules already present in `components.css`.
- **Reconstruct `layout.css`**: `.sm-app`, `.sm-main`, `.sm-content(-narrow)`, sidebar, topbar, table
  wrapper, dashboard/bento/KPI grids, meters, live dots, gate-lock, school-logo — all class names
  referenced by `app.jsx`/`components.css`.
- The **Tweaks panel** flips CSS variables: Mode (light/dark), Brand (Indigo/Emerald/Azure/Plum/Sunset),
  Density (compact/regular/comfy), Corners (sharp/rounded/pillowy), Canvas (cool/warm/paper).

### 4.4 UI component library (`components/ui/`)

Typed React versions of every primitive the CSS already styles:
`Btn`, `IconBtn`, `Badge`, `TierPill`, `Card`/`CardHead`, `Field`/`Label`/`Input`/`Textarea`/`Select`/
`Toggle`/`Checkbox`/`Search`, `Segmented`, `Tabs`, `Avatar`, `Skeleton`, `Empty`, `Modal`, `Drawer`,
`Popover`/`Menu`, `Tooltip`, `Toast` (+ provider), `Progress`, `Breadcrumb`, `Icon` (SVG set ported
from `icons.jsx`), `Kpi`, `PageHead`. Plus `components/charts/` (line/area/donut/bars/sparkline/gauge)
and `components/table/DataTable` (sort, pagination, bulk-select, column visibility).

### 4.5 Data + API layer (swap-ready for .NET Core 10)

- `types/` — TS interfaces for every entity, derived from `data.jsx`.
- `data/mockDb.ts` — the seeded dataset, reproducing the prototype's deterministic RNG so generated
  records are stable across runs.
- `lib/api.ts` — an `Api` interface whose methods mirror a future REST surface
  (`listSchools()`, `getSchool(id)`, `listStudents(opts)`, `listTeachers(opts)`, `listStaff(opts)`,
  `listApprovals(role)`, `reportFor(stu, examId)`, …). Two implementations: `MockApi` (reads `mockDb`)
  now; `RestApi` (calls `/v1`) later. **All methods are async** so UI code is written against Promises
  from day one; switching implementations is a single provider/env change.

### 4.6 Auth, gating, theming

- `LoginScreen` — split brand panel + sign-in form (React 19 Actions for pending/error). Five role-locked
  one-click demo accounts: **Owner, School Admin, Principal, Vice-Principal, Teacher**. Login sets role +
  console: Owner → Owner console (no role switcher); school roles → School console locked to that role.
- Gating: ported `tierIncludes(plan, feature)`, `can(role, module, cap)`, `caps`, `requiredTier`, plus
  `<TierGate feature>` (blurred lock-gate + upgrade CTA) and `<RoleGate module cap>` /
  `RestrictedScreen` (Admin-only Identity, etc.).
- Theming: `ThemeProvider` persists Tweaks choices and applies them as `data-*` attributes / CSS variables.

### 4.7 Routing & placeholders

React Router routes for **every** screen in the roadmap (both consoles). Unbuilt screens render a labeled
placeholder (`<PageHead>` + an `Empty` state noting the phase it lands in), so the entire app is navigable
immediately and later phases have a defined slot to fill. The Sidebar reflects the active console and role.

### 4.8 Testing

- **Unit (Vitest):** gating helpers (`tierIncludes`, `can`), mock-API filters (search/grade/status/fee),
  and academic math (`gradeFor`, `gpaFor`, `reportFor`, `classRank`).
- **Smoke (Testing Library):** login flow (each demo account lands in the correct console/role with the
  switcher hidden); each route renders without throwing; light/dark toggle flips `data-theme`.

## 5. Out of scope for Phase 0

No real backend, persistence, payments, or server-side auth (all stubbed/mocked — these are the
production blockers noted in the chat and belong to the future API project). Feature screens are
placeholders until Phases 1–5. No real i18n message catalogs yet (language menu wired, full translation
is a Phase 5 task); RTL layout supported structurally.

## 6. Success criteria (Phase 0)

- `npm install && npm run dev` starts the app; `npm run build` produces a clean production build;
  `npm test` passes.
- Login with any of the 5 demo accounts lands in the correct console with the correct role/nav and a
  hidden role switcher.
- Every roadmap route is reachable from the sidebar and renders (real shell + placeholder body).
- Light/dark and all Tweaks controls visibly re-skin the app via CSS variables.
- The component library + DataTable + charts render and are usable by later phases.
- Swapping `MockApi` → a `RestApi` stub requires touching only `lib/api.ts` wiring (verified by the
  interface boundary), readying the future `.NET Core 10 /v1` integration.
```
