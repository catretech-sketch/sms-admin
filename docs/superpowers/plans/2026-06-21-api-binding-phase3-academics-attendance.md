# School Admin API Binding — Phase 3: Academics + Attendance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the cleanly-bindable academics + attendance surfaces to the live API — classes (`GET/POST /classes`), subjects (`GET/POST /subjects`), and attendance submit (`POST /classes/{classId}/attendance`) — with **no UI/markup changes**. Synthetic / no-endpoint surfaces (timetable builder, bell-schedule periods, homework, class tests, attendance status pre-fill, geo-fence, class-teacher assign) stay local and are flagged for the Phase 6 "Demo data" pass.

**Architecture:** Add `src/api/classes.ts`, `src/api/subjects.ts`, `src/api/attendance.ts` resource modules + React Query hooks. The classes list (currently the computed string list `grades.slice(8).flatMap(...)` used in both academics and attendance) and the subjects list (currently the static `subjects` string array) become hook-driven. The Add Class / Add Subject actions become create mutations with list invalidation. The attendance subject-wise "Submit attendance" button (currently toast-only) POSTs the marked statuses.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`.

## Global Constraints

- **No UI/markup changes.** Only data sources swap and toast-only actions become real calls (keeping their existing toasts/navigation). JSX/classNames unchanged.
- **Wire is snake_case both ways**; list envelope `{ data, next_cursor }`, single/mutation `{ data }`.
- **Renames:** `teacher_id↔teacherId` (Class) — handled by generic `snakeToCamel`/`camelToSnake`. No other special renames this phase.
- **Bind only clean endpoints.** Classes list+create, subjects list+create, attendance submit. Everything else on these screens stays local mock (flagged Phase 6): timetable grids, periods/bell schedule, homework, class tests, attendance status pre-fill + bulk roster + correction + geo-fence, and class-teacher **assign** (no PATCH /classes endpoint in the spec).
- **Class shape:** `SchoolClass = { name, grade, section, teacherId, students, room }` (matches the screen's local `ClassRow`), defined in `src/api/classes.ts`.
- **Subjects** are names (`string[]`) in the UI; the module returns `string[]` and create takes a name.
- Tests stay green (`npm test`); `npm run typecheck` + `npm run build` pass each task. `noUnusedLocals` on.
- Screens that gain a hook need their tests wrapped in `QueryClientProvider` (`academicsTests.test.tsx`, `timetableViews.test.tsx` currently are NOT).
- Follow the shipped `students.ts`/`useStudentMutations.ts` pattern.

---

### Task 1: Classes + Subjects resource modules

**Files:**
- Create: `src/api/classes.ts`, `src/api/classes.test.ts`
- Create: `src/api/subjects.ts`, `src/api/subjects.test.ts`

**Interfaces:**
- Produces: `SchoolClass` type; `listClasses(): Promise<SchoolClass[]>`, `createClass(c: SchoolClass): Promise<SchoolClass>`; `listSubjects(): Promise<string[]>`, `createSubject(name: string): Promise<string>`.

- [ ] **Step 1: Write the failing classes test**

Create `src/api/classes.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listClasses, createClass } from './classes'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listClasses', () => {
  it('maps teacher_id -> teacherId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'X-A', grade: 'X', section: 'A', teacher_id: 'T1', students: 40, room: 'R1' }], next_cursor: null })))
    const rows = await listClasses()
    expect(rows[0]).toEqual({ name: 'X-A', grade: 'X', section: 'A', teacherId: 'T1', students: 40, room: 'R1' })
  })
})

describe('createClass', () => {
  it('POSTs /classes with teacherId -> teacher_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { name: 'X-B', grade: 'X', section: 'B', teacher_id: '', students: 0, room: 'R2' } }))
    vi.stubGlobal('fetch', fetchMock)
    await createClass({ name: 'X-B', grade: 'X', section: 'B', teacherId: '', students: 0, room: 'R2' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/classes')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.teacher_id).toBe('')
    expect(body.teacherId).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it (FAIL), then implement classes**

Run: `npx vitest run src/api/classes.test.ts` → FAIL.

Create `src/api/classes.ts`:
```ts
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

export interface SchoolClass {
  name: string
  grade: string
  section: string
  teacherId: string
  students: number
  room: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listClasses(): Promise<SchoolClass[]> {
  const env = await listRequest<ListEnvelope>('/classes')
  return env.data.map((c) => snakeToCamel<SchoolClass>(c))
}

export async function createClass(c: SchoolClass): Promise<SchoolClass> {
  const wire = await request<Record<string, unknown>>('/classes', { method: 'POST', body: camelToSnake(c) })
  return snakeToCamel<SchoolClass>(wire)
}
```

- [ ] **Step 3: Run it (PASS), then write the failing subjects test**

Run: `npx vitest run src/api/classes.test.ts` → PASS.

Create `src/api/subjects.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listSubjects, createSubject } from './subjects'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listSubjects', () => {
  it('returns the subject names from {data:[{name}]}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'English' }, { name: 'Science' }], next_cursor: null })))
    expect(await listSubjects()).toEqual(['English', 'Science'])
  })
})

describe('createSubject', () => {
  it('POSTs /subjects with {name} and returns the created name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { name: 'Music' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await createSubject('Music')).toBe('Music')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/subjects')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Music' })
  })
})
```

- [ ] **Step 4: Run it (FAIL), then implement subjects**

Run: `npx vitest run src/api/subjects.test.ts` → FAIL.

Create `src/api/subjects.ts`:
```ts
import { request, listRequest } from './client'

interface ListEnvelope { data: { name: string }[]; next_cursor: string | null }

export async function listSubjects(): Promise<string[]> {
  const env = await listRequest<ListEnvelope>('/subjects')
  return env.data.map((s) => s.name)
}

export async function createSubject(name: string): Promise<string> {
  const created = await request<{ name: string }>('/subjects', { method: 'POST', body: { name } })
  return created.name
}
```

- [ ] **Step 5: Run it (PASS), typecheck, commit**

Run: `npx vitest run src/api/subjects.test.ts` → PASS. Then `npm run typecheck` → PASS.
```bash
git add src/api/classes.ts src/api/classes.test.ts src/api/subjects.ts src/api/subjects.test.ts
git commit -m "feat(api): classes + subjects resource modules (list/create)"
```

---

### Task 2: Classes + Subjects hooks

**Files:**
- Modify: `src/api/queryKeys.ts` (add `classes`, `subjects` groups)
- Create: `src/api/hooks/useClasses.ts` (`useClasses`, `useCreateClass`)
- Create: `src/api/hooks/useSubjects.ts` (`useSubjects`, `useCreateSubject`)
- Create: `src/api/hooks/useAcademics.test.tsx`

**Interfaces:**
- Produces: `queryKeys.classes.all`, `queryKeys.subjects.all`; `useClasses()`, `useCreateClass()`, `useSubjects()`, `useCreateSubject()`.

- [ ] **Step 1: Extend the query-key factory**

In `src/api/queryKeys.ts`, add beside the existing groups:
```ts
  classes: { all: ['classes'] as const },
  subjects: { all: ['subjects'] as const },
```

- [ ] **Step 2: Write the failing hook test**

Create `src/api/hooks/useAcademics.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useClasses, useCreateClass } from './useClasses'
import { useSubjects } from './useSubjects'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }
function wrap(qc: QueryClient) { return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useClasses', () => {
  it('resolves mapped classes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'X-A', grade: 'X', section: 'A', teacher_id: 'T1', students: 40, room: 'R1' }], next_cursor: null })))
    const { result } = renderHook(() => useClasses(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ name: 'X-A', teacherId: 'T1' })
  })
})

describe('useCreateClass', () => {
  it('POSTs and invalidates classes', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { name: 'X-B', grade: 'X', section: 'B', teacher_id: '', students: 0, room: 'R2' } })))
    const { result } = renderHook(() => useCreateClass(), { wrapper: wrap(qc) })
    result.current.mutate({ name: 'X-B', grade: 'X', section: 'B', teacherId: '', students: 0, room: 'R2' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['classes'] })
  })
})

describe('useSubjects', () => {
  it('resolves subject names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ name: 'English' }], next_cursor: null })))
    const { result } = renderHook(() => useSubjects(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['English'])
  })
})
```

- [ ] **Step 3: Run it (FAIL), then implement the hooks**

Run: `npx vitest run src/api/hooks/useAcademics.test.tsx` → FAIL.

Create `src/api/hooks/useClasses.ts`:
```ts
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listClasses, createClass, type SchoolClass } from '../classes'
import { queryKeys } from '../queryKeys'

export function useClasses(): UseQueryResult<SchoolClass[]> {
  return useQuery({ queryKey: queryKeys.classes.all, queryFn: () => listClasses() })
}

export function useCreateClass(): UseMutationResult<SchoolClass, Error, SchoolClass> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: SchoolClass) => createClass(c),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.classes.all }) },
  })
}
```

Create `src/api/hooks/useSubjects.ts`:
```ts
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listSubjects, createSubject } from '../subjects'
import { queryKeys } from '../queryKeys'

export function useSubjects(): UseQueryResult<string[]> {
  return useQuery({ queryKey: queryKeys.subjects.all, queryFn: () => listSubjects() })
}

export function useCreateSubject(): UseMutationResult<string, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createSubject(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.subjects.all }) },
  })
}
```

- [ ] **Step 4: Run it (PASS), typecheck, commit**

Run: `npx vitest run src/api/hooks/useAcademics.test.tsx` → PASS. Then `npm run typecheck` → PASS.
```bash
git add src/api/queryKeys.ts src/api/hooks/useClasses.ts src/api/hooks/useSubjects.ts src/api/hooks/useAcademics.test.tsx
git commit -m "feat(api): classes/subjects query keys + useClasses/useSubjects (+create) hooks"
```

---

### Task 3: Attendance submit module + hook

**Files:**
- Create: `src/api/attendance.ts`, `src/api/attendance.test.ts`
- Create: `src/api/hooks/useAttendance.ts`
- Modify: `src/api/queryKeys.ts` (add `attendance` group)
- Create: `src/api/hooks/useAttendance.test.tsx`

**Interfaces:**
- Produces: `AttendanceMark = { studentId: string; status: 'present' | 'late' | 'absent' }`; `saveAttendance(classId: string, period: number, marks: AttendanceMark[]): Promise<void>`; `queryKeys.attendance.forClass(classId)`; `useSaveAttendance(): UseMutationResult<void, Error, { classId: string; period: number; marks: AttendanceMark[] }>`.

- [ ] **Step 1: Write the failing module test**

Create `src/api/attendance.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveAttendance } from './attendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('saveAttendance', () => {
  it('POSTs /classes/{classId}/attendance with period + snake_case marks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await saveAttendance('X-A', 3, [{ studentId: 's1', status: 'present' }, { studentId: 's2', status: 'absent' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/classes/X-A/attendance')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.period).toBe(3)
    expect(body.marks).toEqual([{ student_id: 's1', status: 'present' }, { student_id: 's2', status: 'absent' }])
  })
})
```

- [ ] **Step 2: Run it (FAIL), then implement**

Run: `npx vitest run src/api/attendance.test.ts` → FAIL.

Create `src/api/attendance.ts`:
```ts
import { request } from './client'

export interface AttendanceMark { studentId: string; status: 'present' | 'late' | 'absent' }

export async function saveAttendance(classId: string, period: number, marks: AttendanceMark[]): Promise<void> {
  await request<unknown>(`/classes/${classId}/attendance`, {
    method: 'POST',
    body: { period, marks: marks.map((m) => ({ student_id: m.studentId, status: m.status })) },
  })
}
```

- [ ] **Step 3: Run it (PASS), then write the failing hook test**

Run: `npx vitest run src/api/attendance.test.ts` → PASS.

In `src/api/queryKeys.ts`, add:
```ts
  attendance: { forClass: (classId: string) => ['attendance', classId] as const },
```

Create `src/api/hooks/useAttendance.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSaveAttendance } from './useAttendance'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useSaveAttendance', () => {
  it('POSTs and invalidates the class attendance', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: {} })))
    const { result } = renderHook(() => useSaveAttendance(), { wrapper })
    result.current.mutate({ classId: 'X-A', period: 1, marks: [{ studentId: 's1', status: 'present' }] })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['attendance', 'X-A'] })
  })
})
```

- [ ] **Step 4: Run it (FAIL), then implement the hook**

Run: `npx vitest run src/api/hooks/useAttendance.test.tsx` → FAIL.

Create `src/api/hooks/useAttendance.ts`:
```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { saveAttendance, type AttendanceMark } from '../attendance'
import { queryKeys } from '../queryKeys'

export function useSaveAttendance(): UseMutationResult<void, Error, { classId: string; period: number; marks: AttendanceMark[] }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, period, marks }: { classId: string; period: number; marks: AttendanceMark[] }) => saveAttendance(classId, period, marks),
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: queryKeys.attendance.forClass(vars.classId) }) },
  })
}
```

- [ ] **Step 5: Run it (PASS), typecheck, commit**

Run: `npx vitest run src/api/hooks/useAttendance.test.tsx` → PASS. Then `npm run typecheck` → PASS.
```bash
git add src/api/attendance.ts src/api/attendance.test.ts src/api/hooks/useAttendance.ts src/api/hooks/useAttendance.test.tsx src/api/queryKeys.ts
git commit -m "feat(api): attendance submit module + useSaveAttendance hook"
```

---

### Task 4: Wire academics Classes + Subjects tabs

**Files:**
- Modify: `src/screens/school/academics.tsx`
- Modify: `src/screens/school/academicsTests.test.tsx` (add QueryClientProvider)
- Modify: `src/screens/school/timetableViews.test.tsx` (add QueryClientProvider)

**Interfaces:**
- Consumes: `useClasses`, `useCreateClass` from `@/api/hooks/useClasses`; `useSubjects`, `useCreateSubject` from `@/api/hooks/useSubjects`.

- [ ] **Step 1: Wrap the two academics tests in QueryClientProvider first**

In `src/screens/school/academicsTests.test.tsx` and `src/screens/school/timetableViews.test.tsx`, import `{ QueryClient, QueryClientProvider } from '@tanstack/react-query'`, create a fresh `new QueryClient({ defaultOptions: { queries: { retry: false } } })` in the render helper, and wrap the existing `<AppProvider>...</AppProvider>` tree with `<QueryClientProvider client={qc}>`. Also `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], next_cursor: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })))` in a `beforeEach` so the new hooks resolve to empty lists during these tests (they assert on seeded local homework/tests, not classes/subjects). Read each file first; preserve all existing assertions.

- [ ] **Step 2: Run them to confirm they still pass (provider added, behavior unchanged)**

Run: `npx vitest run src/screens/school/academicsTests.test.tsx src/screens/school/timetableViews.test.tsx`
Expected: PASS (the wrap is inert until Step 3 adds the hooks; this de-risks the provider change separately).

- [ ] **Step 3: Wire `ClassesTab`**

In `src/screens/school/academics.tsx`:
- Add imports: `import { useClasses, useCreateClass } from '@/api/hooks/useClasses'` and `import { useSubjects, useCreateSubject } from '@/api/hooks/useSubjects'`.
- In `ClassesTab`, replace the local seeded rows state with the query, and route `addClass` through the mutation. Concretely: replace the `useMemo` `initial` + `const [rows, setRows] = useState<ClassRow[]>(initial)` with:
  ```tsx
  const { data: classesData } = useClasses()
  const rows = classesData ?? []
  const createClass = useCreateClass()
  ```
  Replace the `addClass` body's `setRows(...)` + toast with:
  ```tsx
  createClass.mutate(
    { name, grade: aGrade, section: aSec, teacherId: '', students: 0, room: aRoom.trim() || '—' },
    {
      onSuccess: () => { toast.success('Class added', `${name} created.`); setAddOpen(false); setARoom('') },
      onError: (err) => { toast.danger('Could not add class', err instanceof Error ? err.message : 'Please try again.') },
    },
  )
  ```
  The class-teacher `assign()` has no endpoint — leave it as a toast-only action but drop its `setRows` mutation (rows are now read-only query data): replace its `setRows(...)` line with nothing, keeping only the toast. (Assign-persistence is a Phase 6 gap.)

- [ ] **Step 4: Wire `SubjectsTab`**

In `SubjectsTab`, replace `const [list, setList] = useState<string[]>(subjects)` with:
```tsx
  const { data: subjectsData } = useSubjects()
  const list = subjectsData ?? []
  const createSubject = useCreateSubject()
```
Replace the `add()` body's `setList(...)` + toast with:
```tsx
  createSubject.mutate(n, {
    onSuccess: () => { toast.success('Subject added', `${n} created.`); setName(''); setOpen(false) },
    onError: (err) => { toast.danger('Could not add subject', err instanceof Error ? err.message : 'Please try again.') },
  })
```
(Keep the existing duplicate/empty validation guards above it. Remove the now-unused `subjects` import if nothing else in the file uses it — check first; `subjects` may still be referenced by other tabs, in which case keep the import.)

- [ ] **Step 5: Typecheck, run the academics tests, commit**

Run: `npm run typecheck` → PASS. Then `npx vitest run src/screens/school/academicsTests.test.tsx src/screens/school/timetableViews.test.tsx` → PASS.
```bash
git add src/screens/school/academics.tsx src/screens/school/academicsTests.test.tsx src/screens/school/timetableViews.test.tsx
git commit -m "feat(academics): bind Classes + Subjects tabs to live API (no UI change)"
```

---

### Task 5: Wire attendance class list + submit + final verification

**Files:**
- Modify: `src/screens/school/attendance.tsx`

**Interfaces:**
- Consumes: `useClasses` from `@/api/hooks/useClasses`; `useSaveAttendance` from `@/api/hooks/useAttendance`.

- [ ] **Step 1: Bind the class list**

In `src/screens/school/attendance.tsx`:
- Add: `import { useClasses } from '@/api/hooks/useClasses'` and `import { useSaveAttendance } from '@/api/hooks/useAttendance'`.
- Where the component derives `const classList = grades.slice(8).flatMap((g) => sections.map((s) => \`${g}-${s}\`))`, source it from the hook instead — keeping the `string[]` shape the dropdowns expect:
  ```tsx
  const { data: classesData } = useClasses()
  const classList = (classesData ?? []).map((c) => c.name)
  ```
  (If `classList` is computed at module scope rather than inside a component, move it inside the component that renders the class dropdown — it must be inside a component to call the hook. Read the file to find which component owns the dropdown; the `SubjectWise` component is the one with the Submit button.)

- [ ] **Step 2: Wire the Submit button to a real POST**

In the `SubjectWise` component (which holds the `marks` state and the "Submit attendance" button), add `const saveAttendance = useSaveAttendance()`. Replace the Submit button's `onClick={() => toast.success('Attendance submitted', ...)}` with a handler that POSTs the marked roster then toasts:
```tsx
onClick={() => {
  const payload = roster.map((r) => ({ studentId: r.id, status: marks[markKey(r.id)] ?? 'present' as const }))
  saveAttendance.mutate(
    { classId: cls, period: slot.period, marks: payload },
    {
      onSuccess: () => { toast.success('Attendance submitted', `${cls} · P${slot.period} ${slot.subject} · ${presentCount}/${roster.length} present`) },
      onError: (err) => { toast.danger('Could not submit', err instanceof Error ? err.message : 'Please try again.') },
    },
  )
}}
```
(Use the same `markKey`/`roster`/`presentCount`/`slot` identifiers already in scope — read the file to confirm their exact names. Keep the existing `disabled={!editable}` and all JSX/classNames. The status pre-fill, bulk Roster hash view, correction, and geo-fence remain local demo behavior — Phase 6 flag.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — both hooks consumed; `classList` now hook-derived.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — `registry.test.tsx` (renders attendance + academics) has a `QueryClient`; the academics tests were wrapped in Task 4; the attendance screen renders under `<App/>`'s provider and `registry`'s wrapper. Unmocked fetch leaves `classList` empty (dropdowns show no classes) without throwing.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/attendance.tsx
git commit -m "feat(attendance): bind class list + submit attendance to live API (no UI change)"
```

---

## Phase 3 done — what was bound vs flagged

Bound: classes list + create (academics Classes tab), subjects list + create (academics Subjects tab), the class-list dropdowns (academics/attendance) via `useClasses`, and the attendance subject-wise Submit (`POST /classes/{classId}/attendance`).

Flagged for Phase 6 "Demo data" (no endpoint / synthetic): timetable builder grids, periods/bell schedule, homework, class tests, attendance status pre-fill + bulk roster hash + correction + geo-fence, and class-teacher assign (no PATCH /classes in the spec).

Remaining: **Phase 4** exams + exam-papers + grades; **Phase 5** finance + comms; **Phase 6** gap-flagging + AppProvider seed cleanup.

## Self-Review notes

- **Spec coverage (design §4 rows academics/attendance + §8.3):** `GET/POST /classes` (Tasks 1,2,4,5), `GET/POST /subjects` (Tasks 1,2,4), `POST /classes/{classId}/attendance` + `GET /classes` for attendance (Tasks 3,5). Timetable/periods/homework explicitly flagged as gaps per spec §4 ("timetable builder, periods, homework → gap (mock-flag)").
- **Type consistency:** `SchoolClass` is defined once in `classes.ts` and flows through `useClasses`/`useCreateClass` and both screens. `AttendanceMark` is defined once in `attendance.ts`. Subjects are `string[]` end to end. Query keys (`classes.all`, `subjects.all`, `attendance.forClass`) match the hook usage and test assertions.
- **No-UI-change:** screen edits swap data sources and turn toast-only actions into real calls that keep their existing toasts; no JSX/className changes. Class-teacher assign loses only its (never-persisted) local row mutation — flagged.
- **Inference flagged:** `/classes` and `/subjects` response shapes and the attendance POST body follow the spec's snake_case contract; `SchoolClass` mirrors the screen's local `ClassRow`. No running backend consulted.
- **Provider-in-tests:** `academicsTests.test.tsx` and `timetableViews.test.tsx` gain a `QueryClientProvider` (Task 4 Step 1, de-risked separately before the hooks land).
