# Editable datesheet with subject allocation

**Date:** 2026-06-12
**Screen:** Exams & grading — `src/screens/school/exams.tsx` (`DatesheetDrawer`)
**Status:** Approved design

## Summary

Turn the read-mostly datesheet (auto-generated papers, fixed time,
editable rooms/invigilators only) into an editable exam timetable: per
paper you choose the **subject**, **date**, **start time**, and
**duration** (end time computed), plus **add/remove** paper rows. Clash
detection becomes time-aware and also flags duplicate subjects. The
datesheet persists per exam in app state. Frontend-only.

## 1. Type (`src/types/index.ts`)

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

## 2. Pure logic (`src/lib/examData.ts`)

```ts
export function endTime(start: string, duration: number): string
```
Parse `start` "HH:MM" to minutes, add `duration`, clamp to `[0, 1439]`
(same-day), format back to "HH:MM" zero-padded. Invalid/blank `start`
returns `start` unchanged.

```ts
export function findClashes(slots: PaperSlot[]): string[]
```
Returns human-readable messages (empty array = clean) for:

- **Invigilator overlap** — the same non-empty invigilator (`inv1` or
  `inv2`) appears in two slots whose date is equal and whose
  `[start, end)` minute ranges overlap (`aStart < bEnd && bStart < aEnd`).
  Message: ``Invigilator <name> — overlapping slots on <date>``.
- **Room overlap** — the same non-empty `room` used by two slots that
  overlap (same rule). Message: ``Room <room> — double-booked on <date>``.
- **Duplicate subject** — the same non-empty `subject` allocated to two
  slots. Message: ``Subject <subject> — allocated to two papers``.

Each distinct conflict is reported once (dedupe by message).

## 3. State (`src/context/AppProvider.tsx`)

Mirror the exam-state pattern:

```ts
const [datesheets, setDatesheets] = useState<Record<string, PaperSlot[]>>({})
const saveDatesheet = (examId: string, slots: PaperSlot[]) =>
  setDatesheets((m) => ({ ...m, [examId]: slots }))
```

Add `datesheets: Record<string, PaperSlot[]>` and
`saveDatesheet: (examId: string, slots: PaperSlot[]) => void` to the
`AppState` interface and the provided `value`.

## 4. DatesheetDrawer (`src/screens/school/exams.tsx`)

Replace the current `rooms`/`inv1`/`inv2` record state and the
seed/clash logic with a single `slots: PaperSlot[]` state.

- **Seed** (on exam change): if `app.datesheets[exam.id]` exists, use it;
  else build defaults from the existing `buildPapers(exam)` mapped to
  `PaperSlot`: `subject` from the paper, `date` from the paper,
  `start: '09:30'`, `duration: 180`, `room: 'Hall ' + (i+1)`,
  `inv1`/`inv2` from the existing `TEACHER_POOL` defaults.
- **Per-paper row controls** (replacing the fixed Room/Inv1/Inv2 grid):
  - `subject` — `Select` over the `subjects` list.
  - `date` — `Input type="date"`.
  - `start` — `Input type="time"`.
  - `duration` — `Input type="number"` (minutes); the computed
    **end time** (`endTime(start, duration)`) is shown read-only beside it.
  - `room` — `Input` (as today).
  - `inv1`, `inv2` — `Select` over `['', ...TEACHER_POOL]` (as today).
  - a remove (×) `Btn` that drops the row.
- **Add paper**: a `Btn` that appends a new `PaperSlot` with a fresh `id`
  (max existing id + 1), the first not-yet-used subject (or `subjects[0]`),
  the last row's date, `start: '09:30'`, `duration: 180`, empty room/invs.
- **Clashes**: `const clashes = findClashes(slots)` (memoized on `slots`).
  The banner shows when `clashes.length > 0` and lists each message.
- **Actions** (footer):
  - **Save datesheet** — visible when `can(app.role, 'exams', 'E')`;
    `app.saveDatesheet(exam.id, slots)` + success toast; disabled when
    `clashes.length > 0`.
  - **Publish datesheet** — visible when `can(app.role, 'exams', 'A')`
    (unchanged gate); persists via `saveDatesheet` then the existing
    "sent to staff & parents" toast; disabled when `clashes.length > 0`.
  - The footer status line shows `${clashes.length} clash(es) to resolve`
    or `No clashes`.

The drawer keeps its title/sub and the per-paper card layout; only the
field set and the clash source change.

## 5. Testing

- **`src/lib/examData.test.ts`** (additions):
  - `endTime('09:30', 180) === '12:30'`; clamps when start+duration
    exceeds the day; returns input unchanged for blank start.
  - `findClashes`: invigilator overlap on the same date returns a
    message; non-overlapping times or different dates return none; room
    double-booking flagged; duplicate subject flagged; a clean slate
    returns `[]`.
- **`src/screens/school/examsFlow.test.tsx`** (one added case): open a
  datesheet (click an exam row), set two papers to the same subject (or
  overlapping invigilator), and assert a clash message appears and the
  Publish/Save button is disabled.

## Out of scope (YAGNI)

- The exam record's own `from`/`to` date range (unchanged).
- Recurring or multi-session papers, seating plans, per-student halls.
- Cross-exam clash detection (only within a single exam's datesheet).
