# School Admin API Binding — Phase 5: Finance + Comms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the cleanly-bindable finance + comms surfaces to the live API — complaints (`GET /complaints`), threads (`GET /threads`), announcements (`GET/POST /announcements`), and fee payments (`GET /fees/payments` + `POST /fees/invoices/{id}/pay`) — with **no UI/markup changes**. Interactive/synthetic surfaces with no clean endpoint stay local and are **flagged** (messenger send + new-thread, complaint resolve, fee waiver, fee-structure config, payroll run/approve, payslips/leave [no UI], bus/GPS).

**Architecture:** Add `src/api/complaints.ts`, `src/api/threads.ts`, `src/api/announcements.ts` (+ `Announcement` type), `src/api/feePayments.ts` resource modules + React Query hooks. Swap the complaints/threads/announcements lists and the fee-history list from their mockDb/app-state/inline sources to the hooks; route the send-announcement and pay-invoice actions through mutations. Everything else stays as-is.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`.

## Global Constraints

- **No UI/markup changes.** Only data sources swap and the two bound actions (send announcement, pay invoice) become real calls keeping their toasts. JSX/classNames unchanged.
- **Wire is snake_case both ways**; list `{ data, next_cursor }`, single/mutation `{ data }`.
- **Renames:** Complaint `category↔cat` (other fields generic). FeePayment `student_id↔studentId`, `student_name↔studentName`, `fee_type↔feeType` are all handled by generic `snakeToCamel`/`camelToSnake` — no special map. Thread and Announcement are assumed to mirror the UI field names (generic passthrough) — **inferred contract**.
- **Scope = listed reads + 2 mutations only.** Messenger send/new-thread, complaint resolve, fee waiver, fee-structure, payroll, payslips/leave, bus/GPS are OUT (flagged).
- Tests stay green (`npm test`); `npm run typecheck` + `npm run build` pass each task. `noUnusedLocals` on.
- Screens gaining a hook need their tests wrapped in `QueryClientProvider` (`financeFees.test.tsx`).
- Follow the shipped `students.ts`/`approvals.ts`/`useStudents.ts` pattern.

---

### Task 1: Complaints + Threads resource modules

**Files:**
- Create: `src/api/complaints.ts`, `src/api/complaints.test.ts`
- Create: `src/api/threads.ts`, `src/api/threads.test.ts`

**Interfaces:**
- Produces: `listComplaints(): Promise<Complaint[]>` (maps `category→cat`); `listThreads(): Promise<Thread[]>` (generic passthrough).

- [ ] **Step 1: Write the failing complaints test**

Create `src/api/complaints.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listComplaints } from './complaints'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listComplaints', () => {
  it('maps category -> cat and returns the list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'C1', subject: 'Bus late', from: 'Parent A', category: 'transport', priority: 'high', status: 'open', age: '2d', assignee: 'Ops', body: '...' }], next_cursor: null })))
    const rows = await listComplaints()
    expect(rows[0]).toMatchObject({ id: 'C1', cat: 'transport', priority: 'high', status: 'open' })
    expect((rows[0] as Record<string, unknown>).category).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it (FAIL), then implement complaints**

Run: `npx vitest run src/api/complaints.test.ts` → FAIL.

Create `src/api/complaints.ts`:
```ts
import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Complaint } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export function toComplaint(wire: Record<string, unknown>): Complaint {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const { category, ...rest } = c
  return { ...rest, cat: category } as unknown as Complaint
}

export async function listComplaints(): Promise<Complaint[]> {
  const env = await listRequest<ListEnvelope>('/complaints')
  return env.data.map(toComplaint)
}
```

- [ ] **Step 3: Run it (PASS), then write the failing threads test**

Run: `npx vitest run src/api/complaints.test.ts` → PASS.

Create `src/api/threads.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listThreads } from './threads'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listThreads', () => {
  it('returns the threads list (with embedded messages)', async () => {
    const wire = { data: [{ id: 1, parent: 'Mrs A', student: 'X-A', teacher: 'Mr B', unread: 2, last: 'hi', time: '2h', hue: 200, msgs: [{ me: false, t: 'hi', at: '2h' }] }], next_cursor: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)))
    const rows = await listThreads()
    expect(rows[0]).toMatchObject({ id: 1, parent: 'Mrs A', unread: 2 })
    expect(rows[0].msgs[0]).toMatchObject({ me: false, t: 'hi' })
  })
})
```

- [ ] **Step 4: Run it (FAIL), then implement threads**

Run: `npx vitest run src/api/threads.test.ts` → FAIL.

Create `src/api/threads.ts`:
```ts
import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Thread } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listThreads(): Promise<Thread[]> {
  const env = await listRequest<ListEnvelope>('/threads')
  return env.data.map((t) => snakeToCamel<Thread>(t))
}
```

- [ ] **Step 5: Run it (PASS), typecheck, commit**

Run: `npx vitest run src/api/threads.test.ts` → PASS. Then `npm run typecheck` → PASS.
```bash
git add src/api/complaints.ts src/api/complaints.test.ts src/api/threads.ts src/api/threads.test.ts
git commit -m "feat(api): complaints + threads resource modules (list)"
```

---

### Task 2: Announcements + Fee-payments resource modules

**Files:**
- Create: `src/api/announcements.ts`, `src/api/announcements.test.ts`
- Create: `src/api/feePayments.ts`, `src/api/feePayments.test.ts`

**Interfaces:**
- Produces: `Announcement` type; `listAnnouncements(): Promise<Announcement[]>`, `createAnnouncement(input: { title: string; audience: string }): Promise<Announcement>`; `listFeePayments(): Promise<FeePayment[]>`, `payInvoice(invoiceId: string, payment: FeePayment): Promise<FeePayment>`.

- [ ] **Step 1: Write the failing announcements test**

Create `src/api/announcements.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listAnnouncements, createAnnouncement } from './announcements'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listAnnouncements', () => {
  it('returns the announcements list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'A1', title: 'Holiday', audience: 'All', when: '1d', reach: 1200, ch: 'app' }], next_cursor: null })))
    expect((await listAnnouncements())[0]).toMatchObject({ id: 'A1', title: 'Holiday', audience: 'All' })
  })
})

describe('createAnnouncement', () => {
  it('POSTs /announcements with the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'A2', title: 'PTM', audience: 'Parents', when: 'now', reach: 800, ch: 'app' } }))
    vi.stubGlobal('fetch', fetchMock)
    const created = await createAnnouncement({ title: 'PTM', audience: 'Parents' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/announcements')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ title: 'PTM', audience: 'Parents' })
    expect(created).toMatchObject({ id: 'A2', title: 'PTM' })
  })
})
```

- [ ] **Step 2: Run it (FAIL), then implement announcements**

Run: `npx vitest run src/api/announcements.test.ts` → FAIL.

Create `src/api/announcements.ts`:
```ts
import { request, listRequest } from './client'
import { snakeToCamel } from './mapper'

export interface Announcement {
  id: string
  title: string
  audience: string
  when: string
  reach: number
  ch: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listAnnouncements(): Promise<Announcement[]> {
  const env = await listRequest<ListEnvelope>('/announcements')
  return env.data.map((a) => snakeToCamel<Announcement>(a))
}

export async function createAnnouncement(input: { title: string; audience: string }): Promise<Announcement> {
  const wire = await request<Record<string, unknown>>('/announcements', { method: 'POST', body: input })
  return snakeToCamel<Announcement>(wire)
}
```

- [ ] **Step 3: Run it (PASS), then write the failing fee-payments test**

Run: `npx vitest run src/api/announcements.test.ts` → PASS.

Create `src/api/feePayments.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeePayments, payInvoice } from './feePayments'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const wirePayment = { id: 1, student_id: 's1', student_name: 'Asha', cls: 'X-A', fee_type: 'academic', amount: 4800, mode: 'UPI', ref: 'TXN1', date: '2026-06-01' }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listFeePayments', () => {
  it('maps student_id/student_name/fee_type generically', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [wirePayment], next_cursor: null })))
    const rows = await listFeePayments()
    expect(rows[0]).toMatchObject({ id: 1, studentId: 's1', studentName: 'Asha', feeType: 'academic', amount: 4800 })
  })
})

describe('payInvoice', () => {
  it('POSTs /fees/invoices/{id}/pay with a snake_case body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: wirePayment }))
    vi.stubGlobal('fetch', fetchMock)
    await payInvoice('INV-9', { id: 0, studentId: 's1', studentName: 'Asha', cls: 'X-A', feeType: 'academic', amount: 4800, mode: 'UPI', ref: 'TXN1', date: '2026-06-01' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/fees/invoices/INV-9/pay')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.student_id).toBe('s1')
    expect(body.fee_type).toBe('academic')
  })
})
```

- [ ] **Step 4: Run it (FAIL), then implement fee-payments**

Run: `npx vitest run src/api/feePayments.test.ts` → FAIL.

Create `src/api/feePayments.ts`:
```ts
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { FeePayment } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listFeePayments(): Promise<FeePayment[]> {
  const env = await listRequest<ListEnvelope>('/fees/payments')
  return env.data.map((p) => snakeToCamel<FeePayment>(p))
}

export async function payInvoice(invoiceId: string, payment: FeePayment): Promise<FeePayment> {
  const wire = await request<Record<string, unknown>>(`/fees/invoices/${invoiceId}/pay`, { method: 'POST', body: camelToSnake(payment) })
  return snakeToCamel<FeePayment>(wire)
}
```

- [ ] **Step 5: Run it (PASS), typecheck, commit**

Run: `npx vitest run src/api/feePayments.test.ts` → PASS. Then `npm run typecheck` → PASS.
```bash
git add src/api/announcements.ts src/api/announcements.test.ts src/api/feePayments.ts src/api/feePayments.test.ts
git commit -m "feat(api): announcements (list/create) + fee-payments (list/pay) modules"
```

---

### Task 3: Hooks for comms + fee-payments

**Files:**
- Modify: `src/api/queryKeys.ts` (add `complaints`, `threads`, `announcements`, `feePayments` groups)
- Create: `src/api/hooks/useComplaints.ts`, `src/api/hooks/useThreads.ts`, `src/api/hooks/useAnnouncements.ts`, `src/api/hooks/useFeePayments.ts`
- Create: `src/api/hooks/useFinanceComms.test.tsx`

**Interfaces:**
- Produces: `useComplaints()`, `useThreads()`, `useAnnouncements()`, `useCreateAnnouncement()`, `useFeePayments()`, `usePayInvoice()` (mutate arg `{ invoiceId, payment }`). Mutations invalidate their list (`announcements`/`feePayments`).

- [ ] **Step 1: Extend the query-key factory**

In `src/api/queryKeys.ts`, add:
```ts
  complaints: { all: ['complaints'] as const },
  threads: { all: ['threads'] as const },
  announcements: { all: ['announcements'] as const },
  feePayments: { all: ['feePayments'] as const },
```

- [ ] **Step 2: Write the failing hook test**

Create `src/api/hooks/useFinanceComms.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useComplaints } from './useComplaints'
import { useFeePayments, usePayInvoice } from './useFeePayments'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }
function wrap(qc: QueryClient) { return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useComplaints', () => {
  it('resolves mapped complaints', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'C1', subject: 's', from: 'p', category: 'transport', priority: 'high', status: 'open', age: '2d', assignee: 'a', body: 'b' }], next_cursor: null })))
    const { result } = renderHook(() => useComplaints(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 'C1', cat: 'transport' })
  })
})

describe('usePayInvoice', () => {
  it('POSTs and invalidates fee payments', async () => {
    const qc = client(); const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { id: 1, student_id: 's1', student_name: 'A', cls: 'X', fee_type: 'academic', amount: 1, mode: 'UPI', ref: 'r', date: 'd' } })))
    const { result } = renderHook(() => usePayInvoice(), { wrapper: wrap(qc) })
    result.current.mutate({ invoiceId: 'INV-1', payment: { id: 0, studentId: 's1', studentName: 'A', cls: 'X', feeType: 'academic', amount: 1, mode: 'UPI', ref: 'r', date: 'd' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feePayments'] })
  })
})

describe('useFeePayments', () => {
  it('resolves mapped payments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 1, student_id: 's1', student_name: 'A', cls: 'X', fee_type: 'academic', amount: 1, mode: 'UPI', ref: 'r', date: 'd' }], next_cursor: null })))
    const { result } = renderHook(() => useFeePayments(), { wrapper: wrap(client()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ studentId: 's1', feeType: 'academic' })
  })
})
```

- [ ] **Step 3: Run it (FAIL), then implement the hooks**

Run: `npx vitest run src/api/hooks/useFinanceComms.test.tsx` → FAIL.

Create `src/api/hooks/useComplaints.ts`:
```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listComplaints } from '../complaints'
import { queryKeys } from '../queryKeys'
import type { Complaint } from '@/types'

export function useComplaints(): UseQueryResult<Complaint[]> {
  return useQuery({ queryKey: queryKeys.complaints.all, queryFn: () => listComplaints() })
}
```

Create `src/api/hooks/useThreads.ts`:
```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listThreads } from '../threads'
import { queryKeys } from '../queryKeys'
import type { Thread } from '@/types'

export function useThreads(): UseQueryResult<Thread[]> {
  return useQuery({ queryKey: queryKeys.threads.all, queryFn: () => listThreads() })
}
```

Create `src/api/hooks/useAnnouncements.ts`:
```ts
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listAnnouncements, createAnnouncement, type Announcement } from '../announcements'
import { queryKeys } from '../queryKeys'

export function useAnnouncements(): UseQueryResult<Announcement[]> {
  return useQuery({ queryKey: queryKeys.announcements.all, queryFn: () => listAnnouncements() })
}

export function useCreateAnnouncement(): UseMutationResult<Announcement, Error, { title: string; audience: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; audience: string }) => createAnnouncement(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.announcements.all }) },
  })
}
```

Create `src/api/hooks/useFeePayments.ts`:
```ts
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { listFeePayments, payInvoice } from '../feePayments'
import { queryKeys } from '../queryKeys'
import type { FeePayment } from '@/types'

export function useFeePayments(): UseQueryResult<FeePayment[]> {
  return useQuery({ queryKey: queryKeys.feePayments.all, queryFn: () => listFeePayments() })
}

export function usePayInvoice(): UseMutationResult<FeePayment, Error, { invoiceId: string; payment: FeePayment }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, payment }: { invoiceId: string; payment: FeePayment }) => payInvoice(invoiceId, payment),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.feePayments.all }) },
  })
}
```

- [ ] **Step 4: Run it (PASS), typecheck, commit**

Run: `npx vitest run src/api/hooks/useFinanceComms.test.tsx` → PASS. Then `npm run typecheck` → PASS.
```bash
git add src/api/queryKeys.ts src/api/hooks/useComplaints.ts src/api/hooks/useThreads.ts src/api/hooks/useAnnouncements.ts src/api/hooks/useFeePayments.ts src/api/hooks/useFinanceComms.test.tsx
git commit -m "feat(api): comms + fee-payment hooks (complaints/threads/announcements/feePayments)"
```

---

### Task 4: Wire operations.tsx (complaints, threads, announcements)

**Files:**
- Modify: `src/screens/school/operations.tsx`

**Interfaces:**
- Consumes: `useComplaints`, `useThreads`, `useAnnouncements`, `useCreateAnnouncement`.

- [ ] **Step 1: Wire the complaints list**

In `src/screens/school/operations.tsx`:
- Add: `import { useComplaints } from '@/api/hooks/useComplaints'`, `import { useThreads } from '@/api/hooks/useThreads'`, `import { useAnnouncements, useCreateAnnouncement } from '@/api/hooks/useAnnouncements'`.
- In `ComplaintsTab`, replace the module-level `complaints` source: where it reads `complaints.map(...)`, add `const { data: complaintsData } = useComplaints(); const complaints = complaintsData ?? []` at the top of the component (shadowing the mockDb import inside the component). Remove `complaints` from the `@/data/mockDb` import line ONLY IF nothing else in the file uses it (check — `threads`/`buses` likely stay; remove just `complaints`). Keep the local `resolved` Set + `resolve` handler as-is (complaint-resolve stays optimistic-local — Phase 6 flag). JSX unchanged.

- [ ] **Step 2: Wire the threads list**

In `MessengerTab`, replace `import`-level `threads` usage: add `const { data: threadsData } = useThreads(); const apiThreads = threadsData ?? []`, and change `const allThreads = [...localThreads, ...(threads as ChatThread[])]` to `const allThreads = [...localThreads, ...(apiThreads as ChatThread[])]`. Remove `threads` from the mockDb import if now unused. Keep the local `drafts`/`send`/`startChat` handlers as-is (messenger send + new-thread stay local — Phase 6 flag). JSX unchanged.

- [ ] **Step 3: Wire the announcements list + create**

In `AnnouncementsTab`, replace the hardcoded inline `const sent = [...]` array with `const { data: sentData } = useAnnouncements(); const sent = sentData ?? []`. In `AnnouncementModal`, add `const createAnnouncement = useCreateAnnouncement()` and replace the `send()` toast-only body with:
```tsx
createAnnouncement.mutate({ title, audience: String(recipients) }, {
  onSuccess: () => { toast.success('Announcement sent', `"${title}" delivered to ${recipients.toLocaleString()} recipient${recipients === 1 ? '' : 's'}.`); onClose() },
  onError: (err) => { toast.danger('Could not send', err instanceof Error ? err.message : 'Please try again.') },
})
```
(Adapt `title`/`recipients` to the exact in-scope identifiers in `AnnouncementModal` — read the file. If `audience` is a named string in scope, pass it instead of `String(recipients)`. Keep all JSX.)

- [ ] **Step 4: Typecheck, run the full suite, commit**

Run: `npm run typecheck` → PASS. Then `npm test` → full suite green (`registry.test.tsx` wraps a QueryClient; operations screens render under `<App/>`'s provider too). Then commit:
```bash
git add src/screens/school/operations.tsx
git commit -m "feat(comms): bind complaints/threads/announcements lists to live API (no UI change)"
```

---

### Task 5: Wire finance.tsx (fee history + pay) + final verification

**Files:**
- Modify: `src/screens/school/finance.tsx`
- Modify: `src/screens/school/financeFees.test.tsx` (QueryClientProvider + mocked fetch)

**Interfaces:**
- Consumes: `useFeePayments`, `usePayInvoice`.

- [ ] **Step 1: Adapt the finance test first**

Read `src/screens/school/financeFees.test.tsx`. Wrap its render in `QueryClientProvider` (`new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })`) and add a `beforeEach` `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(...))` returning `{ data: [], next_cursor: null }` for the fee-payments GET and an echo payment for the pay POST. Test 1 records a payment then checks the History tab for the `'Transport (Bus)'` badge — after binding, the History tab reads `useFeePayments()` (server), so the just-paid payment won't appear from local state. Adjust Test 1 to assert the **pay POST fired** (`await waitFor` for a POST to `/fees/invoices`) rather than the History-tab badge; OR make the fetch mock's GET return the paid payment so the badge still renders. Preserve Test 2 (fee-structure, which stays local) under the provider — it should pass unchanged. Read the file and keep its exact identifiers.

- [ ] **Step 2: Run it (FAIL), then wire finance**

Run: `npx vitest run src/screens/school/financeFees.test.tsx` → FAIL.

In `src/screens/school/finance.tsx`:
- Add: `import { useFeePayments, usePayInvoice } from '@/api/hooks/useFeePayments'`.
- In `FeeHistoryTab`, replace `app.feePayments` with the hook: `const { data: paymentsData } = useFeePayments(); const feePayments = paymentsData ?? []`, and use `feePayments` where `app.feePayments` was referenced (the `useMemo` filter). JSX unchanged.
- In `PaymentModal`, add `const payInvoice = usePayInvoice()`. Replace the `submit()` body's `app.addFeePayment(payment)` + toast with:
```tsx
payInvoice.mutate({ invoiceId: row.id ?? row.stu?.id ?? 'invoice', payment }, {
  onSuccess: () => { toast.success('Payment recorded', /* keep existing message */); onClose() },
  onError: (err) => { toast.danger('Payment failed', err instanceof Error ? err.message : 'Please try again.') },
})
```
(Adapt `invoiceId` to the row's invoice identifier and `payment`/toast message to the exact in-scope identifiers — read the file. Keep all JSX. The `collection`/`structure` tabs and the waiver/payroll handlers stay local — flagged.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` → PASS.

- [ ] **Step 4: Run the full suite**

Run: `npm test` → full suite green.

- [ ] **Step 5: Build**

Run: `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/finance.tsx src/screens/school/financeFees.test.tsx
git commit -m "feat(finance): bind fee history + pay invoice to live API (no UI change)"
```

---

## Phase 5 done — bound vs flagged

Bound: complaints list, threads list, announcements list + create, fee-payments history + pay-invoice.

Flagged (no clean endpoint / intricate local interaction): messenger send + new-thread (local drafts), complaint resolve (optimistic-local), fee waiver, fee-structure config, payroll run/approve, payslips + leave (no UI rendered), bus fleet + live GPS.

Remaining: **Phase 6** gap-flagging ("Demo data" badges across all flagged surfaces) + AppProvider seed cleanup.

## Self-Review notes

- **Spec coverage (design §4 finance/operations rows, partial):** `/complaints`, `/threads`, `/announcements`, `/fees/payments`, `POST /fees/invoices/{id}/pay` bound. Messages send, waiver, fee-structure, payroll, payslips/leave (no UI), bus/GPS deferred/flagged per the agreed "bind clean subset, flag rest".
- **Type consistency:** `toComplaint` renames `category→cat`; FeePayment fields are generic; `Announcement` defined once in `announcements.ts`; Thread generic passthrough. Hooks invalidate `announcements`/`feePayments` keys.
- **No-UI-change:** list data-source swaps + two actions (send announcement, pay invoice) become real calls keeping their toasts; no JSX/className changes.
- **Inference flagged:** Thread/Announcement field shapes and the complaint `category` rename and the pay-invoice body follow assumed contracts; only `category→cat` is an explicit rename. No running backend consulted.
- **Provider-in-tests:** `financeFees.test.tsx` gains a `QueryClientProvider` + mocked fetch; Test 1's payment assertion moves to the POST path (or the GET mock returns the payment); Test 2 (fee-structure, local) preserved.
