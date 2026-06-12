# Students Toppers View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Toppers" view to the Students (SIS) screen that ranks top performers school-wide (Top 10) and class-wise (Top 3 per class), across two categories — exam performance and attendance.

**Architecture:** Three new pure ranking helpers in `src/lib/format.ts` derive scored, sorted lists from any `Student[]`. New presentational components inside `src/screens/school/sis.tsx` render a leaderboard table and a per-class card grid. A top-level `Tabs` toggle on the Students screen switches between the existing list and the new Toppers view; a sub-toggle switches metric.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library. Existing UI primitives (`Card`, `CardHead`, `Avatar`, `Badge`, `Tabs`, `Empty`) and mock data (`@/data/mockDb`).

---

## File Structure

- **Modify** `src/lib/format.ts` — add `TopperMetric` type, `ScoredStudent` / `ClassTopperGroup` interfaces, and `overallToppers` + `classToppers` (plus small private helpers). Pure functions, take an explicit `Student[]`.
- **Modify** `src/lib/format.test.ts` — unit tests for the new helpers.
- **Modify** `src/screens/school/sis.tsx` — new `RankMedal`, `Leaderboard`, `ClassToppersGrid`, `ToppersView` components; wire a `view` tab toggle into `StudentsScreen`.
- **Create** `src/screens/school/toppers.test.tsx` — render test for view/category switching.

---

### Task 1: Ranking helpers in `format.ts`

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these imports/tests to `src/lib/format.test.ts`. Update the existing import line on line 2 to include the new symbols, and append the new `describe` block at the end of the file (before the final newline).

Change line 2 from:

```ts
import { fmtMoney, fmtNum, gradeFor, gpaFor, reportFor, classRank } from './format'
```

to:

```ts
import { fmtMoney, fmtNum, gradeFor, gpaFor, reportFor, classRank, overallToppers, classToppers } from './format'
import type { Student } from '@/types'
```

Append this block after the existing `describe('format', ...)` block:

```ts
/* Minimal student factory — only the fields the topper helpers read. */
function mk(id: string, cls: string, attendance: number): Student {
  return {
    id, adm: 'ADM' + id, name: 'S' + id, gender: 'M', grade: cls, section: 'A',
    cls, roll: 1, guardian: 'G', phone: '0', attendance, feeStatus: 'paid',
    feeDue: 0, status: 'active', house: 'Red', avatarHue: 0,
  }
}

describe('topper ranking', () => {
  it('overallToppers sorts by attendance desc and respects the limit', () => {
    const list = [mk('a', 'X', 70), mk('b', 'X', 95), mk('c', 'X', 80)]
    const top = overallToppers(list, 'attendance', 2)
    expect(top.map((t) => t.student.id)).toEqual(['b', 'c'])
    expect(top[0].score).toBe(95)
  })

  it('overallToppers breaks attendance ties by id for determinism', () => {
    const list = [mk('b', 'X', 88), mk('a', 'X', 88)]
    const top = overallToppers(list, 'attendance', 2)
    expect(top.map((t) => t.student.id)).toEqual(['a', 'b'])
  })

  it('overallToppers ranks exam metric deterministically', () => {
    const top = overallToppers(students, 'exam', 5)
    expect(top).toHaveLength(5)
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].score).toBeGreaterThanOrEqual(top[i].score)
    }
    // secondary carries the attendance value for the exam metric
    expect(top[0].secondary).toBe(top[0].student.attendance)
  })

  it('classToppers groups by class and limits per class', () => {
    const list = [
      mk('a', 'X', 90), mk('b', 'X', 80), mk('c', 'X', 70), mk('d', 'X', 60),
      mk('e', 'Y', 95),
    ]
    const groups = classToppers(list, 'attendance', 3)
    const x = groups.find((g) => g.cls === 'X')!
    const y = groups.find((g) => g.cls === 'Y')!
    expect(x.toppers.map((t) => t.student.id)).toEqual(['a', 'b', 'c'])
    expect(y.toppers).toHaveLength(1)
  })

  it('classToppers orders classes naturally', () => {
    const list = [mk('a', 'X-2', 90), mk('b', 'X-10', 90), mk('c', 'X-1', 90)]
    const groups = classToppers(list, 'attendance', 1)
    expect(groups.map((g) => g.cls)).toEqual(['X-1', 'X-2', 'X-10'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- format`
Expected: FAIL — `overallToppers`/`classToppers` are not exported from `./format`.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/format.ts` (after `attendanceMonths`, at end of file):

```ts
/* ---- Toppers ranking (pure; pass an explicit student list) ---- */
export type TopperMetric = 'exam' | 'attendance'
export interface ScoredStudent { student: Student; score: number; secondary: number }
export interface ClassTopperGroup { cls: string; toppers: ScoredStudent[] }

export function examPct(stu: Student): number { return reportFor(stu).pct }

function primaryScore(stu: Student, metric: TopperMetric): number {
  return metric === 'exam' ? examPct(stu) : stu.attendance
}
function secondaryScore(stu: Student, metric: TopperMetric): number {
  return metric === 'exam' ? stu.attendance : examPct(stu)
}

function rankStudents(list: Student[], metric: TopperMetric): ScoredStudent[] {
  return list
    .map((s) => ({ student: s, score: primaryScore(s, metric), secondary: secondaryScore(s, metric) }))
    .sort((a, b) =>
      b.score - a.score ||
      b.secondary - a.secondary ||
      a.student.id.localeCompare(b.student.id),
    )
}

export function overallToppers(list: Student[], metric: TopperMetric, limit: number): ScoredStudent[] {
  return rankStudents(list, metric).slice(0, limit)
}

export function classToppers(list: Student[], metric: TopperMetric, perClass: number): ClassTopperGroup[] {
  const byCls = new Map<string, Student[]>()
  for (const s of list) {
    const arr = byCls.get(s.cls)
    if (arr) arr.push(s)
    else byCls.set(s.cls, [s])
  }
  return [...byCls.keys()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((cls) => ({ cls, toppers: overallToppers(byCls.get(cls)!, metric, perClass) }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- format`
Expected: PASS (all `format` and `topper ranking` tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: add overallToppers + classToppers ranking helpers"
```

---

### Task 2: Toppers view components + tab wiring in `sis.tsx`

**Files:**
- Modify: `src/screens/school/sis.tsx`

- [ ] **Step 1: Extend the format import**

In `src/screens/school/sis.tsx`, change the format import (line 13) from:

```ts
import { reportFor, classRank, attendanceMonths, fmtMoney } from '@/lib/format'
```

to:

```ts
import {
  reportFor, classRank, attendanceMonths, fmtMoney,
  overallToppers, classToppers,
  type TopperMetric, type ScoredStudent, type ClassTopperGroup,
} from '@/lib/format'
```

- [ ] **Step 2: Add the Toppers components**

Insert this block immediately above the `/* ===== StudentsScreen — SIS list ===== */` banner comment (just before `function StudentsScreen()`):

```tsx
/* ============================================================
   Toppers — overall leaderboard + class-wise cards
   ============================================================ */
const metricLabel: Record<TopperMetric, string> = { exam: 'Exam %', attendance: 'Attendance %' }
const secondaryHdr: Record<TopperMetric, string> = { exam: 'Attendance', attendance: 'Exam %' }

function RankMedal({ rank }: { rank: number }) {
  const tone = rank === 1 ? '#d4af37' : rank === 2 ? '#9ca3af' : rank === 3 ? '#cd7f32' : null
  if (!tone) return <span className="muted fw6" style={{ width: 26, display: 'inline-block', textAlign: 'center' }}>{rank}</span>
  return (
    <span className="row ai-center jc-center fw7 t-sm" style={{ width: 26, height: 26, borderRadius: 99, flex: '0 0 auto', background: tone, color: '#fff' }}>{rank}</span>
  )
}

function Leaderboard({ rows, metric, onPick }: { rows: ScoredStudent[]; metric: TopperMetric; onPick: (id: string) => void }) {
  return (
    <Card pad={false}>
      <div style={{ padding: 16 }}>
        <CardHead title="Overall toppers" sub={`Top ${rows.length} · school-wide`} icon="cap" />
      </div>
      <table className="sm-table">
        <thead>
          <tr>
            <th style={{ width: 60 }}>Rank</th>
            <th>Student</th>
            <th>Class</th>
            <th className="ta-right">{metricLabel[metric]}</th>
            <th className="ta-right">{secondaryHdr[metric]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.student.id} style={{ cursor: 'pointer' }} onClick={() => onPick(r.student.id)}>
              <td><RankMedal rank={i + 1} /></td>
              <td>
                <div className="row ai-center gap10">
                  <Avatar name={r.student.name} hue={r.student.avatarHue} size={30} />
                  <div>
                    <div className="fw6">{r.student.name}</div>
                    <div className="t-xs muted">{r.student.adm}</div>
                  </div>
                </div>
              </td>
              <td className="fw6">{r.student.cls}</td>
              <td className="ta-right fw7">{r.score}%</td>
              <td className="ta-right muted">{r.secondary}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function ClassToppersGrid({ groups, onPick }: { groups: ClassTopperGroup[]; onPick: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {groups.map((g) => (
        <Card key={g.cls}>
          <CardHead title={`Class ${g.cls}`} sub={`Top ${g.toppers.length}`} icon="users" />
          <div className="col gap10" style={{ marginTop: 8 }}>
            {g.toppers.map((r, i) => (
              <div key={r.student.id} className="row ai-center gap10" style={{ cursor: 'pointer' }} onClick={() => onPick(r.student.id)}>
                <RankMedal rank={i + 1} />
                <Avatar name={r.student.name} hue={r.student.avatarHue} size={28} />
                <div style={{ flex: 1 }}>
                  <div className="fw6">{r.student.name}</div>
                  <div className="t-xs muted">{r.student.adm}</div>
                </div>
                <span className="fw7 t-sm">{r.score}%</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

function ToppersView({ students, onPick }: { students: Student[]; onPick: (id: string) => void }) {
  const [cat, setCat] = useState<TopperMetric>('exam')
  const overall = useMemo(() => overallToppers(students, cat, 10), [students, cat])
  const byClass = useMemo(() => classToppers(students, cat, 3), [students, cat])
  const catTabs = [
    { value: 'exam', label: 'Exam toppers', icon: 'cap' },
    { value: 'attendance', label: 'Attendance toppers', icon: 'calendar' },
  ]
  return (
    <div className="col gap16">
      <Tabs value={cat} onChange={(v) => setCat(v as TopperMetric)} tabs={catTabs} />
      {students.length === 0
        ? <Empty icon="users" title="No students" body="Add students to see toppers." />
        : (
          <>
            <Leaderboard rows={overall} metric={cat} onPick={onPick} />
            <ClassToppersGrid groups={byClass} onPick={onPick} />
          </>
        )}
    </div>
  )
}
```

- [ ] **Step 3: Add `view` state to `StudentsScreen`**

In `StudentsScreen`, add a state line directly after the existing `const [importOpen, setImportOpen] = useState(false)` line:

```tsx
  const [view, setView] = useState<'list' | 'toppers'>('list')
```

- [ ] **Step 4: Render the view toggle and switch content**

In `StudentsScreen`'s returned JSX, insert the view-toggle tabs immediately after the closing `/>` of `<PageHead ... />` and before `<Card pad={false}>`:

```tsx
      <div style={{ margin: '0 0 16px' }}>
        <Tabs
          value={view}
          onChange={(v) => setView(v as 'list' | 'toppers')}
          tabs={[
            { value: 'list', label: 'All students', icon: 'users' },
            { value: 'toppers', label: 'Toppers', icon: 'cap' },
          ]}
        />
      </div>

      {view === 'toppers' ? (
        <ToppersView students={students} onPick={(id) => app.go('school.student', { focus: id })} />
      ) : (
      <>
```

Then, to close the new `list` branch, change the existing closing of the list section. The current code ends the list block with:

```tsx
      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
```

Replace that with:

```tsx
      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
      </>
      )}
    </div>
  )
}
```

(The `<>` opened in the insert above now wraps the filter `<Card>` + `<ImportDrawer>`; the `</>` and `)}` close the ternary's list branch.)

- [ ] **Step 5: Typecheck and run the full test suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (existing suites unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/sis.tsx
git commit -m "feat: Toppers view (exam + attendance, overall + class-wise) on Students screen"
```

---

### Task 3: Render test for view + category switching

**Files:**
- Create: `src/screens/school/toppers.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/screens/school/toppers.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { sisScreens } from './sis'

const StudentsScreen = sisScreens['school.sis']

function renderScreen() {
  return render(
    <AppProvider>
      <ToastProvider>
        <StudentsScreen />
      </ToastProvider>
    </AppProvider>,
  )
}

describe('Students Toppers view', () => {
  it('defaults to the All students list', () => {
    renderScreen()
    expect(screen.getByPlaceholderText(/Search name/i)).toBeInTheDocument()
  })

  it('switches to the Toppers leaderboard and class cards', () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    expect(screen.getByText('Overall toppers')).toBeInTheDocument()
    // at least one class card is rendered
    expect(screen.getAllByText(/^Class /).length).toBeGreaterThan(0)
  })

  it('switches the category to Attendance toppers', () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    fireEvent.click(screen.getByText('Attendance toppers'))
    // header column reflects the attendance metric
    expect(screen.getByText('Attendance %')).toBeInTheDocument()
  })

  it('returns to the list when All students is reselected', () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    fireEvent.click(screen.getByText('All students'))
    expect(screen.getByPlaceholderText(/Search name/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm run test -- toppers`
Expected: PASS — the component already exists from Task 2, so these tests pass on first run (they pin the wired behavior).

> Note: if any test fails, the bug is in Task 2's wiring — fix `sis.tsx`, not the test. The test encodes the intended behavior from the spec.

- [ ] **Step 3: Commit**

```bash
git add src/screens/school/toppers.test.tsx
git commit -m "test: cover Students Toppers view + category switching"
```

---

## Self-Review Notes

- **Spec coverage:** Placement tabs (Task 2 Step 4) ✓; exam + attendance categories (`ToppersView` sub-toggle) ✓; overall Top 10 (`overallToppers(...,10)`) ✓; class-wise Top 3 (`classToppers(...,3)`) ✓; click-through to Student 360 (`onPick` → `app.go('school.student', { focus })`) ✓; deterministic tiebreak (Task 1 sort) ✓; edge cases — fewer than 3 per class (`slice`), empty list (`Empty`) ✓; tests for helpers + render ✓.
- **Type consistency:** `TopperMetric`, `ScoredStudent`, `ClassTopperGroup` defined in Task 1 and consumed by the same names in Task 2. `overallToppers(list, metric, limit)` and `classToppers(list, metric, perClass)` signatures match between definition and call sites.
- **No new CSS:** medals and the class grid use inline styles; tables reuse the existing `sm-table` class already used in `sis.tsx`.
