# Timetable Class-wise Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "All classes" view to the Timetable toggle that shows every built class timetable as its own weekly grid.

**Architecture:** A new `ClassOverview` component in `academics.tsx` reuses `PivotGrid` + `conflictsFor` to render each built class's grid; wired as a fourth `Segmented` option in `TimetableTab`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library.

---

## File Structure

- **Modify** `src/screens/school/academics.tsx` — add `ClassOverview`; add the `overview` view option/branch.
- **Modify** `src/screens/school/timetableViews.test.tsx` — one empty-state case.

---

### Task 1: ClassOverview view + wiring

**Files:**
- Modify: `src/screens/school/academics.tsx`

- [ ] **Step 1: Add the `ClassOverview` component**

Insert immediately before `function TimetableTab(` (after the `SubjectView` function):

```tsx
function ClassOverview({ grids }: { grids: GridsState }) {
  const built = classList.filter((c) => grids[c] && Object.values(grids[c]).some(Boolean))
  if (built.length === 0) return <Empty icon="calendar" title="No timetables yet" body="Build class timetables in the Class view first to see the class-wise overview." />
  return (
    <div className="col gap16">
      {built.map((cls) => {
        const grid = grids[cls] ?? {}
        const conflicts = conflictsFor(grids, cls)
        return (
          <div key={cls} className="col gap8">
            <div className="row ai-center jc-between">
              <div className="fw6">{cls}</div>
              {conflicts.size > 0
                ? <Badge tone="danger" icon="alert">{conflicts.size} clash{conflicts.size > 1 ? 'es' : ''}</Badge>
                : <Badge tone="success" icon="checkCircle">No clashes</Badge>}
            </div>
            <PivotGrid renderCell={(d, p) => {
              const key = cellKey(d, p)
              const cell = grid[key]
              if (!cell) return <div style={{ minHeight: 56, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
              const isClash = conflicts.has(key)
              const st = subjStyle(cell.subject)
              return (
                <div style={{ minHeight: 56, borderRadius: 8, padding: 6,
                  border: `${isClash ? '2px' : '1px'} solid ${isClash ? 'var(--danger)' : st.bd}`, background: st.bg,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                  <span className="fw6 t-xs" style={{ color: st.fg }}>{cell.subject}</span>
                  <span className="t-xs" style={{ display: 'flex', alignItems: 'center', gap: 3, color: isClash ? 'var(--danger)' : 'var(--text-2)' }}>
                    {isClash && <Icon name="alert" size={11} />}{teacherName(cell.teacherId)}
                  </span>
                </div>
              )
            }} />
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Widen the `view` union + add the toggle option**

In `TimetableTab`, change:

```tsx
  const [view, setView] = useState<'class' | 'teacher' | 'subject'>('class')
```

to:

```tsx
  const [view, setView] = useState<'class' | 'teacher' | 'subject' | 'overview'>('class')
```

Change the `Segmented` block:

```tsx
        <Segmented value={view} onChange={(v) => setView(v as 'class' | 'teacher' | 'subject')}
          options={[{ value: 'class', label: 'Class' }, { value: 'teacher', label: 'Teacher' }, { value: 'subject', label: 'Subject' }]} />
```

to:

```tsx
        <Segmented value={view} onChange={(v) => setView(v as 'class' | 'teacher' | 'subject' | 'overview')}
          options={[{ value: 'class', label: 'Class' }, { value: 'teacher', label: 'Teacher' }, { value: 'subject', label: 'Subject' }, { value: 'overview', label: 'All classes' }]} />
```

- [ ] **Step 3: Render the overview branch**

Change:

```tsx
      {view === 'teacher' && <TeacherView grids={grids} setGrids={setGrids} editable={editable} />}
      {view === 'subject' && <SubjectView grids={grids} setGrids={setGrids} editable={editable} />}
```

to:

```tsx
      {view === 'teacher' && <TeacherView grids={grids} setGrids={setGrids} editable={editable} />}
      {view === 'subject' && <SubjectView grids={grids} setGrids={setGrids} editable={editable} />}
      {view === 'overview' && <ClassOverview grids={grids} />}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. (`PivotGrid`, `cellKey`, `conflictsFor`, `subjStyle`, `teacherName`, `classList`, `Empty`, `Badge`, `Icon` are all in scope.)

- [ ] **Step 5: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "feat: Timetable All-classes overview view (read-only, class-wise)"
```

---

### Task 2: Render test

**Files:**
- Modify: `src/screens/school/timetableViews.test.tsx`

- [ ] **Step 1: Add the empty-state case**

In `src/screens/school/timetableViews.test.tsx`, add inside the existing `describe('Timetable teacher/subject views', ...)` block (after the subject-view test):

```tsx
  it('All classes overview shows the empty state with nothing built', () => {
    const { container, clickTab, seg } = renderScreen()
    clickTab('Timetable')
    fireEvent.click(seg().getByText('All classes'))
    expect(within(container).getByText(/class-wise overview/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test**

Run: `npm run test -- timetableViews`
Expected: PASS (3 tests).

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/timetableViews.test.tsx
git commit -m "test: Timetable All-classes overview empty state"
```

---

## Self-Review Notes

- **Spec coverage:** `ClassOverview` lists built classes, empty state, per-class grid via `PivotGrid` with clash flagging (Task 1 Step 1) ✓; `overview` added to `Segmented` + view union + render branch (Task 1 Steps 2–3) ✓; empty-state render test (Task 2) ✓.
- **Type consistency:** `ClassOverview({ grids: GridsState })` matches the `GridsState` type used by the other views; `PivotGrid`'s `renderCell` returns `ReactNode` (a `<div>` here, valid). The `Segmented` onChange cast and the `view` union both include `'overview'`.
- **Placeholder scan:** none.
