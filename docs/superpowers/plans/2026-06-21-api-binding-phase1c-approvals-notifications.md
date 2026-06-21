# School Admin API Binding — Phase 1c: Approvals + Notifications Read-Binding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the approvals inbox and the Topbar notifications dropdown to the live School Admin API (`GET /approvals`, `GET /notifications`) with **zero UI/markup changes**, completing the Phase-1 read-only binds. Make `<App/>` self-contained by moving `QueryClientProvider` into `App.tsx` so the shell (which now uses a query hook) renders without an external provider.

**Architecture:** Add `src/api/approvals.ts` and `src/api/notifications.ts` resource modules (list-only, generic `snakeToCamel` — no special renames needed). Wrap each in a React Query hook keyed via the existing `queryKeys` factory. Move the `QueryClient`/`QueryClientProvider` from `main.tsx` into `App.tsx` (module-level client) so every render of `<App/>` — including tests — has a provider. Swap the approvals inbox and Topbar from direct `mockDb` imports to the hooks. Dashboard KPI counts are intentionally NOT bound (they are synthetic figures derived from `app.school` scalars; binding would change displayed numbers — they are deferred to the Phase 6 "Demo data" gap-flagging pass).

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`.

## Global Constraints

- **No UI/markup changes.** Only data sources swap and provider placement moves. JSX/classNames stay byte-identical.
- **Wire is snake_case**; list envelope is `{ data: [...], next_cursor: string|null }`.
- **No special field renames** this slice: `Approval.forRoles` ← `for_roles` and all other fields are handled by generic `snakeToCamel`; `AppNotification` fields are single-word. Fields the wire omits arrive `undefined`.
- **Read-only slice.** No POST/PATCH, no reverse mapper. The approvals inbox keeps its existing client-side role filter (`forRoles.includes(app.role)`) and local optimistic `acted` state (the PATCH/act-on flow is Phase 2).
- **Scope = approvals + notifications + provider move only.** Dashboard synthetic counts are explicitly out (Phase 6 flag).
- Tests must stay green (`npm test`); `npm run typecheck` + `npm run build` must pass at each task's end. `noUnusedLocals` is on — no unused imports.
- Hooks live in `src/api/hooks/`; cache keys come only from `src/api/queryKeys.ts`.
- Follow the shipped `src/api/students.ts` / `src/api/teachers.ts` modules as the reference pattern.

---

### Task 1: Notifications resource module (`notifications.ts`)

**Files:**
- Create: `src/api/notifications.ts`
- Create: `src/api/notifications.test.ts`

**Interfaces:**
- Consumes: `listRequest` from `./client`; `snakeToCamel` from `./mapper`; `AppNotification` from `@/types`.
- Produces: `listNotifications(): Promise<AppNotification[]>`.

- [ ] **Step 1: Write the failing test**

Create `src/api/notifications.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listNotifications } from './notifications'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listNotifications', () => {
  it('returns the notifications list from the data envelope', async () => {
    const wire = { data: [{ id: 1, icon: 'bell', tone: 'brand', title: 'Fee paid', body: 'Term 1', time: '2h', unread: true }], next_cursor: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)))
    const rows = await listNotifications()
    expect(rows).toEqual([{ id: 1, icon: 'bell', tone: 'brand', title: 'Fee paid', body: 'Term 1', time: '2h', unread: true }])
  })

  it('requests /notifications', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listNotifications()
    expect(fetchMock.mock.calls[0][0]).toContain('/notifications')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/notifications.test.ts`
Expected: FAIL — cannot find module `./notifications`.

- [ ] **Step 3: Implement**

Create `src/api/notifications.ts`:
```ts
import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { AppNotification } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listNotifications(): Promise<AppNotification[]> {
  const env = await listRequest<ListEnvelope>('/notifications')
  return env.data.map((n) => snakeToCamel<AppNotification>(n))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/notifications.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (expect PASS), then:
```bash
git add src/api/notifications.ts src/api/notifications.test.ts
git commit -m "feat(api): notifications resource module (list)"
```

---

### Task 2: Approvals resource module (`approvals.ts`)

**Files:**
- Create: `src/api/approvals.ts`
- Create: `src/api/approvals.test.ts`

**Interfaces:**
- Consumes: `listRequest` from `./client`; `snakeToCamel` from `./mapper`; `Approval` from `@/types`.
- Produces: `listApprovals(): Promise<Approval[]>`. (No role argument — the server scopes by the bearer; the screen keeps its existing client-side `forRoles` filter, so behavior is unchanged.)

- [ ] **Step 1: Write the failing test**

Create `src/api/approvals.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listApprovals } from './approvals'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('listApprovals', () => {
  it('maps for_roles -> forRoles and returns the list', async () => {
    const wire = { data: [{ id: 'A1', type: 'leave', module: 'hr', cap: 'hr.approve', title: 'Leave', detail: '2 days', requester: 'Asha', role: 'teacher', amount: null, age: '3h', priority: 'high', for_roles: ['principal', 'admin'] }], next_cursor: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(wire)))
    const rows = await listApprovals()
    expect(rows[0]).toMatchObject({ id: 'A1', priority: 'high', forRoles: ['principal', 'admin'], amount: null })
    expect((rows[0] as Record<string, unknown>).for_roles).toBeUndefined()
  })

  it('requests /approvals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], next_cursor: null }))
    vi.stubGlobal('fetch', fetchMock)
    await listApprovals()
    expect(fetchMock.mock.calls[0][0]).toContain('/approvals')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/approvals.test.ts`
Expected: FAIL — cannot find module `./approvals`.

- [ ] **Step 3: Implement**

Create `src/api/approvals.ts`:
```ts
import { listRequest } from './client'
import { snakeToCamel } from './mapper'
import type { Approval } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listApprovals(): Promise<Approval[]> {
  const env = await listRequest<ListEnvelope>('/approvals')
  return env.data.map((a) => snakeToCamel<Approval>(a))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/approvals.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (expect PASS), then:
```bash
git add src/api/approvals.ts src/api/approvals.test.ts
git commit -m "feat(api): approvals resource module (list, for_roles->forRoles)"
```

---

### Task 3: Query keys + hooks (`useNotifications`, `useApprovals`)

**Files:**
- Modify: `src/api/queryKeys.ts` (add `notifications` and `approvals` groups)
- Create: `src/api/hooks/useNotifications.ts`
- Create: `src/api/hooks/useApprovals.ts`
- Create: `src/api/hooks/useInbox.test.tsx`

**Interfaces:**
- Consumes: `listNotifications` from `../notifications`, `listApprovals` from `../approvals`; `useQuery` from `@tanstack/react-query`.
- Produces: `queryKeys.notifications.all`, `queryKeys.approvals.all`; `useNotifications(): UseQueryResult<AppNotification[]>`; `useApprovals(): UseQueryResult<Approval[]>`.

- [ ] **Step 1: Extend the query-key factory**

In `src/api/queryKeys.ts`, add two groups beside the existing ones (keep `students`, `teachers`, `staff` unchanged). Add to the `queryKeys` object:
```ts
  notifications: {
    all: ['notifications'] as const,
  },
  approvals: {
    all: ['approvals'] as const,
  },
```

- [ ] **Step 2: Write the failing hook test**

Create `src/api/hooks/useInbox.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNotifications } from './useNotifications'
import { useApprovals } from './useApprovals'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useNotifications', () => {
  it('resolves the notifications list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 1, icon: 'bell', tone: 'brand', title: 'T', body: 'B', time: '1h', unread: true }], next_cursor: null })))
    const { result } = renderHook(() => useNotifications(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 1, unread: true })
  })
})

describe('useApprovals', () => {
  it('resolves the approvals list with forRoles mapped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'A1', type: 't', module: 'm', cap: 'c', title: 'T', detail: 'D', requester: 'R', role: 'teacher', amount: null, age: '2h', priority: 'low', for_roles: ['admin'] }], next_cursor: null })))
    const { result } = renderHook(() => useApprovals(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]).toMatchObject({ id: 'A1', forRoles: ['admin'] })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/api/hooks/useInbox.test.tsx`
Expected: FAIL — cannot find module `./useNotifications`.

- [ ] **Step 4: Implement the hooks**

Create `src/api/hooks/useNotifications.ts`:
```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listNotifications } from '../notifications'
import { queryKeys } from '../queryKeys'
import type { AppNotification } from '@/types'

export function useNotifications(): UseQueryResult<AppNotification[]> {
  return useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: () => listNotifications(),
  })
}
```

Create `src/api/hooks/useApprovals.ts`:
```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listApprovals } from '../approvals'
import { queryKeys } from '../queryKeys'
import type { Approval } from '@/types'

export function useApprovals(): UseQueryResult<Approval[]> {
  return useQuery({
    queryKey: queryKeys.approvals.all,
    queryFn: () => listApprovals(),
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/api/hooks/useInbox.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` (expect PASS), then:
```bash
git add src/api/queryKeys.ts src/api/hooks/useNotifications.ts src/api/hooks/useApprovals.ts src/api/hooks/useInbox.test.tsx
git commit -m "feat(api): notifications/approvals query keys + useNotifications/useApprovals hooks"
```

---

### Task 4: Make `<App/>` self-contained (move `QueryClientProvider` into `App.tsx`)

**Files:**
- Modify: `src/App.tsx` (wrap providers with `QueryClientProvider`, module-level client)
- Modify: `src/main.tsx` (drop the now-duplicate provider)

**Interfaces:**
- Produces: a `QueryClientProvider` at the root of `<App/>`, so any component in the shell (e.g. the Topbar, wired in Task 5) can use query hooks — including in tests that render `<App/>` directly.

- [ ] **Step 1: Add the provider to `App.tsx`**

In `src/App.tsx`, add the imports and a module-level client, and wrap the existing provider tree. The file becomes:
```tsx
/* ============================================================
   SchoolMate — App root: providers + shell
   ============================================================ */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/context/ToastProvider'
import { ThemeProvider } from '@/context/ThemeProvider'
import { AppProvider } from '@/context/AppProvider'
import { useApp } from '@/lib/hooks'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { Tweaks } from '@/components/shell/Tweaks'
import { LoginScreen } from '@/screens/LoginScreen'
import { Router } from '@/router'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function Shell() {
  const app = useApp()
  if (!app.loggedIn) return <LoginScreen />
  return (
    <div className={['sm-app', app.mobileNav && 'nav-open'].filter(Boolean).join(' ')}>
      {app.mobileNav && <div className="sm-scrim only-mobile" onClick={() => app.setMobileNav(false)} />}
      <Sidebar />
      <div className="sm-main">
        <Topbar />
        <main className="sm-content">
          <div className="sm-content-narrow">
            <Router />
          </div>
        </main>
      </div>
      <Tweaks />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ThemeProvider>
          <AppProvider>
            <Shell />
          </AppProvider>
        </ThemeProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 2: Remove the duplicate provider from `main.tsx`**

In `src/main.tsx`, delete the `QueryClient`/`QueryClientProvider` import, the `const queryClient = ...` block, and the `<QueryClientProvider>` wrapper — leaving `<App/>` rendered inside `<StrictMode>` with the existing CSS imports. The render becomes:
```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```
(Keep all `import './styles/*.css'` lines and the `App` import.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `@tanstack/react-query` no longer imported in `main.tsx`; no unused symbols.

- [ ] **Step 4: Run the full suite + build**

Run: `npm test` then `npm run build`
Expected: PASS — `<App/>` now self-provides a `QueryClient`; the existing `App.test.tsx` smoke tests render the shell without a missing-provider error. Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/main.tsx
git commit -m "refactor(app): move QueryClientProvider into App root (self-contained)"
```

---

### Task 5: Wire the approvals inbox + Topbar notifications + full verification

**Files:**
- Modify: `src/screens/school/dashboard.tsx` (`ApprovalsInbox` data source)
- Modify: `src/components/shell/Topbar.tsx` (notifications data source)

**Interfaces:**
- Consumes: `useApprovals` from `@/api/hooks/useApprovals`; `useNotifications` from `@/api/hooks/useNotifications`.
- Produces: no new exports. The approvals inbox and the Topbar bell read the live API; the role filter, optimistic `acted` state, and all JSX are unchanged.

- [ ] **Step 1: Wire `ApprovalsInbox` (dashboard.tsx)**

In `src/screens/school/dashboard.tsx`:
- Change the mockDb import to drop `approvals` (keep `grades`): the line `import { approvals, grades } from '@/data/mockDb'` becomes `import { grades } from '@/data/mockDb'`.
- Add: `import { useApprovals } from '@/api/hooks/useApprovals'`.
- In the `ApprovalsInbox` component, add at the top of its body (before the `const list = ...` line):
  ```tsx
  const { data: approvalsData } = useApprovals()
  const approvals = approvalsData ?? []
  ```
  Leave the existing `const list = approvals.filter((a) => a.forRoles.includes(app.role) && !acted.has(a.id))` line and all JSX unchanged.

- [ ] **Step 2: Wire the Topbar notifications**

In `src/components/shell/Topbar.tsx`:
- Change `import { schools, notifications } from '@/data/mockDb'` to `import { schools } from '@/data/mockDb'`.
- Add: `import { useNotifications } from '@/api/hooks/useNotifications'`.
- In the `Topbar` component body, before `const unread = ...`, add:
  ```tsx
  const { data: notifData } = useNotifications()
  const notifications = notifData ?? []
  ```
  Leave the `const unread = notifications.filter((n) => n.unread).length` line, the `notifications.map(...)` render, and all JSX unchanged.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — both hooks consumed; no unused `approvals`/`notifications` mockDb imports remain.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — `registry.test.tsx` (renders approvals screen) and `App.test.tsx` (renders the shell/Topbar) both have a `QueryClient` available (registry via its own wrapper, App via Task 4's root provider). Unmocked fetch leaves queries pending and components render `[]` (Topbar shows 0 unread; approvals inbox shows its empty state) — no throw.

- [ ] **Step 5: Verify the production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/dashboard.tsx src/components/shell/Topbar.tsx
git commit -m "feat(inbox): bind approvals inbox + Topbar notifications to live API (no UI change)"
```

---

## Phase 1c done — Phase 1 read-binds complete

After Phase 1c: students, teachers, staff, approvals, and notifications all read the live API; `<App/>` is self-contained. Phase 1's read-only binds are complete. Dashboard KPI counts remain on synthetic `app.school` figures and are deferred to the Phase 6 "Demo data" gap-flagging pass (binding them would change displayed numbers and several have no backing endpoint).

Later phases: **Phase 2** mutations (student/teacher/staff add+edit, users + import, approvals PATCH — adds reverse `camelToSnake` rename maps + `useXMutations` + the provider seed-removal migration so the Add forms feed the bound lists), then academics+attendance, exams, finance+comms, and the gap-flagging pass.

## Self-Review notes

- **Spec coverage (Phase 1c slice of design §8.1 + §4 rows `dashboard`/`admin`/notifications):** approvals + notifications list binds via `<resource>.ts` (§1), the §6 mocked-fetch test strategy, and §7 QueryClient wiring (now self-contained in `App.tsx`). `for_roles→forRoles` is the only rename (generic). Dashboard synthetic counts are explicitly deferred to §gap-policy / Phase 6, honoring "bind what has an endpoint, flag the rest" + no-UI-change.
- **Type consistency:** `listNotifications`/`listApprovals` signatures match their tests and hooks. `queryKeys.notifications.all`/`queryKeys.approvals.all` are used identically in the hooks. `Approval.forRoles` and `AppNotification` are the existing `@/types` shapes.
- **Cross-cutting test safety:** Task 4 moves the provider into `App.tsx` BEFORE Task 5 makes the always-rendered Topbar use a query hook — so no test that renders `<App/>` loses its `QueryClient`. This ordering is load-bearing.
- **No placeholders / no-UI-change:** screen edits are import swaps + a two-line data-source read each; no JSX/className changes. `noUnusedLocals` respected (hooks consumed in the same task they are imported).
