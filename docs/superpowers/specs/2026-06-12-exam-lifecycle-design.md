# Exam lifecycle — create, marks, attendance, publish

**Date:** 2026-06-12
**Screen:** Exams & grading — `src/screens/school/exams.tsx`
**Status:** Approved design

## Summary

Turn the Exams & grading screen's existing non-persisting mock features
into a working in-session lifecycle, all inside the admin console
(frontend-only, no backend):

1. **Persist exam creation** — created exams appear in the list.
2. **Persist marks entry** — entered marks are saved and drive report cards.
3. **Exam attendance** — mark present/absent per exam paper/class.
4. **Publish + audience/preview** — release results with an audience
   indicator (Teachers · Parents · Students) and a preview of what they see.

"Visible to teacher/parent/student apps" is modeled as a publish state +
audience + preview. The sibling apps (`sms-student`, `sms-teacher-app`)
are separate repos with no shared backend and are out of scope.

## 1. Shared state (`AppProvider.tsx`)

Mirror the students/teachers/staff pattern. Import `exams as seedExams`
and the `Exam` type.

```ts
const [exams, setExams] = useState<Exam[]>(seedExams)
const addExam = (e: Exam) => setExams((list) => [e, ...list])
const updateExam = (id: string, patch: Partial<Exam>) =>
  setExams((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)))

const [examMarks, setExamMarks] = useState<Record<string, number>>({})
const saveExamMarks = (entries: Record<string, number>) =>
  setExamMarks((m) => ({ ...m, ...entries }))

const [examAttendance, setExamAttendance] = useState<Record<string, 'present' | 'absent'>>({})
const saveExamAttendance = (entries: Record<string, 'present' | 'absent'>) =>
  setExamAttendance((m) => ({ ...m, ...entries }))
```

Add all of these to the `AppState` interface and the provided `value`:
`exams, addExam, updateExam, examMarks, saveExamMarks, examAttendance,
saveExamAttendance`.

## 2. Pure logic (`src/lib/examData.ts`, new)

```ts
export const markKey = (examId: string, studentId: string, subject: string) =>
  `${examId}|${studentId}|${subject}`
export const attKey = (examId: string, studentId: string, subject: string) =>
  `${examId}|${studentId}|${subject}`
```

Extend report building so report cards reflect entered marks. In
`src/lib/format.ts`, add an optional third parameter to `reportFor`:

```ts
export function reportFor(
  stu: Student,
  examId?: string,
  getMark?: (subject: string) => number | undefined,
): Report
```

For each subject, use `getMark(subject)` when it returns a number,
otherwise the existing `studentSubjectMarks(stu, subject, examId)`. All
current callers pass no `getMark`, so behavior is unchanged.

`classRank(stu, examId?, getMark?)` gains the same optional param and
forwards it to `reportFor` so ranks reflect entered marks when supplied.

## 3. Persist exam creation (`CreateExamModal`)

On submit, build a real `Exam` and persist it instead of only toasting:

```ts
const exam: Exam = {
  id: 'EX-' + Date.now().toString(36).toUpperCase(),
  name: name.trim(), type, grades: gradeRange, from, to,
  subjects: subjects.length, status: 'scheduled', marksEntered: 0, published: false,
}
app.addExam(exam)
```

`subjects` count uses the global `subjects` array length (6).
`ExamsListTab` reads `app.exams` (not the mock `exams`) so the new row
appears immediately. The exams count in `CardHead` reads `app.exams.length`.

## 4. Persist marks entry (`MarksEntryTab`)

- Add an **Exam selector** (`Select` over `app.exams` by name) alongside
  the existing grade/section/subject selectors. Default to the first exam.
- Initial marks for a (exam, student, subject): saved value from
  `app.examMarks[markKey(...)]` if present, else `studentSubjectMarks(s,
  subject)` (current seed behavior).
- **Save marks** writes the class's current values into `examMarks` via
  `saveExamMarks`, then updates the exam via `updateExam`: set `status:
  'marks_entry'` and recompute `marksEntered` as the percentage of the
  exam's papers that have at least one saved cell —
  `round(100 * distinctSubjectsWithMarks / exam.subjects)`, capped at 100,
  where `distinctSubjectsWithMarks` counts distinct subjects appearing in
  `examMarks` keys prefixed `${examId}|`. (Entering one full subject moves
  the bar by ~1/subjects.) Show a success toast (existing copy, extended
  with the exam name).
- Gated by `can(app.role, 'exams', 'E')` (unchanged).

## 5. Exam attendance (new `ExamAttendanceTab`)

New tab "Exam attendance" in the Exams hub (between Marks entry and
Report cards). Controls: exam selector, grade, section, subject (the
"paper"). For the resulting class roster:

- A present/absent control per student (segmented `Btn` pair or a
  `Select` of Present/Absent). Default present unless a saved value
  exists in `app.examAttendance`.
- Summary row: present count / absent count / total.
- **Save attendance** writes to `examAttendance` via `saveExamAttendance`
  and toasts. Gated by `can(app.role, 'exams', 'E')`; otherwise a
  "View only" badge and read-only controls.

## 6. Publish + audience/preview (`PublishResultsModal`, new)

A **Publish results** button on each exam row (and/or a header action),
gated by `can(app.role, 'exams', 'A')` — matching the datesheet publish
gate. Opens a modal that shows:

- **Audience**: three badges — Teachers · Parents · Students — labeling
  who the release is visible to.
- **Preview**: a parent/student-facing sample report card (reuse the
  existing report-card layout for the first student of the exam's first
  class, using entered marks) and a teacher-facing one-line class
  summary (class average + pass count).

On confirm: `app.updateExam(exam.id, { published: true, status:
'completed' })`, toast "Results published", close. The list's Published
column then shows "Published". If already published, the button reads
"Published" and the modal is view-only.

## 7. Report cards tab (`ReportCardsTab`, `ReportCardModal`)

- Add the same **Exam selector** (default first exam).
- Build a per-exam `getMark = (subject) => app.examMarks[markKey(examId,
  student.id, subject)]` and pass it into `reportFor(student, examId,
  getMark)` and `classRank(student, examId, getMark)` so cards reflect
  entered marks (falling back to the seed where unentered).

## Testing

- **`src/lib/examData.test.ts`** — `markKey`/`attKey` formatting; and
  `reportFor` with a `getMark` override: returns entered marks where
  provided, falls back to the deterministic seed otherwise, and the
  resulting `pct`/`total` reflect the overrides.
- **`src/screens/school/examsFlow.test.tsx`** — render `ExamsScreen`
  inside `AppProvider` + `ToastProvider`:
  - Creating an exam adds a row to the list (count increases).
  - The Marks-entry and Report-cards tabs render the exam selector.
  - The Exam-attendance tab renders and toggling + saving shows a toast.
  - Publishing an exam shows the audience (Teachers · Parents · Students)
    and marks it Published.

## Out of scope (YAGNI)

- Any backend / cross-repo wiring into `sms-student` / `sms-teacher-app`.
- Per-paper exam timetable changes (the datesheet drawer stays as-is).
- Weighted/CBSE grading schemes beyond the existing `gradeFor` bands.
- Editing/deleting exams after creation (only create + publish + status).
