# Timetable Teacher & Subject Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable Teacher and Subject views to the Timetable tab (alongside the untouched class builder), pivoting the per-class grids by teacher and by subject.

**Architecture:** Two pure derive helpers in `timetable.ts`. New `PivotGrid`, `PivotCellEditor`, `TeacherView`, `SubjectView` components in `academics.tsx`, wired behind a `Segmented` Class/Teacher/Subject toggle. The existing builder JSX is wrapped (not modified) under the Class branch; the new views read/write the same `grids`/`setGrids`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library. Existing timetable helpers + UI primitives.

---

## File Structure

- **Modify** `src/lib/timetable.ts` — add `teacherSchedule`, `subjectSchedule` (+ entry types).
- **Modify** `src/lib/timetable.test.ts` — unit tests for both.
- **Modify** `src/screens/school/academics.tsx` — new view components + toggle wiring.
- **Create** `src/screens/school/timetableViews.test.tsx` — render test.

---

### Task 1: Derive helpers

**Files:**
- Modify: `src/lib/timetable.ts`
- Modify: `src/lib/timetable.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/timetable.test.ts` (add `teacherSchedule, subjectSchedule, cellKey` to the existing `./timetable` import if not present, or add this import line):

```ts
import { teacherSchedule, subjectSchedule, cellKey } from './timetable'

describe('teacher/subject schedule derivation', () => {
  const grids = {
    'X-A': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 'T1' }, [cellKey(0, 1)]: { subject: 'Sci', teacherId: 'T2' } },
    'X-B': { [cellKey(0, 0)]: { subject: 'Eng', teacherId: 'T1' }, [cellKey(1, 0)]: null },
  }

  it('teacherSchedule groups a teacher’s placements by slot across classes', () => {
    const s = teacherSchedule(grids, 'T1')
    expect(s[cellKey(0, 0)]).toEqual([
      { cls: 'X-A', subject: 'Math' },
      { cls: 'X-B', subject: 'Eng' },
    ])
    expect(s[cellKey(0, 1)]).toBeUndefined()
  })

  it('teacherSchedule returns {} for an empty teacherId', () => {
    expect(teacherSchedule(grids, '')).toEqual({})
  })

  it('subjectSchedule groups a subject’s placements by slot', () => {
    const s = subjectSchedule(grids, 'Math')
    expect(s[cellKey(0, 0)]).toEqual([{ cls: 'X-A', teacherId: 'T1' }])
    expect(Object.keys(s)).toHaveLength(1)
  })

  it('returns {} when nothing matches', () => {
    expect(teacherSchedule({}, 'T1')).toEqual({})
    expect(subjectSchedule(grids, 'Nonexistent')).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- timetable`
Expected: FAIL — `teacherSchedule`/`subjectSchedule` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/timetable.ts`:

```ts
export interface TeacherSlotEntry { cls: string; subject: string }
export interface SubjectSlotEntry { cls: string; teacherId: string }

/** All of a teacher's placements, keyed by slot (2+ entries = clash). */
export function teacherSchedule(grids: Grids, teacherId: string): Record<string, TeacherSlotEntry[]> {
  const out: Record<string, TeacherSlotEntry[]> = {}
  if (!teacherId) return out
  for (const [cls, grid] of Object.entries(grids)) {
    for (const [key, cell] of Object.entries(grid)) {
      if (cell && cell.teacherId === teacherId) (out[key] ??= []).push({ cls, subject: cell.subject })
    }
  }
  return out
}

/** All placements of a subject, keyed by slot (2+ entries = same-slot in two classes). */
export function subjectSchedule(grids: Grids, subject: string): Record<string, SubjectSlotEntry[]> {
  const out: Record<string, SubjectSlotEntry[]> = {}
  if (!subject) return out
  for (const [cls, grid] of Object.entries(grids)) {
    for (const [key, cell] of Object.entries(grid)) {
      if (cell && cell.subject === subject) (out[key] ??= []).push({ cls, teacherId: cell.teacherId })
    }
  }
  return out
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- timetable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timetable.ts src/lib/timetable.test.ts
git commit -m "feat: teacherSchedule + subjectSchedule timetable derive helpers"
```

---

### Task 2: Teacher/Subject views + toggle

**Files:**
- Modify: `src/screens/school/academics.tsx`

- [ ] **Step 1: Extend imports**

Change the React import (line 7):

```tsx
import { Fragment, useMemo, useState } from 'react'
```

to:

```tsx
import { Fragment, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
```

Change the UI import to include `Segmented` (add it to the existing `@/components/ui` import list):

```tsx
  PageHead, Tabs, Segmented, Card, CardHead, Btn, Badge, Select, Field, Input,
```

Change the timetable import (line 16) to add the two helpers:

```tsx
import { cellKey, clashingClass, clashingClasses, pickTeacher, conflictsFor, teacherLoads, clashingTeachers, teacherSchedule, subjectSchedule, type Cell, type Grid } from '@/lib/timetable'
```

- [ ] **Step 2: Add the pivot components**

Insert this block immediately before the `function TimetableTab(` definition:

```tsx
/* ---- Pivot views (teacher-wise / subject-wise) over the class grids ---- */
type GridsState = Record<string, Grid>
interface ViewProps { grids: GridsState; setGrids: Dispatch<SetStateAction<GridsState>>; editable: boolean }
interface PivotEdit { cls: string; d: number; p: number; subject: string; current: string }

function PivotGrid({ renderCell }: { renderCell: (d: number, p: number) => JSX.Element }) {
  const rowsDesc: ({ type: 'period'; p: number } | { type: 'lunch' })[] = []
  for (let p = 0; p < PERIODS; p++) { rowsDesc.push({ type: 'period', p }); if (p === LUNCH_AFTER - 1) rowsDesc.push({ type: 'lunch' }) }
  return (
    <Card style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `64px repeat(${DAYS.length}, minmax(110px, 1fr))`, gap: 6, minWidth: 640 }}>
        <div />
        {DAYS.map((d) => <div key={d} className="t-xs fw6 ta-center muted" style={{ padding: '4px 0' }}>{d}</div>)}
        {rowsDesc.map((rd, ri) => rd.type === 'lunch' ? (
          <Fragment key={`lunch-${ri}`}>
            <div className="t-xs muted" style={{ display: 'flex', justifyContent: 'center' }}><Icon name="clock" size={13} /></div>
            <div className="t-xs fw6 muted" style={{ gridColumn: `2 / span ${DAYS.length}`, textAlign: 'center', padding: '6px 0', background: 'var(--surface-2)', borderRadius: 8 }}>Lunch break</div>
          </Fragment>
        ) : (
          <Fragment key={`p-${rd.p}`}>
            <div className="t-xs fw6 muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P{rd.p + 1}</div>
            {DAYS.map((_d, di) => <Fragment key={di}>{renderCell(di, rd.p)}</Fragment>)}
          </Fragment>
        ))}
      </div>
    </Card>
  )
}

function PivotCellEditor({ edit, grids, setGrids, onClose }: { edit: PivotEdit | null; grids: GridsState; setGrids: Dispatch<SetStateAction<GridsState>>; onClose: () => void }) {
  const [tid, setTid] = useState('')
  useEffect(() => { setTid(edit?.current ?? '') }, [edit])
  if (!edit) return null
  const e = edit
  const save = () => {
    setGrids((prev) => ({ ...prev, [e.cls]: { ...(prev[e.cls] ?? {}), [cellKey(e.d, e.p)]: { subject: e.subject, teacherId: tid } } }))
    onClose()
  }
  const clear = () => {
    setGrids((prev) => ({ ...prev, [e.cls]: { ...(prev[e.cls] ?? {}), [cellKey(e.d, e.p)]: null } }))
    onClose()
  }
  return (
    <Modal open={!!edit} onClose={onClose} size="sm" icon="user"
      title="Edit slot" sub={`${e.subject} · ${e.cls} · ${DAYS[e.d]} P${e.p + 1}`}
      footer={
        <div className="row ai-center jc-between" style={{ width: '100%' }}>
          <Btn variant="danger" icon="trash" onClick={clear}>Clear slot</Btn>
          <div className="row gap8"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="check" onClick={save}>Save</Btn></div>
        </div>
      }>
      <div className="col gap8">
        {qualified(e.subject).map((t) => {
          const busy = clashingClass(grids, t.id, e.d, e.p, e.cls)
          const sel = tid === t.id
          return (
            <button key={t.id} onClick={() => setTid(t.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%',
                border: `1px solid ${sel ? (busy ? 'var(--danger)' : 'var(--brand-600)') : 'var(--border)'}`, borderRadius: 10, padding: '9px 11px',
                background: sel ? (busy ? 'var(--danger-bg)' : 'var(--brand-50)') : 'var(--surface)', textAlign: 'left', cursor: 'pointer' }}>
              <div className="row ai-center gap8" style={{ minWidth: 0 }}>
                <Icon name={sel ? 'checkCircle' : 'user'} size={15} />
                <div style={{ minWidth: 0 }}><div className="fw6 t-sm">{t.name}</div><div className="t-xs muted3">{t.dept}</div></div>
              </div>
              {busy ? <Badge tone="danger" icon="alert">busy in {busy}</Badge> : <Badge tone="success">free</Badge>}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

function hasAnyGrid(grids: GridsState): boolean {
  return Object.values(grids).some((g) => Object.values(g).some((c) => !!c))
}

function TeacherView({ grids, setGrids, editable }: ViewProps) {
  const [tid, setTid] = useState(teachers[0].id)
  const [edit, setEdit] = useState<PivotEdit | null>(null)
  const sched = useMemo(() => teacherSchedule(grids, tid), [grids, tid])

  if (!hasAnyGrid(grids)) return <Empty icon="calendar" title="No timetables yet" body="Build class timetables in the Class view first, then view them by teacher." />

  return (
    <div className="col gap12">
      <Card><div className="row ai-center gap12 wrap"><Field label="Teacher"><Select style={{ minWidth: 200 }} options={teacherOpts} value={tid} onChange={(e) => setTid(e.target.value)} /></Field></div></Card>
      <PivotGrid renderCell={(d, p) => {
        const entries = sched[cellKey(d, p)] ?? []
        if (!entries.length) return <div style={{ minHeight: 56, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
        const clash = entries.length > 1
        const st = subjStyle(entries[0].subject)
        const first = entries[0]
        return (
          <button onClick={() => { if (editable) setEdit({ cls: first.cls, d, p, subject: first.subject, current: tid }) }} disabled={!editable}
            style={{ minHeight: 56, borderRadius: 8, padding: 6, textAlign: 'left', cursor: editable ? 'pointer' : 'default',
              border: `${clash ? '2px' : '1px'} solid ${clash ? 'var(--danger)' : st.bd}`, background: st.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
            {entries.map((en, i) => (
              <span key={i} className="t-xs" style={{ color: clash ? 'var(--danger)' : st.fg, display: 'flex', alignItems: 'center', gap: 3 }}>
                {clash && i === 0 && <Icon name="alert" size={11} />}<span className="fw6">{en.cls}</span> · {en.subject}
              </span>
            ))}
          </button>
        )
      }} />
      <PivotCellEditor edit={edit} grids={grids} setGrids={setGrids} onClose={() => setEdit(null)} />
    </div>
  )
}

function SubjectView({ grids, setGrids, editable }: ViewProps) {
  const [subj, setSubj] = useState(subjects[0])
  const [edit, setEdit] = useState<PivotEdit | null>(null)
  const sched = useMemo(() => subjectSchedule(grids, subj), [grids, subj])

  if (!hasAnyGrid(grids)) return <Empty icon="calendar" title="No timetables yet" body="Build class timetables in the Class view first, then view them by subject." />

  const st = subjStyle(subj)
  return (
    <div className="col gap12">
      <Card><div className="row ai-center gap12 wrap"><Field label="Subject"><Select style={{ minWidth: 200 }} options={subjects} value={subj} onChange={(e) => setSubj(e.target.value)} /></Field></div></Card>
      <PivotGrid renderCell={(d, p) => {
        const entries = sched[cellKey(d, p)] ?? []
        if (!entries.length) return <div style={{ minHeight: 56, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
        const clash = entries.length > 1
        const first = entries[0]
        return (
          <button onClick={() => { if (editable) setEdit({ cls: first.cls, d, p, subject: subj, current: first.teacherId }) }} disabled={!editable}
            style={{ minHeight: 56, borderRadius: 8, padding: 6, textAlign: 'left', cursor: editable ? 'pointer' : 'default',
              border: `${clash ? '2px' : '1px'} solid ${clash ? 'var(--danger)' : st.bd}`, background: st.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
            {entries.map((en, i) => (
              <span key={i} className="t-xs" style={{ color: clash ? 'var(--danger)' : st.fg, display: 'flex', alignItems: 'center', gap: 3 }}>
                {clash && i === 0 && <Icon name="alert" size={11} />}<span className="fw6">{en.cls}</span> · {teacherName(en.teacherId)}
              </span>
            ))}
          </button>
        )
      }} />
      <PivotCellEditor edit={edit} grids={grids} setGrids={setGrids} onClose={() => setEdit(null)} />
    </div>
  )
}
```

- [ ] **Step 3: Add the view toggle + wrap the builder in `TimetableTab`**

In `TimetableTab`, add the view state. Right after `const [cls, setCls] = useState(classList[0])` add:

```tsx
  const [view, setView] = useState<'class' | 'teacher' | 'subject'>('class')
```

Then change the start of the returned JSX. Replace:

```tsx
  return (
    <div className="col gap16">
      {/* toolbar */}
      <Card>
```

with:

```tsx
  return (
    <div className="col gap16">
      <Card>
        <Segmented value={view} onChange={(v) => setView(v as 'class' | 'teacher' | 'subject')}
          options={[{ value: 'class', label: 'Class' }, { value: 'teacher', label: 'Teacher' }, { value: 'subject', label: 'Subject' }]} />
      </Card>

      {view === 'teacher' && <TeacherView grids={grids} setGrids={setGrids} editable={editable} />}
      {view === 'subject' && <SubjectView grids={grids} setGrids={setGrids} editable={editable} />}

      {view === 'class' && (<>
      {/* toolbar */}
      <Card>
```

- [ ] **Step 4: Close the Class branch**

The `TimetableTab` return currently ends with the overlap-popup Modal then `</div>`. Replace:

```tsx
          </div>
        )}
      </Modal>
    </div>
  )
}
```

with:

```tsx
          </div>
        )}
      </Modal>
      </>)}
    </div>
  )
}
```

> This `</Modal>` is the final one in `TimetableTab` (the "Teacher already assigned" overlap popup). The `</>)}` closes the `view === 'class' && (<>` fragment opened in Step 3.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. (`Empty`, `subjStyle`, `qualified`, `teacherName`, `teacherOpts`, `teachers`, `subjects`, `DAYS`, `PERIODS`, `LUNCH_AFTER`, `cellKey`, `clashingClass`, `Grid` are all already in scope in `academics.tsx`.)

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "feat: Timetable teacher & subject views (editable pivot over class grids)"
```

---

### Task 3: Render test

**Files:**
- Create: `src/screens/school/timetableViews.test.tsx`

- [ ] **Step 1: Write the test**

Create `src/screens/school/timetableViews.test.tsx`:

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
  const seg = () => within(u.container.querySelector('.sm-seg') as HTMLElement)
  return { ...u, clickTab, seg }
}

describe('Timetable teacher/subject views', () => {
  it('offers Class / Teacher / Subject and shows the empty state before any class is built', () => {
    const { container, clickTab, seg } = renderScreen()
    clickTab('Timetable')
    // segmented toggle exists with all three options
    expect(seg().getByText('Class')).toBeInTheDocument()
    expect(seg().getByText('Teacher')).toBeInTheDocument()
    expect(seg().getByText('Subject')).toBeInTheDocument()
    // switching to Teacher with no built timetables shows the empty state
    fireEvent.click(seg().getByText('Teacher'))
    expect(within(container).getByText(/Build class timetables in the Class view first/i)).toBeInTheDocument()
  })

  it('subject view also shows the empty state with nothing built', () => {
    const { container, clickTab, seg } = renderScreen()
    clickTab('Timetable')
    fireEvent.click(seg().getByText('Subject'))
    expect(within(container).getByText(/view them by subject/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm run test -- timetableViews`
Expected: PASS (2 tests).

> The empty-state path is deterministic (no class timetables built on a fresh render). The derivation logic itself is covered by `timetable.test.ts` (Task 1). If `.sm-seg` isn't found, confirm Task 2 Step 3 added the `Segmented` toggle.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/timetableViews.test.tsx
git commit -m "test: Timetable view toggle + teacher/subject empty states"
```

---

## Self-Review Notes

- **Spec coverage:** derive helpers + types (Task 1) ✓; view toggle + Class branch left intact (Task 2 Steps 3–4) ✓; TeacherView/SubjectView read/edit grids (Task 2 Step 2) ✓; pivot-cell editor reassign + clear, reusing `clashingClass`/`qualified` (Task 2) ✓; empty state (Task 2 + Task 3) ✓; helper unit tests + render test (Tasks 1, 3) ✓.
- **Type consistency:** `TeacherSlotEntry {cls,subject}` / `SubjectSlotEntry {cls,teacherId}` defined in Task 1 and consumed in the views. `GridsState = Record<string, Grid>` matches `TimetableTab`'s `grids` state type. `teacherSchedule`/`subjectSchedule` signatures identical across helper, tests, views. `PivotEdit` fields used consistently by both views and the editor.
- **Builder untouched:** the existing builder JSX is only *wrapped* (`view === 'class' && <>…</>`), no logic edits; the new editor is independent of `editCell`/`applyTeacher`.
- **Placeholder scan:** none.
