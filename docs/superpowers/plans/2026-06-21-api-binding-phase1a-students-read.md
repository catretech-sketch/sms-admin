# School Admin API Binding — Phase 1a: Students Read-Binding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the Students (SIS) list and the Student 360 profile to the live School Admin API (`GET /students`, `GET /students/{id}`) with **zero UI/markup changes** — the first read-only vertical slice of Phase 1.

**Architecture:** Add a `src/api/students.ts` resource module that calls the Phase-0 `request`/`listRequest` client and maps the snake_case wire to the camelCase UI `Student` shape (generic `snakeToCamel` + two field renames). Wrap it in React Query hooks (`useStudents`, `useStudent`) keyed through a central `queryKeys` factory. Swap the two SIS screens from `app.students` to the hooks — provider seed state is left untouched so every other screen keeps working on mock (full provider migration is a later phase).

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`.

## Global Constraints

- **No UI/markup changes.** Only the data source swaps. SIS list, toppers, and Student 360 JSX/classNames stay byte-identical except the one-line data-source reads.
- **Wire is snake_case**; list envelope is `{ data: [...], next_cursor: string|null }`, single is `{ data: {...} }`.
- **Per-resource renames (this slice):** `admission_no↔adm`, `class_label↔cls`. Generic `snakeToCamel` already covers `fee_status→feeStatus`, `fee_due→feeDue`, `avatar_hue→avatarHue`.
- **Read-only.** No POST/PATCH and no reverse (camel→snake) mapper this slice — YAGNI until Phase 2 mutations.
- **Scope = students only.** Teachers, staff, approvals, notifications, dashboard counts are later Phase 1 plans.
- Tests must stay green (`npm test`) and `npm run build` + `npm run typecheck` must pass at each task's end.
- No new runtime deps (`@tanstack/react-query` already added in Phase 0).
- Hooks live in `src/api/hooks/`; cache keys come only from `src/api/queryKeys.ts`.

---

### Task 1: Students resource module (`students.ts`)

**Files:**
- Create: `src/api/students.ts`
- Create: `src/api/students.test.ts`

**Interfaces:**
- Consumes: `request`, `listRequest` from `./client`; `snakeToCamel` from `./mapper`; `Student`, `ListStudentsOpts` from `@/types`.
- Produces: `toStudent(wire: Record<string, unknown>): Student`, `listStudents(opts?: ListStudentsOpts): Promise<Student[]>`, `getStudent(id: string): Promise<Student>`.

- [ ] **Step 1: Write the failing test**

Create `src/api/students.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listStudents, getStudent } from './students'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireStudent = {
  id: 's1', admission_no: 'A-100', name: 'Asha', gender: 'F', grade: '10', section: 'A',
  class_label: '10-A', roll: 3, guardian: 'Ravi', phone: '99', attendance: 92,
  fee_status: 'paid', fee_due: 0, status: 'active', house: 'Blue', avatar_hue: 210,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listStudents', () => {
  it('maps the snake_case wire to the camelCase Student shape (adm/cls renamed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireStudent], next_cursor: null })))
    const rows = await listStudents()
    expect(rows[0]).toMatchObject({
      id: 's1', adm: 'A-100', cls: '10-A', name: 'Asha',
      feeStatus: 'paid', feeDue: 0, avatarHue: 210,
    })
    expect((rows[0] as Record<string, unknown>).admission_no).toBeUndefined()
    expect((rows[0] as Record<string, unknown>).class_label).toBeUndefined()
  })

  it('forwards q/grade/status/fee as query params and drops "all"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listStudents({ q: 'asha', grade: '10', status: 'active', fee: 'paid' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('q=asha')
    expect(url).toContain('grade=10')
    expect(url).toContain('status=active')
    expect(url).toContain('fee=paid')

    fetchMock.mockClear()
    await listStudents({ grade: 'all', status: 'all', fee: 'all' })
    const url2 = fetchMock.mock.calls[0][0] as string
    expect(url2).not.toContain('grade=')
    expect(url2).not.toContain('status=')
    expect(url2).not.toContain('fee=')
  })
})

describe('getStudent', () => {
  it('maps a single record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { ...wireStudent, id: 's2', admission_no: 'A-200', class_label: '9-B', fee_status: 'due', fee_due: 1200 } })))
    const s = await getStudent('s2')
    expect(s).toMatchObject({ id: 's2', adm: 'A-200', cls: '9-B', feeStatus: 'due', feeDue: 1200 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/students.test.ts`
Expected: FAIL — cannot find module `./students`.

- [ ] **Step 3: Implement the resource module**

Create `src/api/students.ts`:
```ts
import { request, listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Student, ListStudentsOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Map one wire record (snake_case) to the UI `Student` shape.
 *  Generic casing covers fee_status/fee_due/avatar_hue; only adm/cls are renamed. */
export function toStudent(wire: Record<string, unknown>): Student {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { admissionNo, classLabel, ...rest } = c
  return { ...rest, adm: admissionNo, cls: classLabel } as unknown as Student
}

export async function listStudents(opts: ListStudentsOpts = {}): Promise<Student[]> {
  const query: Record<string, string | undefined> = {}
  if (opts.q) query.q = opts.q
  if (opts.grade && opts.grade !== 'all') query.grade = opts.grade
  if (opts.status && opts.status !== 'all') query.status = opts.status
  if (opts.fee && opts.fee !== 'all') query.fee = opts.fee
  // next_cursor is read forward-compatibly but a single page is returned today.
  const env = await listRequest<ListEnvelope>('/students', { query })
  return env.data.map(toStudent)
}

export async function getStudent(id: string): Promise<Student> {
  const wire = await request<Record<string, unknown>>(`/students/${id}`)
  return toStudent(wire)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/students.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/api/students.ts src/api/students.test.ts
git commit -m "feat(api): students resource module (list/get, snake->camel + adm/cls rename)"
```

---

### Task 2: Query keys + React Query hooks

**Files:**
- Create: `src/api/queryKeys.ts`
- Create: `src/api/hooks/useStudents.ts`
- Create: `src/api/hooks/useStudents.test.tsx`

**Interfaces:**
- Consumes: `listStudents`, `getStudent` from `../students`; `ListStudentsOpts` from `@/types`; `useQuery` from `@tanstack/react-query`.
- Produces: `queryKeys.students.{all, list(opts), detail(id)}`; `useStudents(opts?): UseQueryResult<Student[]>`; `useStudent(id: string | null): UseQueryResult<Student>`.

- [ ] **Step 1: Create the query-key factory (no test — pure data)**

Create `src/api/queryKeys.ts`:
```ts
import type { ListStudentsOpts } from '@/types'

export const queryKeys = {
  students: {
    all: ['students'] as const,
    list: (opts: ListStudentsOpts = {}) => ['students', 'list', opts] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
  },
}
```

- [ ] **Step 2: Write the failing hook test**

Create `src/api/hooks/useStudents.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useStudents, useStudent } from './useStudents'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const wireStudent = {
  id: 's1', admission_no: 'A-100', name: 'Asha', gender: 'F', grade: '10', section: 'A',
  class_label: '10-A', roll: 3, guardian: 'Ravi', phone: '99', attendance: 92,
  fee_status: 'paid', fee_due: 0, status: 'active', house: 'Blue', avatar_hue: 210,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useStudents', () => {
  it('resolves mapped rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireStudent], next_cursor: null })))
    const { result } = renderHook(() => useStudents(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ adm: 'A-100', cls: '10-A' })
  })
})

describe('useStudent', () => {
  it('is disabled without an id and never fetches', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useStudent(null), { wrapper: makeWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches and maps a single student when given an id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { ...wireStudent, id: 's2', admission_no: 'A-200', class_label: '9-B', fee_due: 1200, fee_status: 'due' } })))
    const { result } = renderHook(() => useStudent('s2'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ adm: 'A-200', cls: '9-B', feeDue: 1200 })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/api/hooks/useStudents.test.tsx`
Expected: FAIL — cannot find module `./useStudents`.

- [ ] **Step 4: Implement the hooks**

Create `src/api/hooks/useStudents.ts`:
```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listStudents, getStudent } from '../students'
import { queryKeys } from '../queryKeys'
import type { Student, ListStudentsOpts } from '@/types'

export function useStudents(opts: ListStudentsOpts = {}): UseQueryResult<Student[]> {
  return useQuery({
    queryKey: queryKeys.students.list(opts),
    queryFn: () => listStudents(opts),
  })
}

export function useStudent(id: string | null): UseQueryResult<Student> {
  return useQuery({
    queryKey: queryKeys.students.detail(id ?? ''),
    queryFn: () => getStudent(id as string),
    enabled: !!id,
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/api/hooks/useStudents.test.tsx`
Expected: PASS (all 3 cases).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add src/api/queryKeys.ts src/api/hooks/useStudents.ts src/api/hooks/useStudents.test.tsx
git commit -m "feat(api): students query keys + useStudents/useStudent hooks"
```

---

### Task 3: Wire the SIS list (`StudentsScreen`) to `useStudents`

**Files:**
- Modify: `src/screens/school/sis.tsx` (the `StudentsScreen` data source only)
- Modify: `src/screens/school/toppers.test.tsx` (wrap a QueryClient + mock fetch)

**Interfaces:**
- Consumes: `useStudents` from `@/api/hooks/useStudents`.
- Produces: no new exports. `StudentsScreen` now sources its roster from the live API; client-side filtering and toppers logic are unchanged.

- [ ] **Step 1: Update the failing screen test first**

Replace `src/screens/school/toppers.test.tsx` with (wraps a `QueryClient`, stubs `fetch` with a snake_case roster built from the mock seed, and awaits async load):
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { students as seed } from '@/data/mockDb'
import { sisScreens } from './sis'
import type { Student } from '@/types'

const StudentsScreen = sisScreens['school.sis']

function toWire(s: Student) {
  return {
    id: s.id, admission_no: s.adm, name: s.name, gender: s.gender, grade: s.grade,
    section: s.section, class_label: s.cls, roll: s.roll, guardian: s.guardian, phone: s.phone,
    attendance: s.attendance, fee_status: s.feeStatus, fee_due: s.feeDue, status: s.status,
    house: s.house, avatar_hue: s.avatarHue,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: seed.map(toWire), next_cursor: null })))
})

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <StudentsScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

describe('Students Toppers view', () => {
  it('defaults to the All students list', () => {
    renderScreen()
    expect(screen.getByPlaceholderText(/Search name/i)).toBeInTheDocument()
  })

  it('switches to the Toppers leaderboard and class cards', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    expect(await screen.findByText('Overall toppers')).toBeInTheDocument()
    expect(screen.getAllByText(/^Class /).length).toBeGreaterThan(0)
  })

  it('switches the category to Attendance toppers', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    await screen.findByText('Overall toppers')
    fireEvent.click(screen.getByText('Attendance toppers'))
    expect(await screen.findByText('Attendance %')).toBeInTheDocument()
  })

  it('returns to the list when All students is reselected', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    await screen.findByText('Overall toppers')
    fireEvent.click(screen.getByText('All students'))
    expect(screen.getByPlaceholderText(/Search name/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/toppers.test.tsx`
Expected: FAIL — `StudentsScreen` still reads `app.students`; with mocked fetch unused, the toppers assertions race the (still-synchronous mock) data, and/or the new QueryClient wrapper is unused. (This test now drives the hook wiring.)

- [ ] **Step 3: Add the hook import**

In `src/screens/school/sis.tsx`, add to the import block near the other `@/` imports:
```tsx
import { useStudents, useStudent } from '@/api/hooks/useStudents'
```
(`useStudent` is consumed in Task 4; importing both here keeps a single edit to the import block.)

- [ ] **Step 4: Swap the SIS roster source**

In the `StudentsScreen` function body, replace:
```tsx
  const editable = canEdit(app.role)
  const students = app.students
```
with:
```tsx
  const editable = canEdit(app.role)
  const { data } = useStudents()
  const students = data ?? []
```
Leave everything else (`rows` useMemo filter, `columns`, `sub`, `ToppersView`, JSX) unchanged.

- [ ] **Step 5: Run the screen test to verify it passes**

Run: `npx vitest run src/screens/school/toppers.test.tsx`
Expected: PASS (all 4 cases).

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/sis.tsx src/screens/school/toppers.test.tsx
git commit -m "feat(students): bind SIS list to live /students via useStudents (no UI change)"
```

---

### Task 4: Wire Student 360 to `useStudent` + full verification

**Files:**
- Modify: `src/screens/school/sis.tsx` (the `Student360` data source only)

**Interfaces:**
- Consumes: `useStudent` from `@/api/hooks/useStudents` (imported in Task 3, Step 3).
- Produces: no new exports. `Student360` identity fields come from `GET /students/{id}`; academics/fees/docs/timeline tabs stay client-derived (grades are a later phase).

- [ ] **Step 1: Swap the Student 360 detail source**

In the `Student360` function body, replace:
```tsx
  const stu = app.students.find((s) => s.id === app.focus) ?? app.students[0]
```
with:
```tsx
  const { data: fetched } = useStudent(app.focus)
  const stu = fetched ?? app.students.find((s) => s.id === app.focus) ?? app.students[0]
```
Leave `reportFor(stu)`, `classRank(stu)`, `attendanceMonths(stu)`, and all JSX unchanged. The mock-seeded `app.students` fallback prevents an undefined dereference while the detail query is loading (provider seed removal is a later phase).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `app.focus` is `string | null`, which matches `useStudent(id: string | null)`.

- [ ] **Step 3: Run the full suite (nothing regressed)**

Run: `npm test`
Expected: PASS — all suites green, including the updated `toppers.test.tsx` and the new `students`/`useStudents` tests.

- [ ] **Step 4: Verify the production build**

Run: `npm run build`
Expected: type-check + Vite build succeed.

- [ ] **Step 5: Commit**

```bash
git add src/screens/school/sis.tsx
git commit -m "feat(students): bind Student 360 identity to live /students/{id} (no UI change)"
```

---

## Phase 1a done — what later phases build on

After Phase 1a: `src/api/students.ts` + `src/api/hooks/useStudents.ts` + `src/api/queryKeys.ts` exist, and the two SIS screens read the live API while every other screen stays on mock. The pattern (`<resource>.ts` with `request`/`listRequest` + `snakeToCamel` + a small rename map → `hooks/useX.ts` → swap the screen's data source) is now established and repeats for the rest of Phase 1:

- **Phase 1b** — teachers, staff (list + people screen).
- **Phase 1c** — approvals list, notifications, dashboard KPI counts (derived from the list hooks).
- **Phase 2+** — mutations (add reverse `camelToSnake` rename maps + `useXMutations`), then the remaining resource phases, ending with the full `AppProvider` seed-removal migration.

## Self-Review notes

- **Spec coverage (Phase 1a slice of design §8.1 "Read-only binds"):** students/SIS list + Student 360 are bound (§4 row `sis`); the seam module + hooks realize §1 (`<resource>.ts`, `hooks/`, `queryKeys.ts`); the `adm/cls` renames realize §3; the test double / mocked-fetch strategy realizes §6. Teachers/staff/approvals/notifications/dashboard are explicitly deferred to Phases 1b/1c above. No reverse mapper (read-only slice).
- **Type consistency:** `toStudent`/`listStudents`/`getStudent` signatures match between `students.ts`, its test, and the hooks. `queryKeys.students.{list,detail}` are used identically in `useStudents.ts`. `useStudent(id: string | null)` matches `app.focus: string | null` from `AppProvider`. `ListStudentsOpts` is the existing `@/types` shape (`q/grade/status/fee`) used by both the module and the screen filter.
- **No placeholders:** every step ships full code or an exact command + expected result.
- **No-UI-change guarantee:** the only edits to `sis.tsx` are three data-source lines (one import, one in `StudentsScreen`, one in `Student360`); no JSX/className changes.
