# School Admin API Binding — Phase 2: Mutations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Add-Student/Teacher/Staff forms create records through the live API (`POST /students|/teachers|/staff`), make the approvals inbox act-on through `PATCH /approvals/{id}`, and wire the admin "Invite user" flow to `POST /users` — each with **zero UI/markup changes**, and with React Query cache invalidation so newly created rows appear in the already-bound lists.

**Architecture:** Extend each resource module (`students.ts`/`teachers.ts`/`staff.ts`) with an outbound `fromX` mapper (`camelToSnake` + reverse field renames) and a `createX` POST function. Add `useCreateStudent`/`useCreateTeacher`/`useCreateStaff` mutation hooks that invalidate the corresponding list query on success. Add `actOnApproval` (PATCH) + `useActOnApproval`, and `inviteUser` (POST) + `useInviteUser`. Swap each form's `app.addX(...)` for the mutation; keep the existing success toast + navigation. The AppProvider seed state and `addX` mutators are left in place (still-mock screens read them); their removal is deferred to a later cleanup phase.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`.

## Global Constraints

- **No UI/markup changes.** Forms keep their JSX, validation, toasts, and post-save navigation. Only the persistence call swaps (`app.addX` → mutation) and a hook is added at the top of each form/component.
- **Wire is snake_case both ways.** POST/PATCH bodies are snake_case; responses use the `{data}` envelope.
- **Outbound renames (reverse of the inbound maps):** `adm→admission_no`, `cls→class_label` (Student); `dept→department`, `desig→designation`, `attendance→attendance_pct` (Teacher); `dept→department`, `cat→category`, `attendance→attendance_pct` (Staff). All other multi-word fields convert via generic `camelToSnake`.
- **No edit binding.** No edit form exists in the UI; "edit" is out of scope (would be net-new UI). Only create/act-on/invite are bound.
- **Import is a gap.** No bulk-import UI exists in admin; it is not bound (Phase 6 "Demo data" flag).
- **Provider seed state stays.** Do NOT remove `students/teachers/staff`/`addX` from `AppProvider` — still-mock screens depend on them. Forms simply stop calling `addX`.
- **Cache invalidation:** every create invalidates its list query (`queryKeys.<resource>.all`) so the bound list refetches and shows the new row.
- Tests stay green (`npm test`); `npm run typecheck` + `npm run build` pass at each task's end. `noUnusedLocals` on.
- Forms that now use a mutation hook require a `QueryClientProvider` in their tests — add it when rewriting each form test.

---

### Task 1: Student create (`fromStudent` + `createStudent`)

**Files:**
- Modify: `src/api/students.ts` (add `fromStudent`, `createStudent`)
- Modify: `src/api/students.test.ts` (add create cases)

**Interfaces:**
- Consumes: `request` from `./client`; `camelToSnake` from `./mapper`; existing `toStudent`.
- Produces: `fromStudent(s: Student): Record<string, unknown>`, `createStudent(s: Student): Promise<Student>`.

- [ ] **Step 1: Add the failing tests**

Append to `src/api/students.test.ts` (add `createStudent` to the import at the top, plus a new describe block):
```ts
import { listStudents, getStudent, createStudent } from './students'
```
```ts
describe('createStudent', () => {
  it('POSTs a snake_case body (adm->admission_no, cls->class_label) and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srv1', admission_no: 'A-9', class_label: '8-C', name: 'New Kid', gender: 'M', grade: '8', section: 'C', roll: 5, guardian: 'G', phone: '7', attendance: 0, fee_status: 'due', fee_due: 0, status: 'active', house: 'Ruby', avatar_hue: 50 } }))
    vi.stubGlobal('fetch', fetchMock)
    const created = await createStudent({ id: 'tmp', adm: 'A-9', cls: '8-C', name: 'New Kid', gender: 'M', grade: '8', section: 'C', roll: 5, guardian: 'G', phone: '7', attendance: 0, feeStatus: 'due', feeDue: 0, status: 'active', house: 'Ruby', avatarHue: 50 } as Parameters<typeof createStudent>[0])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/students')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.admission_no).toBe('A-9')
    expect(body.class_label).toBe('8-C')
    expect(body.fee_status).toBe('due')
    expect(body.adm).toBeUndefined()
    expect(body.cls).toBeUndefined()
    expect(created).toMatchObject({ id: 'srv1', adm: 'A-9', cls: '8-C' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/students.test.ts`
Expected: FAIL — `createStudent` is not exported.

- [ ] **Step 3: Implement**

In `src/api/students.ts`, add the `camelToSnake` import (merge into the existing `./mapper` import: `import { snakeToCamel, camelToSnake } from './mapper'`) and append:
```ts
/** Map the UI `Student` to a snake_case POST body. `camelToSnake` leaves the
 *  single-token `adm`/`cls` as-is; rename them to their wire names explicitly. */
export function fromStudent(s: Student): Record<string, unknown> {
  const snake = camelToSnake(s) as Record<string, unknown>
  const { adm, cls, ...rest } = snake
  return { ...rest, admission_no: adm, class_label: cls }
}

export async function createStudent(s: Student): Promise<Student> {
  const wire = await request<Record<string, unknown>>('/students', { method: 'POST', body: fromStudent(s) })
  return toStudent(wire)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/students.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:
```bash
git add src/api/students.ts src/api/students.test.ts
git commit -m "feat(api): createStudent (POST, camel->snake + adm/cls reverse rename)"
```

---

### Task 2: Teacher + Staff create

**Files:**
- Modify: `src/api/teachers.ts` (add `fromTeacher`, `createTeacher`)
- Modify: `src/api/teachers.test.ts` (add create case)
- Modify: `src/api/staff.ts` (add `fromStaff`, `createStaff`)
- Modify: `src/api/staff.test.ts` (add create case)

**Interfaces:**
- Produces: `fromTeacher(t)/createTeacher(t)`, `fromStaff(s)/createStaff(s)`.

- [ ] **Step 1: Add the failing teacher test**

In `src/api/teachers.test.ts`, change the import to `import { listTeachers, createTeacher } from './teachers'` and append:
```ts
describe('createTeacher', () => {
  it('POSTs snake_case (dept->department, desig->designation, attendance->attendance_pct) and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srvT', name: 'New T', gender: 'F', department: 'Math', designation: 'Teacher', subjects: [], class_teacher: null, phone: '1', email: 'e', exp: 0, rating: 0, attendance_pct: 0, result: 0, load: 0, status: 'active', avatar_hue: 9, top: false } }))
    vi.stubGlobal('fetch', fetchMock)
    const created = await createTeacher({ id: 'tmp', name: 'New T', gender: 'F', dept: 'Math', desig: 'Teacher', subjects: [], classTeacher: null, phone: '1', email: 'e', exp: 0, rating: 0, attendance: 0, result: 0, load: 0, status: 'active', avatarHue: 9, top: false } as Parameters<typeof createTeacher>[0])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/teachers')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.department).toBe('Math')
    expect(body.designation).toBe('Teacher')
    expect(body.attendance_pct).toBe(0)
    expect(body.dept).toBeUndefined()
    expect(body.desig).toBeUndefined()
    expect(created).toMatchObject({ dept: 'Math', desig: 'Teacher' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/teachers.test.ts`
Expected: FAIL — `createTeacher` not exported.

- [ ] **Step 3: Implement teachers create**

In `src/api/teachers.ts`, add `request` to the client import (`import { listRequest, request } from './client'`), add `camelToSnake` to the mapper import (`import { snakeToCamel, camelToSnake } from './mapper'`), and append:
```ts
export function fromTeacher(t: Teacher): Record<string, unknown> {
  const snake = camelToSnake(t) as Record<string, unknown>
  const { dept, desig, attendance, ...rest } = snake
  return { ...rest, department: dept, designation: desig, attendance_pct: attendance }
}

export async function createTeacher(t: Teacher): Promise<Teacher> {
  const wire = await request<Record<string, unknown>>('/teachers', { method: 'POST', body: fromTeacher(t) })
  return toTeacher(wire)
}
```

- [ ] **Step 4: Run the teacher test (PASS), then add the failing staff test**

Run: `npx vitest run src/api/teachers.test.ts` → PASS.

In `src/api/staff.test.ts`, change the import to `import { listStaff, createStaff } from './staff'` and append:
```ts
describe('createStaff', () => {
  it('POSTs snake_case (dept->department, cat->category, attendance->attendance_pct) and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srvS', name: 'New S', gender: 'M', role: 'Clerk', category: 'admin', department: 'Office', phone: '1', shift: 'Day', route: null, attendance_pct: 0, status: 'active', avatar_hue: 3 } }))
    vi.stubGlobal('fetch', fetchMock)
    const created = await createStaff({ id: 'tmp', name: 'New S', gender: 'M', role: 'Clerk', cat: 'admin', dept: 'Office', phone: '1', shift: 'Day', route: null, attendance: 0, status: 'active', avatarHue: 3 } as Parameters<typeof createStaff>[0])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.department).toBe('Office')
    expect(body.category).toBe('admin')
    expect(body.attendance_pct).toBe(0)
    expect(body.cat).toBeUndefined()
    expect(created).toMatchObject({ cat: 'admin', dept: 'Office' })
  })
})
```

- [ ] **Step 5: Run it to verify it fails, then implement staff create**

Run: `npx vitest run src/api/staff.test.ts` → FAIL (`createStaff` not exported).

In `src/api/staff.ts`, add `request` to the client import, `camelToSnake` to the mapper import, and append:
```ts
export function fromStaff(s: Staff): Record<string, unknown> {
  const snake = camelToSnake(s) as Record<string, unknown>
  const { dept, cat, attendance, ...rest } = snake
  return { ...rest, department: dept, category: cat, attendance_pct: attendance }
}

export async function createStaff(s: Staff): Promise<Staff> {
  const wire = await request<Record<string, unknown>>('/staff', { method: 'POST', body: fromStaff(s) })
  return toStaff(wire)
}
```

- [ ] **Step 6: Run both tests (PASS), typecheck, commit**

Run: `npx vitest run src/api/teachers.test.ts src/api/staff.test.ts` → PASS. Then `npm run typecheck` → PASS.
```bash
git add src/api/teachers.ts src/api/teachers.test.ts src/api/staff.ts src/api/staff.test.ts
git commit -m "feat(api): createTeacher + createStaff (POST, reverse renames)"
```

---

### Task 3: Create mutation hooks

**Files:**
- Create: `src/api/hooks/useStudentMutations.ts`
- Create: `src/api/hooks/useTeacherMutations.ts`
- Create: `src/api/hooks/useStaffMutations.ts`
- Create: `src/api/hooks/useMutations.test.tsx`

**Interfaces:**
- Consumes: `createStudent`/`createTeacher`/`createStaff` from the resource modules; `queryKeys`; `useMutation`, `useQueryClient`.
- Produces: `useCreateStudent()`, `useCreateTeacher()`, `useCreateStaff()` — each a `UseMutationResult` that invalidates its list query on success.

- [ ] **Step 1: Write the failing test**

Create `src/api/hooks/useMutations.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCreateStudent } from './useStudentMutations'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function makeClient() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useCreateStudent', () => {
  it('POSTs and invalidates the students list on success', async () => {
    const qc = makeClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srv1', admission_no: 'A1', class_label: '1-A', name: 'N', gender: 'M', grade: '1', section: 'A', roll: 1, guardian: 'g', phone: '1', attendance: 0, fee_status: 'due', fee_due: 0, status: 'active', house: 'Ruby', avatar_hue: 1 } })))
    const { result } = renderHook(() => useCreateStudent(), { wrapper })
    result.current.mutate({ id: 't', adm: 'A1', cls: '1-A', name: 'N', gender: 'M', grade: '1', section: 'A', roll: 1, guardian: 'g', phone: '1', attendance: 0, feeStatus: 'due', feeDue: 0, status: 'active', house: 'Ruby', avatarHue: 1 } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['students'] })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/hooks/useMutations.test.tsx`
Expected: FAIL — cannot find module `./useStudentMutations`.

- [ ] **Step 3: Implement the three hook files**

Create `src/api/hooks/useStudentMutations.ts`:
```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createStudent } from '../students'
import { queryKeys } from '../queryKeys'
import type { Student } from '@/types'

export function useCreateStudent(): UseMutationResult<Student, Error, Student> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Student) => createStudent(s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.students.all }) },
  })
}
```

Create `src/api/hooks/useTeacherMutations.ts`:
```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createTeacher } from '../teachers'
import { queryKeys } from '../queryKeys'
import type { Teacher } from '@/types'

export function useCreateTeacher(): UseMutationResult<Teacher, Error, Teacher> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (t: Teacher) => createTeacher(t),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.teachers.all }) },
  })
}
```

Create `src/api/hooks/useStaffMutations.ts`:
```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createStaff } from '../staff'
import { queryKeys } from '../queryKeys'
import type { Staff } from '@/types'

export function useCreateStaff(): UseMutationResult<Staff, Error, Staff> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: Staff) => createStaff(s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.staff.all }) },
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/hooks/useMutations.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:
```bash
git add src/api/hooks/useStudentMutations.ts src/api/hooks/useTeacherMutations.ts src/api/hooks/useStaffMutations.ts src/api/hooks/useMutations.test.tsx
git commit -m "feat(api): create mutation hooks (student/teacher/staff) with list invalidation"
```

---

### Task 4: Wire the Add Student form

**Files:**
- Modify: `src/screens/school/studentAdd.tsx` (swap `app.addStudent` for the mutation)
- Modify: `src/screens/school/studentAdd.test.tsx` (QueryClientProvider + mocked POST; assert navigation, not roster length)

**Interfaces:**
- Consumes: `useCreateStudent` from `@/api/hooks/useStudentMutations`.

- [ ] **Step 1: Rewrite the form test first**

Replace `src/screens/school/studentAdd.test.tsx` with a version that wraps `QueryClientProvider`, mocks `fetch` for the POST, and asserts navigation + the POST (keeping the existing validation tests). Preserve the existing `Probe`/render structure but add the provider and fetch mock. The valid-submit test asserts `app.view === 'school.sis'` after the mutation resolves (use `await waitFor`) and that `fetch` was called with a POST to `/students`. Drop the `count === start + 1` assertion (the roster is no longer mutated locally).

Concretely, wrap the existing render helper:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <Probe />
          <AddStudentScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}
```
Add to the valid-submit test a `beforeEach`/inline `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'srv', admission_no: 'A1', class_label: '1-A', name: 'X', gender: 'M', grade: '1', section: 'A', roll: 1, guardian: 'g', phone: '1', attendance: 0, fee_status: 'due', fee_due: 0, status: 'active', house: 'Ruby', avatar_hue: 1 } })))` and assert:
```tsx
await waitFor(() => expect(screen.getByTestId('view').textContent).toBe('school.sis'))
expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/students')
```
(Keep the exact `Probe`/testid names already used by the existing test file — read it first and preserve its identifiers.) The two validation tests stay as-is but now render under the provider.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/studentAdd.test.tsx`
Expected: FAIL — form still calls `app.addStudent` (no fetch), so the POST/navigation assertions fail.

- [ ] **Step 3: Wire the form**

In `src/screens/school/studentAdd.tsx`:
- Add: `import { useCreateStudent } from '@/api/hooks/useStudentMutations'`.
- In the component body (near the other hooks), add: `const createStudent = useCreateStudent()`.
- In `save()`, replace the three lines:
  ```tsx
  app.addStudent(student)
  toast.success('Student added', `${name} enrolled in ${cls}.`)
  app.go('school.sis')
  ```
  with:
  ```tsx
  createStudent.mutate(student, {
    onSuccess: () => {
      toast.success('Student added', `${name} enrolled in ${cls}.`)
      app.go('school.sis')
    },
    onError: (err) => {
      toast.danger('Could not save', err instanceof Error ? err.message : 'Please try again.')
    },
  })
  ```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/screens/school/studentAdd.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:
```bash
git add src/screens/school/studentAdd.tsx src/screens/school/studentAdd.test.tsx
git commit -m "feat(students): Add-Student form creates via live POST + list invalidation (no UI change)"
```

---

### Task 5: Wire the Add Teacher form

**Files:**
- Modify: `src/screens/school/teacherAdd.tsx`
- Modify: `src/screens/school/teacherAdd.test.tsx`

**Interfaces:**
- Consumes: `useCreateTeacher` from `@/api/hooks/useTeacherMutations`.

- [ ] **Step 1: Rewrite the form test first**

Mirror Task 4 Step 1 for teachers: wrap `QueryClientProvider`, mock `fetch` for the POST (response a wire teacher with `department`/`designation`/`attendance_pct`), keep the existing validation tests (empty fields, password mismatch) under the provider, and change the valid-submit test to assert navigation to `school.teachers` (`await waitFor`) and a POST to `/teachers`, dropping the `count === start + 1` assertion. Read the existing test file first and preserve its `Probe`/testid identifiers.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/teacherAdd.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Wire the form**

In `src/screens/school/teacherAdd.tsx`:
- Add: `import { useCreateTeacher } from '@/api/hooks/useTeacherMutations'`.
- Add in the body: `const createTeacher = useCreateTeacher()`.
- In `save()`, replace:
  ```tsx
  app.addTeacher(teacher)
  toast.success('Teacher added', `${name} added to ${f.department}.`)
  app.go('school.teachers')
  ```
  with:
  ```tsx
  createTeacher.mutate(teacher, {
    onSuccess: () => {
      toast.success('Teacher added', `${name} added to ${f.department}.`)
      app.go('school.teachers')
    },
    onError: (err) => {
      toast.danger('Could not save', err instanceof Error ? err.message : 'Please try again.')
    },
  })
  ```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/screens/school/teacherAdd.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:
```bash
git add src/screens/school/teacherAdd.tsx src/screens/school/teacherAdd.test.tsx
git commit -m "feat(teachers): Add-Teacher form creates via live POST + invalidation (no UI change)"
```

---

### Task 6: Wire the Add Staff form

**Files:**
- Modify: `src/screens/school/staffAdd.tsx`
- Modify: `src/screens/school/staffAdd.test.tsx`

**Interfaces:**
- Consumes: `useCreateStaff` from `@/api/hooks/useStaffMutations`.

- [ ] **Step 1: Rewrite the form test first**

Mirror Task 4 Step 1 for staff: wrap `QueryClientProvider`, mock `fetch` for the POST (wire staff with `department`/`category`/`attendance_pct`), keep the validation tests under the provider, and change the valid-submit test to assert navigation to `school.staff` and a POST to `/staff`, dropping the roster-length assertion. Preserve the existing `Probe`/testid identifiers.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/staffAdd.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Wire the form**

In `src/screens/school/staffAdd.tsx`:
- Add: `import { useCreateStaff } from '@/api/hooks/useStaffMutations'`.
- Add in the body: `const createStaff = useCreateStaff()`.
- In `save()`, replace:
  ```tsx
  app.addStaff(staffMember)
  toast.success('Staff added', `${name} added to ${f.department}.`)
  app.go('school.staff')
  ```
  with:
  ```tsx
  createStaff.mutate(staffMember, {
    onSuccess: () => {
      toast.success('Staff added', `${name} added to ${f.department}.`)
      app.go('school.staff')
    },
    onError: (err) => {
      toast.danger('Could not save', err instanceof Error ? err.message : 'Please try again.')
    },
  })
  ```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/screens/school/staffAdd.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (PASS), then:
```bash
git add src/screens/school/staffAdd.tsx src/screens/school/staffAdd.test.tsx
git commit -m "feat(staff): Add-Staff form creates via live POST + invalidation (no UI change)"
```

---

### Task 7: Approvals act-on (`PATCH /approvals/{id}`)

**Files:**
- Modify: `src/api/approvals.ts` (add `actOnApproval`)
- Modify: `src/api/approvals.test.ts` (add PATCH case)
- Create: `src/api/hooks/useApprovalMutations.ts`
- Modify: `src/api/hooks/useInbox.test.tsx` (add a mutation case)
- Modify: `src/screens/school/dashboard.tsx` (`ApprovalsInbox.act` uses the mutation)

**Interfaces:**
- Produces: `actOnApproval(id: string, status: 'approved' | 'rejected'): Promise<void>`; `useActOnApproval(): UseMutationResult<void, Error, { id: string; status: 'approved' | 'rejected' }>` (invalidates `queryKeys.approvals.all` on success).

- [ ] **Step 1: Add the failing module test**

In `src/api/approvals.test.ts`, change the import to `import { listApprovals, actOnApproval } from './approvals'` and append:
```ts
describe('actOnApproval', () => {
  it('PATCHes /approvals/{id} with the status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await actOnApproval('A1', 'approved')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/approvals/A1')
    expect((init as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ status: 'approved' })
  })
})
```

- [ ] **Step 2: Run it (FAIL), then implement**

Run: `npx vitest run src/api/approvals.test.ts` → FAIL.

In `src/api/approvals.ts`, add `request` to the client import (`import { listRequest, request } from './client'`) and append:
```ts
export async function actOnApproval(id: string, status: 'approved' | 'rejected'): Promise<void> {
  await request<unknown>(`/approvals/${id}`, { method: 'PATCH', body: { status } })
}
```

- [ ] **Step 3: Run it (PASS), then add the failing hook test**

Run: `npx vitest run src/api/approvals.test.ts` → PASS.

In `src/api/hooks/useInbox.test.tsx`, add `import { useActOnApproval } from './useApprovalMutations'` and a case:
```tsx
describe('useActOnApproval', () => {
  it('PATCHes and invalidates the approvals list', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { result } = renderHook(() => useActOnApproval(), { wrapper })
    result.current.mutate({ id: 'A1', status: 'approved' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['approvals'] })
  })
})
```

- [ ] **Step 4: Run it (FAIL), then implement the hook**

Run: `npx vitest run src/api/hooks/useInbox.test.tsx` → FAIL.

Create `src/api/hooks/useApprovalMutations.ts`:
```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { actOnApproval } from '../approvals'
import { queryKeys } from '../queryKeys'

export function useActOnApproval(): UseMutationResult<void, Error, { id: string; status: 'approved' | 'rejected' }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => actOnApproval(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.approvals.all }) },
  })
}
```

- [ ] **Step 5: Run the hook test (PASS), then wire `ApprovalsInbox`**

Run: `npx vitest run src/api/hooks/useInbox.test.tsx` → PASS.

In `src/screens/school/dashboard.tsx` `ApprovalsInbox`:
- Add: `import { useActOnApproval } from '@/api/hooks/useApprovalMutations'`.
- Add in the body: `const actOn = useActOnApproval()`.
- Replace the `act` function body — keep the optimistic `setActed` + toast, and fire the PATCH:
  ```tsx
  const act = (a: Approval, kind: 'approve' | 'reject') => {
    setActed((prev) => new Set(prev).add(a.id))
    actOn.mutate({ id: a.id, status: kind === 'approve' ? 'approved' : 'rejected' })
    if (kind === 'approve') toast.success('Approved', `${a.title} — ${a.id}`)
    else toast.danger('Rejected', `${a.title} — ${a.id}`)
  }
  ```
  (The optimistic `acted` set still hides the card immediately; the invalidation refetches the server's list. JSX unchanged.)

- [ ] **Step 6: Typecheck + full suite + commit**

Run: `npm run typecheck` (PASS), then `npm test` (full suite green). Then:
```bash
git add src/api/approvals.ts src/api/approvals.test.ts src/api/hooks/useApprovalMutations.ts src/api/hooks/useInbox.test.tsx src/screens/school/dashboard.tsx
git commit -m "feat(approvals): act-on via PATCH /approvals/{id} + invalidation (no UI change)"
```

---

### Task 8: Wire the admin "Invite user" → `POST /users` + final verification

**Files:**
- Create: `src/api/users.ts` (`inviteUser`)
- Create: `src/api/users.test.ts`
- Create: `src/api/hooks/useUserMutations.ts` (`useInviteUser`)
- Modify: `src/api/queryKeys.ts` (add `users` group for completeness)
- Modify: `src/screens/school/admin.tsx` (`InviteModalContent.submit` calls the mutation)

**Interfaces:**
- Produces: `inviteUser(email: string, role: string): Promise<void>`; `useInviteUser(): UseMutationResult<void, Error, { email: string; role: string }>`.

- [ ] **Step 1: Add the failing module test**

Create `src/api/users.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { inviteUser } from './users'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('inviteUser', () => {
  it('POSTs /users with email + role', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'u1' } }))
    vi.stubGlobal('fetch', fetchMock)
    await inviteUser('a@b.edu', 'teacher')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/users')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'a@b.edu', role: 'teacher' })
  })
})
```

- [ ] **Step 2: Run it (FAIL), then implement**

Run: `npx vitest run src/api/users.test.ts` → FAIL.

Create `src/api/users.ts`:
```ts
import { request } from './client'

export async function inviteUser(email: string, role: string): Promise<void> {
  await request<unknown>('/users', { method: 'POST', body: { email, role } })
}
```

In `src/api/queryKeys.ts`, add a `users` group beside the others:
```ts
  users: {
    all: ['users'] as const,
  },
```

Create `src/api/hooks/useUserMutations.ts`:
```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { inviteUser } from '../users'
import { queryKeys } from '../queryKeys'

export function useInviteUser(): UseMutationResult<void, Error, { email: string; role: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) => inviteUser(email, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.users.all }) },
  })
}
```

- [ ] **Step 3: Run the module test (PASS), then wire the invite modal**

Run: `npx vitest run src/api/users.test.ts` → PASS.

In `src/screens/school/admin.tsx` `InviteModalContent`:
- Add: `import { useInviteUser } from '@/api/hooks/useUserMutations'`.
- Add in the body: `const invite = useInviteUser()`.
- In `submit()`, after the email-validation guard, replace the toast-only success with a real call that keeps the existing toast + `onDone()` on success:
  ```tsx
  invite.mutate({ email: email.trim(), role }, {
    onSuccess: () => {
      toast.success('Invitation sent', `${email} invited as ${ROLE_META[role].label}.`)
      onDone()
    },
    onError: (err) => {
      toast.danger('Could not send invite', err instanceof Error ? err.message : 'Please try again.')
    },
  })
  ```
  (Leave the email-validation guard and all JSX unchanged. The bulk "import" feature is not present in the UI and remains unbound — it will get a "Demo data" flag in Phase 6.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `admin.tsx` now needs a `QueryClient` at runtime; it is rendered under `<App/>` (root provider) and in `registry.test.tsx` (its own wrapper). The `identityOverrides.test.tsx` renders the admin Users tab — confirm it wraps `QueryClientProvider`; if it renders `admin` screens and now throws, wrap it (this is the only expected test touch outside the named files; if needed, add the provider exactly as `registry.test.tsx` does).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all files). If `identityOverrides.test.tsx` fails with a missing-QueryClient error, wrap its render in `QueryClientProvider` (retry:false) and re-run.

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/api/users.ts src/api/users.test.ts src/api/hooks/useUserMutations.ts src/api/queryKeys.ts src/screens/school/admin.tsx
git commit -m "feat(users): invite via POST /users (no UI change); import remains a demo gap"
```
(If you wrapped `identityOverrides.test.tsx`, add it to this commit.)

---

## Phase 2 done — what later phases build on

After Phase 2: the three Add forms create through the live API and the new rows appear in the bound lists (caveat from Phase 1 resolved); approvals act-on issues a real PATCH; user invites issue a real POST. Reverse (`camelToSnake` + rename) mappers and the mutation-hook pattern are established for later phases. The AppProvider seed state remains for still-mock screens; its removal is deferred to the final cleanup once every consumer is bound.

Remaining: **Phase 3** academics (classes, subjects) + attendance roll-call; **Phase 4** exams + exam-papers + grades; **Phase 5** finance + comms; **Phase 6** gap-flagging ("Demo data" badges incl. dashboard synthetic counts + import) + AppProvider seed cleanup.

## Self-Review notes

- **Spec coverage (design §8.2 mutations + §4 rows sis/people/admin):** create student/teacher/staff (Tasks 1–6), approvals PATCH (Task 7), users invite POST (Task 8). Edit forms and bulk import have no UI surface today and are explicitly out (flagged for Phase 6). Reverse renames (§3) are implemented as the inverse of the shipped inbound maps.
- **Type consistency:** `fromX`/`createX` mirror the inbound `toX` renames exactly. Mutation hooks return `UseMutationResult<Resource, Error, Resource>` and invalidate `queryKeys.<resource>.all` — the keys already exist from Phase 1. Form `save()` handlers keep their constructed objects; only the persistence call changes.
- **No-UI-change:** every form/component edit is an added hook + a swapped persistence call inside an existing handler; JSX, validation, toasts, and navigation targets are unchanged.
- **Test-provider safety:** each form test gains a `QueryClientProvider` (the form now uses a mutation hook); `identityOverrides.test.tsx` is the one cross-cutting test that may need the same wrapper (Task 8).
- **Inference flagged:** POST/PATCH body shapes follow the spec's snake_case contract; field names beyond the documented renames are assumed to match `camelToSnake` output. No running backend was consulted.
