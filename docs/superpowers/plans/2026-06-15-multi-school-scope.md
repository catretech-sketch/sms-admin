# Multi-school Access Per User — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Owner give one user access to multiple specific schools (or all schools) in the Owner → Users & roles screen.

**Architecture:** Change `TeamUser.scope` from a single `string` to a `string[]` (`['All schools']` sentinel or a list of specific school names). Pure helpers (`isAllSchools`, `scopeLabel`, `toggleScope`) own the rules; a shared `ScopePicker` checkbox list (used by both Edit and Invite modals) edits it; the Team table renders a compact label. Functional mock — state only, no live gating.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + @testing-library/react. All changes in `src/screens/owner/workspace.tsx` + its test.

**Spec:** `docs/superpowers/specs/2026-06-15-multi-school-scope-design.md`

---

## File Structure

- `src/screens/owner/workspace.tsx` — `ALL_SCHOOLS` constant; pure helpers `isAllSchools` / `scopeLabel` / `toggleScope`; `ScopePicker` component; `TeamUser.scope: string[]`; updated `TEAM` seed; updated `EditUserModal`, `InviteModal`, Scope column, search.
- `src/screens/owner/workspace.test.tsx` — helper unit tests; updated + new component tests.

Note on existing names: the seven `schools[].name` values are exactly `Greenwood Valley School`, `St. Xavier’s High School` (curly apostrophe U+2019), `Delhi Public Academy`, `Sunrise International`, `Lotus Montessori`, `Al-Manar Academy`, `Horizon World School`. Scope arrays store these exact names.

---

## Task 1: Scope constant + pure helpers

**Files:**
- Modify: `src/screens/owner/workspace.tsx` (add constant + helpers near the top, after the `roleTone` helper around line 43)
- Test: `src/screens/owner/workspace.test.tsx` (append a `describe` block; do not touch existing tests yet)

- [ ] **Step 1: Write the failing unit tests**

Append this block to the END of `src/screens/owner/workspace.test.tsx`, and add the import names to the existing top import from `./workspace` (currently `import { workspaceScreens } from './workspace'`) so it reads:

```ts
import { workspaceScreens, ALL_SCHOOLS, isAllSchools, scopeLabel, toggleScope } from './workspace'
```

Appended block:

```ts
describe('scope helpers', () => {
  it('isAllSchools detects the All sentinel', () => {
    expect(isAllSchools([ALL_SCHOOLS])).toBe(true)
    expect(isAllSchools(['Greenwood Valley School'])).toBe(false)
  })
  it('scopeLabel summarises the scope', () => {
    expect(scopeLabel([ALL_SCHOOLS])).toBe('All schools')
    expect(scopeLabel(['Greenwood Valley School'])).toBe('Greenwood Valley School')
    expect(scopeLabel(['Greenwood Valley School', 'Delhi Public Academy'])).toBe('2 schools')
  })
  it('toggleScope: picking a specific school replaces All', () => {
    expect(toggleScope([ALL_SCHOOLS], 'Greenwood Valley School')).toEqual(['Greenwood Valley School'])
  })
  it('toggleScope: picking All replaces specifics', () => {
    expect(toggleScope(['Greenwood Valley School', 'Delhi Public Academy'], ALL_SCHOOLS)).toEqual([ALL_SCHOOLS])
  })
  it('toggleScope: adds and removes specific schools', () => {
    expect(toggleScope(['Greenwood Valley School'], 'Delhi Public Academy'))
      .toEqual(['Greenwood Valley School', 'Delhi Public Academy'])
    expect(toggleScope(['Greenwood Valley School', 'Delhi Public Academy'], 'Delhi Public Academy'))
      .toEqual(['Greenwood Valley School'])
  })
  it('toggleScope: removing the last specific falls back to All (never empty)', () => {
    expect(toggleScope(['Greenwood Valley School'], 'Greenwood Valley School')).toEqual([ALL_SCHOOLS])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- workspace`
Expected: FAIL — `ALL_SCHOOLS`, `isAllSchools`, `scopeLabel`, `toggleScope` are not exported.

- [ ] **Step 3: Implement the constant + helpers**

In `src/screens/owner/workspace.tsx`, add immediately after the `roleTone` helper (around line 43):

```ts
/* ---------- scope (which schools a user can access) ---------- */
export const ALL_SCHOOLS = 'All schools'

/** True when the scope grants every tenant. */
export function isAllSchools(scope: string[]): boolean {
  return scope.includes(ALL_SCHOOLS)
}

/** Compact label for the table: "All schools" | "<name>" | "N schools". */
export function scopeLabel(scope: string[]): string {
  if (isAllSchools(scope)) return ALL_SCHOOLS
  if (scope.length === 1) return scope[0]
  return `${scope.length} schools`
}

/** Toggle a school in the working scope, enforcing All-vs-specific + non-empty. */
export function toggleScope(scope: string[], school: string): string[] {
  if (school === ALL_SCHOOLS) return [ALL_SCHOOLS]
  const specifics = scope.filter((s) => s !== ALL_SCHOOLS)
  const next = specifics.includes(school)
    ? specifics.filter((s) => s !== school)
    : [...specifics, school]
  return next.length === 0 ? [ALL_SCHOOLS] : next
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- workspace`
Expected: the `scope helpers` describe passes. (The two pre-existing component tests in this file may now FAIL to compile/run because they still reference `ALL_SCHOOLS` via the new import only — that is fine; they are rewritten in Task 2. If they fail, it must be ONLY the existing `edit user` tests, never the `scope helpers` ones.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (helpers are additive; `TeamUser.scope` is still `string` at this point and unused by the new helpers).

- [ ] **Step 6: Commit**

```bash
git add src/screens/owner/workspace.tsx src/screens/owner/workspace.test.tsx
git commit -m "feat: scope helpers for multi-school access"
```

---

## Task 2: Migrate to string[] scope + ScopePicker + modals + table

**Files:**
- Modify: `src/screens/owner/workspace.tsx` (`TeamUser` type, `TEAM` seed, `ScopePicker`, `EditUserModal`, `InviteModal`, Scope column + search, `TeamTab` onSave)
- Modify: `src/screens/owner/workspace.test.tsx` (rewrite the two existing `edit user` component tests for the checkbox control)

- [ ] **Step 1: Change the `TeamUser.scope` type**

In `src/screens/owner/workspace.tsx`, change the `scope` field of the `TeamUser` interface:

```ts
interface TeamUser {
  id: string
  name: string
  email: string
  role: Role
  scope: string[]
  hue: number
  status: 'active' | 'invited' | 'suspended'
  last: string
}
```

- [ ] **Step 2: Update the `TEAM` seed data to arrays**

Replace the entire `TEAM` array literal with (one user, U-04, gets two schools so the feature shows on load):

```ts
const TEAM: TeamUser[] = [
  { id: 'U-01', name: 'Anil Mehta', email: 'anil@schoolmate.io', role: 'admin', scope: [ALL_SCHOOLS], hue: 250, status: 'active', last: 'Just now' },
  { id: 'U-02', name: 'Sunita Rao', email: 'sunita.rao@schoolmate.io', role: 'principal', scope: ['Greenwood Valley School'], hue: 330, status: 'active', last: '12m ago' },
  { id: 'U-03', name: 'Arjun Banerjee', email: 'arjun.b@schoolmate.io', role: 'vice_principal', scope: ['Greenwood Valley School'], hue: 150, status: 'active', last: '1h ago' },
  { id: 'U-04', name: 'Ravi Menon', email: 'ravi.menon@schoolmate.io', role: 'admin', scope: ['St. Xavier’s High School', 'Greenwood Valley School'], hue: 200, status: 'active', last: '3h ago' },
  { id: 'U-05', name: 'Meera Krishnan', email: 'meera.k@schoolmate.io', role: 'teacher', scope: ['Greenwood Valley School'], hue: 20, status: 'active', last: 'Yesterday' },
  { id: 'U-06', name: 'Priya Iyer', email: 'priya.iyer@schoolmate.io', role: 'principal', scope: ['Delhi Public Academy'], hue: 290, status: 'active', last: 'Yesterday' },
  { id: 'U-07', name: 'Kabir Sharma', email: 'kabir.s@schoolmate.io', role: 'admin', scope: ['Sunrise International'], hue: 40, status: 'active', last: '2d ago' },
  { id: 'U-08', name: 'Fatima Khan', email: 'fatima.khan@schoolmate.io', role: 'vice_principal', scope: ['Al-Manar Academy'], hue: 175, status: 'active', last: '2d ago' },
  { id: 'U-09', name: 'Rohan Das', email: 'rohan.das@schoolmate.io', role: 'teacher', scope: ['Horizon World School'], hue: 110, status: 'suspended', last: '6d ago' },
  { id: 'U-10', name: 'Anika Reddy', email: 'anika.reddy@schoolmate.io', role: 'admin', scope: ['Lotus Montessori'], hue: 320, status: 'active', last: '1w ago' },
  { id: 'U-11', name: 'Vivaan Gupta', email: 'vivaan.gupta@schoolmate.io', role: 'principal', scope: ['St. Xavier’s High School'], hue: 215, status: 'active', last: '1w ago' },
  { id: 'U-12', name: 'Diya Nair', email: 'diya.nair@schoolmate.io', role: 'teacher', scope: ['Delhi Public Academy'], hue: 80, status: 'invited', last: 'Pending' },
]
```

- [ ] **Step 3: Add the shared `ScopePicker` component**

Add this just BEFORE the `InviteModal` function (around line 80):

```tsx
/* Multi-school scope selector shared by the Invite and Edit modals. */
function ScopePicker({ scope, onChange }: { scope: string[]; onChange: (next: string[]) => void }) {
  const all = isAllSchools(scope)
  return (
    <Field label="Scope" required hint="Grant access to all tenants, or pick one or more specific schools.">
      <div className="col gap8" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
        <label className="row ai-center gap8" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={all} onChange={() => onChange(toggleScope(scope, ALL_SCHOOLS))} />
          <span className="fw6">All schools</span>
        </label>
        {schools.map((s) => (
          <label key={s.id} className="row ai-center gap8" style={{ cursor: 'pointer', opacity: all ? 0.6 : 1 }}>
            <input
              type="checkbox"
              checked={!all && scope.includes(s.name)}
              onChange={() => onChange(toggleScope(scope, s.name))}
            />
            <span>{s.name}</span>
          </label>
        ))}
      </div>
    </Field>
  )
}
```

(The specific-school rows stay clickable while "All schools" is checked — clicking one switches the user to that school. They are only visually de-emphasised.)

- [ ] **Step 4: Update `InviteModal` to use `string[]` scope + `ScopePicker`**

In `InviteModal`, replace the scope state, reset, the `where` line, and the scope `<Field>`:

Change `const [scope, setScope] = useState('all')` to:
```tsx
  const [scope, setScope] = useState<string[]>([ALL_SCHOOLS])
```
Change `const reset = () => { setEmail(''); setRole('admin'); setScope('all') }` to:
```tsx
  const reset = () => { setEmail(''); setRole('admin'); setScope([ALL_SCHOOLS]) }
```
Change the `where` computation in `submit`:
```tsx
    const where = scopeLabel(scope)
```
Replace the scope `<Field>...</Field>` block (the one wrapping the `<Select>` for scope) with:
```tsx
        <ScopePicker scope={scope} onChange={setScope} />
```

- [ ] **Step 5: Update `EditUserModal` to use `string[]` scope + `ScopePicker`**

Change its prop type and state. The `onSave` signature becomes `string[]`:

```tsx
function EditUserModal({ user, onClose, onSave }: {
  user: TeamUser
  onClose: () => void
  onSave: (id: string, role: Role, scope: string[]) => void
}) {
  const [role, setRole] = useState<Role>(user.role)
  const [scope, setScope] = useState<string[]>(user.scope)
```

Replace its scope `<Field>...</Field>` block (the `<Select>` one) with:
```tsx
        <ScopePicker scope={scope} onChange={setScope} />
```

(The role `<Field>`/`<Select>` and the footer with `onSave(user.id, role, scope)` stay as-is — `scope` is now an array.)

- [ ] **Step 6: Update the Team search to match any school in scope**

In `TeamTab`'s `rows` useMemo, replace the filter predicate's name/email/scope line:

```tsx
      if (needle && !(
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        u.scope.some((s) => s.toLowerCase().includes(needle))
      )) return false
```

- [ ] **Step 7: Update the Scope column render**

Replace the `scope` column definition in `columns`:

```tsx
    {
      key: 'scope', label: 'Scope', sortValue: (u) => scopeLabel(u.scope),
      render: (u) => (
        <span className="row ai-center gap6 t-sm" title={u.scope.join(', ')}>
          <Icon name={isAllSchools(u.scope) ? 'globe' : 'building'} size={14} />
          {scopeLabel(u.scope)}
        </span>
      ),
    },
```

- [ ] **Step 8: Update the `onSave` handler type in `TeamTab`**

The `EditUserModal` render in `TeamTab` already destructures `(id, role, scope)`; confirm the `onSave` body matches the new `string[]` scope (no code change needed beyond Step 5's signature, but verify):

```tsx
          onSave={(id, role, scope) => {
            setTeam((list) => list.map((x) => (x.id === id ? { ...x, role, scope } : x)))
            toast.success('Access updated', `${editing.name} is now ${ROLE_META[role].label} · ${scopeLabel(scope)}.`)
            setEditing(null)
          }}
```

- [ ] **Step 9: Rewrite the two existing `edit user` component tests for checkboxes**

In `src/screens/owner/workspace.test.tsx`, replace the entire `describe('owner Users & roles — edit user', ...)` block with:

```ts
describe('owner Users & roles — edit user', () => {
  it('opens an editor, sets role + All-schools scope, and the row reflects it', () => {
    const { container } = renderScreen()

    const editBtn = within(container).getAllByText('Edit')[0]
    const userName = (editBtn.closest('tr') as HTMLElement).querySelector('.fw6')!.textContent!

    fireEvent.click(editBtn)
    const dialog = within(container).getByRole('dialog')

    // Role -> Principal (the only combobox in the dialog now).
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'principal' } })
    // Scope -> All schools (checkbox).
    fireEvent.click(within(dialog).getByLabelText('All schools'))

    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    expect(within(container).queryByRole('dialog')).toBeNull()
    expect(within(container).getByText(/access updated/i)).toBeInTheDocument()

    const savedRow = within(container).getByText(userName).closest('tr') as HTMLElement
    expect(within(savedRow).getByText('Principal')).toBeInTheDocument()
    expect(within(savedRow).getByText('All schools')).toBeInTheDocument()
  })

  it('does not persist changes when the editor is cancelled', () => {
    const { container } = renderScreen()

    const editBtn = within(container).getAllByText('Edit')[0]
    const row = editBtn.closest('tr') as HTMLElement
    const roleBefore = within(row).getByText(/admin|principal|vice-principal|teacher/i).textContent

    fireEvent.click(editBtn)
    const dialog = within(container).getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'teacher' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(within(container).queryByRole('dialog')).toBeNull()
    expect(within(row).getByText(roleBefore as string)).toBeInTheDocument()
  })
})
```

- [ ] **Step 10: Run tests + typecheck**

Run: `npm test -- workspace`
Expected: PASS (`scope helpers` + both `edit user` tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/screens/owner/workspace.tsx src/screens/owner/workspace.test.tsx
git commit -m "feat: multi-school scope (string[]) with ScopePicker in Owner Users & roles"
```

---

## Task 3: Component test for multi-school selection

**Files:**
- Modify: `src/screens/owner/workspace.test.tsx` (add one component test)

- [ ] **Step 1: Write the test**

Append this `describe` block to `src/screens/owner/workspace.test.tsx`:

```ts
describe('owner Users & roles — multi-school scope', () => {
  it('assigns two specific schools and the row shows "2 schools"', () => {
    const { container } = renderScreen()

    const editBtn = within(container).getAllByText('Edit')[0]
    const userName = (editBtn.closest('tr') as HTMLElement).querySelector('.fw6')!.textContent!

    fireEvent.click(editBtn)
    const dialog = within(container).getByRole('dialog')

    // Normalise to a known starting point, then pick exactly two specific schools.
    fireEvent.click(within(dialog).getByLabelText('All schools'))                 // scope = [All]
    fireEvent.click(within(dialog).getByLabelText('Greenwood Valley School'))      // scope = [GVS]
    fireEvent.click(within(dialog).getByLabelText('Delhi Public Academy'))         // scope = [GVS, DPA]

    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    expect(within(container).queryByRole('dialog')).toBeNull()
    const savedRow = within(container).getByText(userName).closest('tr') as HTMLElement
    expect(within(savedRow).getByText('2 schools')).toBeInTheDocument()
  })

  it('picking a specific school clears All schools', () => {
    const { container } = renderScreen()
    fireEvent.click(within(container).getAllByText('Edit')[0])
    const dialog = within(container).getByRole('dialog')

    const allBox = within(dialog).getByLabelText('All schools') as HTMLInputElement
    fireEvent.click(allBox)                                                        // ensure All on
    expect(allBox.checked).toBe(true)

    fireEvent.click(within(dialog).getByLabelText('Greenwood Valley School'))
    expect((within(dialog).getByLabelText('All schools') as HTMLInputElement).checked).toBe(false)
    expect((within(dialog).getByLabelText('Greenwood Valley School') as HTMLInputElement).checked).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm test -- workspace`
Expected: PASS (all `workspace` describes green).

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm test`
Expected: all tests pass.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/owner/workspace.test.tsx
git commit -m "test: multi-school scope selection in Owner Users & roles"
```

---

## Self-review notes

- **Spec coverage:** scope `string[]` model + sentinel → Task 2 Step 1–2; `ALL_SCHOOLS`/`isAllSchools`/`scopeLabel`/`toggleScope` → Task 1; `ScopePicker` in both modals → Task 2 Steps 3–5; table label + icon → Step 7; search across schools → Step 6; seed multi-school user → Step 2; helper unit tests → Task 1; component tests (multi-select, All↔specific) → Task 3; functional-mock / no gating → no `can()`/`PERMS` edits. All covered.
- **Type consistency:** `onSave` is `(id, role, scope: string[])` in both the `EditUserModal` definition (Task 2 Step 5) and the `TeamTab` caller (Step 8); `scope` is `string[]` everywhere after Task 2 Step 1.
- **No placeholders:** every step has full code or an exact command + expected result.
- **Note:** the `OwnerUsers` Tabs `count: TEAM.length` and the Team-tab role filter are unaffected by the scope change and intentionally left as-is.
