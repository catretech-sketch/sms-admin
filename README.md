# SchoolMate Admin

A two-console, multi-tenant **school-management SaaS admin panel** — built as a modern
**React 19 + TypeScript** frontend. Backed by mock data today; structured so a future
**.NET Core 10 + SQL Server** REST API drops in behind a single data-access seam.

> Frontend only. No backend, persistence, or payments — those belong to the API project.

## Quick start

```bash
npm install
npm run dev        # start the dev server (Vite)
npm run build      # type-check (tsc -b) + production build
npm run preview    # preview the production build
npm test           # run the Vitest suite
```

Open the dev URL and sign in with any of the **five one-click demo accounts** on the login
screen:

| Account | Lands in | Role |
|---|---|---|
| Anil Mehta | Owner console | Owner (full access) |
| Ravi Menon | School console | Admin |
| Sunita Rao | School console | Principal |
| Arjun Banerjee | School console | Vice-Principal |
| Meera Krishnan | School console | Teacher |

Each account is locked to its role (no role switcher). The Owner can enter any school and
keeps Owner identity while viewing it.

## What's inside

- **Owner console** — portfolio overview, schools list + 5-step create-school wizard
  (student-strength pricing), cross-school reports (year filter + Excel export),
  subscriptions & billing + interactive plan calculator, users & roles (RBAC matrix),
  owner settings, branded account report.
- **School console** — dashboard (KPIs, charts, people-at-a-glance, live feed), approvals
  inbox, Students/SIS + Student 360, Teachers, Staff, Parents, Academics (classes,
  interactive timetable builder, periods, subjects, homework), Attendance, Exams
  (scheduling, datesheet + invigilator clash detection, marks grid, report cards), Fees,
  HR & Payroll, Communication (messenger, complaints, announcements), Operations, Live bus
  tracking, Reports, Identity & access, Settings.
- **Cross-cutting** — Silver/Gold/Platinum **tier gating** (blurred lock-gate + live upgrade),
  Admin/Principal/VP/Teacher **role gating** via a permission matrix (+ Owner super-role),
  light/dark + a live **Tweaks** panel (accent/density/corners/canvas), RTL/i18n scaffolding,
  India-flavored data (₹).

## Project structure

```
src/
  main.tsx, App.tsx, router.tsx          # entry, providers + shell, view router
  styles/        tokens.css, components.css, layout.css, login.css
  types/         domain types (School, Student, Teacher, …, roles/tiers/perms)
  data/          mockDb.ts — deterministic seeded dataset
  lib/           format.ts (money + academic math), gating.ts, api.ts, hooks.ts
  context/       AppProvider, ThemeProvider, ToastProvider
  components/
    ui/          typed component library (Btn, Modal, Field, DataTable re-export, …)
    charts/      SVG charts (Line, Donut, Bars, Spark, Gauge)
    table/       generic DataTable (sort/paginate/bulk)
    shell/       Sidebar, Topbar, Tweaks, gates (TierGate/RoleGate)
  screens/
    school/*     dashboard, sis, people, attendance, academics, exams, finance,
                 operations, admin
    owner/*      portfolio, billing, workspace
    registry.tsx # merges each area's screen map -> consumed by router.tsx
```

## The API seam (swapping in the .NET backend)

All data flows through the `Api` interface in `src/lib/api.ts`. Today `export const api`
points at `MockApi` (reads `src/data/mockDb.ts`). Every method is **async**, so UI code is
already written for the network. When the **.NET Core 10 `/v1`** API is ready, implement the
commented `RestApi` (one method per endpoint, same signatures) and change the single
`export const api` line — no screen code changes. The permission matrix in `lib/gating.ts`
must then be **enforced server-side** as well (the client gating is UX only).

## Phase status

| Phase | Status |
|---|---|
| 0 — Foundation (scaffold, design system, shell, UI lib, data/API, auth, theming, routing) | ✅ |
| 1 — School flagship (dashboard, approvals, SIS, Student 360) | ✅ |
| 2 — Academics & Exams | ✅ |
| 3 — People, Attendance, Fees/HR, Communication/Operations/GPS | ✅ |
| 4 — Owner console | ✅ |
| 5 — Reports, Settings, Identity/RBAC | ✅ |

Design spec: `docs/superpowers/specs/`. Implementation plan: `docs/superpowers/plans/`.
Original design handoff (reference): `docs/design-reference/`.

## Tech

React 19 · TypeScript 5 · Vite 6 · React Router 7 (installed) · Vitest 3 +
Testing Library. No UI/runtime dependencies beyond React — the design system is hand-rolled
CSS variables, which is what powers light/dark and the Tweaks panel.
