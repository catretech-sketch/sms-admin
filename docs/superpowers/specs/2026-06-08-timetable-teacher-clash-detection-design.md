# Timetable — Teacher Clash Detection

**Date:** 2026-06-08
**Area:** School console → Academics → Timetable tab
**File:** `src/screens/school/academics.tsx` (`TimetableTab`)
**Scope:** Frontend-only (in-memory, mock data). A backend API may wire in later; this spec does not define it.

## Problem

The Timetable builder already exists: a per-class 5-day × 8-period grid with manual
click-to-place and auto-generate, plus per-subject teacher rosters. It stores each
class's grid **independently** (`grids: Record<className, Grid>`), so it never checks
whether a teacher is already teaching **another** class in the same day+period. A
teacher can therefore be double-booked.

**Goal:** a teacher is never in two classes at the same time. A teacher may teach many
classes, just not two simultaneously.

## Definition of a clash

A teacher clashes when assigned to **two different classes at the same `day-period`
slot**. Teaching multiple classes in *different* slots is normal and is not a clash.
Room double-booking is **out of scope** — teacher clash only.

## Approach (chosen: "C")

- **Auto-generate → auto-avoid (clash-free).**
- **Manual click-to-place → warn + highlight (no silent blocking).**

## Components

### 1. Core logic (new pure helpers)

- `teacherBusyElsewhere(grids, teacherId, day, period, exceptClass): boolean`
  Returns true if any class other than `exceptClass` has a cell at `day-period`
  taught by `teacherId`. Empty `teacherId` is never busy.
- `conflictsFor(grids, cls): Set<cellKey>`
  The set of cells in `cls` whose teacher is double-booked at that slot in another
  class. Memoized on `grids` + `cls`.

Both derive purely from the existing `grids` state — no new state shape.

### 2. Auto-generate (clash-free)

When the generator assigns a teacher for a subject's slot, it picks the first teacher
in that subject's roster (respecting the existing rotation order) for whom
`teacherBusyElsewhere(...)` is false. If every qualified teacher is busy that slot,
it still places the period, but that cell is a residual clash (flagged in red).

Toast reflects the outcome: `Timetable generated · 0 clashes` or `… · N clashes to review`.

### 3. Manual click-to-place (warn + highlight)

Placement keeps the current rotating-teacher behaviour. After placing, if the chosen
teacher clashes, the cell is flagged red and a toast shows
`⚠ {Teacher} is also teaching {OtherClass} on {Day} P{n}.` Placement is never blocked.

### 4. Visual treatment

- Conflicting cell: red border + a small ⚠ icon; teacher name rendered in the danger colour.
- Toolbar status badge: `⚠ N clashes` (danger) when the current class has any conflicts;
  `No clashes` (success) when the grid is non-empty and clean.
- Hover tooltip on a clashing cell: `Also in {class} · {Day} P{n}`.

### 5. Save

Save still works. If clashes exist, the toast warns:
`Saved with N clashes — resolve before publishing.`

## Out of scope (YAGNI)

- Room/resource double-booking.
- Cross-class "resolve all" automation beyond generate.
- Persistence beyond the existing in-memory component state.
- Backend API (future work).
- Changes to the Classes / Periods / Subjects / Homework tabs.

## Testing

- Unit-test the pure helpers (`teacherBusyElsewhere`, `conflictsFor`) with fixtures:
  same teacher same slot in two classes → clash; same teacher different slots → no clash;
  empty teacher → no clash; single class → no clash.
- Manual verification in-app: generate two classes that share a thin roster and confirm
  the generator avoids clashes; manually force a clash and confirm red highlight + counter
  + toast.
