# Teacher-created Homework & Tests in Academics

**Date:** 2026-06-12
**Screen:** Academics hub — `src/screens/school/academics.tsx`
**Status:** Approved design

## Summary

Surface academic items teachers create in the teacher app inside the
admin Academics hub: enhance the **Homework** tab and add a new **Tests**
tab. Each shows teacher-created items (with a "Teacher app" origin badge
+ teacher name) and lets admin also add their own. Frontend-only, local
component state, mock data — the teacher app is a separate repo, so
"from teacher app" is modeled via a `source` field on seeded rows.

## 1. Homework tab (`HomeworkTab`, enhance)

- Extend the `Hw` interface with `teacher: string` and
  `source: 'teacher_app' | 'admin'`.
- Re-seed the existing 5 rows as teacher-created — give each a `teacher`
  name (from `teachers` mock) and `source: 'teacher_app'`.
- Add a **Teacher** column: the teacher name plus a small badge —
  `Teacher app` (tone `info`) when `source === 'teacher_app'`, else
  `Admin` (tone `neutral`).
- Keep the **Assign homework** action (gated by `editable`). Admin-added
  rows set `source: 'admin'` and `teacher: app.user?.name ?? 'Admin'`
  (read `useApp().user`).

## 2. Tests tab (`TestsTab`, new)

```ts
interface Test {
  id: number
  cls: string
  subject: string
  title: string
  date: string        // yyyy-mm-dd
  maxMarks: number
  teacher: string
  source: 'teacher_app' | 'admin'
  status: 'Scheduled' | 'Completed' | 'Graded'
}
```

- Seed ~5 teacher-created class tests (`source: 'teacher_app'`, varied
  classes/subjects/status), e.g. "Unit Test — Quadratics", "Ch 3 quiz".
- A `DataTable<Test>` with columns: Class (badge) · Subject · Title ·
  Date · Max (marks) · Teacher (name + source badge) · Status (badge,
  tone: Scheduled `brand`, Completed `info`, Graded `success`).
- **Add test** action (gated by `editable`) opens a `Modal` with Class
  (`Select` over `classList`), Subject (`Select` over `subjects`), Title
  (`Input`, required), Date (`Input type=date`), Max marks
  (`Input type=number`). On submit: prepend a row with `source: 'admin'`,
  `teacher: app.user?.name ?? 'Admin'`, `status: 'Scheduled'`; toast;
  validate title non-empty (toast danger if empty, mirroring homework).
- Empty state mirrors `HomeworkTab` (`Empty` with `clipboard` icon).

## 3. Academics shell (`AcademicsScreen`)

- Add a **Tests** tab to the `tabs` array (value `tests`, label `Tests`,
  icon `cap`) — placed between `subjects` and `homework`.
- Mount its panel like the others:
  `<div style={{ display: tab === 'tests' ? 'block' : 'none' }}><TestsTab editable={editable} /></div>`.

## 4. Testing (`src/screens/school/academicsTests.test.tsx`, new)

Render `AcademicsScreen` inside `AppProvider` + `ToastProvider`:

- Click the **Tests** tab; assert a seeded teacher-created test title and
  its teacher name render, and at least one **Teacher app** badge shows.
- Click **Add test**, fill Title (+ defaults), submit; assert the new
  title appears in the table.
- One Homework assertion: switching to **Homework**, a **Teacher app**
  badge / teacher name is present.

> Note: `AcademicsScreen` keeps all panels mounted (`display:none`), so
> scope queries to visible content or to unique strings to avoid
> cross-tab text collisions (use `within` on the table or unique titles).

## Out of scope (YAGNI)

- Real cross-repo data from the teacher app (no shared backend).
- Grading, submissions, file attachments, per-student marks.
- Cross-screen persistence (state is local to the Academics tabs, like
  the existing Classes/Subjects/Homework tabs).
