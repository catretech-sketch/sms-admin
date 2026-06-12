# Students — Toppers view

**Date:** 2026-06-12
**Screen:** Students (SIS) — `src/screens/school/sis.tsx`
**Status:** Approved design

## Summary

Add a **Toppers** view to the Students (SIS) screen that surfaces top
performers both school-wide and class-wise, across two categories:
**exam performance** and **attendance**. Frontend-only, derived from
existing mock data — no backend, no new exam/date selectors, no export.

## Navigation & placement

The Students screen gains a top-level `Tabs` toggle:

- **All students** — the existing search / filter / `DataTable`. Unchanged.
- **Toppers** — the new view.

Inside Toppers, a sub-toggle selects the category:

- **Exam toppers** — ranked by overall exam percentage.
- **Attendance toppers** — ranked by attendance percentage.

New state in `StudentsScreen`:

- `view: 'list' | 'toppers'` (default `'list'`)
- `cat: 'exam' | 'attendance'` (default `'exam'`)

## Toppers view layout (per category)

1. **Overall Top 10** — a leaderboard card.
   - Rank column: gold / silver / bronze medal styling for ranks 1–3,
     plain rank number otherwise.
   - Student: avatar + name + admission no.
   - Class.
   - Primary score (exam % or attendance %), with the *other* metric
     shown muted as a secondary value.
   - Rows clickable → existing Student 360
     (`app.go('school.student', { focus: id })`).

2. **Class-wise Top 3** — a responsive grid of cards, one per class.
   - Each card lists its top 3 students with rank badge + score.
   - Same click-through to Student 360.

## Ranking logic (new pure helpers in `src/lib/format.ts`)

All helpers take an explicit `students` array (do not read mock data
directly) so the screen can pass `app.students`.

- `examPct(stu)` → `reportFor(stu).pct`.
- Attendance metric → `stu.attendance` directly.
- `overallToppers(students, metric, limit)` → sorted descending by the
  selected metric, tie-broken by the *other* metric, then by `id` for
  full determinism; sliced to `limit` (10).
- `classToppers(students, metric, perClass)` → groups by `cls`, returns
  each class with its top `perClass` (3); classes ordered naturally by
  class label.

Metric type: `type TopperMetric = 'exam' | 'attendance'`.
A scored row shape: `{ student, score, secondary }`.

Computation cost is trivial for the ~36 mock students; wrap in
`useMemo` keyed on `students` + `cat`.

## Components (added inside `sis.tsx`, matching existing style)

- `ToppersView` — owns the category sub-toggle and composes the two
  sections.
- `Leaderboard` — the overall Top 10 table.
- `ClassToppers` — the per-class card grid.
- `RankMedal` — small helper rendering the 1/2/3 medal or plain rank.

Reuses existing UI primitives: `Card`, `CardHead`, `Avatar`, `Badge`,
`Progress`, `Tabs`, `Icon`.

## Edge cases

- Class with fewer than 3 students → show however many exist.
- Ties → resolved deterministically (other metric, then `id`).
- Empty students array → render existing `Empty` state.

## Testing

- `src/lib/format.test.ts` — unit-test the three helpers:
  descending order, tiebreak behavior, class grouping, and
  limit / `perClass` slicing. All deterministic.
- A light render test: switching to the Toppers tab shows the
  leaderboard and lists students; switching category updates ordering.

## Out of scope (YAGNI)

- Exam selector / term picker.
- Date ranges.
- CSV / PDF export.
- Any backend or persistence.
