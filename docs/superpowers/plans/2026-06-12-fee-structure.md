# Fee Structure (Class-wise) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Structure tab to the Fees screen for defining per-grade fee amounts (Academic / Transport / Other), persisted in app state.

**Architecture:** `feeStructure` + `saveFeeStructure` in `AppProvider`. A new `FeeStructureTab` in `finance.tsx` renders an editable grade × fee-head table seeded from `termFeeFor`; wired as a third Fees tab.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library.

---

## File Structure

- **Modify** `src/context/AppProvider.tsx` — `feeStructure` + `saveFeeStructure`.
- **Modify** `src/screens/school/finance.tsx` — `FeeStructureTab` + Structure tab.
- **Modify** `src/screens/school/financeFees.test.tsx` — Structure render/save test.

---

### Task 1: AppProvider state

**Files:**
- Modify: `src/context/AppProvider.tsx`

- [ ] **Step 1: Add to the `AppState` interface**

After the `feePayments` lines:

```ts
  feePayments: FeePayment[]
  addFeePayment: (p: FeePayment) => void
```

add:

```ts
  /* per-grade fee structure (in-session) */
  feeStructure: Record<string, Record<FeeType, number>>
  saveFeeStructure: (next: Record<string, Record<FeeType, number>>) => void
```

- [ ] **Step 2: Import `FeeType`**

Add `FeeType` to the type import:

```ts
import type { ConsoleKind, Exam, FeePayment, FeeType, PaperSlot, Role, School, Staff, Student, Teacher, Tier } from '@/types'
```

- [ ] **Step 3: Add the state + action**

After:

```ts
  const [feePayments, setFeePayments] = useState<FeePayment[]>([])
  const addFeePayment = (p: FeePayment) => setFeePayments((list) => [p, ...list])
```

add:

```ts
  const [feeStructure, setFeeStructureState] = useState<Record<string, Record<FeeType, number>>>({})
  const saveFeeStructure = (next: Record<string, Record<FeeType, number>>) => setFeeStructureState(next)
```

- [ ] **Step 4: Expose on the value**

Change:

```ts
    feePayments, addFeePayment,
```

to:

```ts
    feePayments, addFeePayment,
    feeStructure, saveFeeStructure,
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test -- AppProvider`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/context/AppProvider.tsx
git commit -m "feat: feeStructure + saveFeeStructure in AppProvider"
```

---

### Task 2: FeeStructureTab + Structure tab

**Files:**
- Modify: `src/screens/school/finance.tsx`

- [ ] **Step 1: Add the `FeeStructureTab` component**

Insert before `function FeesScreen() {` (after `FeeHistoryTab`):

```tsx
/* ---------- Fee structure (per-grade amounts) ---------- */
const STRUCTURE_GRADES = grades.slice(4)
type StructRow = Record<FeeType, number>
const defaultStruct = (g: string): StructRow => ({ academic: termFeeFor(g), transport: 18000, other: 0 })

function FeeStructureTab({ cur, editable }: { cur: string; editable: boolean }) {
  const app = useApp()
  const toast = useToast()
  const [draft, setDraft] = useState<Record<string, StructRow>>(() => {
    const out: Record<string, StructRow> = {}
    STRUCTURE_GRADES.forEach((g) => { out[g] = app.feeStructure[g] ?? defaultStruct(g) })
    return out
  })

  const setCell = (g: string, head: FeeType, raw: string) => {
    const n = Math.max(0, Math.round(Number(raw) || 0))
    setDraft((d) => ({ ...d, [g]: { ...d[g], [head]: n } }))
  }
  const rowTotal = (r: StructRow) => r.academic + r.transport + r.other
  const grandTotal = STRUCTURE_GRADES.reduce((a, g) => a + rowTotal(draft[g]), 0)

  const save = () => {
    app.saveFeeStructure(draft)
    toast.success('Fee structure saved', `${STRUCTURE_GRADES.length} grades updated.`)
  }

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div><div className="fw6">Fee structure</div><div className="t-sm muted">Per-grade amounts by fee head · {cur}</div></div>
        {editable
          ? <Btn variant="primary" icon="check" onClick={save}>Save structure</Btn>
          : <Badge tone="neutral" icon="eye">View only</Badge>}
      </div>
      <table className="sm-table">
        <thead>
          <tr>
            <th>Grade</th>
            <th className="ta-right">Academic</th>
            <th className="ta-right">Transport</th>
            <th className="ta-right">Other</th>
            <th className="ta-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {STRUCTURE_GRADES.map((g) => {
            const r = draft[g]
            return (
              <tr key={g}>
                <td className="fw6">Grade {g}</td>
                {(['academic', 'transport', 'other'] as FeeType[]).map((head) => (
                  <td key={head} className="ta-right" style={{ width: 140 }}>
                    <Input type="number" min={0} value={String(r[head])} disabled={!editable}
                      style={{ width: 120, textAlign: 'right' }}
                      onChange={(e) => setCell(g, head, e.target.value)} />
                  </td>
                ))}
                <td className="ta-right fw7">{fmtMoney(rowTotal(r), cur)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="row jc-end" style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
        <span className="t-sm">Grand total (all grades) <span className="fw7">{fmtMoney(grandTotal, cur)}</span></span>
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Add the Structure tab option + branch**

In `FeesScreen`, change the Tabs:

```tsx
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'collection', label: 'Collection', icon: 'wallet' }, { value: 'history', label: 'History', icon: 'clock' }]} />
```

to:

```tsx
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'collection', label: 'Collection', icon: 'wallet' }, { value: 'history', label: 'History', icon: 'clock' }, { value: 'structure', label: 'Structure', icon: 'rupee' }]} />
```

and add the render branch after the history branch:

```tsx
      {tab === 'history' && <FeeHistoryTab cur={cur} />}
      {tab === 'structure' && <FeeStructureTab cur={cur} editable={canRecord} />}
```

> `canRecord = can(app.role, 'fees', 'E')` is already declared in `FeesScreen`. `grades`, `termFeeFor`, `Input`, `Btn`, `Badge`, `fmtMoney` are all in scope.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/finance.tsx
git commit -m "feat: class-wise (per-grade) fee structure tab on Fees"
```

---

### Task 3: Structure render/save test

**Files:**
- Modify: `src/screens/school/financeFees.test.tsx`

- [ ] **Step 1: Add the test case**

In `src/screens/school/financeFees.test.tsx`, add inside the existing `describe('Fee collection history', ...)` block (after the existing test):

```tsx
  it('shows the fee structure grid and saves edits', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Structure')
    // fee-head column headers render
    expect(within(container).getByText('Academic')).toBeInTheDocument()
    expect(within(container).getByText('Transport')).toBeInTheDocument()
    expect(within(container).getByText('Other')).toBeInTheDocument()
    // edit the first amount input and save
    const firstAmount = within(container).getByText('Fee structure').closest('.sm-card, div')!.parentElement!.querySelectorAll('input[type="number"]')[0] as HTMLInputElement
    fireEvent.change(firstAmount, { target: { value: '50000' } })
    fireEvent.click(within(container).getByText('Save structure'))
    expect(within(container).getByText(/Fee structure saved/i)).toBeInTheDocument()
  })
```

> The selector grabs the first `number` input in the Structure tab. If it's brittle, target by row instead: `within(container).getAllByRole('spinbutton')[0]` (number inputs expose the `spinbutton` role). Prefer `getAllByRole('spinbutton')[0]` if available.

- [ ] **Step 2: Run the test**

Run: `npm run test -- financeFees`
Expected: PASS (2 tests).

> If the input selector misses, replace it with `within(container).getAllByRole('spinbutton')[0]`. The toast text "Fee structure saved" must match Task 2's handler.

- [ ] **Step 3: Full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/financeFees.test.tsx
git commit -m "test: fee structure grid renders and saves"
```

---

## Self-Review Notes

- **Spec coverage:** `feeStructure`/`saveFeeStructure` state (Task 1) ✓; Structure tab option + branch (Task 2 Step 2) ✓; per-grade rows × Academic/Transport/Other inputs + Total + grand total + seed from `termFeeFor` + Save gated by `editable` (Task 2 Step 1) ✓; render/save test (Task 3) ✓.
- **Type consistency:** `Record<string, Record<FeeType, number>>` identical across AppProvider and the tab; `StructRow = Record<FeeType, number>`. `saveFeeStructure(next)` defined (Task 1) and called as `app.saveFeeStructure(draft)` (Task 2). `defaultStruct` returns the three `FeeType` keys.
- **Placeholder scan:** none.
- **Test robustness:** the number-input selector has a documented `getAllByRole('spinbutton')` fallback.
