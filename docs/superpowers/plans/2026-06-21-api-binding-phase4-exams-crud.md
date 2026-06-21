# School Admin API Binding — Phase 4: Exams CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the **exam records** to the live API — the exam list (`GET /exams`), creating an exam (`POST /exams`), and updating an exam's lifecycle fields (`PUT /exams/{id}` for status / marksEntered% / published) — with **no UI/markup changes**. The per-student grades model (exam-papers + grades), the marks-entry grid's data, exam attendance, and the datesheet stay on local synthetic state and are **flagged for a later effort** (they require the real backend's exam-papers/grades contract and a sanctioned marks-grid UI pivot).

**Architecture:** Add `src/api/exams.ts` (`toExam`/`fromExam` mappers with the `marksEntered↔marks_entered_pct` rename, `listExams`, `createExam`, `updateExam`) + React Query hooks (`useExams`, `useCreateExam`, `useUpdateExam`). Swap `ExamsListTab` from `app.exams` to `useExams`; route the new-exam create through `useCreateExam`; route every `app.updateExam(...)` lifecycle call through `useUpdateExam`. The marks/attendance/datesheet tabs keep reading/writing `app.examMarks`/`app.examAttendance`/`app.datesheets` (deferred); only the exam **record** is bound. `reportFor`/`classRank` stay client-side.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`.

## Global Constraints

- **No UI/markup changes.** Only the exam-record data source swaps and the create/update persistence calls become real. JSX/classNames unchanged. The marks/attendance/datesheet UIs are untouched.
- **Wire is snake_case both ways**; list `{ data, next_cursor }`, single/mutation `{ data }`.
- **Rename:** `marks_entered_pct↔marksEntered` (Exam). All other Exam fields (`name`, `type`, `grades`, `from`, `to`, `subjects`, `status`, `published`, `id`) pass through generic `snakeToCamel`/`camelToSnake` unchanged.
- **Scope = exam records only.** Per-student grades (`/exam-papers`, `GET /exam-papers/{id}/grades`, `PUT /grades`), the marks-entry grid data, exam attendance, and the datesheet are OUT — they stay on `app.examMarks`/`app.examAttendance`/`app.datesheets` and are flagged for Phase 6 / a dedicated grades effort.
- **`updateExam` covers all lifecycle patches** (status, marksEntered%, published) — the exam record's metadata is fully bound; only the per-student grade entries remain local.
- Tests stay green (`npm test`); `npm run typecheck` + `npm run build` pass each task. `noUnusedLocals` on.
- `ExamsScreen` now uses a query hook → `examsFlow.test.tsx` needs a `QueryClientProvider` + mocked `fetch`.
- Follow the shipped `students.ts`/`useStudentMutations.ts` pattern.

---

### Task 1: Exams resource module (`exams.ts`)

**Files:**
- Create: `src/api/exams.ts`, `src/api/exams.test.ts`

**Interfaces:**
- Consumes: `request`, `listRequest` from `./client`; `snakeToCamel`, `camelToSnake` from `./mapper`; `Exam` from `@/types`.
- Produces: `toExam(wire): Exam`, `fromExam(e: Partial<Exam>): Record<string, unknown>`, `listExams(): Promise<Exam[]>`, `createExam(e: Exam): Promise<Exam>`, `updateExam(id: string, patch: Partial<Exam>): Promise<Exam>`.

- [ ] **Step 1: Write the failing test**

Create `src/api/exams.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listExams, createExam, updateExam } from './exams'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const wireExam = { id: 'EX1', name: 'Term 1', type: 'Term', grades: 'VI-XII', from: '2026-09-08', to: '2026-09-20', subjects: 6, status: 'scheduled', marks_entered_pct: 0, published: false }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listExams', () => {
  it('maps marks_entered_pct -> marksEntered', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireExam], next_cursor: null })))
    const rows = await listExams()
    expect(rows[0]).toMatchObject({ id: 'EX1', name: 'Term 1', marksEntered: 0, published: false })
    expect((rows[0] as Record<string, unknown>).marks_entered_pct).toBeUndefined()
  })
})

describe('createExam', () => {
  it('POSTs /exams with marksEntered -> marks_entered_pct', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: wireExam }))
    vi.stubGlobal('fetch', fetchMock)
    await createExam({ id: 'tmp', name: 'Term 1', type: 'Term', grades: 'VI-XII', from: '2026-09-08', to: '2026-09-20', subjects: 6, status: 'scheduled', marksEntered: 0, published: false })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/exams')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.marks_entered_pct).toBe(0)
    expect(body.marksEntered).toBeUndefined()
  })
})

describe('updateExam', () => {
  it('PUTs /exams/{id} with a mapped partial patch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ...wireExam, status: 'marks_entry', marks_entered_pct: 64 } }))
    vi.stubGlobal('fetch', fetchMock)
    const updated = await updateExam('EX1', { status: 'marks_entry', marksEntered: 64 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/exams/EX1')
    expect((init as RequestInit).method).toBe('PUT')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.status).toBe('marks_entry')
    expect(body.marks_entered_pct).toBe(64)
    expect(updated).toMatchObject({ status: 'marks_entry', marksEntered: 64 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/exams.test.ts`
Expected: FAIL — cannot find module `./exams`.

- [ ] **Step 3: Implement**

Create `src/api/exams.ts`:
```ts
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { Exam } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export function toExam(wire: Record<string, unknown>): Exam {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { marksEnteredPct, ...rest } = c
  return { ...rest, marksEntered: marksEnteredPct } as unknown as Exam
}

/** Map a full or partial Exam to a snake_case body (handles `marksEntered` rename only if present). */
export function fromExam(e: Partial<Exam>): Record<string, unknown> {
  const snake = camelToSnake(e) as Record<string, unknown>
  if ('marks_entered' in snake) {
    const { marks_entered, ...rest } = snake
    return { ...rest, marks_entered_pct: marks_entered }
  }
  return snake
}

export async function listExams(): Promise<Exam[]> {
  const env = await listRequest<ListEnvelope>('/exams')
  return env.data.map(toExam)
}

export async function createExam(e: Exam): Promise<Exam> {
  const wire = await request<Record<string, unknown>>('/exams', { method: 'POST', body: fromExam(e) })
  return toExam(wire)
}

export async function updateExam(id: string, patch: Partial<Exam>): Promise<Exam> {
  const wire = await request<Record<string, unknown>>(`/exams/${id}`, { method: 'PUT', body: fromExam(patch) })
  return toExam(wire)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/exams.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:
```bash
git add src/api/exams.ts src/api/exams.test.ts
git commit -m "feat(api): exams resource module (list/create/update, marks_entered_pct rename)"
```

---

### Task 2: Exams hooks

**Files:**
- Modify: `src/api/queryKeys.ts` (add `exams` group)
- Create: `src/api/hooks/useExams.ts` (`useExams`, `useCreateExam`, `useUpdateExam`)
- Create: `src/api/hooks/useExams.test.tsx`

**Interfaces:**
- Produces: `queryKeys.exams.all`; `useExams()`; `useCreateExam()`; `useUpdateExam()` (mutate arg `{ id: string; patch: Partial<Exam> }`). All mutations invalidate `queryKeys.exams.all`.

- [ ] **Step 1: Extend the query-key factory**

In `src/api/queryKeys.ts`, add beside the others:
```ts
  exams: { all: ['exams'] as const },
```

- [ ] **Step 2: Write the failing hook test**

Create `src/api/hooks/useExams.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useExams, useCreateExam, useUpdateExam } from './useExams'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }
function wrap(qc: QueryClient) { return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
const wireExam = { id: 'EX1', name: 'T1', type: 'Term', grades: 'VI', from: '1', to: '2', subjects: 6, status: 'scheduled', marks_entered_pct: 0, published: false }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useExams', () => {
  it('resolves mapped exams', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wireExam], next_cursor: null })))
    const { result } = renderHook(() => useExams(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 'EX1', marksEntered: 0 })
  })
})

describe('useCreateExam', () => {
  it('POSTs and invalidates exams', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: wireExam })))
    const { result } = renderHook(() => useCreateExam(), { wrapper: wrap(qc) })
    result.current.mutate({ id: 't', name: 'T1', type: 'Term', grades: 'VI', from: '1', to: '2', subjects: 6, status: 'scheduled', marksEntered: 0, published: false })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exams'] })
  })
})

describe('useUpdateExam', () => {
  it('PUTs and invalidates exams', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { ...wireExam, published: true } })))
    const { result } = renderHook(() => useUpdateExam(), { wrapper: wrap(qc) })
    result.current.mutate({ id: 'EX1', patch: { published: true } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exams'] })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/api/hooks/useExams.test.tsx`
Expected: FAIL — cannot find module `./useExams`.

- [ ] **Step 4: Implement the hooks**

Create `src/api/hooks/useExams.ts`:
```ts
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listExams, createExam, updateExam } from '../exams'
import { queryKeys } from '../queryKeys'
import type { Exam } from '@/types'

export function useExams(): UseQueryResult<Exam[]> {
  return useQuery({ queryKey: queryKeys.exams.all, queryFn: () => listExams() })
}

export function useCreateExam(): UseMutationResult<Exam, Error, Exam> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (e: Exam) => createExam(e),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.exams.all }) },
  })
}

export function useUpdateExam(): UseMutationResult<Exam, Error, { id: string; patch: Partial<Exam> }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Exam> }) => updateExam(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.exams.all }) },
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/api/hooks/useExams.test.tsx`
Expected: PASS (all 3 cases).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:
```bash
git add src/api/queryKeys.ts src/api/hooks/useExams.ts src/api/hooks/useExams.test.tsx
git commit -m "feat(api): exams query keys + useExams/useCreateExam/useUpdateExam hooks"
```

---

### Task 3: Wire `ExamsScreen` exam-record flows + final verification

**Files:**
- Modify: `src/screens/school/exams.tsx` (exam list source + create + lifecycle updates)
- Modify: `src/screens/school/examsFlow.test.tsx` (QueryClientProvider + mocked fetch; adjust create/publish assertions)

**Interfaces:**
- Consumes: `useExams`, `useCreateExam`, `useUpdateExam` from `@/api/hooks/useExams`.

- [ ] **Step 1: Adapt the existing test first**

Read `src/screens/school/examsFlow.test.tsx` fully. Wrap its render helper in `QueryClientProvider` (`new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })`) and add a `beforeEach` `vi.stubGlobal('fetch', ...)` that returns the seed exam list for `GET /exams` and an echo object for `POST`/`PUT` (a generic `vi.fn().mockResolvedValue(jsonResponse({ data: <a wire exam>, next_cursor: null }))` works if the assertions don't depend on the exact returned record). For the list to render, the mock must resolve `GET /exams` to `{ data: [<seed wire exams>], next_cursor: null }` — derive the wire list by mapping the imported mockDb `exams` to snake_case (rename `marksEntered`→`marks_entered_pct`). Preserve ALL existing assertions for the marks-entry, attendance, publish-modal, and datesheet sub-flows (those read `app.*` state, unaffected). For the **exam-creation** test, change the assertion from "app.exams grew" to: after submitting the new-exam form, `fetch` was called with a POST to `/exams` (await with `waitFor`). Read the file to keep its exact `Probe`/testid/getBy identifiers.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/examsFlow.test.tsx`
Expected: FAIL — `ExamsListTab` still reads `app.exams` (no fetch); the create assertion's POST never fires.

- [ ] **Step 3: Wire the exam list + create + updates**

In `src/screens/school/exams.tsx`:
- Add: `import { useExams, useCreateExam, useUpdateExam } from '@/api/hooks/useExams'`.
- In `ExamsScreen` (or wherever `app.exams` / `app.addExam` / `app.updateExam` are consumed), introduce the hooks. In `ExamsListTab`, replace `rows={app.exams}` with rows from `const { data: examsData } = useExams(); const exams = examsData ?? []` → `rows={exams}`.
- Replace the new-exam create handler's `app.addExam(exam)` with `createExam.mutate(exam, { onSuccess: () => { <existing toast/close> }, onError: (err) => toast.danger('Could not create exam', err instanceof Error ? err.message : 'Please try again.') })` where `const createExam = useCreateExam()`.
- Replace EVERY `app.updateExam(examId, patch)` call (publish action AND the marks-save status/marksEntered update) with `updateExam.mutate({ id: examId, patch })` where `const updateExam = useUpdateExam()`. (The marks map itself stays local via `app.saveExamMarks` — only the exam record's status/marksEntered% is now persisted via PUT. Keep the surrounding toasts.)
- Leave `app.examMarks`/`app.saveExamMarks`/`app.examAttendance`/`app.saveExamAttendance`/`app.datesheets`/`app.saveDatesheet` exactly as they are (deferred grades/attendance/datesheet). Leave `reportFor`/`classRank` calls unchanged.
- Note: hooks must be called inside components. If `app.updateExam` is used inside `MarksEntryTab`/`DatesheetDrawer`, add `const updateExam = useUpdateExam()` in those components and use `updateExam.mutate(...)`.

- [ ] **Step 4: Run the screen test to verify it passes**

Run: `npx vitest run src/screens/school/examsFlow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + build**

Run: `npm run typecheck` (PASS), then `npm test` (full suite green — `registry.test.tsx` already wraps `QueryClientProvider`; `ExamsScreen` renders under it and under `<App/>`'s root provider), then `npm run build` (succeeds).

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/exams.tsx src/screens/school/examsFlow.test.tsx
git commit -m "feat(exams): bind exam list/create/update to live /exams (no UI change)"
```

---

## Phase 4 done — bound vs flagged

Bound: exam list (`GET /exams`), create exam (`POST /exams`), exam-record lifecycle updates — status / marksEntered% / published (`PUT /exams/{id}`).

Flagged (needs real backend contract + a sanctioned marks-grid UI pivot — a dedicated future effort): exam-papers (`/exam-papers`), per-student grades (`GET /exam-papers/{id}/grades`, `PUT /grades`), the marks-entry grid's data (still `app.examMarks`, hash-seeded), exam attendance (no endpoint), the datesheet (no endpoint), and `reportFor`/`classRank` (still client-side over mock marks).

Remaining: **Phase 5** finance + comms; **Phase 6** gap-flagging ("Demo data" badges) + AppProvider seed cleanup.

## Self-Review notes

- **Spec coverage (design §4 exams row, partial):** `/exams` CRUD bound (Tasks 1–3). The exam-papers + grades model pivot is explicitly deferred (documented above + flagged for Phase 6 / dedicated effort), per the agreed "bind clean subset, flag rest" decision — it requires UI adaptation the no-UI-change rule forbids and a backend contract not present in the codebase.
- **Type consistency:** `toExam`/`fromExam` use the single documented rename (`marks_entered_pct↔marksEntered`); `fromExam` handles partial patches for `updateExam`. Hooks return `UseQueryResult<Exam[]>` / `UseMutationResult<Exam, ...>` and invalidate `queryKeys.exams.all`.
- **No-UI-change:** exam-list/create/update swaps only; marks/attendance/datesheet tabs untouched; the exam record's metadata (status/marksEntered/published) is now server-persisted, the per-student grades stay local (flagged).
- **Inference flagged:** the `/exams` response shape follows the spec's snake_case contract; only `marks_entered_pct` is a documented rename, other fields assumed to match `camelToSnake` output. No running backend consulted.
- **Provider-in-tests:** `examsFlow.test.tsx` gains a `QueryClientProvider` + mocked `fetch`; the create assertion moves to the POST path; marks/attendance/datesheet sub-flow assertions are preserved (they read local `app.*` state).
