# School Admin API Binding — Phase 6: Gap-Flagging + Docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small reusable **"Demo data"** badge and place it on the mock-only / synthetic surfaces that have no live endpoint, so users can tell live data from demo data; then document what is live-bound vs demo across the whole binding effort. This is the **only phase that intentionally changes the UI** — the badge is additive (a pill in existing section headers), no layout/data-flow changes.

**Architecture:** A `DemoBadge` component (thin wrapper over the existing `Badge` primitive: `tone="warning"`, an info icon, text "Demo data"). Slot it into the `PageHead actions` / `CardHead action` of each flagged surface. No data sources change; this phase only adds visual flags + a docs section.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3.

## Global Constraints

- **Additive UI only.** Each change adds a `<DemoBadge />` into an existing header slot. No layout, data-source, or behavior changes. Do not touch any binding logic.
- **Surfaces to flag** (mock-only / synthetic, no live endpoint — accumulated across Phases 1–5):
  - Fully mock screens: **live GPS** (`GpsScreen`), **bus fleet** (operations transport), **calendar**, **owner console** (portfolio + billing), **timetable builder**, **homework**, **class tests**, **bell-schedule periods**, **fee-structure config**.
  - Synthetic remainders on otherwise-bound screens: **exam marks-entry grid**, **exam attendance**, **datesheet**, **report cards/ranks**, **attendance status pre-fill / bulk roster / geo-fence**, **fee waiver**, **payroll run/approve**, **dashboard synthetic KPI counts**.
- Tests stay green (`npm test`); `npm run typecheck` + `npm run build` pass each task. `noUnusedLocals` on.
- Reuse the existing `Badge` from `@/components/ui` — do not reinvent badge styling.

---

### Task 1: `DemoBadge` component

**Files:**
- Create: `src/components/ui/DemoBadge.tsx`
- Create: `src/components/ui/DemoBadge.test.tsx`
- Modify: `src/components/ui/index.ts` (re-export `DemoBadge`, if the ui barrel exists; otherwise skip)

**Interfaces:**
- Produces: `DemoBadge(props?: { label?: string })` — renders the existing `Badge` with `tone="warning"`, an info icon, and text `label ?? 'Demo data'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/DemoBadge.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemoBadge } from './DemoBadge'

describe('DemoBadge', () => {
  it('renders the default "Demo data" label', () => {
    render(<DemoBadge />)
    expect(screen.getByText('Demo data')).toBeInTheDocument()
  })
  it('renders a custom label', () => {
    render(<DemoBadge label="Sample data" />)
    expect(screen.getByText('Sample data')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/DemoBadge.test.tsx`
Expected: FAIL — cannot find module `./DemoBadge`.

- [ ] **Step 3: Implement**

Create `src/components/ui/DemoBadge.tsx`:
```tsx
import { Badge } from './primitives'

/** Marks a surface that is still backed by demo/mock data (no live endpoint yet). */
export function DemoBadge({ label = 'Demo data' }: { label?: string }) {
  return <Badge tone="warning" icon="info">{label}</Badge>
}
```
(If `Badge`'s icon set has no `info`, use an existing icon name already used elsewhere in the codebase — read `primitives.tsx` / the Icon set and pick one such as `alert` or `eye`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/DemoBadge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Re-export (if a ui barrel exists)**

If `src/components/ui/index.ts` exists and re-exports primitives, add `export { DemoBadge } from './DemoBadge'`. If components are imported directly (no barrel), skip this step.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:
```bash
git add src/components/ui/DemoBadge.tsx src/components/ui/DemoBadge.test.tsx src/components/ui/index.ts
git commit -m "feat(ui): reusable DemoBadge for flagging mock-only surfaces"
```
(Drop `index.ts` from the `git add` if it wasn't modified.)

---

### Task 2: Flag the fully-mock screens

**Files (modify — add a `<DemoBadge />` into each screen's header/section, import `DemoBadge`):**
- `src/screens/school/operations.tsx` — `GpsScreen` header + the bus-fleet / transport section in `OperationsScreen`.
- `src/screens/school/calendar.tsx` — page header.
- `src/screens/owner/portfolio.tsx` and `src/screens/owner/billing.tsx` — page headers (owner console is out of API scope).
- `src/screens/school/academics.tsx` — the Timetable, Periods, Homework, and Tests tab headers (these tabs are synthetic; Classes + Subjects tabs are live — do NOT badge those).

**Interfaces:**
- Consumes: `DemoBadge` from `@/components/ui/DemoBadge` (or the ui barrel).

- [ ] **Step 1: Add the badge to each fully-mock surface**

For EACH file above: import `DemoBadge`, then add `<DemoBadge />` into the relevant header. Slot it into the existing `PageHead`'s `actions` prop or a `CardHead`'s `action` prop (or beside the section title) — read each file to find the section header and place the badge there without disturbing other actions. Concretely:
- `GpsScreen`: add to the page/section header for the live-GPS map.
- `OperationsScreen` transport tab + `BusFleet`: add to the bus-fleet card header.
- `calendar.tsx`: add to the `PageHead actions`.
- `portfolio.tsx` / `billing.tsx`: add to each `PageHead actions`.
- `academics.tsx`: add to the `CardHead`/section header of the **Timetable**, **Periods**, **Homework**, and **Tests** tabs only.

Keep all existing header content/actions; the badge is additive. No other changes.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (each `DemoBadge` import is used).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS — badges are additive; no test asserts their absence. If any snapshot/exact-text test now sees an extra "Demo data" string and fails, adjust that assertion minimally (it should not match "Demo data").

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/operations.tsx src/screens/school/calendar.tsx src/screens/owner/portfolio.tsx src/screens/owner/billing.tsx src/screens/school/academics.tsx
git commit -m "feat(ui): flag fully-mock screens with DemoBadge (gps/buses/calendar/owner/timetable/homework)"
```

---

### Task 3: Flag synthetic remainders + fee-structure + final verification + docs

**Files (modify — add `<DemoBadge />`):**
- `src/screens/school/finance.tsx` — `FeeStructureTab` header (fee-structure config is a gap) + the payroll run section in `PayrollBody`.
- `src/screens/school/exams.tsx` — the **Marks entry**, **Exam attendance**, and **Datesheet** sub-view headers (their per-student grades are synthetic; the exam LIST is live — do NOT badge the exams list).
- `src/screens/school/attendance.tsx` — the bulk-roster / status section header (status is hash-derived; the class list + submit are live — badge only the synthetic status/geo-fence area).
- Docs: `docs/superpowers/specs/2026-06-20-school-admin-api-binding-design.md` — append a "Live vs Demo — final binding status" section.

- [ ] **Step 1: Add the badge to each synthetic remainder**

For each screen file: import `DemoBadge` (if not already), add `<DemoBadge />` to the relevant sub-view/section header (the synthetic part only — leave the live-bound parts unbadged). Read each file to place it correctly. Keep all existing content.

- [ ] **Step 2: Append the docs section**

In `docs/superpowers/specs/2026-06-20-school-admin-api-binding-design.md`, append a section summarizing the final state:
```markdown
## Live vs Demo — final binding status (Phases 0–6)

**Live-bound (real API):**
- Auth: OTP + password login, /auth/me, refresh, logout (Phase 0)
- Reads: students + Student 360, teachers, staff, approvals, notifications, complaints, threads, announcements, fee payments, classes, subjects, exams (Phases 1, 3, 4, 5)
- Mutations: add student/teacher/staff (POST), approvals act-on (PATCH), user invite (POST), create class/subject (POST), submit attendance (POST), create/update exam (POST/PUT), create announcement (POST), pay invoice (POST) (Phases 2–5)

**Demo data (no live endpoint — flagged with DemoBadge):**
- Dashboard synthetic KPI counts; timetable builder, bell-schedule periods, homework, class tests, class-teacher assign; exam marks-entry grid, per-student grades, exam-papers, exam attendance, datesheet, report cards/ranks; attendance status pre-fill / bulk roster / geo-fence; messenger send + new-thread + unread badge; complaint resolve; fee waiver; fee-structure config; payroll run/approve; payslips + leave (no UI); bus fleet + live GPS; calendar; owner console.

**Deferred for a dedicated effort (needs real backend contract + sanctioned UI changes):** the exam-papers + grades model pivot (marks grid → paper-picker), and AppProvider seed-state removal (still consumed by the demo surfaces above).
```

- [ ] **Step 3: Typecheck + full suite + build**

Run: `npm run typecheck` (PASS), then `npm test` (full suite green), then `npm run build` (succeeds).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/finance.tsx src/screens/school/exams.tsx src/screens/school/attendance.tsx docs/superpowers/specs/2026-06-20-school-admin-api-binding-design.md
git commit -m "feat(ui): flag synthetic remainders with DemoBadge + document live-vs-demo status"
```

---

## Phase 6 done — binding effort complete

The "Demo data" badge marks every mock-only / synthetic surface; the design spec documents the final live-vs-demo status. The School Admin API binding effort (Phases 0–6) is complete: auth + all cleanly-bindable reads and mutations are live, and everything without a real endpoint is clearly flagged.

## Self-Review notes

- **Spec coverage (design §8.6):** "Demo data" badges on the named mock-only screens (buses/GPS, timetable, homework, fee-structure, calendar, owner console) + the synthetic remainders surfaced during Phases 3–5; docs updated.
- **Additive-only:** every change is a `DemoBadge` slotted into an existing header; no data-source or layout changes; live-bound sections are deliberately left unbadged.
- **AppProvider seed removal** is explicitly deferred (documented) — the seed is still consumed by the flagged demo surfaces, so removing it now would break them.
