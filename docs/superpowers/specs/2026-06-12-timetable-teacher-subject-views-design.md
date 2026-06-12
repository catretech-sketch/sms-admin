# Timetable — Teacher & Subject views

**Date:** 2026-06-12
**Screen:** Academics → Timetable — `src/screens/school/academics.tsx` (`TimetableTab`)
**Status:** Approved design

## Summary

Add **Teacher** and **Subject** views to the Timetable tab alongside the
existing class builder. A view toggle (Class · Teacher · Subject) sits
atop the tab. The existing class builder is left untouched and renders
under the Class branch. The two new views are editable pivot grids
derived from the same per-class `grids` state. Frontend-only.

## 1. Pure helpers (`src/lib/timetable.ts`)

```ts
export interface TeacherSlotEntry { cls: string; subject: string }
export interface SubjectSlotEntry { cls: string; teacherId: string }

export function teacherSchedule(grids: Grids, teacherId: string): Record<string, TeacherSlotEntry[]>
export function subjectSchedule(grids: Grids, subject: string): Record<string, SubjectSlotEntry[]>
```

- `teacherSchedule`: for every class grid, every non-null cell whose
  `teacherId === teacherId`, append `{ cls, subject }` under that cell's
  key. Empty `teacherId` argument returns `{}`.
- `subjectSchedule`: for every class grid, every non-null cell whose
  `subject === subject`, append `{ cls, teacherId }` under that cell's
  key.
- A key with two+ entries means a clash (teacher double-booked / subject
  in two classes at once).

## 2. View toggle (`TimetableTab`)

- New state `view: 'class' | 'teacher' | 'subject'` (default `'class'`),
  rendered as a `Segmented`/`Tabs` control at the top of the tab.
- `view === 'class'` → the **existing** builder JSX, wrapped unchanged.
- `view === 'teacher'` → `<TeacherView grids={grids} setGrids={setGrids} editable={editable} />`.
- `view === 'subject'` → `<SubjectView grids={grids} setGrids={setGrids} editable={editable} />`.

The builder's existing state (`grids`, modes, etc.) stays in
`TimetableTab` and is passed to the new views.

## 3. TeacherView / SubjectView (new components in `academics.tsx`)

Both render a read/edit weekly grid using the same `DAYS` × `PERIODS`
(+ lunch) layout as the builder:

- A teacher (or subject) `Select` at top.
- `teacherSchedule(grids, tid)` / `subjectSchedule(grids, subj)` drives
  the cells.
- Each slot:
  - 0 entries → blank, non-interactive.
  - 1 entry → show class + the other dimension (subject for teacher view;
    teacher name for subject view).
  - 2+ entries → red-bordered, all entries listed (clash).
- If `grids` has no built classes (every grid empty) → an `Empty` with
  "Build class timetables first."
- **Edit**: when `editable`, clicking a filled cell opens the
  **pivot-cell editor** modal (below). For a 2+ entry slot, clicking
  targets the first entry (deterministic).

## 4. Pivot-cell editor modal (new, self-contained)

State `pivotEdit: { cls: string; d: number; p: number; subject: string; current: string } | null`.

- Lists `qualified(subject)` teachers; each shows free/busy via
  `clashingClass(grids, t.id, d, p, cls)` (reuse existing helper).
- **Reassign**: selecting a teacher + Save writes
  `grids[cls][cellKey(d,p)] = { subject, teacherId }` via `setGrids`
  (keeps the subject). If the chosen teacher clashes elsewhere, still
  allowed (the cell will show as a clash) — matching the builder's
  "assign anyway" tolerance.
- **Clear slot** button: sets `grids[cls][cellKey(d,p)] = null`.
- Close without change leaves the grid as-is.

This modal is independent of the builder's `editCell`/`applyTeacher`
machinery (so the builder code is not modified), but reuses the pure
clash helpers.

## 5. Testing

- **`src/lib/timetable.test.ts`** (additions): `teacherSchedule` returns
  a teacher's placements keyed by slot, merges across classes, marks a
  two-class slot as a 2-entry list, and returns `{}` for an empty
  teacherId / empty grids. Same shape for `subjectSchedule`.
- **`src/screens/school/timetableViews.test.tsx`** (new): render
  `AcademicsScreen`, on the Timetable tab generate/seed a class grid
  (or inject via the Class builder's auto-generate), switch to **Teacher**
  view, pick a teacher, assert at least one of their slots renders; open
  a cell and click **Clear slot**, assert the slot empties.

> If driving the builder's auto-generate in a test is brittle, the
> render test may instead assert the empty-state copy ("Build class
> timetables first") on a fresh Teacher view, and the helper coverage in
> `timetable.test.ts` carries the derivation logic. Pick whichever is
> reliable at implementation time; do not delete coverage silently.

## Out of scope (YAGNI)

- Creating new placements from Teacher/Subject views (stays in Class
  view).
- Drag-and-drop between views, print/export, cross-class auto-balancing.
- Any change to the existing class builder's behavior.
