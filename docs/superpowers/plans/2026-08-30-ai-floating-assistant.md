# AI Floating Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI Mode's entry point from a header toggle on the Communication screen to a single
persistent floating button visible from every school-console screen, reusing `AiSearchScreen`
completely unmodified.

**Architecture:** A new `AiFloatingButton` component follows the exact fab+panel CSS pattern already
established by `Tweaks.tsx`, mounted once in `App.tsx`'s `Shell` alongside `<Tweaks />`.
`CommunicationScreen` (`operations.tsx`) reverts to its pre-AI-Mode form; the obsolete
`communicationAiMode.test.tsx` is deleted.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3 + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-ai-floating-assistant-design.md`

## Global Constraints

- `AiSearchScreen`, `useAiSearch`, `resolveAiQuery`, `useSpeechToText`, `useTextToSpeech` are NOT
  modified by any task in this plan — reused exactly as they are today.
- The floating button renders only when `app.consoleKind === 'school'` — never for `'owner'`.
- The fab/panel follow `Tweaks.tsx`'s existing raw-button + conditional-div pattern — no `Drawer`,
  no new overlay mechanism.
- New CSS positions the fab at `bottom: 20px; right: 80px` and the panel at
  `bottom: 78px; right: 80px` (stacked left of `Tweaks`' fab/panel, which occupy `right: 20px`),
  with the panel width `420px` — do not collide with or resize `Tweaks`' own classes.
- `npm test`, `npx tsc -b` (no NEW errors — pre-existing baseline errors in
  `src/components/maps/RouteBuilderMap.tsx`, `src/components/shell/Sidebar.tsx`, `src/lib/format.ts`,
  `src/screens/school/admin.tsx`, `src/screens/school/geoFencePanel.tsx`,
  `src/screens/school/transport.tsx` are not this plan's concern), and `npm run build` must all be
  clean (modulo that known baseline). `noUnusedLocals` is on — remove any import that becomes
  unused after Task 2's edits, but do not remove `useApp`, `TierGate`, or `tierIncludes` from
  `operations.tsx` — they are used elsewhere in that file (Transport/GPS screens).

---

### Task 1: `AiFloatingButton` component

**Files:**
- Modify: `src/styles/layout.css` (add two new classes after the existing Tweaks panel rules)
- Create: `src/components/shell/AiFloatingButton.tsx`
- Test: `src/components/shell/AiFloatingButton.test.tsx`

**Interfaces:**
- Consumes (existing, unmodified): `useApp` (`@/lib/hooks`), `tierIncludes` (`@/lib/gating`),
  `TierGate` (`@/components/shell/gates`), `AiSearchScreen` (`@/screens/school/aiSearch`), `Icon`
  (`@/components/ui`).
- Produces (used by Task 2): `export function AiFloatingButton(): JSX.Element | null` — renders
  `null` when `app.consoleKind !== 'school'`, otherwise a self-contained fab + conditional panel
  with no required props.

- [ ] **Step 1: Write the failing tests**

Create `src/components/shell/AiFloatingButton.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { tokenStore } from '@/api/auth/tokenStore'
import { AiFloatingButton } from './AiFloatingButton'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function schoolResponse(tier: string) {
  return jsonResponse({
    data: [{
      id: 'school-1', name: 'Greenwood High', slug: 'greenwood', country: 'IN', status: 'active',
      plan_id: null, plan_name: tier, tier, mrr: 0, students_count: 0, staff_count: 0,
      storage_gb: 0, created: '2026-01-01', contact_name: null, contact_email: null,
      contact_phone: null, address: null, health_score: 100,
    }],
    next_cursor: null,
  })
}

function mockFetch(opts: { tier: string; isPlatform?: boolean }) {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('/auth/refresh')) return Promise.resolve(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
    if (url.includes('/auth/me')) {
      return Promise.resolve(jsonResponse({
        data: {
          id: 'u1', tenant_id: 'school-1', roles: [opts.isPlatform ? 'owner' : 'school.admin'],
          is_platform: !!opts.isPlatform,
        },
      }))
    }
    if (url.includes('/me/schools') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(schoolResponse(opts.tier))
    if (url.includes('/students')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    if (url.includes('/attendance/period-records/summary/range')) {
      return Promise.resolve(jsonResponse({ data: { total_marked_periods: 0, present: 0, absent: 0, late: 0, leave: 0, attendance_percentage: null } }))
    }
    return Promise.resolve(jsonResponse({ data: {} }))
  })
}

function renderButton(opts: { tier: string; isPlatform?: boolean }) {
  vi.stubGlobal('fetch', mockFetch(opts))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider><AiFloatingButton /></ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  tokenStore.set({ access_token: 'a', refresh_token: 'r' })
  tokenStore.setEmail('admin@greenwood.edu')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('AiFloatingButton', () => {
  it('renders the fab in the school console', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
  })

  it('does not render in the owner console', async () => {
    renderButton({ tier: 'platinum', isPlatform: true })
    // Give the session restore a tick to settle, then confirm the fab never appears.
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByRole('button', { name: /AI Mode/i })).not.toBeInTheDocument()
  })

  it('opens the panel showing AiSearchScreen for a Platinum school', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
  })

  it('shows the upgrade veil instead of AiSearchScreen for a non-Platinum school', async () => {
    renderButton({ tier: 'gold' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Upgrade to Platinum/i)).toBeInTheDocument())
    expect(screen.queryByText(/Ask a question about your school/i)).not.toBeInTheDocument()
  })

  it('closes the panel when the fab is tapped again', async () => {
    renderButton({ tier: 'platinum' })
    await waitFor(() => expect(screen.getByRole('button', { name: /AI Mode/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    await waitFor(() => expect(screen.getByText(/Ask a question about your school/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /AI Mode/i }))
    expect(screen.queryByText(/Ask a question about your school/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/shell/AiFloatingButton.test.tsx`
Expected: FAIL — cannot find module `./AiFloatingButton`.

- [ ] **Step 3: Implement**

In `src/styles/layout.css`, add these two rules immediately after the existing
`html[dir=rtl] .sm-tweaks-panel { ... }` line (i.e. right after the Tweaks panel block, before
`.sm-tweaks-row`):
```css
.sm-ai-fab { position: fixed; bottom: 20px; right: 80px; z-index: 45; width: 46px; height: 46px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-elev); color: var(--brand-600); box-shadow: var(--sh-lg); cursor: pointer; display: flex; align-items: center; justify-content: center; }
html[dir=rtl] .sm-ai-fab { right: auto; left: 80px; }
.sm-ai-panel { position: fixed; bottom: 78px; right: 80px; z-index: 46; width: 420px; max-height: 70vh; overflow-y: auto; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--sh-xl); padding: 16px; }
html[dir=rtl] .sm-ai-panel { right: auto; left: 80px; }
```

Create `src/components/shell/AiFloatingButton.tsx`:
```tsx
/* ============================================================
   SchoolMate — AI floating assistant: app-wide entry point for AI Mode,
   mounted once in Shell (App.tsx) alongside Tweaks. Reuses AiSearchScreen
   unmodified. See docs/superpowers/specs/2026-08-30-ai-floating-assistant-design.md.
   ============================================================ */
import { useState } from 'react'
import { useApp } from '@/lib/hooks'
import { tierIncludes } from '@/lib/gating'
import { Icon } from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { AiSearchScreen } from '@/screens/school/aiSearch'

export function AiFloatingButton() {
  const app = useApp()
  const [open, setOpen] = useState(false)

  if (app.consoleKind !== 'school') return null

  return (
    <>
      <button className="sm-ai-fab" onClick={() => setOpen((o) => !o)} aria-label="AI Mode">
        <Icon name={open ? 'x' : 'sparkle'} size={20} />
      </button>
      {open && (
        <div className="sm-ai-panel">
          {tierIncludes(app.plan, 'ai_search') ? (
            <AiSearchScreen />
          ) : (
            // TierGate mounts its children inside an aria-hidden blur div (never omits them), so
            // always wrapping AiSearchScreen here would still mount it (and its data fetches) for
            // non-Platinum schools. Branch explicitly instead so the gated path never mounts it.
            <TierGate feature="ai_search" title="AI Mode" blurb="Ask natural-language questions about your school on the Platinum plan.">
              <div />
            </TierGate>
          )}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/shell/AiFloatingButton.test.tsx`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b` — expect no new errors (only the known pre-existing baseline list).

```bash
git add src/styles/layout.css src/components/shell/AiFloatingButton.tsx src/components/shell/AiFloatingButton.test.tsx
git commit -m "feat(shell): add AiFloatingButton — app-wide entry point for AI Mode"
```

---

### Task 2: Wire into Shell, revert Communication, remove obsolete test

**Files:**
- Modify: `src/App.tsx` (add one import + one line in `Shell`)
- Modify: `src/screens/school/operations.tsx` (revert `CommunicationScreen` to its pre-AI-Mode form)
- Delete: `src/screens/school/communicationAiMode.test.tsx`

**Interfaces:**
- Consumes (from Task 1): `AiFloatingButton` from `@/components/shell/AiFloatingButton`.
- Produces: no new exports — `App.tsx`'s `Shell` and `operations.tsx`'s `CommunicationScreen` keep
  their existing signatures/behavior for everything except the AI Mode toggle being removed from
  the latter.

- [ ] **Step 1: Write/update the failing tests**

Since `communicationAiMode.test.tsx` tests behavior that no longer exists, delete it outright
rather than converting it (its 3 scenarios — toggling AI Mode within `CommunicationScreen` — have
no equivalent after this change; Task 1's `AiFloatingButton.test.tsx` already covers the
gating/rendering behavior that matters):
```bash
git rm src/screens/school/communicationAiMode.test.tsx
```

No new test file is needed for this task — `App.tsx` has no existing test suite to extend (verify
by checking for one: if `src/App.test.tsx` exists, skip adding a test for the one-line `Shell`
change; if it doesn't exist, don't create one — mounting is implicitly covered by every other
component test that renders through `AppProvider`/`Shell`-adjacent paths, and a dedicated `Shell`
test is out of scope for this plan).

- [ ] **Step 2: Confirm current state before editing**

Run: `npx vitest run src/screens/school/operations.tsx 2>&1 || true` (this file has no direct test
of its own beyond what's being deleted — this step is a no-op confirmation, not a real TDD
red step, since Task 2 is a revert + deletion, not new behavior). Proceed to Step 3.

- [ ] **Step 3: Implement**

In `src/App.tsx`, add the import (alongside the other shell imports, e.g. right after the
`Tweaks` import):
```ts
import { AiFloatingButton } from '@/components/shell/AiFloatingButton'
```
And add one line in `Shell`'s JSX, immediately after `<Tweaks />`:
```tsx
      <Tweaks />
      <AiFloatingButton />
```

In `src/screens/school/operations.tsx`, replace the `CommunicationScreen` function (currently):
```tsx
function CommunicationScreen() {
  const [tab, setTab] = useState('messenger')
  const [aiMode, setAiMode] = useState(false)
  const app = useApp()
  const { data: threadsData } = useThreads()
  const { data: complaintsData } = useComplaints()
  const unread = (threadsData ?? []).reduce((n, t) => n + t.unread, 0)
  const openComplaints = (complaintsData ?? []).filter((c) => c.status !== 'resolved').length
  const hasAiAccess = tierIncludes(app.plan, 'ai_search')
  return (
    <div>
      <PageHead
        title="Communication"
        sub="Messenger · Complaints · Announcements"
        actions={
          <Btn variant={aiMode ? 'primary' : 'secondary'} icon="sparkle" onClick={() => setAiMode((v) => !v)}>
            {aiMode ? 'Exit AI Mode' : 'AI Mode'}
          </Btn>
        }
      />
      {aiMode ? (
        // TierGate mounts its children inside an aria-hidden blur div (never omits them), so
        // always wrapping AiSearchScreen here would still mount it (and its data fetches) for
        // non-Platinum schools. Branch explicitly instead so the gated path never mounts it.
        hasAiAccess ? (
          <AiSearchScreen />
        ) : (
          <TierGate feature="ai_search" title="AI Mode" blurb="Ask natural-language questions about your school on the Platinum plan.">
            <div />
          </TierGate>
        )
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <Tabs value={tab} onChange={setTab} tabs={[
              { value: 'messenger', label: 'Messenger', icon: 'message', count: unread },
              { value: 'complaints', label: 'Complaints', icon: 'inbox', count: openComplaints },
              { value: 'announcements', label: 'Announcements', icon: 'bell' },
            ]} />
          </div>
          {tab === 'messenger' && <MessengerTab />}
          {tab === 'complaints' && <ComplaintsTab />}
          {tab === 'announcements' && <AnnouncementsTab />}
        </>
      )}
    </div>
  )
}
```
with:
```tsx
function CommunicationScreen() {
  const [tab, setTab] = useState('messenger')
  const { data: threadsData } = useThreads()
  const { data: complaintsData } = useComplaints()
  const unread = (threadsData ?? []).reduce((n, t) => n + t.unread, 0)
  const openComplaints = (complaintsData ?? []).filter((c) => c.status !== 'resolved').length
  return (
    <div>
      <PageHead title="Communication" sub="Messenger · Complaints · Announcements" />
      <div style={{ marginBottom: 14 }}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'messenger', label: 'Messenger', icon: 'message', count: unread },
          { value: 'complaints', label: 'Complaints', icon: 'inbox', count: openComplaints },
          { value: 'announcements', label: 'Announcements', icon: 'bell' },
        ]} />
      </div>
      {tab === 'messenger' && <MessengerTab />}
      {tab === 'complaints' && <ComplaintsTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
    </div>
  )
}
```

Then remove the now-unused import in `operations.tsx` — the `AiSearchScreen` import
(`import { AiSearchScreen } from './aiSearch'`) is no longer referenced anywhere in this file once
`CommunicationScreen` no longer uses it; delete that import line. Do **not** remove the `useApp`,
`TierGate`, or `tierIncludes` imports — grep the file first to confirm they're each still used
elsewhere (Transport/GPS screens further down in the same file use all three).

- [ ] **Step 4: Run the tests to verify nothing broke**

Run:
```bash
npx vitest run src/components/shell/AiFloatingButton.test.tsx src/screens/school/aiSearch.test.tsx src/lib/aiSearchResolver.test.ts src/api/hooks/useAiSearch.test.ts src/lib/speechToText.test.ts src/lib/textToSpeech.test.ts src/lib/gating.test.ts
```
Expected: all pass. `communicationAiMode.test.tsx` should no longer exist (confirm with
`ls src/screens/school/communicationAiMode.test.tsx` returning "No such file").

- [ ] **Step 5: Full verification and commit**

Run, in order:
```bash
npx vitest run
npx tsc -b
npm run build
```
Expected: full suite green except the known pre-existing, unrelated flaky
`src/screens/school/toppers.test.tsx` (already documented, not this plan's concern); `tsc -b` shows
only the known pre-existing baseline errors listed in Global Constraints, nothing new; `npm run
build`'s `vite build` step succeeds.

```bash
git add src/App.tsx src/screens/school/operations.tsx
git commit -m "feat(shell): move AI Mode entry point from Communication toggle to the floating assistant"
```

---

## Post-plan verification

After Task 2, run the full suite once more to confirm nothing elsewhere broke:
```bash
npm test
npm run typecheck
```
Both must exit 0 (modulo the pre-existing, unrelated baseline `tsc` errors and the pre-existing,
unrelated flaky `src/screens/school/toppers.test.tsx` timing test — both already known and
documented as out of scope across this and the two prior AI Mode plans).
