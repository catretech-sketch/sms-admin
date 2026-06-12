# Academics Teacher-Created Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show teacher-app-created homework and class tests in the Academics hub — enhance the Homework tab with a teacher/source column and add a new Tests tab — with admin still able to add items.

**Architecture:** Both lists are local component state (like the other Academics tabs). A `source: 'teacher_app' | 'admin'` field + a teacher name distinguish origins, shown via a small badge. The new `TestsTab` mirrors `HomeworkTab`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library. Existing UI primitives + `teachers`/`subjects`/`classList` from `academics.tsx`.

---

## File Structure

- **Modify** `src/screens/school/academics.tsx` — enhance `HomeworkTab`, add `TestsTab`, register the Tests tab.
- **Create** `src/screens/school/academicsTests.test.tsx` — render tests for the Tests tab + Homework source badge.

---

### Task 1: Homework tab — teacher + source

**Files:**
- Modify: `src/screens/school/academics.tsx`

- [ ] **Step 1: Extend the `Hw` interface and re-seed rows**

Replace the `Hw` interface + `hwTone` (currently above `HomeworkTab`) and the seed rows. Change:

```tsx
interface Hw { id: number; cls: string; subject: string; title: string; due: string; status: string }
const hwTone: Record<string, BadgeTone> = { Assigned: 'brand', Submitted: 'info', Graded: 'success', Overdue: 'danger' }
```

to:

```tsx
interface Hw { id: number; cls: string; subject: string; title: string; due: string; status: string; teacher: string; source: 'teacher_app' | 'admin' }
const hwTone: Record<string, BadgeTone> = { Assigned: 'brand', Submitted: 'info', Graded: 'success', Overdue: 'danger' }
const sourceBadge = (s: 'teacher_app' | 'admin') =>
  s === 'teacher_app' ? <Badge tone="info">Teacher app</Badge> : <Badge tone="neutral">Admin</Badge>
const tName = (i: number): string => teachers[i % teachers.length].name
```

- [ ] **Step 2: Add `useApp`, re-seed rows with teacher + source**

In `HomeworkTab`, change the opening + seed:

```tsx
function HomeworkTab({ editable }: { editable: boolean }) {
  const toast = useToast()
  const [rows, setRows] = useState<Hw[]>([
    { id: 1, cls: 'IX-A', subject: 'Mathematics', title: 'Quadratic equations — Ex 4.3', due: '2026-06-12', status: 'Assigned' },
    { id: 2, cls: 'X-B', subject: 'Science', title: 'Chemical reactions worksheet', due: '2026-06-10', status: 'Submitted' },
    { id: 3, cls: 'IX-C', subject: 'English', title: 'Essay: My favourite book', due: '2026-06-05', status: 'Graded' },
    { id: 4, cls: 'XI-A', subject: 'Computer', title: 'Python loops assignment', due: '2026-06-04', status: 'Overdue' },
    { id: 5, cls: 'X-A', subject: 'Social Studies', title: 'Map work — rivers of India', due: '2026-06-14', status: 'Assigned' },
  ])
```

to:

```tsx
function HomeworkTab({ editable }: { editable: boolean }) {
  const toast = useToast()
  const app = useApp()
  const [rows, setRows] = useState<Hw[]>([
    { id: 1, cls: 'IX-A', subject: 'Mathematics', title: 'Quadratic equations — Ex 4.3', due: '2026-06-12', status: 'Assigned', teacher: tName(0), source: 'teacher_app' },
    { id: 2, cls: 'X-B', subject: 'Science', title: 'Chemical reactions worksheet', due: '2026-06-10', status: 'Submitted', teacher: tName(1), source: 'teacher_app' },
    { id: 3, cls: 'IX-C', subject: 'English', title: 'Essay: My favourite book', due: '2026-06-05', status: 'Graded', teacher: tName(2), source: 'teacher_app' },
    { id: 4, cls: 'XI-A', subject: 'Computer', title: 'Python loops assignment', due: '2026-06-04', status: 'Overdue', teacher: tName(3), source: 'teacher_app' },
    { id: 5, cls: 'X-A', subject: 'Social Studies', title: 'Map work — rivers of India', due: '2026-06-14', status: 'Assigned', teacher: tName(4), source: 'teacher_app' },
  ])
```

- [ ] **Step 3: Admin-added homework carries `source: 'admin'`**

Change the `add` handler's `setRows`:

```tsx
    setRows((r) => [{ id: Date.now(), cls, subject, title: title.trim(), due, status: 'Assigned' }, ...r])
```

to:

```tsx
    setRows((r) => [{ id: Date.now(), cls, subject, title: title.trim(), due, status: 'Assigned', teacher: app.user?.name ?? 'Admin', source: 'admin' }, ...r])
```

- [ ] **Step 4: Add the Teacher column**

In `HomeworkTab`'s `cols`, insert a Teacher column between `subject` and `title`:

```tsx
    { key: 'subject', label: 'Subject', sortValue: (r) => r.subject, render: (r) => <span className="fw6">{r.subject}</span> },
    { key: 'teacher', label: 'Teacher', sortValue: (r) => r.teacher, render: (r) => (
      <div className="row ai-center gap8"><span className="t-sm">{r.teacher}</span>{sourceBadge(r.source)}</div>
    ) },
    { key: 'title', label: 'Title', sortValue: (r) => r.title },
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. (`useApp` already imported; `teachers` already imported; `Badge`/`BadgeTone` already imported.)

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "feat: Homework tab shows teacher + source (teacher app / admin)"
```

---

### Task 2: New Tests tab + register

**Files:**
- Modify: `src/screens/school/academics.tsx`

- [ ] **Step 1: Add the `TestsTab` component**

Insert this block immediately before the `/* ===== Academics hub — tab shell ===== */` banner:

```tsx
/* ============================================================
   6 · Class tests (created in the teacher app; admin can add)
   ============================================================ */
interface Test {
  id: number
  cls: string
  subject: string
  title: string
  date: string
  maxMarks: number
  teacher: string
  source: 'teacher_app' | 'admin'
  status: 'Scheduled' | 'Completed' | 'Graded'
}
const testTone: Record<Test['status'], BadgeTone> = { Scheduled: 'brand', Completed: 'info', Graded: 'success' }

function TestsTab({ editable }: { editable: boolean }) {
  const toast = useToast()
  const app = useApp()
  const [rows, setRows] = useState<Test[]>([
    { id: 1, cls: 'IX-A', subject: 'Mathematics', title: 'Unit Test — Quadratics', date: '2026-06-16', maxMarks: 25, teacher: tName(0), source: 'teacher_app', status: 'Scheduled' },
    { id: 2, cls: 'X-B', subject: 'Science', title: 'Ch 3 — Chemical reactions quiz', date: '2026-06-11', maxMarks: 20, teacher: tName(1), source: 'teacher_app', status: 'Completed' },
    { id: 3, cls: 'IX-C', subject: 'English', title: 'Grammar class test', date: '2026-06-06', maxMarks: 15, teacher: tName(2), source: 'teacher_app', status: 'Graded' },
    { id: 4, cls: 'XI-A', subject: 'Computer', title: 'Loops & arrays test', date: '2026-06-18', maxMarks: 30, teacher: tName(3), source: 'teacher_app', status: 'Scheduled' },
    { id: 5, cls: 'X-A', subject: 'Social Studies', title: 'Map & rivers test', date: '2026-06-09', maxMarks: 20, teacher: tName(4), source: 'teacher_app', status: 'Completed' },
  ])
  const [open, setOpen] = useState(false)
  const [cls, setCls] = useState(classList[0])
  const [subject, setSubject] = useState(subjects[0])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('2026-06-20')
  const [maxMarks, setMaxMarks] = useState('20')

  const add = () => {
    if (!title.trim()) { toast.danger('Title required', 'Enter a test title.'); return }
    setRows((r) => [{ id: Date.now(), cls, subject, title: title.trim(), date, maxMarks: Math.max(0, Number(maxMarks) || 0), teacher: app.user?.name ?? 'Admin', source: 'admin', status: 'Scheduled' }, ...r])
    toast.success('Test added', `${subject} → ${cls}.`); setTitle(''); setOpen(false)
  }

  const cols: Column<Test>[] = [
    { key: 'cls', label: 'Class', sortValue: (r) => r.cls, render: (r) => <Badge tone="neutral">{r.cls}</Badge> },
    { key: 'subject', label: 'Subject', sortValue: (r) => r.subject, render: (r) => <span className="fw6">{r.subject}</span> },
    { key: 'teacher', label: 'Teacher', sortValue: (r) => r.teacher, render: (r) => (
      <div className="row ai-center gap8"><span className="t-sm">{r.teacher}</span>{sourceBadge(r.source)}</div>
    ) },
    { key: 'title', label: 'Title', sortValue: (r) => r.title },
    { key: 'date', label: 'Date', sortValue: (r) => r.date, render: (r) => <span className="muted">{r.date}</span> },
    { key: 'maxMarks', label: 'Max', align: 'center', sortValue: (r) => r.maxMarks, render: (r) => <span className="fw6">{r.maxMarks}</span> },
    { key: 'status', label: 'Status', align: 'center', sortValue: (r) => r.status, render: (r) => <Badge tone={testTone[r.status]} dot>{r.status}</Badge> },
  ]

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div><div className="fw6">Class tests</div><div className="t-sm muted">{rows.length} tests · created in the teacher app</div></div>
        {editable && <Btn variant="primary" icon="plus" onClick={() => setOpen(true)}>Add test</Btn>}
      </div>
      <DataTable<Test> columns={cols} rows={rows} rowKey={(r) => r.id} pageSize={10} initialSort={{ key: 'date', dir: 'asc' }}
        empty={<Empty icon="clipboard" title="No tests yet" body="Class tests created by teachers will show here." />} />
      <Modal open={open} onClose={() => setOpen(false)} icon="clipboard" title="Add class test"
        footer={<div className="row gap8 jc-end"><Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn variant="primary" icon="check" onClick={add}>Add</Btn></div>}>
        <div className="sm-grid-2 gap12">
          <Field label="Class"><Select options={classList} value={cls} onChange={(e) => setCls(e.target.value)} /></Field>
          <Field label="Subject"><Select options={subjects} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        </div>
        <Field label="Title" required><Input icon="clipboard" value={title} placeholder="e.g. Unit Test 2" onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="sm-grid-2 gap12">
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Max marks"><Input type="number" min={0} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} /></Field>
        </div>
      </Modal>
    </Card>
  )
}
```

- [ ] **Step 2: Register the Tests tab in `AcademicsScreen`**

Change the `tabs` array:

```tsx
  const tabs = [
    { value: 'classes', label: 'Classes', icon: 'grid' },
    { value: 'timetable', label: 'Timetable', icon: 'calendar' },
    { value: 'periods', label: 'Periods', icon: 'clock' },
    { value: 'subjects', label: 'Subjects', icon: 'book' },
    { value: 'tests', label: 'Tests', icon: 'cap' },
    { value: 'homework', label: 'Homework', icon: 'clipboard' },
  ]
```

and add the panel after the subjects panel:

```tsx
      <div style={{ display: tab === 'subjects' ? 'block' : 'none' }}><SubjectsTab editable={editable} /></div>
      <div style={{ display: tab === 'tests' ? 'block' : 'none' }}><TestsTab editable={editable} /></div>
      <div style={{ display: tab === 'homework' ? 'block' : 'none' }}><HomeworkTab editable={editable} /></div>
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "feat: Academics Tests tab — teacher-created class tests + admin add"
```

---

### Task 3: Render tests

**Files:**
- Create: `src/screens/school/academicsTests.test.tsx`

- [ ] **Step 1: Write the tests**

Create `src/screens/school/academicsTests.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { academicsScreens } from './academics'

const AcademicsScreen = academicsScreens['school.academics']

afterEach(cleanup)

function renderScreen() {
  const u = render(
    <AppProvider>
      <ToastProvider>
        <AcademicsScreen />
      </ToastProvider>
    </AppProvider>,
  )
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  return { ...u, clickTab }
}

describe('Academics — teacher-created items', () => {
  it('Tests tab shows seeded teacher-created class tests with the Teacher app badge', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    expect(within(container).getByText('Unit Test — Quadratics')).toBeInTheDocument()
    expect(within(container).getAllByText('Teacher app').length).toBeGreaterThan(0)
  })

  it('admin can add a class test', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Tests')
    fireEvent.click(within(container).getByText('Add test'))
    const dialog = within(container).getByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText(/Unit Test 2/i), { target: { value: 'Algebra Pop Quiz' } })
    fireEvent.click(within(dialog).getByText('Add'))
    expect(within(container).getByText('Algebra Pop Quiz')).toBeInTheDocument()
  })

  it('Homework tab shows a teacher name + source badge', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Homework')
    expect(within(container).getByText('Quadratic equations — Ex 4.3')).toBeInTheDocument()
    expect(within(container).getAllByText('Teacher app').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npm run test -- academicsTests`
Expected: PASS (3 tests).

> All Academics panels stay mounted (`display:none`), so the seeded rows are queryable without the tab being visible; the tab click is for realism. If "Add test" / "Add" can't be found, confirm Task 2's button labels.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/academicsTests.test.tsx
git commit -m "test: Academics Tests tab + Homework source badge"
```

---

## Self-Review Notes

- **Spec coverage:** Homework `teacher`+`source` field, re-seed as teacher_app, Teacher column with source badge, admin-add sets source (Task 1) ✓; new `Test` type + `TestsTab` seeded teacher tests + Add test modal + source/teacher display (Task 2) ✓; Tests tab registered in the shell (Task 2 Step 2) ✓; render tests (Task 3) ✓.
- **Type consistency:** `source: 'teacher_app' | 'admin'` identical across `Hw`, `Test`, `sourceBadge`. `tName`/`sourceBadge` defined once (Task 1) and reused by `TestsTab` (Task 2). `Test['status']` union matches `testTone` keys. `app.user?.name` guarded with `'Admin'` fallback (user may be null when unauthenticated, e.g. in tests).
- **Placeholder scan:** none.
- **Helper ordering:** `tName`/`sourceBadge` are declared at module scope above `HomeworkTab` (Task 1 Step 1), so `TestsTab` (inserted later in the file) can reference them.
