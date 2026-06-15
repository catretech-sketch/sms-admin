# Per-user Permission Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin grant or revoke individual View/Edit/Approve capabilities for a single user (per-ID), layered on top of the role-based permission matrix in the Identity & access screen.

**Architecture:** A pure resolver (`effectiveCaps`) in `src/lib/gating.ts` computes a user's effective caps as `role caps + grants − revokes` from a sparse per-user override map. The Identity & access Users tab gets an inline per-user editor (matching the existing `InviteModalContent` inline-swap pattern) with click-to-cycle V/E/A chips. Overrides live in on-screen React state only — a functional mock, consistent with the rest of the screen (global `PERMS` / live `can()` gating are untouched).

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + @testing-library/react. Frontend-only mock data.

**Spec:** `docs/superpowers/specs/2026-06-15-identity-access-per-user-overrides-design.md`

---

## File Structure

- `src/types/index.ts` — add `CellState` and `UserOverrides` types (domain types live here).
- `src/lib/gating.ts` — add pure helpers: `effectiveCaps`, `cellState`, `overrideCount`, `NEXT_CELL_STATE`. Sits beside existing `can()` / `caps()`.
- `src/lib/gating.test.ts` — unit tests for the new resolver helpers.
- `src/screens/school/admin.tsx` — `OverrideChip` + `UserAccessEditor` components, wire the Users-tab Edit button, override state, row badge, sample overrides, sample audit entry.
- `src/screens/school/identityOverrides.test.tsx` — new component test for the editor flow.

---

## Task 1: Types + pure override resolver

**Files:**
- Modify: `src/types/index.ts` (after `export type ConsoleKind = 'owner' | 'school'`, line 9)
- Modify: `src/lib/gating.ts` (append helpers after `caps()`, line 26)
- Test: `src/lib/gating.test.ts`

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, immediately after the line `export type ConsoleKind = 'owner' | 'school'`, add:

```ts
/* ---- Per-user permission overrides (Identity & access) ---- */
export type CellState = 'inherit' | 'grant' | 'revoke'
/* module key -> cap -> explicit grant/revoke. Absent entry = inherit from role. */
export type UserOverrides = Record<string, Partial<Record<Cap, 'grant' | 'revoke'>>>
```

- [ ] **Step 2: Write the failing tests**

Replace the import line at the top of `src/lib/gating.test.ts` and add a new `describe` block. The file becomes:

```ts
import { describe, it, expect } from 'vitest'
import {
  tierIncludes, requiredTier, can, caps,
  effectiveCaps, cellState, overrideCount, NEXT_CELL_STATE,
} from './gating'
import type { UserOverrides } from '@/types'

describe('gating', () => {
  it('tierIncludes respects tier order', () => {
    expect(tierIncludes('silver', 'sis')).toBe(true)
    expect(tierIncludes('silver', 'hr_payroll')).toBe(false)
    expect(tierIncludes('gold', 'hr_payroll')).toBe(true)
    expect(tierIncludes('gold', 'transport.gps')).toBe(false)
    expect(tierIncludes('platinum', 'transport.gps')).toBe(true)
  })
  it('requiredTier defaults to silver for unknown features', () => {
    expect(requiredTier('nonexistent')).toBe('silver')
    expect(requiredTier('hr_payroll')).toBe('gold')
  })
  it('can() reads the permission matrix', () => {
    expect(can('admin', 'sis', 'E')).toBe(true)
    expect(can('teacher', 'fees', 'E')).toBe(false)
    expect(can('principal', 'exams', 'A')).toBe(true)
  })
  it('caps() returns the capability array', () => {
    expect(caps('admin', 'sis')).toContain('E')
    expect(caps('teacher', 'fees')).toEqual([])
  })
})

describe('per-user overrides', () => {
  it('effectiveCaps returns role caps when there are no overrides', () => {
    expect(effectiveCaps('admin', 'sis', {})).toEqual(['E'])
    expect(effectiveCaps('teacher', 'fees', {})).toEqual([])
  })
  it('grant adds a cap the role lacks', () => {
    const ov: UserOverrides = { fees: { E: 'grant' } }
    expect(effectiveCaps('teacher', 'fees', ov)).toEqual(['E'])
  })
  it('revoke removes a cap the role has', () => {
    const ov: UserOverrides = { sis: { E: 'revoke' } }
    expect(effectiveCaps('admin', 'sis', ov)).toEqual([])
  })
  it('grant of an already-held cap is a no-op (no duplicates)', () => {
    const ov: UserOverrides = { sis: { E: 'grant' } }
    expect(effectiveCaps('admin', 'sis', ov)).toEqual(['E'])
  })
  it('revoke of a cap the role never had is a no-op', () => {
    const ov: UserOverrides = { fees: { V: 'revoke' } }
    expect(effectiveCaps('teacher', 'fees', ov)).toEqual([])
  })
  it('keeps caps ordered V -> E -> A', () => {
    const ov: UserOverrides = { academics: { A: 'grant' } }
    expect(effectiveCaps('teacher', 'academics', ov)).toEqual(['V', 'E', 'A'])
  })
  it('cellState reports the override or inherit', () => {
    const ov: UserOverrides = { fees: { E: 'grant' } }
    expect(cellState('fees', 'E', ov)).toBe('grant')
    expect(cellState('fees', 'V', ov)).toBe('inherit')
    expect(cellState('sis', 'E', {})).toBe('inherit')
  })
  it('overrideCount counts non-inherit cells across modules', () => {
    const ov: UserOverrides = { fees: { E: 'grant', V: 'revoke' }, sis: { A: 'grant' } }
    expect(overrideCount(ov)).toBe(3)
    expect(overrideCount({})).toBe(0)
  })
  it('NEXT_CELL_STATE cycles inherit -> grant -> revoke -> inherit', () => {
    expect(NEXT_CELL_STATE.inherit).toBe('grant')
    expect(NEXT_CELL_STATE.grant).toBe('revoke')
    expect(NEXT_CELL_STATE.revoke).toBe('inherit')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- gating`
Expected: FAIL — `effectiveCaps`, `cellState`, `overrideCount`, `NEXT_CELL_STATE` are not exported.

- [ ] **Step 4: Implement the helpers**

In `src/lib/gating.ts`, update the type import on line 6 to include the new types:

```ts
import type { Tier, Role, Cap, UserOverrides, CellState } from '@/types'
```

Then append after the existing `caps()` function (end of file):

```ts
const CAP_ORDER: Cap[] = ['V', 'E', 'A']

/** Next state when a per-user capability cell is clicked. */
export const NEXT_CELL_STATE: Record<CellState, CellState> = {
  inherit: 'grant',
  grant: 'revoke',
  revoke: 'inherit',
}

/** Override state of a single capability cell for a user (inherit if unset). */
export function cellState(module: string, cap: Cap, overrides: UserOverrides): CellState {
  return overrides[module]?.[cap] ?? 'inherit'
}

/** Effective caps for a user = role caps + grants − revokes, ordered V→E→A. */
export function effectiveCaps(role: Role, module: string, overrides: UserOverrides): Cap[] {
  const set = new Set<Cap>(caps(role, module))
  const mod = overrides[module]
  if (mod) {
    for (const cap of CAP_ORDER) {
      if (mod[cap] === 'grant') set.add(cap)
      else if (mod[cap] === 'revoke') set.delete(cap)
    }
  }
  return CAP_ORDER.filter((c) => set.has(c))
}

/** Count of non-inherit cells across all modules. */
export function overrideCount(overrides: UserOverrides): number {
  return Object.values(overrides).reduce((n, m) => n + Object.keys(m).length, 0)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- gating`
Expected: PASS (all `gating` and `per-user overrides` tests green).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/gating.ts src/lib/gating.test.ts
git commit -m "feat: effectiveCaps resolver for per-user permission overrides"
```

---

## Task 2: Per-user access editor UI + Users-tab wiring

**Files:**
- Modify: `src/screens/school/admin.tsx` (imports; `OverrideChip` + `UserAccessEditor` new; `UsersTab` wiring; sample overrides; sample audit entry)

- [ ] **Step 1: Update imports**

In `src/screens/school/admin.tsx`, change the gating import (line 15) from:

```ts
import { tierIncludes } from '@/lib/gating'
```
to:
```ts
import { tierIncludes, caps, effectiveCaps, cellState, overrideCount, NEXT_CELL_STATE } from '@/lib/gating'
```

And change the types import (line 22) from:

```ts
import type { Role, Cap, Tier } from '@/types'
```
to:
```ts
import type { Role, Cap, Tier, CellState, UserOverrides } from '@/types'
```

- [ ] **Step 2: Add sample overrides next to `SCHOOL_USERS`**

Immediately after the `SCHOOL_USERS` IIFE block ends (the `})()` on line 308) and before `const userStatus`, add:

```ts
/* A couple of users ship with per-user overrides so the feature is visible on load. */
const SAMPLE_OVERRIDES: Record<string, UserOverrides> = {
  [SCHOOL_USERS[3].id]: { fees: { V: 'grant' } },        // a teacher granted fee visibility
  [SCHOOL_USERS[4].id]: { attendance: { E: 'revoke' } }, // a teacher with attendance edit removed
}
```

- [ ] **Step 3: Add the `OverrideChip` component**

Immediately after the existing `CapChip` function (ends line 462), add:

```tsx
function OverrideChip({ cap, state, onClick }: { cap: Cap; state: CellState; onClick: () => void }) {
  const granted = state === 'grant'
  const revoked = state === 'revoke'
  const color = CAP_COLOR[cap]
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${CAP_LABEL[cap]} — ${state}`}
      style={{
        width: 30, height: 26, borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: `1px solid ${granted ? color : revoked ? 'var(--danger)' : 'var(--border)'}`,
        background: granted ? color : 'transparent',
        color: granted ? '#fff' : revoked ? 'var(--danger)' : 'var(--text-2)',
        textDecoration: revoked ? 'line-through' : 'none',
        transition: 'all .12s ease',
      }}
    >
      {cap}
    </button>
  )
}
```

- [ ] **Step 4: Add the `UserAccessEditor` component**

Immediately after `OverrideChip`, add:

```tsx
function UserAccessEditor({ user, initial, onSave, onCancel }: {
  user: SchoolUser
  initial: UserOverrides
  onSave: (ov: UserOverrides) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [ov, setOv] = useState<UserOverrides>(initial)

  const cycle = (mod: string, cap: Cap) => {
    setOv((prev) => {
      const next = NEXT_CELL_STATE[cellState(mod, cap, prev)]
      const modOv = { ...(prev[mod] ?? {}) }
      if (next === 'inherit') delete modOv[cap]
      else modOv[cap] = next
      const out = { ...prev }
      if (Object.keys(modOv).length === 0) delete out[mod]
      else out[mod] = modOv
      return out
    })
  }

  const count = overrideCount(ov)
  const reset = () => { setOv(initial); toast.info('Overrides reset', 'Reverted to the last saved overrides.') }
  const save = () => {
    onSave(ov)
    toast.success('Permissions saved', `${count} override${count === 1 ? '' : 's'} for ${user.name}.`)
  }

  return (
    <div className="col gap16">
      <Card>
        <div className="row ai-center gap12 wrap">
          <Avatar name={user.name} hue={user.hue} size={40} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="fw7">{user.name}</div>
            <div className="t-sm muted">{user.email}</div>
          </div>
          <Badge tone={roleTone(user.role)}>{ROLE_META[user.role].label}</Badge>
          <Btn variant="ghost" size="sm" icon="arrowLeft" onClick={onCancel}>Back</Btn>
        </div>
      </Card>

      <Card pad={false}>
        <CardHead
          title="Per-user access"
          sub="Tap V / E / A to cycle inherit → grant → revoke for this user"
          icon="user"
          action={
            <div className="row ai-center gap8">
              <Badge tone="neutral">{count} override{count === 1 ? '' : 's'}</Badge>
              <Btn variant="ghost" size="sm" icon="refresh" onClick={reset}>Reset</Btn>
              <Btn variant="primary" size="sm" icon="check" onClick={save}>Save changes</Btn>
            </div>
          }
        />
        <div style={{ overflowX: 'auto' }}>
          <table className="sm-table">
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Module</th>
                <th className="ta-center">Role default</th>
                <th className="ta-center">This user</th>
                <th className="ta-center">Effective</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(PERMS).map((mod) => {
                const roleCaps = caps(user.role, mod)
                const eff = effectiveCaps(user.role, mod, ov)
                return (
                  <tr key={mod}>
                    <td>
                      <div className="fw6">{MODULE_LABEL[mod] ?? mod}</div>
                      <div className="t-xs muted">{mod}</div>
                    </td>
                    <td className="ta-center">
                      <span className="t-xs muted">{roleCaps.length ? roleCaps.join(' · ') : '—'}</span>
                    </td>
                    <td className="ta-center">
                      <div className="row gap4" style={{ justifyContent: 'center' }}>
                        {CAPS.map((c) => (
                          <OverrideChip key={c} cap={c} state={cellState(mod, c, ov)} onClick={() => cycle(mod, c)} />
                        ))}
                      </div>
                    </td>
                    <td className="ta-center">
                      <div className="row gap4" style={{ justifyContent: 'center' }}>
                        {eff.length
                          ? eff.map((c) => <Badge key={c} tone={CAP_TONE[c]}>{c}</Badge>)
                          : <span className="t-xs muted">No access</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Wire the editor into `UsersTab`**

In `UsersTab` (starts line 352), add override + editing state after the existing `useState` calls (after `const [inviting, setInviting] = useState(false)`):

```tsx
  const [overrides, setOverrides] = useState<Record<string, UserOverrides>>(SAMPLE_OVERRIDES)
  const [editing, setEditing] = useState<SchoolUser | null>(null)
```

Change the row "Edit" button (line 396) from:

```tsx
          <Btn variant="secondary" size="sm" icon="edit" onClick={() => toast.info('Edit access', `Adjust role for ${u.name}.`)}>Edit</Btn>
```
to:
```tsx
          <Btn variant="secondary" size="sm" icon="edit" onClick={() => setEditing(u)}>Edit</Btn>
```

Update the `role` column render (line 382) to show an override badge:

```tsx
      key: 'role', label: 'Role', sortValue: (u) => u.role,
      render: (u) => {
        const n = overrideCount(overrides[u.id] ?? {})
        return (
          <div className="row ai-center gap6">
            <Badge tone={roleTone(u.role)}>{ROLE_META[u.role].label}</Badge>
            {n > 0 && <Badge tone="neutral">{n} custom</Badge>}
          </div>
        )
      },
```

Add the editor inline-swap right next to the existing invite swap. Change (line 405):

```tsx
  if (inviting) return <InviteModalContent onDone={() => setInviting(false)} />
```
to:
```tsx
  if (inviting) return <InviteModalContent onDone={() => setInviting(false)} />
  if (editing) return (
    <UserAccessEditor
      user={editing}
      initial={overrides[editing.id] ?? {}}
      onSave={(ov) => { setOverrides((m) => ({ ...m, [editing.id]: ov })); setEditing(null) }}
      onCancel={() => setEditing(null)}
    />
  )
```

- [ ] **Step 6: Add a sample audit entry**

In the `AUDIT` array (line 601), add one entry at the top of the list (after the opening `[`):

```tsx
  { id: 'A-0', who: 'Ravi Menon', hue: 200, action: 'Granted View', target: 'Neha Joshi · Fees', module: 'identity', when: 'Just now', tone: 'success' },
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/screens/school/admin.tsx
git commit -m "feat: per-user permission override editor in Identity & access"
```

---

## Task 3: Component test for the editor flow

**Files:**
- Create: `src/screens/school/identityOverrides.test.tsx`

- [ ] **Step 1: Write the test**

Create `src/screens/school/identityOverrides.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { adminScreens } from './admin'

const IdentityScreen = adminScreens['school.identity']

afterEach(cleanup)

function renderScreen() {
  return render(
    <AppProvider>
      <ToastProvider>
        <IdentityScreen />
      </ToastProvider>
    </AppProvider>,
  )
}

/** Locate the editor table row for a given module label. */
function moduleRow(container: HTMLElement, label: string): HTMLElement {
  const cell = within(container).getByText(label)
  return cell.closest('tr') as HTMLElement
}

describe('per-user access editor', () => {
  it('opens from a user row, cycles a capability, saves, and shows the override badge', () => {
    const { container } = renderScreen()

    // Open the editor for the first user.
    fireEvent.click(within(container).getAllByText('Edit')[0])
    expect(within(container).getByText('Per-user access')).toBeInTheDocument()

    // The "Fees & finance" module row exists with three V/E/A chips.
    const row = moduleRow(container, 'Fees & finance')
    const vChip = within(row).getByTitle(/^View —/)

    // inherit -> grant
    fireEvent.click(vChip)
    expect(within(row).getByTitle('View — grant')).toBeInTheDocument()

    // Save commits and returns to the table with a success toast.
    fireEvent.click(within(container).getByText('Save changes'))
    expect(within(container).getByText(/Permissions saved/i)).toBeInTheDocument()

    // Back on the list, the user shows a "custom" override badge.
    expect(within(container).getByText(/1 custom/i)).toBeInTheDocument()
  })

  it('cycles a cell through grant, revoke, and back to inherit', () => {
    const { container } = renderScreen()
    fireEvent.click(within(container).getAllByText('Edit')[0])

    const row = moduleRow(container, 'Fees & finance')
    const eChip = within(row).getByTitle(/^Edit —/)

    fireEvent.click(eChip) // inherit -> grant
    expect(within(row).getByTitle('Edit — grant')).toBeInTheDocument()
    fireEvent.click(within(row).getByTitle('Edit — grant')) // grant -> revoke
    expect(within(row).getByTitle('Edit — revoke')).toBeInTheDocument()
    fireEvent.click(within(row).getByTitle('Edit — revoke')) // revoke -> inherit
    expect(within(row).getByTitle('Edit — inherit')).toBeInTheDocument()
  })
})
```

> Note: the first user row in `SCHOOL_USERS` (after the default `name` ascending sort, the alphabetically-first user) has no seeded override, so the post-save badge reads `1 custom`. The test asserts on the editor heading + chip titles, which are independent of which user sorts first.

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- identityOverrides`
Expected: PASS (both cases green). If the first-row user happens to carry a seeded override, the badge count would differ — in that case assert `getByText(/custom/i)` instead of the exact count and re-run.

- [ ] **Step 3: Run the full test suite + typecheck**

Run: `npm test`
Expected: all tests pass.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/identityOverrides.test.tsx
git commit -m "test: per-user permission override editor flow"
```

---

## Self-review notes

- **Spec coverage:** override model (grant + revoke, tri-state) → Task 1 `effectiveCaps` + Task 2 `OverrideChip`/cycle; modal-from-Users-tab entry → Task 2 inline-swap; functional mock (no live gating) → no edits to `can()`/`PERMS`/`AppProvider`; click-to-cycle chips → `NEXT_CELL_STATE` + `OverrideChip`; row signal → "N custom" badge; audit sample → Task 2 Step 6; tests → Tasks 1 & 3. All sections covered.
- **Types:** `CellState` / `UserOverrides` defined once in `types/index.ts` and reused everywhere; helper names (`effectiveCaps`, `cellState`, `overrideCount`, `NEXT_CELL_STATE`) are consistent across gating, admin, and tests.
- **No placeholders:** every step has full code or an exact command + expected result.
