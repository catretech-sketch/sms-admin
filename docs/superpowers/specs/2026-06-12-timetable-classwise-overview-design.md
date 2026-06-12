# Timetable — Class-wise overview view

**Date:** 2026-06-12
**Screen:** Academics → Timetable — `src/screens/school/academics.tsx` (`TimetableTab`)
**Status:** Approved design

## Summary

Add a read-only **All classes** view to the Timetable's
Class/Teacher/Subject toggle. It shows, in one place, every class that
has a built/saved timetable, each as its own weekly grid. Frontend-only;
reads the existing in-session `grids` state; the builder and other views
are untouched.

## Component — `ClassOverview` (new, in `academics.tsx`)

Props: `{ grids: GridsState }` (the same type the pivot views use).

- **Built classes**: `classList.filter((c) => grids[c] && Object.values(grids[c]).some(Boolean))`.
- **Empty state**: if no class has a filled cell, render `Empty` —
  "Build class timetables in the Class view first."
- For each built class, render a `Card`:
  - Header: the class name + a clash badge when
    `conflictsFor(grids, cls).size > 0` (e.g. "N clashes"), else a
    "No clashes" success badge.
  - A read-only weekly grid via the existing `PivotGrid`: each cell reads
    `grids[cls][cellKey(d, p)]`; filled cells show the **subject**
    (coloured via `subjStyle`) + **teacher name** (`teacherName`), with a
    red border + alert icon when the slot is in `conflictsFor(grids, cls)`.
    Empty cells render a blank tile. Cells are non-interactive (read-only).

`PivotGrid`, `cellKey`, `conflictsFor`, `subjStyle`, `teacherName`,
`classList`, `Empty`, `Badge` are all already in scope in `academics.tsx`.

## Wiring — `TimetableTab`

- Add `{ value: 'overview', label: 'All classes' }` to the `Segmented`
  `options` (after Subject).
- Widen the `view` state union to include `'overview'`.
- Render: `{view === 'overview' && <ClassOverview grids={grids} />}`
  alongside the existing teacher/subject branches.

The `view === 'class'` builder branch and the Teacher/Subject views are
unchanged.

## Testing (`src/screens/school/timetableViews.test.tsx`, add one case)

- Switch the Timetable view to **All classes** with nothing built;
  assert the empty-state copy renders. (Grid rendering reuses
  `PivotGrid`, already exercised; per-class derivation is the existing
  `grids`/`conflictsFor`, already covered.)

## Out of scope (YAGNI)

- Editing cells from the overview (editing stays in Class / Teacher /
  Subject views).
- New persistence, print/export, or PDF.
- Any change to the class builder.
