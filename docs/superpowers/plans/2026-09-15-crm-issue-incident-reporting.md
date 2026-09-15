# CRM Issue/Incident Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manager-facing "Issues" tab to sms-admin's Operations → Communication screen, consuming the (not-yet-built) sms-staff/sms-backend Issues API, and fix the confirmed gap where Transport/Operations screens don't wire the existing role-permission matrix into their action buttons.

**Architecture:** New self-contained API module (`src/api/issues.ts` + `src/api/hooks/useIssues.ts`) follows the existing `complaints.ts`/`useComplaints.ts` pattern exactly (envelope, `snakeToCamel`/`camelToSnake` mapper, React Query hooks). A new `IssuesTab` + `IssueDetailDrawer` render inside the existing `operations.tsx` `CommunicationScreen`, reusing `DataTable`, `Drawer`, `Search`, `Select`, `Textarea` from `@/components/ui`. Manager-only actions (status change, add note) are gated by a new `issues` row in the existing `PERMS` matrix (`src/data/mockDb.ts`), read through the existing `can()` function — no new authorization mechanism. Separately, `transport.tsx`'s existing action buttons get the same `can()` check wired in using the existing `operations` PERMS row, which is currently defined but never read by that screen.

**Tech Stack:** React 19, TypeScript, Vite, TanStack React Query, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-15-crm-issue-incident-reporting-design.md`

## Global Constraints

- sms-admin only. No sms-backend, sms-staff, database, or migration changes.
- No mock/fake data as a production source. Tests use stubbed `fetch` (existing convention), never `localStorage`/`sessionStorage` as a data source.
- Do not modify Complaints (`ComplaintsTab`, `src/api/complaints.ts`, `useComplaints.ts`) or any of its tests.
- Issues gets its own query keys, isolated from `complaints`.
- Status filter (`open|in_progress|resolved|closed`) is server-side via `?status=`; title/description search is client-side on the already-fetched page.
- Manager actions (status change, add note) visible only to School Admin / Principal / Vice-Principal / School Owner, via the existing `can()`/`PERMS` mechanism — never a new permission system.
- Backend for Issues does not exist yet (confirmed 2026-09-15 with the sms-staff session). This plan produces code-complete, test-passing, type-checked, build-clean work. No end-to-end claim against a live backend.
- Every task ends with passing tests before moving to the next task.

---

### Task 1: Add an `issues` row to the permission matrix

**Files:**
- Modify: `src/data/mockDb.ts:40-54` (the `PERMS` object)
- Modify: `src/lib/gating.test.ts` (extend the existing `describe('gating')` block)

**Interfaces:**
- Produces: `PERMS.issues: Record<GateRole, Cap[]>` — a new module key readable via the existing `can(role, 'issues', cap)` and `caps(role, 'issues')` functions (no signature changes to `gating.ts`).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/gating.test.ts`, inside the existing `describe('gating', () => { ... })` block (after the `'can() reads the permission matrix'` test):

```ts
  it('can() gates Issues manager actions to admin/principal/vice_principal (owner via inheritance)', () => {
    expect(can('admin', 'issues', 'E')).toBe(true)
    expect(can('principal', 'issues', 'E')).toBe(true)
    expect(can('vice_principal', 'issues', 'E')).toBe(true)
    expect(can('owner', 'issues', 'E')).toBe(true)
    expect(can('teacher', 'issues', 'E')).toBe(false)
    expect(can('staff', 'issues', 'E')).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gating.test.ts`
Expected: FAIL — `can('admin', 'issues', 'E')` returns `false` because `PERMS.issues` does not exist yet.

- [ ] **Step 3: Add the PERMS row**

In `src/data/mockDb.ts`, add this line inside the `PERMS` object (after the `operations` line, before the closing `}` at line 54):

```ts
  issues: { admin: ['V', 'E'], principal: ['V', 'E'], vice_principal: ['V', 'E'], teacher: [], staff: [] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gating.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/mockDb.ts src/lib/gating.test.ts
git commit -m "feat(rbac): add issues module to the permission matrix"
```

---

### Task 2: Issues API module

**Files:**
- Create: `src/api/issues.ts`
- Create: `src/api/issues.test.ts`

**Interfaces:**
- Consumes: `request`, `listRequest` from `./client` (existing); `snakeToCamel`, `camelToSnake` from `./mapper` (existing).
- Produces (used by Task 3 onward):
  - `type IssueCategory = 'vehicle' | 'student' | 'route' | 'safety' | 'other'`
  - `type IssuePriority = 'normal' | 'high' | 'emergency'`
  - `type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'`
  - `interface IssueNote { id: string; authorUserId: string; authorName?: string; note: string; createdAt: string }`
  - `interface Issue { id, tenantId, reporterUserId, reporterName?, category, title, description, priority, status, vehicleId?, routeId?, tripId?, photoBase64?, notes?: IssueNote[], createdAt, updatedAt }`
  - `interface UpdateIssueInput { status?: IssueStatus; note?: string }`
  - `toIssue(wire): Issue`, `toIssueNote(wire): IssueNote`
  - `listIssues(status?: IssueStatus): Promise<Issue[]>`
  - `getIssue(id: string): Promise<Issue>`
  - `updateIssue(id: string, input: UpdateIssueInput): Promise<Issue>`

- [ ] **Step 1: Write the failing tests**

Create `src/api/issues.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listIssues, getIssue, updateIssue, toIssue } from './issues'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('toIssue', () => {
  it('maps a wire object with notes into camelCase fields', () => {
    const issue = toIssue({
      id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'vehicle',
      title: 'Brake noise', description: 'Squeaking on braking', priority: 'high', status: 'open',
      vehicle_id: 'V1', route_id: null, trip_id: null, photo_base64: null,
      notes: [{ id: 'N1', author_user_id: 'U2', note: 'Checked, scheduling service', created_at: '2026-09-15T10:00:00Z' }],
      created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z',
    })
    expect(issue).toMatchObject({
      id: 'I1', tenantId: 'T1', reporterUserId: 'U1', category: 'vehicle',
      title: 'Brake noise', priority: 'high', status: 'open', vehicleId: 'V1',
    })
    expect(issue.routeId).toBeUndefined()
    expect(issue.notes).toHaveLength(1)
    expect(issue.notes?.[0]).toMatchObject({ id: 'N1', authorUserId: 'U2', note: 'Checked, scheduling service' })
  })
})

describe('listIssues', () => {
  it('GETs the list and maps every row', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'vehicle', title: 'Brake noise',
        description: 'x', priority: 'high', status: 'open',
        created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z',
      }],
      next_cursor: null,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const rows = await listIssues()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'I1', category: 'vehicle', status: 'open' })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/staff\/issues$/)
  })

  it('passes a status filter as a query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listIssues('open')
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/staff\/issues\?status=open$/)
  })
})

describe('getIssue', () => {
  it('GETs the detail by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'safety', title: 'Loose railing',
        description: 'x', priority: 'emergency', status: 'in_progress',
        created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z', notes: [],
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const issue = await getIssue('I1')
    expect(issue).toMatchObject({ id: 'I1', category: 'safety', priority: 'emergency', status: 'in_progress' })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/staff\/issues\/I1$/)
  })
})

describe('updateIssue', () => {
  it('PATCHes a status change', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'vehicle', title: 'Brake noise',
        description: 'x', priority: 'high', status: 'resolved',
        created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const issue = await updateIssue('I1', { status: 'resolved' })
    expect(issue.status).toBe('resolved')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/issues\/I1$/)
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual({ status: 'resolved' })
  })

  it('PATCHes a note only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: 'I1', tenant_id: 'T1', reporter_user_id: 'U1', category: 'vehicle', title: 'Brake noise',
        description: 'x', priority: 'high', status: 'open',
        created_at: '2026-09-15T09:00:00Z', updated_at: '2026-09-15T09:00:00Z',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await updateIssue('I1', { note: 'Scheduled for tomorrow' })
    const [, opts] = fetchMock.mock.calls[0]
    expect(JSON.parse(opts.body as string)).toEqual({ note: 'Scheduled for tomorrow' })
  })

  it('rejects an update with neither status nor note', async () => {
    await expect(updateIssue('I1', {})).rejects.toThrow(/status or a note/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- issues.test.ts`
Expected: FAIL with "Cannot find module './issues'" (the file doesn't exist yet).

- [ ] **Step 3: Implement `src/api/issues.ts`**

```ts
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

export type IssueCategory = 'vehicle' | 'student' | 'route' | 'safety' | 'other'
export type IssuePriority = 'normal' | 'high' | 'emergency'
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface IssueNote {
  id: string
  authorUserId: string
  authorName?: string
  note: string
  createdAt: string
}

export interface Issue {
  id: string
  tenantId: string
  reporterUserId: string
  reporterName?: string
  category: IssueCategory
  title: string
  description: string
  priority: IssuePriority
  status: IssueStatus
  vehicleId?: string
  routeId?: string
  tripId?: string
  photoBase64?: string
  notes?: IssueNote[]
  createdAt: string
  updatedAt: string
}

export interface UpdateIssueInput {
  status?: IssueStatus
  note?: string
}

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export function toIssueNote(wire: Record<string, unknown>): IssueNote {
  const n = snakeToCamel<Record<string, unknown>>(wire)
  return {
    id: String(n.id ?? ''),
    authorUserId: String(n.authorUserId ?? ''),
    authorName: typeof n.authorName === 'string' ? n.authorName : undefined,
    note: String(n.note ?? ''),
    createdAt: String(n.createdAt ?? ''),
  }
}

export function toIssue(wire: Record<string, unknown>): Issue {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const notesWire = Array.isArray(c.notes) ? (c.notes as Record<string, unknown>[]) : undefined
  return {
    id: String(c.id ?? ''),
    tenantId: String(c.tenantId ?? ''),
    reporterUserId: String(c.reporterUserId ?? ''),
    reporterName: typeof c.reporterName === 'string' ? c.reporterName : undefined,
    category: (c.category as IssueCategory) ?? 'other',
    title: String(c.title ?? ''),
    description: String(c.description ?? ''),
    priority: (c.priority as IssuePriority) ?? 'normal',
    status: (c.status as IssueStatus) ?? 'open',
    vehicleId: typeof c.vehicleId === 'string' ? c.vehicleId : undefined,
    routeId: typeof c.routeId === 'string' ? c.routeId : undefined,
    tripId: typeof c.tripId === 'string' ? c.tripId : undefined,
    photoBase64: typeof c.photoBase64 === 'string' ? c.photoBase64 : undefined,
    notes: notesWire?.map(toIssueNote),
    createdAt: String(c.createdAt ?? ''),
    updatedAt: String(c.updatedAt ?? ''),
  }
}

export async function listIssues(status?: IssueStatus): Promise<Issue[]> {
  const env = await listRequest<ListEnvelope>('/staff/issues', {
    query: status ? { status } : undefined,
  })
  return env.data.map(toIssue)
}

export async function getIssue(id: string): Promise<Issue> {
  const wire = await request<Record<string, unknown>>(`/staff/issues/${id}`)
  return toIssue(wire)
}

export async function updateIssue(id: string, input: UpdateIssueInput): Promise<Issue> {
  if (input.status === undefined && input.note === undefined) {
    throw new Error('Provide a status or a note to update')
  }
  const payload = camelToSnake({
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  })
  const wire = await request<Record<string, unknown>>(`/issues/${id}`, { method: 'PATCH', body: payload })
  return toIssue(wire)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- issues.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/issues.ts src/api/issues.test.ts
git commit -m "feat(issues): add Issues API module (list/detail/update)"
```

---

### Task 3: Issues query keys and React Query hooks

**Files:**
- Modify: `src/api/queryKeys.ts` (add an `issues` entry)
- Create: `src/api/hooks/useIssues.ts`

**Interfaces:**
- Consumes: `listIssues`, `getIssue`, `updateIssue`, `Issue`, `IssueStatus`, `UpdateIssueInput` from `../issues` (Task 2).
- Produces (used by Tasks 4-6):
  - `useIssues(status?: IssueStatus | 'all'): UseQueryResult<Issue[]>`
  - `useIssue(id: string | null): UseQueryResult<Issue | null>`
  - `useUpdateIssue(): UseMutationResult<Issue, Error, { id: string; input: UpdateIssueInput }>`

No dedicated hook test file — following the existing convention (`useComplaints.ts` has no standalone test either; hook behavior is exercised through the component tests in Tasks 4-6, same as `useComplaints`/`useUpdateComplaint` are only tested via `ComplaintsTab`).

- [ ] **Step 1: Add the query keys**

In `src/api/queryKeys.ts`, add this entry to the exported `queryKeys` object (after the `complaints` entry, around line 95):

```ts
  issues: {
    all: ['issues'] as const,
    list: (status?: string) => ['issues', 'list', status ?? 'all'] as const,
    detail: (id: string) => ['issues', 'detail', id] as const,
  },
```

- [ ] **Step 2: Implement the hooks**

Create `src/api/hooks/useIssues.ts`:

```ts
import {
  useQuery, useMutation, useQueryClient,
  type UseQueryResult, type UseMutationResult,
} from '@tanstack/react-query'
import {
  listIssues, getIssue, updateIssue,
  type Issue, type IssueStatus, type UpdateIssueInput,
} from '../issues'
import { queryKeys } from '../queryKeys'

export function useIssues(status?: IssueStatus | 'all'): UseQueryResult<Issue[]> {
  return useQuery({
    queryKey: queryKeys.issues.list(status),
    queryFn: () => listIssues(status && status !== 'all' ? status : undefined),
  })
}

export function useIssue(id: string | null): UseQueryResult<Issue | null> {
  return useQuery({
    queryKey: queryKeys.issues.detail(id ?? ''),
    queryFn: () => (id ? getIssue(id) : Promise.resolve(null)),
    enabled: !!id,
  })
}

export function useUpdateIssue(): UseMutationResult<Issue, Error, { id: string; input: UpdateIssueInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIssueInput }) => updateIssue(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.issues.all }) },
  })
}
```

- [ ] **Step 3: Verify the project still typechecks**

Run: `npm run typecheck`
Expected: PASS (no errors — these files aren't consumed by anything yet, but must be internally type-correct).

- [ ] **Step 4: Commit**

```bash
git add src/api/queryKeys.ts src/api/hooks/useIssues.ts
git commit -m "feat(issues): add React Query hooks for Issues"
```

---

### Task 4: Issues tab — list, server-side status filter, client-side search

**Files:**
- Modify: `src/screens/school/operations.tsx` (imports at lines 14-20, `CommunicationScreen` at lines 120-141, new `IssuesTab` function added after `ComplaintsTab`)
- Create: `src/screens/school/operations.test.tsx`

**Interfaces:**
- Consumes: `useIssues` (Task 3), `Issue`, `IssueCategory`, `IssuePriority`, `IssueStatus` (Task 2), `opsScreens` (existing export at `operations.tsx:2273`).
- Produces: `IssuesTab` component (not exported — used internally by `CommunicationScreen`, same visibility as `ComplaintsTab`).

- [ ] **Step 1: Write the failing test**

Create `src/screens/school/operations.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { opsScreens } from './operations'

const CommunicationScreen = opsScreens['school.comm']

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const TENANT_ID = 'school-1'

function authAndSchoolResponse(url: string, method: string, roles: string[]): Response | null {
  if (url.includes('/auth/refresh')) return jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })
  if (url.includes('/auth/me')) return jsonResponse({ data: { id: 'u1', tenant_id: TENANT_ID, roles, is_platform: false } })
  if (url.includes('/me/schools') && method === 'GET') {
    return jsonResponse({
      data: [{
        id: TENANT_ID, name: 'Greenwood High', slug: 'greenwood', country: 'IN', status: 'active',
        plan_id: null, plan_name: 'Gold', tier: 'gold', mrr: 0, students_count: 0,
        staff_count: 0, storage_gb: 0, created: '2026-01-01', contact_name: null,
        contact_email: null, contact_phone: null, address: null, health_score: 100,
      }],
      next_cursor: null,
    })
  }
  return null
}

const ISSUE_ROWS = [{
  id: 'I1', tenant_id: TENANT_ID, reporter_user_id: 'U9', reporter_name: 'Ramesh Driver',
  category: 'vehicle', title: 'Brake noise', description: 'Squeaking on braking',
  priority: 'high', status: 'open', vehicle_id: 'BUS-01', route_id: null, trip_id: null,
  photo_base64: null, created_at: '2026-09-14T09:00:00Z', updated_at: '2026-09-14T09:00:00Z',
}]

const ISSUE_DETAIL = {
  ...ISSUE_ROWS[0],
  notes: [{ id: 'N1', author_user_id: 'U1', author_name: 'Priya Admin', note: 'Looking into it', created_at: '2026-09-14T10:00:00Z' }],
}

function makeFetch(roles: string[], rows: unknown[] = ISSUE_ROWS, detail: unknown = ISSUE_DETAIL) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method, roles)
    if (auth) return Promise.resolve(auth)
    if (/\/staff\/issues\/[^/?]+$/.test(url)) return Promise.resolve(jsonResponse({ data: detail }))
    if (url.includes('/staff/issues')) return Promise.resolve(jsonResponse({ data: rows, next_cursor: null }))
    if (/\/issues\/[^/?]+$/.test(url) && method === 'PATCH') {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      return Promise.resolve(jsonResponse({ data: { ...(detail as object), ...body } }))
    }
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  })
}

function renderScreen(roles: string[] = ['school.admin'], rows: unknown[] = ISSUE_ROWS, detail: unknown = ISSUE_DETAIL) {
  const fetchMock = makeFetch(roles, rows, detail)
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <CommunicationScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
  return { ...utils, fetchMock }
}

describe('Issues tab', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    tokenStore.set({ access_token: 'a', refresh_token: 'r' })
    tokenStore.setEmail('admin@greenwood.edu')
  })

  afterEach(() => {
    tokenStore.clear()
    vi.unstubAllGlobals()
  })

  it('lists reported issues after switching to the Issues tab', async () => {
    renderScreen()
    screen.getByRole('button', { name: /issues/i }).click()
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    expect(screen.getByText(/squeaking on braking/i)).toBeInTheDocument()
  })

  it('re-fetches with the status query param when the status filter changes', async () => {
    const { fetchMock } = renderScreen()
    screen.getByRole('button', { name: /issues/i }).click()
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    const statusSelect = screen.getByRole('combobox') as HTMLSelectElement
    statusSelect.value = 'open'
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes('/staff/issues?status=open'))
      expect(called).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- operations.test.tsx`
Expected: FAIL — no "Issues" tab exists yet in `CommunicationScreen`.

- [ ] **Step 3: Implement the Issues tab**

In `src/screens/school/operations.tsx`:

1. Update the `@/components/ui` import block (lines 16-20) to add `Drawer` and `Spinner`:

```ts
import {
  PageHead, Tabs, Card, CardHead, Kpi, Btn, IconBtn, Badge, Avatar, Search,
  Select, Field, Input, Textarea, Modal, Drawer, Spinner, Icon, Empty, Checkbox, TierPill,
  Segmented, DataTable, type Column, type BadgeTone,
} from '@/components/ui'
```

2. Update the `@/lib/gating` import (line 15) to add `can`:

```ts
import { tierIncludes, can } from '@/lib/gating'
```

3. Add new imports after the existing `useComplaints` import (line 23):

```ts
import { useIssues } from '@/api/hooks/useIssues'
import type { Issue, IssueCategory, IssuePriority, IssueStatus } from '@/api/issues'
```

4. Add category/priority/status display maps, after the existing `STATUS_LABEL` constant (line 60):

```ts
const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  vehicle: 'Vehicle', student: 'Student', route: 'Route', safety: 'Safety', other: 'Other',
}
const ISSUE_PRIORITY_TONE: Record<IssuePriority, BadgeTone> = { emergency: 'danger', high: 'warning', normal: 'neutral' }
const ISSUE_STATUS_TONE: Record<IssueStatus, BadgeTone> = { open: 'info', in_progress: 'warning', resolved: 'success', closed: 'neutral' }
const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' }
const ISSUE_STATUS_FILTER_OPTIONS: { value: IssueStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]
```

5. Update `CommunicationScreen` (lines 120-141) to add the Issues tab:

```tsx
function CommunicationScreen() {
  const [tab, setTab] = useState('messenger')
  const { data: threadsData } = useThreads()
  const { data: complaintsData } = useComplaints()
  const { data: issuesData } = useIssues('all')
  const unread = (threadsData ?? []).reduce((n, t) => n + t.unread, 0)
  const openComplaints = (complaintsData ?? []).filter((c) => c.status !== 'resolved').length
  const openIssues = (issuesData ?? []).filter((i) => i.status === 'open' || i.status === 'in_progress').length
  return (
    <div>
      <PageHead title="Communication" sub="Messenger · Complaints · Issues · Announcements" />
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'messenger', label: 'Messenger', icon: 'message', count: unread },
          { value: 'complaints', label: 'Complaints', icon: 'inbox', count: openComplaints },
          { value: 'issues', label: 'Issues', icon: 'alert', count: openIssues },
          { value: 'announcements', label: 'Announcements', icon: 'bell' },
        ]} />
      </div>
      {tab === 'messenger' && <MessengerTab />}
      {tab === 'complaints' && <ComplaintsTab />}
      {tab === 'issues' && <IssuesTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
    </div>
  )
}
```

6. Add the `IssuesTab` function right after `ComplaintsTab` ends (after line 696, before `NewComplaintModal`):

```tsx
/* ---------- Issues: staff-reported vehicle/student/route/safety issues ---------- */
function IssuesTab() {
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const [openIssue, setOpenIssue] = useState<Issue | null>(null)
  const issuesQ = useIssues(statusFilter)
  const rows: Issue[] = issuesQ.data ?? []

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((r) => r.title.toLowerCase().includes(term) || r.description.toLowerCase().includes(term))
  }, [rows, q])

  const cols: Column<Issue>[] = [
    { key: 'category', label: 'Category', sortValue: (r) => r.category, render: (r) => <Badge tone="neutral" soft>{ISSUE_CATEGORY_LABEL[r.category]}</Badge> },
    {
      key: 'title', label: 'Issue', sortValue: (r) => r.title,
      render: (r) => (
        <div>
          <div className="fw6 t-md">{r.title}</div>
          <div className="t-xs muted3">{r.description}</div>
        </div>
      ),
    },
    { key: 'priority', label: 'Priority', sortValue: (r) => r.priority, render: (r) => <Badge tone={ISSUE_PRIORITY_TONE[r.priority]} soft dot>{r.priority[0].toUpperCase() + r.priority.slice(1)}</Badge> },
    { key: 'status', label: 'Status', sortValue: (r) => r.status, render: (r) => <Badge tone={ISSUE_STATUS_TONE[r.status]} soft>{ISSUE_STATUS_LABEL[r.status]}</Badge> },
    { key: 'reporter', label: 'Reporter', render: (r) => <span className="t-md">{r.reporterName ?? r.reporterUserId.slice(0, 8)}</span> },
    { key: 'created', label: 'Created', align: 'right', sortValue: (r) => r.createdAt, render: (r) => <span className="t-sm muted">{new Date(r.createdAt).toLocaleString()}</span> },
  ]

  return (
    <div className="col gap16">
      <div className="row ai-center jc-between gap12 wrap">
        <Search value={q} onChange={setQ} placeholder="Search title or description…" />
        <Select
          options={ISSUE_STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as IssueStatus | 'all')}
        />
      </div>
      <Card pad={false}>
        <div className="row ai-center jc-between" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <CardHead title="Issues" sub="Vehicle, student, route & safety issues reported by staff" icon="alert" />
        </div>
        {issuesQ.isError ? (
          <div style={{ padding: 16 }}>
            <div className="t-sm muted" style={{ marginBottom: 8 }}>Could not load issues.</div>
            <Btn variant="secondary" size="sm" onClick={() => issuesQ.refetch()}>Retry</Btn>
          </div>
        ) : issuesQ.isLoading ? (
          <div style={{ padding: 16 }}><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <Empty icon="alert" title="No issues reported" />
        ) : (
          <DataTable
            columns={cols} rows={filtered} pageSize={8} rowKey={(r) => r.id}
            initialSort={{ key: 'created', dir: 'desc' }}
            onRowClick={(r) => setOpenIssue(r)}
          />
        )}
      </Card>
    </div>
  )
}
```

(The `IssueDetailDrawer` referenced by a future `onRowClick` follow-up is added in Task 5 — for this task, `setOpenIssue` is stored but not yet rendered into a drawer; that wiring lands in Task 5 so this task's tests only cover list + filter.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- operations.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full existing operations-adjacent suite to confirm no regression**

Run: `npm test -- complaints.test.ts`
Expected: PASS (unchanged)

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/operations.tsx src/screens/school/operations.test.tsx
git commit -m "feat(issues): add Issues tab with server-side status filter and search"
```

---

### Task 5: Issue detail drawer (read-only fields, vehicle/route/trip, photo, notes timeline)

**Files:**
- Modify: `src/screens/school/operations.tsx` (add `IssueDetailDrawer`, wire it into `IssuesTab`)
- Modify: `src/screens/school/operations.test.tsx` (add detail-view tests)

**Interfaces:**
- Consumes: `useIssue` (Task 3, hook), `Issue`/`IssueNote` (Task 2).
- Produces: `IssueDetailDrawer` component (used by `IssuesTab`, and extended with mutations in Task 6).

- [ ] **Step 1: Write the failing test**

Add to `src/screens/school/operations.test.tsx`, inside the `describe('Issues tab', ...)` block:

```tsx
  it('opens the detail drawer with vehicle context, photo absence, and the notes timeline', async () => {
    renderScreen()
    screen.getByRole('button', { name: /issues/i }).click()
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    screen.getByText('Brake noise').click()
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())
    expect(screen.getByText('BUS-01')).toBeInTheDocument()
    expect(screen.getByText('Priya Admin')).toBeInTheDocument()
    expect(screen.queryByAltText('Issue attachment')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- operations.test.tsx`
Expected: FAIL — clicking the row does nothing visible yet (no drawer rendered).

- [ ] **Step 3: Implement `IssueDetailDrawer` and wire it in**

In `src/screens/school/operations.tsx`, add this function directly after `IssuesTab` (Task 4's function):

```tsx
function IssueDetailDrawer({ issue, onClose }: { issue: Issue | null; onClose: () => void }) {
  const detailQ = useIssue(issue?.id ?? null)
  const full = detailQ.data ?? issue
  const notes = (full?.notes ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <Drawer open={!!issue} onClose={onClose} icon="alert" title={issue?.title} sub={issue ? ISSUE_CATEGORY_LABEL[issue.category] : undefined}>
      {issue && full && (
        <div className="col gap16">
          <div className="row ai-center gap8">
            <Badge tone={ISSUE_PRIORITY_TONE[issue.priority]} soft dot>{issue.priority[0].toUpperCase() + issue.priority.slice(1)}</Badge>
            <Badge tone={ISSUE_STATUS_TONE[full.status]} soft>{ISSUE_STATUS_LABEL[full.status]}</Badge>
          </div>
          <div>
            <div className="t-xs muted3" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>Description</div>
            <div className="t-md" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{full.description}</div>
          </div>
          <div className="sm-grid-2 gap12">
            <div>
              <div className="t-xs muted3">Reporter</div>
              <div className="t-sm fw6">{full.reporterName ?? full.reporterUserId}</div>
            </div>
            <div>
              <div className="t-xs muted3">Created</div>
              <div className="t-sm fw6">{new Date(full.createdAt).toLocaleString()}</div>
            </div>
            {full.vehicleId && <div><div className="t-xs muted3">Vehicle</div><div className="t-sm fw6">{full.vehicleId}</div></div>}
            {full.routeId && <div><div className="t-xs muted3">Route</div><div className="t-sm fw6">{full.routeId}</div></div>}
            {full.tripId && <div><div className="t-xs muted3">Trip</div><div className="t-sm fw6">{full.tripId}</div></div>}
          </div>
          {full.photoBase64 && (
            <img src={full.photoBase64} alt="Issue attachment" style={{ maxWidth: '100%', borderRadius: 10 }} />
          )}
          <div>
            <div className="t-xs muted3" style={{ textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Notes</div>
            <div className="col gap10">
              {notes.length === 0 && <div className="t-sm muted">No notes yet.</div>}
              {notes.map((n) => (
                <div key={n.id} style={{ padding: 10, borderRadius: 8, background: 'var(--surface-2)' }}>
                  <div className="row ai-center jc-between">
                    <span className="t-xs fw6">{n.authorName ?? n.authorUserId}</span>
                    <span className="t-xs muted3">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="t-sm" style={{ marginTop: 4 }}>{n.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}
```

Then in `IssuesTab`, replace the closing of the returned JSX (add the drawer as a sibling of `<Card>`, right before the final `</div>`):

```tsx
      </Card>
      <IssueDetailDrawer issue={openIssue} onClose={() => setOpenIssue(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- operations.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/screens/school/operations.tsx src/screens/school/operations.test.tsx
git commit -m "feat(issues): add issue detail drawer with notes timeline"
```

---

### Task 6: Status update, add-note, and RBAC-gated manager controls

**Files:**
- Modify: `src/screens/school/operations.tsx` (`IssueDetailDrawer` gains mutations; `IssuesTab` passes `canManage`)
- Modify: `src/screens/school/operations.test.tsx` (add mutation + RBAC tests)

**Interfaces:**
- Consumes: `useUpdateIssue` (Task 3), `useToast`/`useApp` (existing, already imported), `can` (existing, imported in Task 4 step 2).
- Produces: `IssueDetailDrawer` now accepts `canManage: boolean`; status `<Select>` and "Add note" form render only when `canManage` is true.

- [ ] **Step 1: Write the failing tests**

Add to `src/screens/school/operations.test.tsx`:

```tsx
  it('changes status via PATCH and reflects the new status', async () => {
    const { fetchMock } = renderScreen(['school.admin'])
    screen.getByRole('button', { name: /issues/i }).click()
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    screen.getByText('Brake noise').click()
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())

    const statusSelects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const drawerStatusSelect = statusSelects[statusSelects.length - 1]
    drawerStatusSelect.value = 'resolved'
    drawerStatusSelect.dispatchEvent(new Event('change', { bubbles: true }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/issues/I1') && (opts?.method ?? '') === 'PATCH'
      })
      expect(patch).toBeTruthy()
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ status: 'resolved' })
    })
  })

  it('adds a note via PATCH and clears the textarea on success', async () => {
    const { fetchMock } = renderScreen(['school.admin'])
    screen.getByRole('button', { name: /issues/i }).click()
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    screen.getByText('Brake noise').click()
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())

    const textarea = screen.getByPlaceholderText(/add a note/i) as HTMLTextAreaElement
    textarea.value = 'Scheduled for tomorrow'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    screen.getByRole('button', { name: /add note/i }).click()

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c: unknown[]) => {
        const url = String(c[0])
        const opts = c[1] as RequestInit | undefined
        return url.includes('/issues/I1') && (opts?.method ?? '') === 'PATCH'
          && JSON.parse((opts?.body as string) ?? '{}').note === 'Scheduled for tomorrow'
      })
      expect(patch).toBeTruthy()
    })
    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('hides status and note controls for a non-manager role', async () => {
    renderScreen(['school.teacher'])
    screen.getByRole('button', { name: /issues/i }).click()
    await waitFor(() => expect(screen.getByText('Brake noise')).toBeInTheDocument())
    screen.getByText('Brake noise').click()
    await waitFor(() => expect(screen.getByText('Looking into it')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText(/add a note/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add note/i })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- operations.test.tsx`
Expected: FAIL — no status `<Select>` or "Add note" controls exist yet inside the drawer.

- [ ] **Step 3: Implement the mutations and RBAC gating**

Replace the `IssueDetailDrawer` function (from Task 5) in `src/screens/school/operations.tsx` with this extended version:

```tsx
function IssueDetailDrawer({ issue, onClose, canManage }: { issue: Issue | null; onClose: () => void; canManage: boolean }) {
  const toast = useToast()
  const detailQ = useIssue(issue?.id ?? null)
  const updateIssueMut = useUpdateIssue()
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<IssueStatus>('open')
  const full = detailQ.data ?? issue
  const notes = (full?.notes ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  useEffect(() => {
    if (full) setStatus(full.status)
  }, [full])

  const changeStatus = (next: IssueStatus) => {
    if (!issue) return
    const prev = status
    setStatus(next)
    updateIssueMut.mutate(
      { id: issue.id, input: { status: next } },
      {
        onSuccess: () => toast.success('Status updated', `${issue.title} is now ${ISSUE_STATUS_LABEL[next]}.`),
        onError: (err) => {
          setStatus(prev)
          toast.danger('Could not update status', err instanceof Error ? err.message : 'Please try again.')
        },
      },
    )
  }

  const submitNote = () => {
    if (!issue) return
    const text = note.trim()
    if (!text) { toast.danger('Note required', 'Enter a note before submitting.'); return }
    updateIssueMut.mutate(
      { id: issue.id, input: { note: text } },
      {
        onSuccess: () => { setNote(''); toast.success('Note added', 'Your note was saved.') },
        onError: (err) => toast.danger('Could not add note', err instanceof Error ? err.message : 'Please try again.'),
      },
    )
  }

  return (
    <Drawer open={!!issue} onClose={onClose} icon="alert" title={issue?.title} sub={issue ? ISSUE_CATEGORY_LABEL[issue.category] : undefined}>
      {issue && full && (
        <div className="col gap16">
          <div className="row ai-center gap8">
            <Badge tone={ISSUE_PRIORITY_TONE[issue.priority]} soft dot>{issue.priority[0].toUpperCase() + issue.priority.slice(1)}</Badge>
            <Badge tone={ISSUE_STATUS_TONE[status]} soft>{ISSUE_STATUS_LABEL[status]}</Badge>
          </div>
          <div>
            <div className="t-xs muted3" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>Description</div>
            <div className="t-md" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{full.description}</div>
          </div>
          <div className="sm-grid-2 gap12">
            <div>
              <div className="t-xs muted3">Reporter</div>
              <div className="t-sm fw6">{full.reporterName ?? full.reporterUserId}</div>
            </div>
            <div>
              <div className="t-xs muted3">Created</div>
              <div className="t-sm fw6">{new Date(full.createdAt).toLocaleString()}</div>
            </div>
            {full.vehicleId && <div><div className="t-xs muted3">Vehicle</div><div className="t-sm fw6">{full.vehicleId}</div></div>}
            {full.routeId && <div><div className="t-xs muted3">Route</div><div className="t-sm fw6">{full.routeId}</div></div>}
            {full.tripId && <div><div className="t-xs muted3">Trip</div><div className="t-sm fw6">{full.tripId}</div></div>}
          </div>
          {full.photoBase64 && (
            <img src={full.photoBase64} alt="Issue attachment" style={{ maxWidth: '100%', borderRadius: 10 }} />
          )}
          {canManage && (
            <Field label="Status">
              <Select
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'closed', label: 'Closed' },
                ]}
                value={status}
                disabled={updateIssueMut.isPending}
                onChange={(e) => changeStatus(e.target.value as IssueStatus)}
              />
            </Field>
          )}
          <div>
            <div className="t-xs muted3" style={{ textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Notes</div>
            <div className="col gap10">
              {notes.length === 0 && <div className="t-sm muted">No notes yet.</div>}
              {notes.map((n) => (
                <div key={n.id} style={{ padding: 10, borderRadius: 8, background: 'var(--surface-2)' }}>
                  <div className="row ai-center jc-between">
                    <span className="t-xs fw6">{n.authorName ?? n.authorUserId}</span>
                    <span className="t-xs muted3">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="t-sm" style={{ marginTop: 4 }}>{n.note}</div>
                </div>
              ))}
            </div>
            {canManage && (
              <div className="col gap8" style={{ marginTop: 10 }}>
                <Textarea value={note} rows={3} placeholder="Add a note…" onChange={(e) => setNote(e.target.value)} />
                <div className="row jc-end">
                  <Btn variant="primary" size="sm" icon="check" disabled={updateIssueMut.isPending} onClick={submitNote}>
                    {updateIssueMut.isPending ? 'Adding…' : 'Add note'}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}
```

Add the `useUpdateIssue` import alongside the existing `useIssues` import (Task 4, step 3):

```ts
import { useIssues, useIssue, useUpdateIssue } from '@/api/hooks/useIssues'
```

Finally, update `IssuesTab`'s render of the drawer to pass `canManage`:

```tsx
      <IssueDetailDrawer
        issue={openIssue}
        onClose={() => setOpenIssue(null)}
        canManage={can(app.role, 'issues', 'E')}
      />
```

This requires `IssuesTab` to read `app`. Add `const app = useApp()` at the top of `IssuesTab` (it isn't there yet from Task 4 — `useApp` is already imported at the top of `operations.tsx`, line 14).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- operations.test.tsx`
Expected: PASS (6 tests total)

- [ ] **Step 5: Run the full frontend test suite**

Run: `npm test`
Expected: PASS, no regressions in any other file.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/operations.tsx src/screens/school/operations.test.tsx
git commit -m "feat(issues): add status update, add-note, and RBAC-gated manager controls"
```

---

### Task 7: Wire `can()`/PERMS role-gating into Transport/Operations screens

**Files:**
- Modify: `src/screens/school/transport.tsx` (`TransportDashboardBody`, `TransportRoutesBody`, `TransportBusesBody`)
- Create: `src/screens/school/transport.test.tsx`

**Interfaces:**
- Consumes: `can` from `@/lib/gating` (module already imports `useApp`/`useToast` from `@/lib/hooks`; add `can` import).
- Produces: no new exports — purely conditional rendering of existing action buttons based on `can(app.role, 'operations', 'E')`.

This is the confirmed bundled fix from the design spec (§14): these three components already call `useApp()` but never check the existing `PERMS.operations` matrix before rendering Add/Edit/Delete controls.

- [ ] **Step 1: Write the failing test**

Create `src/screens/school/transport.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { transportScreens } from './transport'

const TransportBusesScreen = transportScreens['school.transport.buses']

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const TENANT_ID = 'school-1'

function authAndSchoolResponse(url: string, method: string, roles: string[]): Response | null {
  if (url.includes('/auth/refresh')) return jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })
  if (url.includes('/auth/me')) return jsonResponse({ data: { id: 'u1', tenant_id: TENANT_ID, roles, is_platform: false } })
  if (url.includes('/me/schools') && method === 'GET') {
    return jsonResponse({
      data: [{
        id: TENANT_ID, name: 'Greenwood High', slug: 'greenwood', country: 'IN', status: 'active',
        plan_id: null, plan_name: 'Platinum', tier: 'platinum', mrr: 0, students_count: 0,
        staff_count: 0, storage_gb: 0, created: '2026-01-01', contact_name: null,
        contact_email: null, contact_phone: null, address: null, health_score: 100,
      }],
      next_cursor: null,
    })
  }
  return null
}

const BUSES = [{
  bus_id: 'b1', bus_no: 'Bus 01', route_id: 'r1', route_name: 'Route 5',
  stop_count: 1, students_assigned: 1, capacity: 40,
}]

function makeFetch(roles: string[]) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: { method?: string }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const auth = authAndSchoolResponse(url, method, roles)
    if (auth) return Promise.resolve(auth)
    if (url.includes('/transport/buses')) return Promise.resolve(jsonResponse({ data: BUSES }))
    return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
  })
}

function renderScreen(roles: string[]) {
  vi.stubGlobal('fetch', makeFetch(roles))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <TransportBusesScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

describe('Transport role gating', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    tokenStore.set({ access_token: 'a', refresh_token: 'r' })
    tokenStore.setEmail('admin@greenwood.edu')
  })

  afterEach(() => {
    tokenStore.clear()
    vi.unstubAllGlobals()
  })

  it('shows Add bus and the row Edit action for admin (operations.E)', async () => {
    renderScreen(['school.admin'])
    await waitFor(() => expect(screen.getByText('Bus 01')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /add bus/i })).toBeInTheDocument()
    expect(screen.getByTitle('Edit')).toBeInTheDocument()
  })

  it('hides Add bus and the row Edit action for principal (operations.V only)', async () => {
    renderScreen(['school.principal'])
    await waitFor(() => expect(screen.getByText('Bus 01')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /add bus/i })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transport.test.tsx`
Expected: FAIL — "Add bus" and the row "Edit" `IconBtn` currently render unconditionally, so the "hides ... for principal" test fails.

- [ ] **Step 3: Wire `can()` into the three components**

In `src/screens/school/transport.tsx`:

1. Add the `can` import (find the existing `import { useApp, useToast } from '@/lib/hooks'` at line 5 and add a new import line directly after it):

```ts
import { can } from '@/lib/gating'
```

2. In `TransportDashboardBody` (starts at line 54), add `const canEdit = can(app.role, 'operations', 'E')` right after `const app = useApp()` (line 55), then wrap the "Add route"/"Add bus" buttons (lines 73-74) with a `canEdit &&` guard:

```tsx
            {canEdit && <Btn variant="secondary" icon="plus" onClick={() => setRouteModalOpen(true)}>Add route</Btn>}
            {canEdit && <Btn variant="primary" icon="plus" onClick={() => setBusModalOpen(true)}>Add bus</Btn>}
```

Apply the same `canEdit &&` guard to the "Add" buttons at lines 91, 126, and the `action` prop's button at line 140.

3. In `TransportRoutesBody` (starts at line 379), add `const canEdit = can(app.role, 'operations', 'E')` right after `const app = useApp()` (line 380). Guard the "New route" button (line 419):

```tsx
            {canEdit && <Btn variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>New route</Btn>}
```

Guard the empty-state "Create route" action (line 429) and the per-row "Open builder"/"Delete route" buttons (lines 439-440):

```tsx
        ) : routes.length === 0 ? (
          <Empty icon="pin" title="No routes yet" body="Create a route then place stops on the map."
            action={canEdit ? <Btn variant="primary" onClick={() => setCreateOpen(true)}>Create route</Btn> : undefined} />
        ) : (
          <div>
            {routes.map((r) => (
              <div key={r.id} className="row ai-center jc-between gap12" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div className="fw6 t-lg">{r.name}</div>
                  <div className="t-sm muted3">{r.stops} stop{r.stops === 1 ? '' : 's'}</div>
                </div>
                <div className="row gap8">
                  <Btn variant="secondary" icon="pin" onClick={() => setEditing(r)}>Open builder</Btn>
                  {canEdit && <IconBtn icon="trash" title="Delete route" onClick={() => setDeleting(r)} />}
                </div>
              </div>
            ))}
          </div>
        )}
```

("Open builder" stays visible to all viewers — it opens a read-only route map for non-editors; only the destructive delete action is gated. This matches the spec's instruction to gate mutating actions, not navigation.)

4. In `TransportBusesBody` (starts at line 719), add `const canEdit = can(app.role, 'operations', 'E')` right after `const app = useApp()` (line 720). Guard the "Add bus" button (line 745) and the per-row Edit `IconBtn` (line 775):

```tsx
            {canEdit && <Btn variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>Add bus</Btn>}
```

```tsx
                  <td>{canEdit ? <IconBtn icon="edit" title="Edit" onClick={() => setEditBus(b)} /> : null}</td>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- transport.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full existing transport test suite to confirm no regression**

Run: `npm test -- transport`
Expected: PASS — `transport.test.ts` (API layer, if it exists) and `transportStudents.test.tsx` both still pass unmodified.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/transport.tsx src/screens/school/transport.test.tsx
git commit -m "fix(rbac): wire existing PERMS.operations matrix into Transport action buttons"
```

---

### Task 8: Full regression verification

**Files:** none (verification only — no code changes)

**Interfaces:** none

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`
Expected: PASS — every existing test file plus the four new/modified ones from this plan (`gating.test.ts`, `issues.test.ts`, `operations.test.tsx`, `transport.test.tsx`).

- [ ] **Step 2: Run TypeScript typecheck**

Run: `npm run typecheck`
Expected: PASS with zero errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS — build completes with no errors.

- [ ] **Step 4: Record the completion state**

If all three steps pass, this project is complete per the spec's §17 (E2E dependency): CRM code complete, tests passing, typecheck clean, build clean. The full end-to-end chain (staff creates issue → CRM sees it → manager updates it → staff sees the update) remains pending until sms-staff/sms-backend delivers the live Issues API — do not claim it works end-to-end.

- [ ] **Step 5: Commit (only if any of the above required a fix)**

If Steps 1-3 all passed with no changes needed, there is nothing to commit for this task. If a fix was required, commit it with a message describing exactly what regression was found and fixed.

---

## Self-Review Notes

**Spec coverage:** All 20 spec sections map to a task — §3-4 (API/hooks) → Tasks 2-3; §5 (list) → Task 4; §6-7 (filters) → Task 4; §8-9 (Drawer/photo/vehicle-route-trip) → Task 5; §10 (notes) → Task 5; §11-12 (status/add-note) → Task 6; §13 (RBAC) → Task 6; §14 (Transport gating fix) → Task 7; §15 (loading/empty/error) → Tasks 4-6 inline; §16 (testing) → every task's own test file; §17 (E2E dependency) → Task 8; §18 (files) → matches every task's Files section; §19 (non-goals) respected throughout (no Complaints changes, no backend changes, no note edit/delete, no new permission framework).

**Placeholder scan:** No TBD/TODO; every step has literal code, not descriptions.

**Type consistency:** `Issue`, `IssueStatus`, `IssueCategory`, `IssuePriority`, `IssueNote`, `UpdateIssueInput` are defined once in Task 2 and referenced identically (same names, same shapes) through Tasks 3-6. `useIssues`/`useIssue`/`useUpdateIssue` signatures defined in Task 3 match every call site in Tasks 4-6 exactly (`useIssues(statusFilter)`, `useIssue(issue?.id ?? null)`, `useUpdateIssue()` returning `{ mutate, isPending }`).
