# SchoolMate Admin — Foundation (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running, themeable, navigable React 19 + TypeScript SchoolMate Admin app: ported design system, typed UI component library, DataTable, charts, a swap-ready async mock-API layer, role/tier gating, auth/login with role-locked demo accounts, theming + Tweaks, and routing with placeholder screens for every roadmap screen.

**Architecture:** Vite 6 + React 19 (function components, `ref`-as-prop, Actions) + TypeScript. The prototype's CSS-variable design system is ported as-is; UI primitives are typed React wrappers over those classes. Data flows through an `Api` interface (`MockApi` now, `RestApi` calling `.NET /v1` later) — all methods async. App state lives in Context (App/Theme/Toast).

**Tech Stack:** React 19, Vite 6, TypeScript 5, React Router v7, Vitest + @testing-library/react.

**Design reference (read before each task):** `docs/design-reference/project/app/` — especially `data.jsx` (entities + math), `components.css` (class contract), `app.jsx` (router/shell patterns), `icons.jsx`, `charts.jsx`. Chat history: `docs/design-reference/chats/chat1.md`.

---

## File structure (decomposition)

```
src/
  main.tsx, App.tsx, router.tsx
  styles/{tokens,components,layout,login}.css
  types/index.ts
  data/mockDb.ts
  lib/{format,gating,api}.ts, lib/hooks.ts
  context/{AppProvider,ThemeProvider,ToastProvider}.tsx
  components/ui/*          (Btn, Badge, Card, Field/Input/Select/Toggle/Checkbox/Search,
                            Segmented, Tabs, Avatar, Skeleton, Empty, Modal, Drawer,
                            Popover/Menu, Tooltip, Progress, Breadcrumb, Kpi, PageHead, Icon, index.ts)
  components/charts/Charts.tsx
  components/table/DataTable.tsx
  components/shell/{Sidebar,Topbar,Tweaks,TierGate,RoleGate,RestrictedScreen}.tsx
  screens/LoginScreen.tsx
  screens/placeholders/Placeholder.tsx
```

---

## Task 1: Scaffold Vite + React 19 + TS project

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `.gitignore`, `src/test/setup.ts`.

- [ ] **Step 1:** Initialize with the React-TS template, then add router + test deps.
```bash
cd "D:/SMS/sms-project/sms-admin"
npm create vite@latest . -- --template react-ts   # if prompted about non-empty dir, keep existing files
npm install react@^19 react-dom@^19 react-router-dom@^7
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/node
```
- [ ] **Step 2:** Set `vite.config.ts` with `@/` alias → `src/`, and `vitest.config.ts` (or `test` block) using `jsdom` + `src/test/setup.ts` (imports `@testing-library/jest-dom`).
- [ ] **Step 3:** Replace `src/App.tsx` with a minimal shell rendering `"SchoolMate"` and remove template CSS/assets (`App.css`, `index.css` template content, logos). `main.tsx` imports `./styles/tokens.css`, `./styles/components.css`, `./styles/layout.css`.
- [ ] **Step 4:** Add npm scripts: `dev`, `build`, `preview`, `test` (`vitest run`), `test:watch` (`vitest`). Run `npm run build`. Expected: clean build.
- [ ] **Step 5:** Add `.gitignore` (node_modules, dist, .vite). Commit.
```bash
git add -A && git commit -m "chore: scaffold Vite + React 19 + TS + Vitest"
```

## Task 2: Port the design system CSS

**Files:** Create `src/styles/components.css` (copy), `src/styles/tokens.css`, `src/styles/layout.css`, `src/styles/login.css`.

- [ ] **Step 1:** Copy `docs/design-reference/project/app/components.css` → `src/styles/components.css` verbatim.
- [ ] **Step 2:** Write `src/styles/tokens.css` defining ALL CSS custom properties referenced in `components.css` and `app.jsx`, scoped to `:root`/`html[data-theme=light]` and `html[data-theme=dark]`. Required tokens (verify against a grep of `var(--…)` in components.css + app.jsx):
  - Brand scale `--brand-50 … --brand-900` (default **indigo**: 50 `#eef2ff`, 300 `#a5b4fc`, 500 `#6366f1`, 600 `#4f46e5`, 700 `#4338ca`), `--ring` (brand at ~22% alpha).
  - Text: `--text`, `--text-2`, `--text-3`; ink ramp `--ink-150/300/400/900`.
  - Surfaces: `--bg`, `--bg-elev`, `--surface`, `--surface-2`, `--surface-3`; borders `--border`, `--border-2`.
  - Semantic + bg: `--success(-bg)`, `--warning(-bg)`, `--danger(-bg)`, `--info(-bg)`.
  - Tiers: `--silver(-bg)` slate, `--gold(-bg)` amber `#d4a017`, `--gold-2`, `--platinum(-bg)` violet `#7c3aed`.
  - Radii `--r-xs:5px --r-sm:8px --r-md:10px --r-lg:14px --r-xl:18px --r-pill:999px`.
  - Shadows `--sh-xs/sm/md/lg/xl` (subtle → elevated). Z-index `--z-modal:50 --z-pop:60 --z-toast:70`.
  - Fonts `--font-display` and `--font-ui` (system stack: `-apple-system, "Segoe UI", Roboto, …`).
  - Dark theme overrides: dark bg `#0b1120`, elevated `#111827`, surfaces, inverted text ramp, adjusted borders.
  - Accent override blocks via `html[data-accent=emerald|azure|plum|sunset]` remapping `--brand-*`. Density via `html[data-density=compact|comfy]` (a `--space` multiplier), corners via `html[data-corners=sharp|pillowy]` (radii overrides), canvas via `html[data-canvas=warm|paper]` (bg tint).
- [ ] **Step 3:** Write `src/styles/layout.css` for class names used by `app.jsx`/shell/screens not covered by components.css: `.sm-app` (grid: sidebar + main), `.sm-main`, `.sm-content`, `.sm-content-narrow` (max-width center), `.sm-sidebar` (+ groups, nav items, active state, collapsed), `.sm-topbar`, `.sm-scrim`, `.only-mobile`, `.sm-table-wrap` + table cells, `.sm-kpi-grid`, `.sm-grid-2`, `.sm-bento`, stat-tile, `.sm-meter`, `.sm-dot-live` (pulse), `.sm-gate-lock`, `.sm-school-logo`, `sm-shimmer`/`sm-pulse` keyframes. Responsive: sidebar collapses under 960px.
- [ ] **Step 4:** Write `src/styles/login.css`: `.sm-login` split layout, `.sm-login-brand` panel (brand gradient), `.sm-login-form`, demo-account chips.
- [ ] **Step 5:** Temporarily render a few `.sm-btn`, `.sm-card` in App.tsx, `npm run dev`, confirm styles apply (manual visual). Commit.
```bash
git add -A && git commit -m "feat: port design-system CSS (tokens, components, layout, login)"
```

## Task 3: TypeScript entity & domain types

**Files:** Create `src/types/index.ts`.

- [ ] **Step 1:** Define types from `data.jsx`: `Tier='silver'|'gold'|'platinum'`; `Role='admin'|'principal'|'vice_principal'|'teacher'`; `Cap='V'|'E'|'A'`; `Console='owner'|'school'`; and interfaces `School, Student, Teacher, Staff, Bus, Exam, Approval, Complaint, Thread, ThreadMsg, Notification`, plus `ReportRow`, `Report`, `RankInfo`, `RoleMeta`, `TierMeta`. Match field names exactly (e.g. `School.mrr`, `Student.feeStatus`, `Bus.status`).
- [ ] **Step 2:** Define `ListStudentsOpts`, `ListTeachersOpts`, `ListStaffOpts` (the `service` filter option shapes).
- [ ] **Step 3:** `npx tsc --noEmit`. Expected: no errors. Commit.
```bash
git add -A && git commit -m "feat: add domain TypeScript types"
```

## Task 4: Port mock dataset

**Files:** Create `src/data/mockDb.ts`.

- [ ] **Step 1:** Port `data.jsx` constants & generators to typed TS: `TIERS, TIER_META, FEATURE_TIER, ROLES, ROLE_META, PERMS`, the seeded `rng(42)`, and the generated `schools, students(240), teachers(48), staff(56), buses, exams, complaints, threads, approvals, notifications, subjects, grades, sections, depts`. Keep the exact RNG so data is deterministic. Export all as named exports.
- [ ] **Step 2:** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3:** Commit.
```bash
git add -A && git commit -m "feat: port deterministic mock dataset"
```

## Task 5: Format & academic helpers (TDD)

**Files:** Create `src/lib/format.ts`, `src/lib/format.test.ts`.

- [ ] **Step 1: Write failing tests** in `format.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fmtMoney, fmtNum, gradeFor, gpaFor, reportFor, classRank } from './format'
import { students } from '@/data/mockDb'

describe('format', () => {
  it('formats money in en-IN with currency', () => {
    expect(fmtMoney(150000)).toBe('₹ 1,50,000')
    expect(fmtMoney(1000, 'AED')).toBe('AED 1,000')
  })
  it('grades by percentage band', () => {
    expect(gradeFor(95)).toBe('A1'); expect(gradeFor(35)).toBe('D'); expect(gradeFor(10)).toBe('E')
  })
  it('maps grade to gpa', () => { expect(gpaFor('A1')).toBe(10); expect(gpaFor('E')).toBe(3) })
  it('builds a deterministic report with PASS/COMPARTMENT', () => {
    const r = reportFor(students[0])
    expect(r.rows.length).toBeGreaterThan(0)
    expect(['PASS','COMPARTMENT']).toContain(r.result)
    expect(r.pct).toBe(reportFor(students[0]).pct) // deterministic
  })
  it('ranks a student within its class (1-based, within class size)', () => {
    const { rank, classSize } = classRank(students[0])
    expect(rank).toBeGreaterThanOrEqual(1); expect(rank).toBeLessThanOrEqual(classSize)
  })
})
```
- [ ] **Step 2:** Run `npm test -- format` → FAIL (module not found).
- [ ] **Step 3:** Implement `format.ts` porting `fmtMoney, fmtNum, hash, gradeFor, gpaFor, studentSubjectMarks, reportFor, classRank, attendanceMonths` from `data.jsx`.
- [ ] **Step 4:** Run `npm test -- format` → PASS.
- [ ] **Step 5:** Commit. `git add -A && git commit -m "feat: format + academic helpers with tests"`

## Task 6: Gating helpers (TDD)

**Files:** Create `src/lib/gating.ts`, `src/lib/gating.test.ts`.

- [ ] **Step 1: Failing tests:**
```ts
import { describe, it, expect } from 'vitest'
import { tierIncludes, requiredTier, can, caps } from './gating'

describe('gating', () => {
  it('tierIncludes respects tier order', () => {
    expect(tierIncludes('silver','sis')).toBe(true)
    expect(tierIncludes('silver','hr_payroll')).toBe(false)
    expect(tierIncludes('gold','hr_payroll')).toBe(true)
    expect(tierIncludes('gold','transport.gps')).toBe(false)
    expect(tierIncludes('platinum','transport.gps')).toBe(true)
  })
  it('requiredTier defaults to silver', () => { expect(requiredTier('unknown')).toBe('silver') })
  it('can() reads the permission matrix', () => {
    expect(can('admin','sis','E')).toBe(true)
    expect(can('teacher','fees','E')).toBe(false)
    expect(can('principal','exams','A')).toBe(true)
  })
  it('caps() returns the capability array', () => { expect(caps('admin','sis')).toContain('E') })
})
```
- [ ] **Step 2:** `npm test -- gating` → FAIL.
- [ ] **Step 3:** Implement `gating.ts` porting `tierIncludes, requiredTier, can, caps` reading `TIERS, FEATURE_TIER, PERMS` from `mockDb`.
- [ ] **Step 4:** `npm test -- gating` → PASS.
- [ ] **Step 5:** Commit. `git add -A && git commit -m "feat: tier/role gating helpers with tests"`

## Task 7: Async API layer (TDD on filters)

**Files:** Create `src/lib/api.ts`, `src/lib/api.test.ts`.

- [ ] **Step 1: Failing tests:**
```ts
import { describe, it, expect } from 'vitest'
import { api } from './api'

describe('MockApi', () => {
  it('lists all schools', async () => { expect((await api.listSchools()).length).toBe(7) })
  it('filters students by query', async () => {
    const all = await api.listStudents(); const some = await api.listStudents({ q: all[0].name.split(' ')[0] })
    expect(some.length).toBeGreaterThan(0); expect(some.length).toBeLessThanOrEqual(all.length)
  })
  it('filters students by fee status', async () => {
    const due = await api.listStudents({ fee: 'due' }); expect(due.every(s => s.feeStatus === 'due')).toBe(true)
  })
  it('lists approvals for a role', async () => {
    const a = await api.listApprovals('principal'); expect(a.every(x => x.forRoles.includes('principal'))).toBe(true)
  })
})
```
- [ ] **Step 2:** `npm test -- api` → FAIL.
- [ ] **Step 3:** Implement `api.ts`: an `Api` interface (`listSchools, getSchool, listStudents, listTeachers, listStaff, listApprovals, notifications, reportFor, classRank`), a `MockApi` class implementing it (async, reading `mockDb` + `format`), and `export const api: Api = new MockApi()`. Add a commented `RestApi` stub showing `fetch('/v1/...')` shape for the future .NET API.
- [ ] **Step 4:** `npm test -- api` → PASS.
- [ ] **Step 5:** Commit. `git add -A && git commit -m "feat: async Api interface + MockApi with tests"`

## Task 8: Icon component

**Files:** Create `src/components/ui/Icon.tsx`.

- [ ] **Step 1:** Port `icons.jsx` to a typed `Icon` component: `{ name: string; size?: number; className?: string; style?: CSSProperties }`, returning the matching inline SVG path set (stroke=currentColor). Include every name used across `app.jsx`/data icons: bus, rupee, check, checkCircle, alert, inbox, pin, clock, users, book, briefcase, shield, beaker, doc, box, plus, home, grid, calendar, sparkle, lock, building, globe, layers, search, bell, sun, moon, menu, chevron, x, edit, trash, etc. Provide a fallback (dot) for unknown names.
- [ ] **Step 2:** `npx tsc --noEmit` → clean. Commit. `git add -A && git commit -m "feat: Icon component (SVG set)"`

## Task 9: UI component library

**Files:** Create `src/components/ui/{Btn,IconBtn,Badge,TierPill,Card,Field,Input,Textarea,Select,Toggle,Checkbox,Search,Segmented,Tabs,Avatar,Skeleton,Empty,Modal,Drawer,Popover,Menu,Tooltip,Progress,Breadcrumb,Kpi,PageHead}.tsx` and `src/components/ui/index.ts`.

- [ ] **Step 1:** Implement each as a typed function component rendering the exact `components.css` classes (e.g. `Btn` → `sm-btn sm-btn-{size} sm-btn-{variant}`, optional `icon`). React 19: accept `ref` as a normal prop where useful (Input, Modal). Variants for `Btn`: primary|secondary|ghost|danger|success|gold|platinum; sizes sm|md|lg. `Modal`/`Drawer` render into `.sm-overlay` and trap Esc + backdrop-close. `Tabs`/`Segmented` controlled via `value`/`onChange`. `Select` takes `options: (string | {value,label})[]`. `Kpi` and `PageHead` match dashboard usage in `app.jsx`.
- [ ] **Step 2:** Barrel-export all from `index.ts`.
- [ ] **Step 3:** Add `src/components/ui/ui.test.tsx`: render `Btn`, click handler fires; `Modal open` shows children, `open=false` hides; `Tabs` switches on click.
- [ ] **Step 4:** `npm test -- ui` → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 5:** Commit. `git add -A && git commit -m "feat: typed UI component library"`

## Task 10: Charts

**Files:** Create `src/components/charts/Charts.tsx`.

- [ ] **Step 1:** Port `charts.jsx` to typed SVG components: `LineChart, AreaChart, Donut, Bars, Sparkline, Gauge`. Props typed (`data: number[]` or `{label,value}[]`, `colors?`, `size?`). No external chart lib — inline SVG, theme via currentColor / CSS vars.
- [ ] **Step 2:** Add `charts.test.tsx`: each renders an `<svg>` for sample data without throwing.
- [ ] **Step 3:** `npm test -- charts` → PASS. Commit. `git add -A && git commit -m "feat: SVG chart components"`

## Task 11: DataTable

**Files:** Create `src/components/table/DataTable.tsx`, `src/components/table/DataTable.test.tsx`.

- [ ] **Step 1: Failing test:** render a DataTable with 3 rows + 2 columns; assert rows render; clicking a sortable header reorders; pagination shows page 2 when `pageSize=2`.
- [ ] **Step 2:** `npm test -- DataTable` → FAIL.
- [ ] **Step 3:** Implement generic `DataTable<T>`: `columns: { key; label; render?; sortValue?; align? }[]`, `rows: T[]`, `pageSize?`, `initialSort?`, optional `bulk` (checkbox select) and column-visibility menu. Uses `.sm-table-wrap` classes.
- [ ] **Step 4:** `npm test -- DataTable` → PASS.
- [ ] **Step 5:** Commit. `git add -A && git commit -m "feat: generic DataTable with sort/paginate/bulk"`

## Task 12: Context providers

**Files:** Create `src/context/ToastProvider.tsx`, `src/context/ThemeProvider.tsx`, `src/context/AppProvider.tsx`, `src/lib/hooks.ts`.

- [ ] **Step 1:** `ToastProvider` + `useToast()` (`success/info/danger`), renders `.sm-toasts`.
- [ ] **Step 2:** `ThemeProvider` + `useTheme()`: state for `theme(light|dark)`, `accent`, `density`, `corners`, `canvas`; applies to `document.documentElement` via `data-theme`/`data-accent`/etc.; persists to `localStorage`.
- [ ] **Step 3:** `AppProvider` + `useApp()`: `loggedIn, user, console, role, school, plan, lang, dir, view, mobileNav` and actions `login(email), logout(), go(view), enterSchool(id), exitToOwner(), upgrade(tier), setLang, setMobileNav`. Login routing: `@schoolmate.io` → owner console; demo emails map to roles; role switcher hidden post-login. Re-export `useApp/useToast/useTheme` from `hooks.ts`.
- [ ] **Step 4:** Add `AppProvider.test.tsx`: `login('anil@schoolmate.io')` sets `console='owner'`; `login('principal@grv.edu')` sets `role='principal'`, `console='school'`.
- [ ] **Step 5:** `npm test -- AppProvider` → PASS. Commit. `git add -A && git commit -m "feat: App/Theme/Toast context providers"`

## Task 13: Shell — Sidebar, Topbar, Tweaks, gates

**Files:** Create `src/components/shell/{Sidebar,Topbar,Tweaks,TierGate,RoleGate,RestrictedScreen}.tsx`.

- [ ] **Step 1:** `Sidebar` — console- & role-aware nav config (Owner groups vs School groups matching the roadmap; Identity item Admin-only). Active item from `app.view`; tier-lock hint icons; collapsible; mobile scrim via `app.mobileNav`.
- [ ] **Step 2:** `Topbar` — school switcher (school console), global search (visual), language menu, light/dark toggle (via `useTheme`), notifications popover (from `api.notifications()`), user menu with working **Sign out**. Owner-viewing-school shows "Owner · viewing {school}".
- [ ] **Step 3:** `Tweaks` — floating panel with Mode/Brand/Density/Corners/Canvas controls wired to `useTheme`.
- [ ] **Step 4:** `TierGate({feature, plan, children})` — renders children if `tierIncludes`, else a blurred `.sm-gate-lock` overlay + upgrade CTA. `RoleGate({role, module, cap, children})` / `RestrictedScreen` for unauthorized access.
- [ ] **Step 5:** `npx tsc --noEmit` → clean. Commit. `git add -A && git commit -m "feat: app shell (sidebar, topbar, tweaks, gates)"`

## Task 14: Login screen (React 19 Actions)

**Files:** Create `src/screens/LoginScreen.tsx`.

- [ ] **Step 1:** Split layout (`.sm-login`): brand panel + form. Use `useActionState`/form action for submit with pending spinner. Show/hide password, remember-me. Five one-click demo accounts (Owner/Admin/Principal/VP/Teacher) that call `app.login(email)`.
- [ ] **Step 2:** Add `LoginScreen.test.tsx`: clicking the "Owner" demo account logs in and the form unmounts (app shows shell). (Wrap in providers.)
- [ ] **Step 3:** `npm test -- LoginScreen` → PASS. Commit. `git add -A && git commit -m "feat: login screen with role-locked demo accounts"`

## Task 15: Router, placeholders, App wiring

**Files:** Create `src/screens/placeholders/Placeholder.tsx`, `src/router.tsx`; rewrite `src/App.tsx`.

- [ ] **Step 1:** `Placeholder({title, phase})` — `PageHead` + `Empty` ("Coming in Phase N").
- [ ] **Step 2:** `router.tsx` — map every roadmap `view` key (owner.* and school.*) to either a real component (none yet) or `<Placeholder>` with the right title/phase. Mirror the `Router()` switch in `app.jsx`.
- [ ] **Step 3:** `App.tsx` — `ToastProvider > ThemeProvider > AppProvider > Shell`. `Shell`: if `!loggedIn` → `LoginScreen`; else `.sm-app` with `Sidebar`, `Topbar`, `<main>` rendering the routed view, plus `Tweaks`.
- [ ] **Step 4:** Add `App.test.tsx` smoke: renders Login; after Owner login, sidebar shows "Portfolio"/owner nav; toggling theme sets `data-theme`.
- [ ] **Step 5:** `npm test` (full) → PASS. `npm run build` → clean. Commit. `git add -A && git commit -m "feat: router + placeholders + app wiring"`

## Task 16: Final verification & docs

- [ ] **Step 1:** `npm run build` and `npm test` both green; capture output.
- [ ] **Step 2:** Manually `npm run dev`; verify: each demo account → correct console/role; every sidebar item navigates to a rendered placeholder; light/dark + each Tweak re-skins; no console errors.
- [ ] **Step 3:** Write `README.md` (run instructions, structure, phase status, how the API seam swaps to `.NET /v1`).
- [ ] **Step 4:** Commit. `git add -A && git commit -m "docs: README + Phase 0 verification"`

---

## Self-review notes

- **Spec coverage:** stack (T1), design system/tokens/layout (T2), types (T3), mock data (T4), format/academic math (T5), gating (T6), async API seam (T7), Icon (T8), component library (T9), charts (T10), DataTable (T11), context/theming (T12), shell/sidebar/topbar/tweaks/gates (T13), auth/login/demo accounts (T14), routing + placeholders (T15), tests + success criteria (T5–T16). All Phase-0 spec sections map to a task.
- **Out-of-scope** items (real backend, payments, persistence, full i18n) intentionally excluded per spec §5.
- **Type consistency:** entity field names taken directly from `data.jsx`; `Api` method names reused identically in T7/T12/T13.
