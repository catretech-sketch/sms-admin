# School Admin API Binding — Phase 1b: Teachers + Staff Read-Binding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the People screen's Teachers and Staff rosters to the live School Admin API (`GET /teachers`, `GET /staff`) with **zero UI/markup changes** — the second read-only slice of Phase 1, mirroring the shipped students binding exactly.

**Architecture:** Add `src/api/teachers.ts` and `src/api/staff.ts` resource modules that call the Phase-0 `listRequest` client and map snake_case→camelCase (generic `snakeToCamel` + a small per-resource rename map). Wrap each in a React Query hook (`useTeachers`, `useStaff`) keyed through the existing `queryKeys` factory. Swap `StaffScreen`/the teachers list in `people.tsx` from `app.teachers`/`app.staff` to the hooks. Provider seed state stays untouched (full provider migration is a later phase).

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`.

## Global Constraints

- **No UI/markup changes.** Only the data source swaps. `people.tsx` JSX/classNames stay byte-identical except the hook reads. The in-screen `TeacherProfile` drawer keeps using the already-fetched teacher object (no per-row detail fetch — there is no `/teachers/{id}` in this slice).
- **Wire is snake_case**; list envelope is `{ data: [...], next_cursor: string|null }`.
- **Per-resource renames (from spec §3):**
  - Teachers: `department→dept`, `designation→desig`, `attendance_pct→attendance`. (`class_teacher→classTeacher`, `date_of_joining→dateOfJoining`, `avatar_hue→avatarHue` are already handled by generic `snakeToCamel`.)
  - Staff: `department→dept`, `category→cat`, `attendance_pct→attendance`. (`date_of_joining→dateOfJoining`, `avatar_hue→avatarHue` handled generically.)
  - All other fields pass through generic `snakeToCamel` unchanged. Fields the wire does not send arrive `undefined` (the UI already treats onboarding-detail fields as optional).
- **Read-only slice.** No POST/PATCH, no reverse (camel→snake) mapper, no detail-fetch hooks — YAGNI until Phase 2.
- **Scope = teachers + staff only.** Approvals, notifications, dashboard counts are later Phase-1 plans.
- Tests must stay green (`npm test`), and `npm run typecheck` + `npm run build` must pass at each task's end. The repo uses `noUnusedLocals` — do not add unused imports.
- Hooks live in `src/api/hooks/`; cache keys come only from `src/api/queryKeys.ts`.
- Follow the shipped students slice (`src/api/students.ts`, `src/api/hooks/useStudents.ts`) as the reference pattern.

---

### Task 1: Teachers resource module (`teachers.ts`)

**Files:**
- Create: `src/api/teachers.ts`
- Create: `src/api/teachers.test.ts`

**Interfaces:**
- Consumes: `listRequest` from `./client`; `snakeToCamel` from `./mapper`; `Teacher`, `ListTeachersOpts` from `@/types`.
- Produces: `toTeacher(wire: Record<string, unknown>): Teacher`, `listTeachers(opts?: ListTeachersOpts): Promise<Teacher[]>`.

- [ ] **Step 1: Write the failing test**

Create `src/api/teachers.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listTeachers } from './teachers'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireTeacher = {
  id: 'T-01', name: 'Meera', gender: 'F', department: 'Science', designation: 'HOD',
  subjects: ['Physics'], class_teacher: '10-A', phone: '99', email: 'm@s.edu', exp: 12,
  rating: 4.6, attendance_pct: 97, result: 88, load: 24, status: 'active', avatar_hue: 180, top: true,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listTeachers', () => {
  it('maps wire snake_case to the camelCase Teacher shape (dept/desig/attendance renamed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireTeacher], next_cursor: null })))
    const rows = await listTeachers()
    expect(rows[0]).toMatchObject({
      id: 'T-01', name: 'Meera', dept: 'Science', desig: 'HOD',
      classTeacher: '10-A', attendance: 97, avatarHue: 180, top: true,
    })
    const raw = rows[0] as Record<string, unknown>
    expect(raw.department).toBeUndefined()
    expect(raw.designation).toBeUndefined()
    expect(raw.attendancePct).toBeUndefined()
  })

  it('forwards q/dept/status as query params and drops "all"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listTeachers({ q: 'meera', dept: 'Science', status: 'active' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('q=meera')
    expect(url).toContain('dept=Science')
    expect(url).toContain('status=active')

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    await listTeachers({ dept: 'all', status: 'all' })
    const url2 = fetchMock.mock.calls[0][0] as string
    expect(url2).not.toContain('dept=')
    expect(url2).not.toContain('status=')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/teachers.test.ts`
Expected: FAIL — cannot find module `./teachers`.

- [ ] **Step 3: Implement**

Create `src/api/teachers.ts`:
```ts
import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Teacher, ListTeachersOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Map one wire record (snake_case) to the UI `Teacher` shape.
 *  Generic casing covers class_teacher/date_of_joining/avatar_hue;
 *  only dept/desig/attendance need an explicit rename. */
export function toTeacher(wire: Record<string, unknown>): Teacher {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { department, designation, attendancePct, ...rest } = c
  return { ...rest, dept: department, desig: designation, attendance: attendancePct } as unknown as Teacher
}

export async function listTeachers(opts: ListTeachersOpts = {}): Promise<Teacher[]> {
  const query: Record<string, string | undefined> = {}
  if (opts.q) query.q = opts.q
  if (opts.dept && opts.dept !== 'all') query.dept = opts.dept
  if (opts.status && opts.status !== 'all') query.status = opts.status
  const env = await listRequest<ListEnvelope>('/teachers', { query })
  return env.data.map(toTeacher)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/teachers.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/teachers.ts src/api/teachers.test.ts
git commit -m "feat(api): teachers resource module (list, snake->camel + dept/desig/attendance rename)"
```

---

### Task 2: Staff resource module (`staff.ts`)

**Files:**
- Create: `src/api/staff.ts`
- Create: `src/api/staff.test.ts`

**Interfaces:**
- Consumes: `listRequest` from `./client`; `snakeToCamel` from `./mapper`; `Staff`, `ListStaffOpts` from `@/types`.
- Produces: `toStaff(wire: Record<string, unknown>): Staff`, `listStaff(opts?: ListStaffOpts): Promise<Staff[]>`.

- [ ] **Step 1: Write the failing test**

Create `src/api/staff.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listStaff } from './staff'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const wireStaff = {
  id: 'S-01', name: 'Ramesh', gender: 'M', role: 'Accountant', category: 'admin',
  department: 'Finance', phone: '88', shift: 'day', route: null, attendance_pct: 95,
  status: 'active', avatar_hue: 30,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listStaff', () => {
  it('maps wire snake_case to the camelCase Staff shape (dept/cat/attendance renamed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireStaff], next_cursor: null })))
    const rows = await listStaff()
    expect(rows[0]).toMatchObject({
      id: 'S-01', name: 'Ramesh', role: 'Accountant', cat: 'admin',
      dept: 'Finance', attendance: 95, avatarHue: 30, route: null,
    })
    const raw = rows[0] as Record<string, unknown>
    expect(raw.category).toBeUndefined()
    expect(raw.department).toBeUndefined()
    expect(raw.attendancePct).toBeUndefined()
  })

  it('forwards q/cat as query params and drops "all"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listStaff({ q: 'ramesh', cat: 'admin' })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('q=ramesh')
    expect(url).toContain('cat=admin')

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    await listStaff({ cat: 'all' })
    const url2 = fetchMock.mock.calls[0][0] as string
    expect(url2).not.toContain('cat=')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/staff.test.ts`
Expected: FAIL — cannot find module `./staff`.

- [ ] **Step 3: Implement**

Create `src/api/staff.ts`:
```ts
import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Staff, ListStaffOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

/** Map one wire record (snake_case) to the UI `Staff` shape.
 *  Generic casing covers date_of_joining/avatar_hue;
 *  only dept/cat/attendance need an explicit rename. */
export function toStaff(wire: Record<string, unknown>): Staff {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { department, category, attendancePct, ...rest } = c
  return { ...rest, dept: department, cat: category, attendance: attendancePct } as unknown as Staff
}

export async function listStaff(opts: ListStaffOpts = {}): Promise<Staff[]> {
  const query: Record<string, string | undefined> = {}
  if (opts.q) query.q = opts.q
  if (opts.cat && opts.cat !== 'all') query.cat = opts.cat
  const env = await listRequest<ListEnvelope>('/staff', { query })
  return env.data.map(toStaff)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/staff.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/staff.ts src/api/staff.test.ts
git commit -m "feat(api): staff resource module (list, snake->camel + dept/cat/attendance rename)"
```

---

### Task 3: Query keys + hooks (`useTeachers`, `useStaff`)

**Files:**
- Modify: `src/api/queryKeys.ts` (add `teachers` and `staff` key groups)
- Create: `src/api/hooks/useTeachers.ts`
- Create: `src/api/hooks/useStaff.ts`
- Create: `src/api/hooks/usePeople.test.tsx`

**Interfaces:**
- Consumes: `listTeachers` from `../teachers`, `listStaff` from `../staff`; `ListTeachersOpts`, `ListStaffOpts` from `@/types`; `useQuery` from `@tanstack/react-query`.
- Produces: `queryKeys.teachers.{all, list(opts)}`, `queryKeys.staff.{all, list(opts)}`; `useTeachers(opts?): UseQueryResult<Teacher[]>`; `useStaff(opts?): UseQueryResult<Staff[]>`.

- [ ] **Step 1: Extend the query-key factory**

In `src/api/queryKeys.ts`, add the two new groups beside `students` (keep `students` unchanged). The file becomes:
```ts
import type { ListStudentsOpts, ListTeachersOpts, ListStaffOpts } from '@/types'

export const queryKeys = {
  students: {
    all: ['students'] as const,
    list: (opts: ListStudentsOpts = {}) => ['students', 'list', opts] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
  },
  teachers: {
    all: ['teachers'] as const,
    list: (opts: ListTeachersOpts = {}) => ['teachers', 'list', opts] as const,
  },
  staff: {
    all: ['staff'] as const,
    list: (opts: ListStaffOpts = {}) => ['staff', 'list', opts] as const,
  },
}
```

- [ ] **Step 2: Write the failing hook test**

Create `src/api/hooks/usePeople.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTeachers } from './useTeachers'
import { useStaff } from './useStaff'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useTeachers', () => {
  it('resolves mapped teacher rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'T1', name: 'Meera', department: 'Science', designation: 'HOD', attendance_pct: 97, avatar_hue: 1, subjects: [], class_teacher: null, phone: '', email: '', exp: 1, rating: 4, result: 80, load: 10, status: 'active', gender: 'F', top: false }], next_cursor: null })))
    const { result } = renderHook(() => useTeachers(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ dept: 'Science', desig: 'HOD', attendance: 97 })
  })
})

describe('useStaff', () => {
  it('resolves mapped staff rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'S1', name: 'Ramesh', role: 'Accountant', category: 'admin', department: 'Finance', attendance_pct: 95, avatar_hue: 2, gender: 'M', phone: '', shift: 'day', route: null, status: 'active' }], next_cursor: null })))
    const { result } = renderHook(() => useStaff(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ cat: 'admin', dept: 'Finance', attendance: 95 })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/api/hooks/usePeople.test.tsx`
Expected: FAIL — cannot find module `./useTeachers`.

- [ ] **Step 4: Implement the hooks**

Create `src/api/hooks/useTeachers.ts`:
```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listTeachers } from '../teachers'
import { queryKeys } from '../queryKeys'
import type { Teacher, ListTeachersOpts } from '@/types'

export function useTeachers(opts: ListTeachersOpts = {}): UseQueryResult<Teacher[]> {
  return useQuery({
    queryKey: queryKeys.teachers.list(opts),
    queryFn: () => listTeachers(opts),
  })
}
```

Create `src/api/hooks/useStaff.ts`:
```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listStaff } from '../staff'
import { queryKeys } from '../queryKeys'
import type { Staff, ListStaffOpts } from '@/types'

export function useStaff(opts: ListStaffOpts = {}): UseQueryResult<Staff[]> {
  return useQuery({
    queryKey: queryKeys.staff.list(opts),
    queryFn: () => listStaff(opts),
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/api/hooks/usePeople.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/queryKeys.ts src/api/hooks/useTeachers.ts src/api/hooks/useStaff.ts src/api/hooks/usePeople.test.tsx
git commit -m "feat(api): teachers/staff query keys + useTeachers/useStaff hooks"
```

---

### Task 4: Wire the People screen + full verification

**Files:**
- Modify: `src/screens/school/people.tsx` (teachers list + `StaffScreen` data sources only)

**Interfaces:**
- Consumes: `useTeachers` from `@/api/hooks/useTeachers`; `useStaff` from `@/api/hooks/useStaff`.
- Produces: no new exports. The teachers list and `StaffScreen` source their rosters from the live API; client-side filtering and the `TeacherProfile` drawer are unchanged.

- [ ] **Step 1: Add the hook imports**

In `src/screens/school/people.tsx`, add near the other `@/` imports:
```tsx
import { useTeachers } from '@/api/hooks/useTeachers'
import { useStaff } from '@/api/hooks/useStaff'
```

- [ ] **Step 2: Swap the teachers roster source**

In the teachers list component, replace:
```tsx
  const teachers = app.teachers
```
with:
```tsx
  const { data: teachersData } = useTeachers()
  const teachers = teachersData ?? []
```
Leave all filtering, columns, `TeacherProfile` drawer, and JSX unchanged.

- [ ] **Step 3: Swap the staff roster source**

In `StaffScreen`, replace:
```tsx
  const roster = app.staff
```
with:
```tsx
  const { data: staffData } = useStaff()
  const roster = staffData ?? []
```
Leave all filtering, columns, and JSX unchanged.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no unused imports, both hooks consumed.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all suites green (the `registry.test.tsx` smoke render already wraps `QueryClientProvider`, so the People screen renders with the hooks; unmocked fetch leaves the query pending and the screen renders `[]`, which does not throw).

- [ ] **Step 6: Verify the production build**

Run: `npm run build`
Expected: type-check + Vite build succeed.

- [ ] **Step 7: Commit**

```bash
git add src/screens/school/people.tsx
git commit -m "feat(people): bind teachers + staff rosters to live API (no UI change)"
```

---

## Phase 1b done — what later phases build on

After Phase 1b: `teachers.ts`/`staff.ts` modules + `useTeachers`/`useStaff` hooks exist and the People screen reads the live API. Remaining Phase-1 read binds:

- **Phase 1c** — approvals list (dashboard `ApprovalsInbox`, currently a direct `mockDb` import, role-filtered) + notifications (Topbar, direct `mockDb` import) + dashboard KPI counts (currently derived from `app.school` scalars with synthetic multipliers — bind the real list counts where an endpoint exists, flag the synthetic figures).

## Self-Review notes

- **Spec coverage (Phase 1b slice of design §8.1 + §4 `people` row):** teachers + staff list binds via `<resource>.ts` (§1), the documented §3 renames (`dept`/`desig`/`cat`/`attendance`), and the §6 mocked-fetch test strategy. Approvals/notifications/dashboard deferred to Phase 1c. No reverse mapper, no detail fetch (read-only; the teacher drawer reuses the list object).
- **Type consistency:** `toTeacher`/`listTeachers` and `toStaff`/`listStaff` signatures match their tests and hooks. `queryKeys.teachers.list`/`queryKeys.staff.list` are used identically in the hooks. `ListTeachersOpts` (`q/dept/status`) and `ListStaffOpts` (`q/cat`) are the existing `@/types` shapes used by both modules and the screen filters.
- **No placeholders:** every step ships full code or an exact command + expected result.
- **No-UI-change guarantee:** edits to `people.tsx` are two imports + two data-source swaps (teachers list + `StaffScreen`); no JSX/className changes.
- **noUnusedLocals guard:** both `useTeachers` and `useStaff` are consumed in the same task they are imported (Task 4), avoiding the unused-import typecheck failure seen in Phase 1a.
