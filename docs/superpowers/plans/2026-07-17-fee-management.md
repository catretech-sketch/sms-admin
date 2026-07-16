# Fee Management (Offline + Razorpay + School Integrations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace dummy fee collection with a real school fee ledger (heads, structure, invoices, offline pay modes), school Settings integrations (Email / SMS / Razorpay), parent notices, online collect via per-school Razorpay, and live dashboard fee KPIs.

**Architecture:** New API modules + React Query hooks under `src/api/` follow existing `feePayments.ts` / `announcements.ts` patterns (snake_case wire, `{ data }` unwrap). Fees screen (`finance.tsx`) switches from mock students to invoices + summary. School Settings (`admin.tsx` SettingsScreen) gains an Integrations card for Email, SMS, and Razorpay. Notifications reuse `createAnnouncement` via `feeNotify.ts` (mirror `examNotify.ts`). Platform SaaS Razorpay (`upgradeRequests.ts`) stays separate from school fee cash.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`, existing Razorpay checkout script helper.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-offline-fee-management-design.md`
- Wire is snake_case both ways; lists use `{ data, next_cursor }`; mutations use `{ data }`.
- School fee Razorpay uses **that school’s** keys from `/school/integrations` — never platform `/me/payment-gateway` keys.
- Secrets (Razorpay key secret, webhook secret) are write-only in UI; GET responses return masked status only.
- Existing `listFeePayments` / `payInvoice` / `useOwnerFeeSummary` stay; extend payloads, do not break History tab.
- `npm test`, `npm run typecheck`, `npm run build` green after each task.
- Follow shipped patterns in `src/api/feePayments.ts`, `src/lib/examNotify.ts`, `src/screens/school/admin.tsx` SettingsScreen.

## File map

| File | Responsibility |
|------|----------------|
| `src/types/index.ts` | `FeeHead`, `FeeInvoice`, extend `FeePayment`, `SchoolIntegrations` |
| `src/api/queryKeys.ts` | fee + school.integrations keys |
| `src/api/feeHeads.ts` (+ test) | CRUD fee heads |
| `src/api/feeStructure.ts` (+ test) | GET/PUT structure matrix |
| `src/api/feeInvoices.ts` (+ test) | list + generate |
| `src/api/feePayments.ts` (+ test) | extend pay; add razorpay order/verify |
| `src/api/feeReports.ts` (+ test) | school fee summary |
| `src/api/feeReminders.ts` (+ test) | POST reminders |
| `src/api/schoolIntegrations.ts` (+ test) | GET/PUT integrations + razorpay verify |
| `src/api/hooks/useFees.ts` (+ test) | all fee hooks |
| `src/api/hooks/useSchoolIntegrations.ts` (+ test) | integrations hooks |
| `src/lib/feeNotify.ts` (+ test) | receipt + reminder notify |
| `src/screens/school/finance.tsx` | Collection / History / Structure wired |
| `src/screens/school/financeFees.test.tsx` | UI tests |
| `src/screens/school/admin.tsx` | Settings Integrations UI |
| `src/screens/school/dashboard.tsx` | live fee KPIs |

---

### Task 1: Domain types + query keys

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/api/queryKeys.ts`

**Interfaces:**
- Produces: `FeeHead`, `FeeInvoice`, `FeeInvoiceLine`, `FeeCheque`, `FeeGateway`, extended `FeePayment`, `FeeReportSummary`, `SchoolIntegrations`, `SchoolEmailSettings`, `SchoolSmsSettings`, `SchoolRazorpaySettings`

- [ ] **Step 1: Extend types**

In `src/types/index.ts`, keep legacy `FeeType` for backward compat but add:

```ts
export interface FeeHead {
  id: string
  name: string
  code?: string
  active: boolean
  isSystem?: boolean
}

export interface FeeInvoiceLine {
  headId: string
  headName: string
  amount: number
}

export interface FeeInvoice {
  id: string
  studentId: string
  studentName: string
  cls: string
  grade: string
  academicYear: string
  term: string
  lines: FeeInvoiceLine[]
  total: number
  paid: number
  waived: number
  due: number
  status: FeeStatus
  dueDate?: string
}

export interface FeeCheque {
  number: string
  bank?: string
  date?: string
  status?: string
}

export interface FeeGateway {
  provider: 'razorpay'
  orderId?: string
  paymentId?: string
  signature?: string
}

export interface FeePayment {
  id: number
  invoiceId?: string
  studentId: string
  studentName: string
  cls: string
  /** @deprecated prefer headId */
  feeType?: FeeType | string
  headId?: string
  headName?: string
  amount: number
  mode: string
  ref: string
  date: string
  note?: string
  collectedBy?: string
  cheque?: FeeCheque
  gateway?: FeeGateway
}

export interface FeeReportSummary {
  collectedToday: number
  collectedTerm: number
  outstanding: number
  defaulters: number
  billedTerm: number
  pct: number
  byClass: { label: string; value: number; n: number }[]
  byMode: { label: string; value: number }[]
  latestPayment?: FeePayment | null
}

export interface SchoolEmailSettings {
  enabled: boolean
  fromName: string
  fromAddress: string
  replyTo?: string
  receiptTemplate?: string
  reminderTemplate?: string
}

export interface SchoolSmsSettings {
  enabled: boolean
  senderId: string
  receiptTemplate?: string
  reminderTemplate?: string
}

export type RazorpayStatus = 'not_configured' | 'configured' | 'invalid'

export interface SchoolRazorpaySettings {
  enabled: boolean
  keyId: string
  /** Never returned from GET; only sent on PUT when changing */
  keySecret?: string
  webhookSecret?: string
  mode: 'test' | 'live'
  status: RazorpayStatus
  keySecretSet?: boolean
  webhookSecretSet?: boolean
}

export interface SchoolIntegrations {
  email: SchoolEmailSettings
  sms: SchoolSmsSettings
  razorpay: SchoolRazorpaySettings
}
```

- [ ] **Step 2: Extend queryKeys**

In `src/api/queryKeys.ts` add:

```ts
  feeHeads: { all: ['feeHeads'] as const },
  feeStructure: { all: ['feeStructure'] as const },
  feeInvoices: {
    all: ['feeInvoices'] as const,
    list: (opts: Record<string, string> = {}) => ['feeInvoices', 'list', opts] as const,
  },
  feeReports: {
    summary: ['feeReports', 'summary'] as const,
  },
  school: {
    integrations: ['school', 'integrations'] as const,
  },
```

Keep existing `feePayments` and `owner.feeSummary`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/api/queryKeys.ts
git commit -m "feat(fees): add fee domain types and query keys"
```

---

### Task 2: Fee heads API + hooks

**Files:**
- Create: `src/api/feeHeads.ts`, `src/api/feeHeads.test.ts`
- Create: `src/api/hooks/useFeeHeads.ts`
- Modify: `src/api/hooks/useFinanceComms.test.tsx` or create `src/api/hooks/useFees.test.tsx`

**Interfaces:**
- Produces: `listFeeHeads()`, `createFeeHead({ name, code? })`, `updateFeeHead(id, patch)`, `deleteFeeHead(id)`, `useFeeHeads()`, `useCreateFeeHead()`, `useUpdateFeeHead()`, `useDeleteFeeHead()`

- [ ] **Step 1: Failing test**

Create `src/api/feeHeads.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeeHeads, createFeeHead } from './feeHeads'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listFeeHeads', () => {
  it('maps snake_case heads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'h1', name: 'Academic', code: 'ACAD', active: true, is_system: true }],
      next_cursor: null,
    })))
    const rows = await listFeeHeads()
    expect(rows[0]).toMatchObject({ id: 'h1', name: 'Academic', isSystem: true, active: true })
  })
})

describe('createFeeHead', () => {
  it('POSTs /fees/heads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'h2', name: 'Lab', active: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await createFeeHead({ name: 'Lab' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/fees/heads')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ name: 'Lab' })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/api/feeHeads.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

Create `src/api/feeHeads.ts`:

```ts
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { FeeHead } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listFeeHeads(): Promise<FeeHead[]> {
  const env = await listRequest<ListEnvelope>('/fees/heads')
  return env.data.map((h) => snakeToCamel<FeeHead>(h))
}

export async function createFeeHead(input: { name: string; code?: string }): Promise<FeeHead> {
  const wire = await request<Record<string, unknown>>('/fees/heads', {
    method: 'POST',
    body: camelToSnake(input),
  })
  return snakeToCamel<FeeHead>(wire)
}

export async function updateFeeHead(id: string, patch: Partial<Pick<FeeHead, 'name' | 'code' | 'active'>>): Promise<FeeHead> {
  const wire = await request<Record<string, unknown>>(`/fees/heads/${id}`, {
    method: 'PATCH',
    body: camelToSnake(patch),
  })
  return snakeToCamel<FeeHead>(wire)
}

export async function deleteFeeHead(id: string): Promise<void> {
  await request<unknown>(`/fees/heads/${id}`, { method: 'DELETE' })
}
```

Create `src/api/hooks/useFeeHeads.ts` with `useFeeHeads`, `useCreateFeeHead`, `useUpdateFeeHead`, `useDeleteFeeHead` invalidating `queryKeys.feeHeads.all`.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/api/feeHeads.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/feeHeads.ts src/api/feeHeads.test.ts src/api/hooks/useFeeHeads.ts
git commit -m "feat(api): fee heads list/create/update/delete"
```

---

### Task 3: Fee structure + invoices APIs

**Files:**
- Create: `src/api/feeStructure.ts`, `src/api/feeStructure.test.ts`
- Create: `src/api/feeInvoices.ts`, `src/api/feeInvoices.test.ts`
- Create: `src/api/hooks/useFeeStructure.ts`, `src/api/hooks/useFeeInvoices.ts`

**Interfaces:**
- Produces: `getFeeStructure(): Promise<Record<string, Record<string, number>>>`, `saveFeeStructure(matrix)`, `listFeeInvoices(opts?)`, `generateFeeInvoices({ grades, academicYear, term, dueDate? })`, matching hooks

- [ ] **Step 1: Failing structure test**

```ts
// src/api/feeStructure.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getFeeStructure, saveFeeStructure } from './feeStructure'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('getFeeStructure', () => {
  it('returns grade×head matrix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: { 'X': { h1: 36000, h2: 18000 } },
    })))
    expect(await getFeeStructure()).toEqual({ X: { h1: 36000, h2: 18000 } })
  })
})

describe('saveFeeStructure', () => {
  it('PUTs /fees/structure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { X: { h1: 1 } } }))
    vi.stubGlobal('fetch', fetchMock)
    await saveFeeStructure({ X: { h1: 1 } })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/fees/structure')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
  })
})
```

- [ ] **Step 2: Implement structure module**

```ts
// src/api/feeStructure.ts
import { request } from './client'

export type FeeStructureMatrix = Record<string, Record<string, number>>

export async function getFeeStructure(): Promise<FeeStructureMatrix> {
  return request<FeeStructureMatrix>('/fees/structure')
}

export async function saveFeeStructure(matrix: FeeStructureMatrix): Promise<FeeStructureMatrix> {
  return request<FeeStructureMatrix>('/fees/structure', { method: 'PUT', body: matrix })
}
```

- [ ] **Step 3: Failing invoices test + implement**

```ts
// feeInvoices.test.ts — list maps snake_case; generate POSTs grades/academic_year/term
```

```ts
// src/api/feeInvoices.ts
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { FeeInvoice } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listFeeInvoices(opts: { q?: string; status?: string; grade?: string; class?: string } = {}): Promise<FeeInvoice[]> {
  const env = await listRequest<ListEnvelope>('/fees/invoices', { query: opts })
  return env.data.map((row) => snakeToCamel<FeeInvoice>(row))
}

export async function generateFeeInvoices(input: {
  grades: string[]
  academicYear: string
  term: string
  dueDate?: string
}): Promise<{ created: number }> {
  return request<{ created: number }>('/fees/invoices/generate', {
    method: 'POST',
    body: camelToSnake(input),
  })
}
```

Hooks: `useFeeStructure`, `useSaveFeeStructure`, `useFeeInvoices(opts)`, `useGenerateFeeInvoices` — invalidate structure / invoices / reports as appropriate.

- [ ] **Step 4: Tests PASS + typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/api/feeStructure.ts src/api/feeStructure.test.ts src/api/feeInvoices.ts src/api/feeInvoices.test.ts src/api/hooks/useFeeStructure.ts src/api/hooks/useFeeInvoices.ts
git commit -m "feat(api): fee structure and invoices list/generate"
```

---

### Task 4: Fee reports summary + extend payments

**Files:**
- Create: `src/api/feeReports.ts`, `src/api/feeReports.test.ts`, `src/api/hooks/useFeeReports.ts`
- Modify: `src/api/feePayments.ts`, `src/api/feePayments.test.ts`, `src/api/hooks/useFeePayments.ts`

**Interfaces:**
- Produces: `getFeeReportSummary(): Promise<FeeReportSummary>`, `useFeeReportSummary()`
- Extends: `payInvoice` body may include `headId`, `note`, `cheque`, `invoiceId`; invalidate invoices + reports on pay success

- [ ] **Step 1: Failing summary test**

```ts
import { getFeeReportSummary } from './feeReports'
// GET /fees/reports/summary → camelCase FeeReportSummary
```

- [ ] **Step 2: Implement**

```ts
import { request } from './client'
import { snakeToCamel } from './mapper'
import type { FeeReportSummary } from '@/types'

export async function getFeeReportSummary(): Promise<FeeReportSummary> {
  const wire = await request<Record<string, unknown>>('/fees/reports/summary')
  return snakeToCamel<FeeReportSummary>(wire)
}
```

- [ ] **Step 3: Extend payInvoice test for head_id + cheque**

Update `payInvoice` caller sites to pass optional `headId`. Keep mapping `fee_type` for legacy. On `usePayInvoice` success invalidate:

```ts
qc.invalidateQueries({ queryKey: queryKeys.feePayments.all })
qc.invalidateQueries({ queryKey: queryKeys.feeInvoices.all })
qc.invalidateQueries({ queryKey: queryKeys.feeReports.summary })
```

- [ ] **Step 4: PASS + commit**

```bash
git commit -m "feat(api): fee report summary and richer pay payload"
```

---

### Task 5: Wire Structure tab to live heads/structure/generate

**Files:**
- Modify: `src/screens/school/finance.tsx` (`FeeStructureTab`)
- Modify: `src/screens/school/financeFees.test.tsx`

**Interfaces:**
- Consumes: `useFeeHeads`, `useCreateFeeHead`, `useDeleteFeeHead`, `useFeeStructure`, `useSaveFeeStructure`, `useGenerateFeeInvoices`

- [ ] **Step 1: Update structure test**

Mock fetch for `/fees/heads` and `/fees/structure`. Assert:
- heads render from API
- Save structure PUTs `/fees/structure`
- Generate invoices button POSTs `/fees/invoices/generate`

- [ ] **Step 2: Implement FeeStructureTab**

- Load heads + matrix from hooks (fallback empty).  
- Remove `DemoBadge` and `app.saveFeeStructure` as source of truth.  
- Add head → `useCreateFeeHead`; remove → `useDeleteFeeHead` (or deactivate).  
- Save → `useSaveFeeStructure`.  
- Add fields: academic year, term, grade multi-select, **Generate invoices** → `useGenerateFeeInvoices`.  
- Grades: from `useClasses` unique grades if available, else existing `grades` list.

- [ ] **Step 3: Tests PASS**

Run: `npx vitest run src/screens/school/financeFees.test.tsx`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(fees): wire Structure tab to heads/structure/generate APIs"
```

---

### Task 6: Wire Collection tab to invoices + summary + offline pay modes

**Files:**
- Modify: `src/screens/school/finance.tsx` (`FeesScreen`, `PaymentModal`, `WaiverModal`)
- Modify: `src/screens/school/financeFees.test.tsx`

**Interfaces:**
- Consumes: `useFeeInvoices`, `useFeeReportSummary`, `useFeeHeads`, `usePayInvoice`

- [ ] **Step 1: Failing/updated UI tests**

- Collection KPIs come from summary mock (not mock student math).  
- Record payment POSTs with mode from full list and `headId`.  
- Table rows keyed by invoice id.

- [ ] **Step 2: Replace mock collection**

- Remove `students.map(buildFeeRow)` as primary source.  
- Rows = `useFeeInvoices()` mapped to display shape (`due`, `status`, `studentName`, …).  
- KPIs + by-class bars from `useFeeReportSummary()`.  
- Live cue only if `summary.latestPayment` present.  
- `PAY_MODES = ['Cash', 'UPI (manual)', 'Cheque', 'Card / POS', 'Bank transfer', 'DD']`  
- PaymentModal: head select from active heads; show cheque fields when mode === 'Cheque'; submit `payInvoice(invoice.id, payment)`.  
- WaiverModal: mode `'Adjustment / waiver'` via same pay endpoint when `can(app.role, 'fees', 'A')`.

- [ ] **Step 3: History tab**

Keep `useFeePayments`; add client-side mode filter including `Razorpay`.

- [ ] **Step 4: Tests + typecheck + commit**

```bash
git commit -m "feat(fees): wire Collection to invoices, summary, and offline modes"
```

---

### Task 7: School integrations API + Settings UI (Email · SMS · Razorpay)

**Files:**
- Create: `src/api/schoolIntegrations.ts`, `src/api/schoolIntegrations.test.ts`
- Create: `src/api/hooks/useSchoolIntegrations.ts`
- Modify: `src/screens/school/admin.tsx` (`SettingsScreen`)

**Interfaces:**
- Produces: `getSchoolIntegrations()`, `saveSchoolIntegrations(partial)`, `verifySchoolRazorpay()`, `useSchoolIntegrations()`, `useSaveSchoolIntegrations()`, `useVerifySchoolRazorpay()`

- [ ] **Step 1: Failing API test**

```ts
describe('getSchoolIntegrations', () => {
  it('maps email/sms/razorpay and never echoes secrets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        email: { enabled: true, from_name: 'GV', from_address: 'fees@gv.edu' },
        sms: { enabled: true, sender_id: 'SCHMAT' },
        razorpay: { enabled: true, key_id: 'rzp_test_x', status: 'configured', key_secret_set: true, mode: 'test' },
      },
    })))
    const s = await getSchoolIntegrations()
    expect(s.email.fromName).toBe('GV')
    expect(s.razorpay.keySecret).toBeUndefined()
    expect(s.razorpay.keySecretSet).toBe(true)
  })
})

describe('saveSchoolIntegrations', () => {
  it('PUTs /school/integrations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await saveSchoolIntegrations({ email: { enabled: true, fromName: 'A', fromAddress: 'a@b.c' } })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/school/integrations')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
  })
})
```

- [ ] **Step 2: Implement API**

```ts
export async function getSchoolIntegrations(): Promise<SchoolIntegrations> {
  const wire = await request<Record<string, unknown>>('/school/integrations')
  return snakeToCamel<SchoolIntegrations>(wire)
}

export async function saveSchoolIntegrations(input: Partial<{
  email: Partial<SchoolEmailSettings>
  sms: Partial<SchoolSmsSettings>
  razorpay: Partial<SchoolRazorpaySettings>
}>): Promise<SchoolIntegrations> {
  const wire = await request<Record<string, unknown>>('/school/integrations', {
    method: 'PUT',
    body: camelToSnake(input),
  })
  return snakeToCamel<SchoolIntegrations>(wire)
}

export async function verifySchoolRazorpay(): Promise<{ status: RazorpayStatus }> {
  return request<{ status: RazorpayStatus }>('/school/integrations/razorpay/verify', { method: 'POST' })
}
```

- [ ] **Step 3: Settings UI**

In `SettingsScreen`, add a full-width **Integrations** card (or third column) with three sections:

1. **Email** — Toggle, From name, From address, Reply-to, receipt/reminder template textareas  
2. **SMS** — Toggle, Sender ID, templates  
3. **Razorpay** — Toggle, Key ID, Key secret (password input, placeholder “•••• if set”), Webhook secret, Test/Live select, status Badge, **Test connection**, **Save**

Only `owner` / `admin` / `isPlatform` can edit (same as profile). On save, omit empty secret fields so existing secrets are not wiped.

- [ ] **Step 4: Smoke test (optional RTL) + commit**

```bash
git commit -m "feat(settings): school Email, SMS, and Razorpay integrations"
```

---

### Task 8: feeNotify + reminders modal

**Files:**
- Create: `src/lib/feeNotify.ts`, `src/lib/feeNotify.test.ts`
- Create: `src/api/feeReminders.ts`, `src/api/feeReminders.test.ts`
- Modify: `src/screens/school/finance.tsx` (Send reminders)

**Interfaces:**
- Produces: `notifyFeeAudience(...)`, `sendFeeReminders(input)`, `useSendFeeReminders()`

- [ ] **Step 1: feeNotify failing test** (mirror `examNotify.test.ts`)

```ts
await notifyFeeAudience({
  kind: 'receipt',
  schoolName: 'Demo',
  studentName: 'Asha',
  amount: 1000,
  mode: 'Cash',
  channels: { email: true, sms: true, app: true },
  emails: ['p@x.com'],
  phones: ['9999999999'],
})
// expects createAnnouncement with type fee_receipt and channels
```

- [ ] **Step 2: Implement feeNotify**

Call `createAnnouncement` with `type: 'fee_receipt' | 'fee_reminder'`, body built from templates or defaults, emails/phones/channels.

- [ ] **Step 3: Reminders API**

```ts
export async function sendFeeReminders(input: {
  invoiceIds?: string[]
  audience?: 'defaulters' | 'selected'
  channels: string[]
  includePayLink?: boolean
}): Promise<{ reach: number }> {
  return request<{ reach: number }>('/fees/reminders', {
    method: 'POST',
    body: camelToSnake(input),
  })
}
```

- [ ] **Step 4: UI**

Replace `app.go('school.communication', { intent: 'fee-reminder' })` with a modal: channel checkboxes App/Email/SMS, audience defaulters vs selected, Submit → `useSendFeeReminders`. After offline pay success, optionally call `notifyFeeAudience` for receipt (best-effort; don’t fail pay toast).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(fees): parent receipt/reminder notify and reminders API"
```

---

### Task 9: Per-school Razorpay collect (order + checkout)

**Files:**
- Modify: `src/api/feePayments.ts`, `src/api/feePayments.test.ts`, `src/api/hooks/useFeePayments.ts`
- Modify: `src/screens/school/finance.tsx`
- Reuse: `loadRazorpayScript` from `src/api/upgradeRequests.ts` (import only the script loader; do **not** use platform order APIs)

**Interfaces:**
- Produces: `createFeeRazorpayOrder(invoiceId)`, `verifyFeeRazorpayPayment(invoiceId, body)`, `useCreateFeeRazorpayOrder()`, `useVerifyFeeRazorpayPayment()`

- [ ] **Step 1: Failing API test**

```ts
await createFeeRazorpayOrder('INV-1')
// POST /fees/invoices/INV-1/razorpay/order
await verifyFeeRazorpayPayment('INV-1', {
  razorpayOrderId: 'order_x',
  razorpayPaymentId: 'pay_x',
  razorpaySignature: 'sig',
})
```

- [ ] **Step 2: Implement**

```ts
export async function createFeeRazorpayOrder(invoiceId: string): Promise<{
  orderId: string
  amount: number
  currency: string
  keyId: string
}> {
  const wire = await request<Record<string, unknown>>(`/fees/invoices/${invoiceId}/razorpay/order`, { method: 'POST' })
  return snakeToCamel(wire) as { orderId: string; amount: number; currency: string; keyId: string }
}

export async function verifyFeeRazorpayPayment(
  invoiceId: string,
  body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<FeePayment> {
  const wire = await request<Record<string, unknown>>(`/fees/invoices/${invoiceId}/razorpay/verify`, {
    method: 'POST',
    body: camelToSnake(body),
  })
  return snakeToCamel<FeePayment>(wire)
}
```

- [ ] **Step 3: UI Collect online**

- `useSchoolIntegrations()` — if `razorpay.enabled && razorpay.status === 'configured'`, show **Collect online** / **Send pay link** on due rows.  
- Collect online: create order → `loadRazorpayScript()` → `new window.Razorpay({ key: keyId, amount, order_id, handler })` → on success verify → invalidate queries → toast + optional receipt notify.  
- Send pay link: if API returns `payLink` on order, copy to clipboard; else toast that link requires backend pay-link field.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(fees): school Razorpay order, checkout, and verify"
```

---

### Task 10: School dashboard fee KPIs

**Files:**
- Modify: `src/screens/school/dashboard.tsx`
- Optional test: small hook/render smoke if existing dashboard tests exist

**Interfaces:**
- Consumes: `useFeeReportSummary()`

- [ ] **Step 1: Replace fake math**

Remove:

```ts
const feesToday = Math.round(liveStudents * 920)
const outstanding = Math.round(liveStudents * (100 - s.fees) * 145)
```

Use:

```ts
const feeQ = useFeeReportSummary()
const feesToday = feeQ.data?.collectedToday ?? 0
const outstanding = feeQ.data?.outstanding ?? 0
const collectedPct = feeQ.data?.pct ?? 0
```

Update KPI footers and fee donut to use `collectedPct` / amounts from summary. If summary loading, show `—` or previous skeleton pattern used elsewhere.

- [ ] **Step 2: Activity**

If `latestPayment` present, prepend real “Payment received — …” line.

- [ ] **Step 3: typecheck + full test suite + commit**

```bash
npm run typecheck
npm test
git commit -m "feat(dashboard): bind fee KPIs to fee report summary"
```

---

## Self-review (plan vs spec)

| Spec section | Task(s) |
|--------------|---------|
| Fee heads + structure + generate | 2, 3, 5 |
| Invoices + offline modes + waiver | 4, 6 |
| School Settings Email/SMS/Razorpay | 7 |
| Parent notices + reminders | 8 |
| Per-school Razorpay collect | 9 |
| Dashboards | 10 |
| Owner revenue already live | no change (keep) |
| Platform SaaS Razorpay separate | Task 9 constraint |

No intentional TBD left. Backend path names follow the approved spec; if live API differs, adapt only the resource modules.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-17-fee-management.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
