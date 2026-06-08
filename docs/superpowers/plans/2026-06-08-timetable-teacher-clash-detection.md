# Timetable Teacher Clash Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a teacher being booked in two classes at the same day+period in the Academics → Timetable builder, with clash-free auto-generate and warn+highlight on manual edits.

**Architecture:** Extract pure, UI-free clash helpers into `src/lib/timetable.ts` (unit-tested with vitest). The `TimetableTab` in `src/screens/school/academics.tsx` already keeps every class's grid in one state object (`grids: Record<className, Grid>`), so global teacher occupancy is computable from props/state alone. Wire the helpers in: clash-aware teacher pick during generate, a clash toast during manual place, conflict highlighting + a toolbar status badge, and a clash-aware Save toast.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest. Frontend-only (in-memory, mock data); no backend.

---

## File Structure

- **Create** `src/lib/timetable.ts` — pure types (`Cell`, `Grid`, `Grids`) + helpers (`cellKey`, `clashingClass`, `teacherBusyElsewhere`, `pickTeacher`, `conflictsFor`). Single responsibility: the timetable data model + clash math, with no React/mockDb dependency.
- **Create** `src/lib/timetable.test.ts` — unit tests for the helpers.
- **Modify** `src/screens/school/academics.tsx` — import the helpers (remove the local `Cell`/`Grid`/`cellKey` definitions), make `generate()` clash-aware, warn on manual `place()`, render conflict highlighting + a toolbar badge, and make Save clash-aware.

---

## Task 1: Pure clash-detection helpers

**Files:**
- Create: `src/lib/timetable.ts`
- Test: `src/lib/timetable.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/timetable.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  cellKey, clashingClass, teacherBusyElsewhere, pickTeacher, conflictsFor, type Grids,
} from './timetable'

const grids: Grids = {
  'IX-A': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 't1' }, [cellKey(0, 1)]: { subject: 'Sci', teacherId: 't2' } },
  'IX-B': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 't1' }, [cellKey(1, 0)]: { subject: 'Eng', teacherId: 't3' } },
}

describe('timetable clash detection', () => {
  it('detects a teacher booked in two classes at the same slot', () => {
    expect(clashingClass(grids, 't1', 0, 0, 'IX-A')).toBe('IX-B')
    expect(teacherBusyElsewhere(grids, 't1', 0, 0, 'IX-A')).toBe(true)
  })
  it('same teacher in a different slot is not a clash', () => {
    expect(teacherBusyElsewhere(grids, 't3', 0, 0, 'IX-A')).toBe(false)
  })
  it('empty teacher never clashes', () => {
    expect(teacherBusyElsewhere(grids, '', 0, 0, 'IX-A')).toBe(false)
  })
  it('conflictsFor returns the double-booked cells of a class', () => {
    expect(conflictsFor(grids, 'IX-A')).toEqual(new Set([cellKey(0, 0)]))
    expect(conflictsFor(grids, 'IX-B')).toEqual(new Set([cellKey(0, 0)]))
  })
  it('pickTeacher prefers a free teacher', () => {
    expect(pickTeacher(grids, ['t1', 't4'], 0, 0, 'IX-C', 0)).toBe('t4')
  })
  it('pickTeacher falls back to the rotated teacher when all are busy', () => {
    expect(pickTeacher(grids, ['t1'], 0, 0, 'IX-C', 0)).toBe('t1')
  })
  it('pickTeacher returns empty string for an empty roster', () => {
    expect(pickTeacher(grids, [], 0, 0, 'IX-C', 0)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timetable.test.ts`
Expected: FAIL — cannot resolve `./timetable` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/timetable.ts`:

```ts
/* ============================================================
   SchoolMate — Timetable model + teacher clash detection.
   Pure, UI-free helpers so the builder can detect when a
   teacher is booked in two classes at the same day+period.
   ============================================================ */

export type Cell = { subject: string; teacherId: string }
export type Grid = Record<string, Cell | null>
export type Grids = Record<string, Grid>

/** Stable key for a 0-based day + 0-based period slot. */
export const cellKey = (day: number, period: number): string => `${day}-${period}`

/**
 * The first class OTHER than `exceptClass` in which `teacherId` already teaches
 * at this day+period, or null if none. An empty teacherId never clashes.
 */
export function clashingClass(
  grids: Grids, teacherId: string, day: number, period: number, exceptClass: string,
): string | null {
  if (!teacherId) return null
  const key = cellKey(day, period)
  for (const [cls, grid] of Object.entries(grids)) {
    if (cls === exceptClass) continue
    const cell = grid[key]
    if (cell && cell.teacherId === teacherId) return cls
  }
  return null
}

/** True if the teacher is booked in another class at this slot. */
export function teacherBusyElsewhere(
  grids: Grids, teacherId: string, day: number, period: number, exceptClass: string,
): boolean {
  return clashingClass(grids, teacherId, day, period, exceptClass) !== null
}

/**
 * Pick a teacher from `roster` for a slot, preferring one free across all other
 * classes. Tries the roster in rotation order from `rotStart`. Falls back to the
 * rotated teacher (a residual clash) if everyone is busy. '' for an empty roster.
 */
export function pickTeacher(
  grids: Grids, roster: string[], day: number, period: number, exceptClass: string, rotStart: number,
): string {
  if (roster.length === 0) return ''
  const n = roster.length
  for (let i = 0; i < n; i++) {
    const cand = roster[(rotStart + i) % n]
    if (!teacherBusyElsewhere(grids, cand, day, period, exceptClass)) return cand
  }
  return roster[rotStart % n]
}

/**
 * The set of cell keys in `cls` whose assigned teacher is double-booked in
 * another class at the same slot.
 */
export function conflictsFor(grids: Grids, cls: string): Set<string> {
  const out = new Set<string>()
  const grid = grids[cls]
  if (!grid) return out
  for (const [key, cell] of Object.entries(grid)) {
    if (!cell || !cell.teacherId) continue
    const [d, p] = key.split('-').map(Number)
    if (teacherBusyElsewhere(grids, cell.teacherId, d, p, cls)) out.add(key)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/timetable.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timetable.ts src/lib/timetable.test.ts
git commit -m "feat: pure timetable teacher clash-detection helpers"
```

---

## Task 2: Wire helpers into academics.tsx (refactor, no behaviour change)

**Files:**
- Modify: `src/screens/school/academics.tsx`

- [ ] **Step 1: Add the import**

After the existing `import type { Teacher } from '@/types'` line near the top, add:

```ts
import { cellKey, clashingClass, pickTeacher, conflictsFor, type Cell, type Grid } from '@/lib/timetable'
```

- [ ] **Step 2: Remove the now-duplicated local definitions**

Delete this local line (it lives in the "shared helpers / constants" block):

```ts
const cellKey = (d: number, p: number) => `${d}-${p}`
```

And delete these local type lines (just above the "Classes & sections" section):

```ts
type Cell = { subject: string; teacherId: string }
type Grid = Record<string, Cell | null>
```

(`cellKey`, `Cell`, and `Grid` now come from `@/lib/timetable`; all existing usages stay unchanged.)

- [ ] **Step 3: Verify types + existing tests still pass**

Run: `npx tsc -b`
Expected: exit 0 (no errors).
Run: `npx vitest run`
Expected: PASS (all existing suites + the new timetable suite).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "refactor: source timetable types/cellKey from lib/timetable"
```

---

## Task 3: Clash-aware auto-generate

**Files:**
- Modify: `src/screens/school/academics.tsx` (inside `TimetableTab` → `generate()`)

- [ ] **Step 1: Replace the teacher pick inside the generate loop**

Find this block inside `generate()`:

```ts
        const s = tokens[ti++]
        const team = subjTeachers[s] ?? []
        const tid = team.length ? team[(rot[s] ?? 0) % team.length] : ''
        rot[s] = (rot[s] ?? 0) + 1
        next[cellKey(d, p)] = { subject: s, teacherId: tid }
```

Replace it with (picks a non-clashing teacher against other classes + cells already placed this pass):

```ts
        const s = tokens[ti++]
        const team = subjTeachers[s] ?? []
        const tid = pickTeacher({ ...grids, [cls]: next }, team, d, p, cls, rot[s] ?? 0)
        rot[s] = (rot[s] ?? 0) + 1
        next[cellKey(d, p)] = { subject: s, teacherId: tid }
```

- [ ] **Step 2: Make the success toast report residual clashes**

Find this line at the end of `generate()`:

```ts
    toast.success('Timetable generated', `${Math.min(tokens.length, TOTAL_SLOTS)} periods placed for ${cls}.`)
```

Replace with:

```ts
    const clashCount = conflictsFor({ ...grids, [cls]: next }, cls).size
    toast.success('Timetable generated', `${Math.min(tokens.length, TOTAL_SLOTS)} periods placed for ${cls} · ${clashCount === 0 ? '0 clashes' : `${clashCount} clash${clashCount > 1 ? 'es' : ''} to review`}.`)
```

- [ ] **Step 3: Verify types + tests**

Run: `npx tsc -b`
Expected: exit 0.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "feat: clash-free teacher assignment on timetable auto-generate"
```

---

## Task 4: Warn on manual clash placement

**Files:**
- Modify: `src/screens/school/academics.tsx` (inside `TimetableTab` → `place()`)

- [ ] **Step 1: Add a clash toast after manual placement**

Find this block inside `place()`:

```ts
    const team = subjTeachers[brush] ?? []
    const c = placeCounts[brush] ?? 0
    const tid = team.length ? team[c % team.length] : ''
    setGrids((prev) => ({ ...prev, [cls]: { ...(prev[cls] ?? {}), [key]: { subject: brush, teacherId: tid } } }))
    setPlaceCounts((prev) => ({ ...prev, [brush]: (prev[brush] ?? 0) + 1 }))
```

Replace with (keeps the rotating teacher, then warns if it clashes with another class):

```ts
    const team = subjTeachers[brush] ?? []
    const c = placeCounts[brush] ?? 0
    const tid = team.length ? team[c % team.length] : ''
    const clashWith = tid ? clashingClass(grids, tid, d, p, cls) : null
    setGrids((prev) => ({ ...prev, [cls]: { ...(prev[cls] ?? {}), [key]: { subject: brush, teacherId: tid } } }))
    setPlaceCounts((prev) => ({ ...prev, [brush]: (prev[brush] ?? 0) + 1 }))
    if (clashWith) toast.danger('Teacher clash', `${teacherName(tid)} is also teaching ${clashWith} on ${DAYS[d]} P${p + 1}.`)
```

- [ ] **Step 2: Verify types + tests**

Run: `npx tsc -b`
Expected: exit 0.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "feat: warn when a manual timetable placement double-books a teacher"
```

---

## Task 5: Conflict highlighting + toolbar status badge

**Files:**
- Modify: `src/screens/school/academics.tsx` (inside `TimetableTab`)

- [ ] **Step 1: Compute the current class's conflict set**

Find this line near the top of `TimetableTab` (just after the state hooks):

```ts
  const g = grids[cls] ?? {}
```

Add immediately below it:

```ts
  const conflicts = useMemo(() => conflictsFor(grids, cls), [grids, cls])
```

(`useMemo` is already imported at the top of the file.)

- [ ] **Step 2: Add the clash status badge to the build toolbar**

Find this line inside the `m === 'build'` toolbar:

```ts
              <Badge tone={filled === TOTAL_SLOTS ? 'success' : 'neutral'}>{filled}/{TOTAL_SLOTS} periods set</Badge>
```

Add directly after it:

```ts
              {conflicts.size > 0
                ? <Badge tone="danger" icon="alert">{conflicts.size} clash{conflicts.size > 1 ? 'es' : ''}</Badge>
                : filled > 0 ? <Badge tone="success" icon="checkCircle">No clashes</Badge> : null}
```

- [ ] **Step 3: Highlight conflicting cells in the grid**

Find this block in the grid render (the per-day cell map):

```ts
                  {DAYS.map((_d, di) => {
                    const cell = g[cellKey(di, rd.p)]
                    const st = cell ? subjStyle(cell.subject) : null
                    return (
                      <button key={di} onClick={() => place(di, rd.p)} disabled={!editable}
                        style={{
                          minHeight: 56, borderRadius: 8, padding: 6, textAlign: 'left',
                          cursor: editable ? 'pointer' : 'default',
                          border: `1px solid ${st ? st.bd : 'var(--border)'}`,
                          background: st ? st.bg : 'var(--surface)',
                          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                        }}>
                        {cell ? (
                          <>
                            <span className="fw6 t-xs" style={{ color: st!.fg }}>{cell.subject}</span>
                            <span className="t-xs muted" style={{ lineHeight: 1.1 }}>{teacherName(cell.teacherId)}</span>
                          </>
                        ) : <span className="muted" style={{ opacity: editable ? 0.5 : 0.2, fontSize: 16, textAlign: 'center' }}>{editable ? '+' : '·'}</span>}
                      </button>
                    )
                  })}
```

Replace it with:

```ts
                  {DAYS.map((_d, di) => {
                    const ck = cellKey(di, rd.p)
                    const cell = g[ck]
                    const st = cell ? subjStyle(cell.subject) : null
                    const isClash = conflicts.has(ck)
                    const clashWith = cell && isClash ? clashingClass(grids, cell.teacherId, di, rd.p, cls) : null
                    return (
                      <button key={di} onClick={() => place(di, rd.p)} disabled={!editable}
                        title={clashWith ? `Also in ${clashWith} · ${DAYS[di]} P${rd.p + 1}` : undefined}
                        style={{
                          minHeight: 56, borderRadius: 8, padding: 6, textAlign: 'left',
                          cursor: editable ? 'pointer' : 'default',
                          border: `${isClash ? '2px' : '1px'} solid ${isClash ? 'var(--danger)' : st ? st.bd : 'var(--border)'}`,
                          background: st ? st.bg : 'var(--surface)',
                          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                        }}>
                        {cell ? (
                          <>
                            <span className="fw6 t-xs" style={{ color: st!.fg }}>{cell.subject}</span>
                            <span className="t-xs" style={{ lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 3, color: isClash ? 'var(--danger)' : 'var(--text-2)' }}>
                              {isClash && <Icon name="alert" size={11} />}{teacherName(cell.teacherId)}
                            </span>
                          </>
                        ) : <span className="muted" style={{ opacity: editable ? 0.5 : 0.2, fontSize: 16, textAlign: 'center' }}>{editable ? '+' : '·'}</span>}
                      </button>
                    )
                  })}
```

(`Icon` is already imported at the top of the file.)

- [ ] **Step 4: Verify types + tests**

Run: `npx tsc -b`
Expected: exit 0.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "feat: highlight clashing timetable cells and show a clash counter"
```

---

## Task 6: Clash-aware Save

**Files:**
- Modify: `src/screens/school/academics.tsx` (inside `TimetableTab` build toolbar)

- [ ] **Step 1: Make Save report clashes**

Find this line in the build toolbar:

```ts
              {editable && <Btn size="sm" variant="primary" icon="check" onClick={() => toast.success('Timetable saved', `${cls} routine saved (${filled}/${TOTAL_SLOTS} periods).`)}>Save</Btn>}
```

Replace with:

```ts
              {editable && <Btn size="sm" variant="primary" icon="check" onClick={() => {
                const n = conflicts.size
                if (n > 0) toast.danger('Saved with clashes', `${cls} saved (${filled}/${TOTAL_SLOTS}) · ${n} clash${n > 1 ? 'es' : ''} — resolve before publishing.`)
                else toast.success('Timetable saved', `${cls} routine saved (${filled}/${TOTAL_SLOTS} periods).`)
              }}>Save</Btn>}
```

- [ ] **Step 2: Verify types + tests**

Run: `npx tsc -b`
Expected: exit 0.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/screens/school/academics.tsx
git commit -m "feat: warn on save when the timetable still has teacher clashes"
```

---

## Final manual verification

Frontend-only, so confirm in the running app (dev server is already running at http://localhost:5173):

1. Log in (any school account), open **Academics → Timetable**.
2. For one class, give a subject a single-teacher roster and **auto-generate**; note its teacher/slots.
3. Switch to a second class, give a different subject the **same** single teacher, auto-generate, and confirm the generator avoided that teacher's busy slots (toast shows `0 clashes` where possible).
4. **Manually** place that teacher into a slot they already occupy in the other class → confirm: red cell border + ⚠, the toolbar `N clashes` badge, the warning toast, and the hover tooltip naming the other class.
5. Erase the clashing cell → badge returns to `No clashes`.
6. With a clash present, click **Save** → confirm the "Saved with clashes" warning toast.

## Notes for the implementer

- All clash logic is pure and lives in `src/lib/timetable.ts` — if you change a rule, change it there and extend `timetable.test.ts` first.
- A clash is strictly: same `teacherId` + same `day-period` + **different** class. `clashingClass`/`conflictsFor` use `exceptClass` so a class never clashes with itself.
- Backend is future work; everything here is in-memory React state.
