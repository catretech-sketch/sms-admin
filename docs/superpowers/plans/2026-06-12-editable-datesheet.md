# Editable Datesheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the exam datesheet an editable, persisted timetable — per paper pick subject/date/start-time/duration (end computed), add/remove papers, with time-aware invigilator + room + duplicate-subject clash detection.

**Architecture:** A `PaperSlot` type + pure `endTime`/`findClashes` helpers in `examData.ts`. Datesheets persist per exam in `AppProvider` (`datesheets` + `saveDatesheet`). `DatesheetDrawer` is rewritten around a single `slots: PaperSlot[]` state with editable fields and Save/Publish gated by exam caps.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library. Existing UI primitives, mock data, `buildPapers`/`TEACHER_POOL` in `exams.tsx`.

---

## File Structure

- **Modify** `src/types/index.ts` — add `PaperSlot`.
- **Modify** `src/lib/examData.ts` — add `endTime`, `findClashes`.
- **Modify** `src/lib/examData.test.ts` — unit tests for both.
- **Modify** `src/context/AppProvider.tsx` — `datesheets` + `saveDatesheet`.
- **Modify** `src/screens/school/exams.tsx` — rewrite `DatesheetDrawer`.
- **Modify** `src/screens/school/examsFlow.test.tsx` — one datesheet clash test.

---

### Task 1: `PaperSlot` type + `endTime`/`findClashes`

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/examData.ts`
- Modify: `src/lib/examData.test.ts`

- [ ] **Step 1: Add the `PaperSlot` type**

In `src/types/index.ts`, add after the `Exam` interface (near the other exam types):

```ts
export interface PaperSlot {
  id: number
  subject: string
  date: string        // yyyy-mm-dd
  start: string       // HH:MM (24h)
  duration: number    // minutes
  room: string
  inv1: string
  inv2: string
}
```

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/examData.test.ts` (add `endTime, findClashes` to the existing `./examData` import on line 2, and `PaperSlot` type import):

Change line 2 from:

```ts
import { markKey, attKey, marksProgress } from './examData'
```

to:

```ts
import { markKey, attKey, marksProgress, endTime, findClashes } from './examData'
import type { PaperSlot } from '@/types'
```

Append at end of file:

```ts
describe('endTime', () => {
  it('adds duration to a HH:MM start', () => {
    expect(endTime('09:30', 180)).toBe('12:30')
    expect(endTime('08:00', 45)).toBe('08:45')
  })
  it('clamps within the same day', () => {
    expect(endTime('23:00', 180)).toBe('23:59')
  })
  it('returns the input unchanged for a blank/invalid start', () => {
    expect(endTime('', 60)).toBe('')
    expect(endTime('nope', 60)).toBe('nope')
  })
})

describe('findClashes', () => {
  const base: PaperSlot = { id: 0, subject: 'English', date: '2026-09-08', start: '09:30', duration: 180, room: 'Hall 1', inv1: '', inv2: '' }
  const mk = (over: Partial<PaperSlot>): PaperSlot => ({ ...base, ...over })

  it('flags an invigilator in two overlapping slots on the same date', () => {
    const slots = [
      mk({ id: 0, subject: 'English', inv1: 'R. Kumar' }),
      mk({ id: 1, subject: 'Hindi', start: '11:00', inv1: 'R. Kumar' }),
    ]
    expect(findClashes(slots).some((m) => m.includes('R. Kumar'))).toBe(true)
  })

  it('does not flag invigilator when times do not overlap', () => {
    const slots = [
      mk({ id: 0, subject: 'English', start: '09:00', duration: 60, inv1: 'R. Kumar' }),
      mk({ id: 1, subject: 'Hindi', start: '10:30', duration: 60, inv1: 'R. Kumar' }),
    ]
    expect(findClashes(slots).some((m) => m.includes('R. Kumar'))).toBe(false)
  })

  it('does not flag invigilator across different dates', () => {
    const slots = [
      mk({ id: 0, subject: 'English', date: '2026-09-08', inv1: 'R. Kumar' }),
      mk({ id: 1, subject: 'Hindi', date: '2026-09-09', inv1: 'R. Kumar' }),
    ]
    expect(findClashes(slots).some((m) => m.includes('R. Kumar'))).toBe(false)
  })

  it('flags a double-booked room for overlapping slots', () => {
    const slots = [
      mk({ id: 0, subject: 'English', room: 'Hall 1' }),
      mk({ id: 1, subject: 'Hindi', start: '10:00', room: 'Hall 1' }),
    ]
    expect(findClashes(slots).some((m) => m.startsWith('Room Hall 1'))).toBe(true)
  })

  it('flags a subject allocated to two papers', () => {
    const slots = [
      mk({ id: 0, subject: 'English', date: '2026-09-08' }),
      mk({ id: 1, subject: 'English', date: '2026-09-12' }),
    ]
    expect(findClashes(slots).some((m) => m.startsWith('Subject English'))).toBe(true)
  })

  it('returns [] for a clean datesheet', () => {
    const slots = [
      mk({ id: 0, subject: 'English', inv1: 'R. Kumar', room: 'Hall 1' }),
      mk({ id: 1, subject: 'Hindi', date: '2026-09-10', inv1: 'S. Rao', room: 'Hall 2' }),
    ]
    expect(findClashes(slots)).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- examData`
Expected: FAIL — `endTime`/`findClashes` not exported.

- [ ] **Step 4: Implement `endTime` + `findClashes`**

Append to `src/lib/examData.ts` (add the `PaperSlot` import at the top):

At the top of the file, add:

```ts
import type { PaperSlot } from '@/types'
```

At the end of the file:

```ts
function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** End time "HH:MM" from a start + duration, clamped within the day. */
export function endTime(start: string, duration: number): string {
  const base = toMinutes(start)
  if (base === null) return start
  const mins = Math.min(1439, Math.max(0, base + (Number(duration) || 0)))
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const mm = String(mins % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Conflict messages for a single exam's datesheet (empty = clean). */
export function findClashes(slots: PaperSlot[]): string[] {
  const out = new Set<string>()
  const overlap = (a: PaperSlot, b: PaperSlot): boolean => {
    if (a.date !== b.date) return false
    const as = toMinutes(a.start), bs = toMinutes(b.start)
    if (as === null || bs === null) return false
    return as < bs + (b.duration || 0) && bs < as + (a.duration || 0)
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j]
      if (a.subject && b.subject && a.subject === b.subject) {
        out.add(`Subject ${a.subject} — allocated to two papers`)
      }
      if (overlap(a, b)) {
        const ai = [a.inv1, a.inv2].filter(Boolean)
        const bi = [b.inv1, b.inv2].filter(Boolean)
        for (const t of ai) if (bi.includes(t)) out.add(`Invigilator ${t} — overlapping slots on ${a.date}`)
        if (a.room && b.room && a.room === b.room) out.add(`Room ${a.room} — double-booked on ${a.date}`)
      }
    }
  }
  return [...out]
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- examData`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/examData.ts src/lib/examData.test.ts
git commit -m "feat: PaperSlot type + endTime/findClashes datesheet helpers"
```

---

### Task 2: Persist datesheets in AppProvider

**Files:**
- Modify: `src/context/AppProvider.tsx`

- [ ] **Step 1: Import the `PaperSlot` type**

Change the type import to include `PaperSlot`:

```ts
import type { ConsoleKind, Exam, PaperSlot, Role, School, Staff, Student, Teacher, Tier } from '@/types'
```

- [ ] **Step 2: Add to the `AppState` interface**

After:

```ts
  examAttendance: Record<string, 'present' | 'absent'>
  saveExamAttendance: (entries: Record<string, 'present' | 'absent'>) => void
```

add:

```ts
  /* per-exam datesheets (in-session) */
  datesheets: Record<string, PaperSlot[]>
  saveDatesheet: (examId: string, slots: PaperSlot[]) => void
```

- [ ] **Step 3: Add the state + action in the provider body**

After:

```ts
  const [examAttendance, setExamAttendance] = useState<Record<string, 'present' | 'absent'>>({})
  const saveExamAttendance = (entries: Record<string, 'present' | 'absent'>) =>
    setExamAttendance((m) => ({ ...m, ...entries }))
```

add:

```ts
  const [datesheets, setDatesheets] = useState<Record<string, PaperSlot[]>>({})
  const saveDatesheet = (examId: string, slots: PaperSlot[]) =>
    setDatesheets((m) => ({ ...m, [examId]: slots }))
```

- [ ] **Step 4: Expose on the context value**

Change:

```ts
    exams, addExam, updateExam, examMarks, saveExamMarks, examAttendance, saveExamAttendance,
```

to:

```ts
    exams, addExam, updateExam, examMarks, saveExamMarks, examAttendance, saveExamAttendance,
    datesheets, saveDatesheet,
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test -- AppProvider`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/context/AppProvider.tsx
git commit -m "feat: persist per-exam datesheets in AppProvider"
```

---

### Task 3: Rewrite `DatesheetDrawer`

**Files:**
- Modify: `src/screens/school/exams.tsx`

- [ ] **Step 1: Add the examData + type imports**

Change the examData import line to add `endTime, findClashes`:

```ts
import { markKey, attKey, marksProgress, endTime, findClashes } from '@/lib/examData'
```

Change the types import to add `PaperSlot`:

```ts
import type { Exam, Student, PaperSlot } from '@/types'
```

- [ ] **Step 2: Replace the whole `DatesheetDrawer` function**

Replace the entire `DatesheetDrawer` function (from `function DatesheetDrawer({ exam, onClose }...` through its closing `}` before the `Tab 1` banner) with:

```tsx
function DatesheetDrawer({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const toast = useToast()
  const app = useApp()
  const canPublish = can(app.role, 'exams', 'A')
  const canEdit = can(app.role, 'exams', 'E')

  const defaultSlots = (e: Exam): PaperSlot[] =>
    buildPapers(e).map((p, i) => ({
      id: p.id, subject: p.subject, date: p.date, start: '09:30', duration: 180,
      room: 'Hall ' + (i + 1),
      inv1: TEACHER_POOL[(i * 2) % TEACHER_POOL.length],
      inv2: TEACHER_POOL[(i * 2 + 1) % TEACHER_POOL.length],
    }))

  const [slots, setSlots] = useState<PaperSlot[]>([])
  useEffect(() => {
    if (!exam) return
    setSlots(app.datesheets[exam.id] ?? defaultSlots(exam))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam])

  const setSlot = (id: number, patch: Partial<PaperSlot>) =>
    setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const removePaper = (id: number) => setSlots((ss) => ss.filter((s) => s.id !== id))
  const addPaper = () =>
    setSlots((ss) => {
      const nextId = ss.reduce((mx, s) => Math.max(mx, s.id), -1) + 1
      const used = new Set(ss.map((s) => s.subject))
      const subj = subjects.find((s) => !used.has(s)) ?? subjects[0]
      const last = ss[ss.length - 1]
      return [...ss, { id: nextId, subject: subj, date: last?.date ?? (exam?.from ?? ''), start: '09:30', duration: 180, room: '', inv1: '', inv2: '' }]
    })

  const clashes = useMemo(() => findClashes(slots), [slots])
  const invigOptions = ['', ...TEACHER_POOL].map((t) => ({ value: t, label: t || '— Select —' }))

  const save = () => {
    if (!exam || clashes.length) return
    app.saveDatesheet(exam.id, slots)
    toast.success('Datesheet saved', `${exam.name} timetable saved.`)
  }
  const publish = () => {
    if (!exam || clashes.length) return
    app.saveDatesheet(exam.id, slots)
    toast.success('Datesheet published', `${exam.name} datesheet sent to staff & parents.`)
    onClose()
  }

  return (
    <Drawer
      open={!!exam} onClose={onClose} width={680} icon="calendar"
      title="Datesheet" sub={exam ? `${exam.name} · ${exam.grades} · ${slots.length} papers` : ''}
      footer={
        <div className="row gap8 jc-between ai-center">
          <span className="t-xs muted">{clashes.length ? `${clashes.length} clash(es) to resolve` : 'No clashes'}</span>
          <div className="row gap8">
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
            {canEdit && <Btn variant="secondary" icon="check" disabled={clashes.length > 0} onClick={save}>Save datesheet</Btn>}
            {canPublish && <Btn variant="primary" icon="check" disabled={clashes.length > 0} onClick={publish}>Publish datesheet</Btn>}
          </div>
        </div>
      }
    >
      {clashes.length > 0 && (
        <div className="row ai-start gap8" style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 14, background: 'var(--danger-bg, rgba(220,38,38,.1))', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          <Icon name="alert" size={16} />
          <span className="t-sm fw6">{clashes.join(' · ')}</span>
        </div>
      )}

      <div className="row ai-center jc-between" style={{ marginBottom: 12 }}>
        <span className="t-sm muted">{slots.length} paper{slots.length === 1 ? '' : 's'}</span>
        {canEdit && <Btn variant="secondary" size="sm" icon="plus" onClick={addPaper}>Add paper</Btn>}
      </div>

      <div className="col gap12">
        {slots.map((s, i) => (
          <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div className="row ai-center jc-between" style={{ marginBottom: 10 }}>
              <div className="row ai-center gap10">
                <span className="sm-card-ic"><Icon name="book" size={16} /></span>
                <div>
                  <div className="fw6">{s.subject || '—'}</div>
                  <div className="t-xs muted">{s.date ? fmtDate(s.date) : '—'} · {s.start} – {endTime(s.start, s.duration)}</div>
                </div>
              </div>
              <div className="row ai-center gap8">
                <Badge tone="neutral">Paper {i + 1}</Badge>
                {canEdit && <Btn variant="ghost" size="sm" onClick={() => removePaper(s.id)}>Remove</Btn>}
              </div>
            </div>
            <div className="sm-grid-3 gap12">
              <Field label="Subject">
                <Select options={subjects} value={s.subject} disabled={!canEdit} onChange={(e) => setSlot(s.id, { subject: e.target.value })} />
              </Field>
              <Field label="Date">
                <Input type="date" value={s.date} disabled={!canEdit} onChange={(e) => setSlot(s.id, { date: e.target.value })} />
              </Field>
              <Field label="Start time">
                <Input type="time" value={s.start} disabled={!canEdit} onChange={(e) => setSlot(s.id, { start: e.target.value })} />
              </Field>
              <Field label="Duration (min)">
                <Input type="number" min={0} value={String(s.duration)} disabled={!canEdit} onChange={(e) => setSlot(s.id, { duration: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              </Field>
              <Field label="End time">
                <Input value={endTime(s.start, s.duration)} disabled />
              </Field>
              <Field label="Room / hall">
                <Input value={s.room} placeholder="e.g. Hall 1" disabled={!canEdit} onChange={(e) => setSlot(s.id, { room: e.target.value })} />
              </Field>
              <Field label="Invigilator 1">
                <Select options={invigOptions} value={s.inv1} disabled={!canEdit} onChange={(e) => setSlot(s.id, { inv1: e.target.value })} />
              </Field>
              <Field label="Invigilator 2">
                <Select options={invigOptions} value={s.inv2} disabled={!canEdit} onChange={(e) => setSlot(s.id, { inv2: e.target.value })} />
              </Field>
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  )
}
```

> If `Select` does not forward a `disabled` prop, the field still renders and remains usable; for the default `admin` role `canEdit` is `true` so editing works regardless. (`Input` already supports `disabled` — used in the marks grid.)

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. (`fmtDate`, `buildPapers`, `TEACHER_POOL`, `subjects`, `Field`, `Input`, `Select`, `Drawer` are all already in scope/imported in `exams.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/exams.tsx
git commit -m "feat: editable datesheet — subject/date/time/duration, add-remove, time-aware clashes, persist"
```

---

### Task 4: Datesheet clash render test

**Files:**
- Modify: `src/screens/school/examsFlow.test.tsx`

- [ ] **Step 1: Add the test case**

Add this `it` block inside the existing `describe('Exam lifecycle', ...)` in `src/screens/school/examsFlow.test.tsx` (after the publish test):

```tsx
  it('flags a duplicate subject in the datesheet and disables Save', () => {
    const { container } = renderScreen()
    // open the first exam's datesheet
    fireEvent.click(within(container).getAllByText('Datesheet')[0])
    const dialog = within(container).getByRole('dialog')
    // per paper the selects are [Subject, Invigilator 1, Invigilator 2]
    const combos = within(dialog).getAllByRole('combobox') as HTMLSelectElement[]
    const firstSubject = combos[0].value
    // set paper 2's subject (combos[3]) equal to paper 1's subject → duplicate
    fireEvent.change(combos[3], { target: { value: firstSubject } })
    expect(within(dialog).getByText(/allocated to two papers/i)).toBeInTheDocument()
    const saveBtn = within(dialog).getByText('Save datesheet').closest('button')
    expect(saveBtn).toBeDisabled()
  })
```

- [ ] **Step 2: Run the test**

Run: `npm run test -- examsFlow`
Expected: PASS (5 tests).

> If `combos[3]` isn't paper 2's subject, the per-paper select order differs — adjust the index to the second paper's Subject select (3 selects per paper: Subject, Inv1, Inv2). If the dialog isn't found, confirm the `Drawer` primitive sets `role="dialog"` (it does).

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/examsFlow.test.tsx
git commit -m "test: datesheet duplicate-subject clash disables Save"
```

---

## Self-Review Notes

- **Spec coverage:** `PaperSlot` type (Task 1) ✓; `endTime` + `findClashes` with invigilator/room/duplicate-subject rules (Task 1) ✓; `datesheets` + `saveDatesheet` state (Task 2) ✓; editable subject/date/start/duration + computed end + add/remove + seed-from-saved-or-default + time-aware clash banner + Save(E)/Publish(A) gating disabled on clash (Task 3) ✓; unit tests + render clash test (Tasks 1, 4) ✓.
- **Type consistency:** `PaperSlot` fields (`id, subject, date, start, duration, room, inv1, inv2`) defined in Task 1 and used identically in `examData.ts`, AppProvider, and the drawer. `findClashes(slots)`/`endTime(start, duration)` signatures match across definition, tests, and the drawer. `saveDatesheet(examId, slots)` defined (Task 2) and called as `app.saveDatesheet(exam.id, slots)` (Task 3).
- **Placeholder scan:** none — every code step is complete.
- **Known assumption:** `Select`'s `disabled` forwarding (noted inline) and the per-paper combobox order in the render test (fallback noted). Both are non-blocking for the default `admin` role.
