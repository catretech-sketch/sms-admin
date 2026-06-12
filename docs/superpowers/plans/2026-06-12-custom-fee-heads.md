# Custom Fee Heads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fee structure's fee heads configurable — manage a head list (Academic, Transport, Lab, …) and set each head's amount per grade.

**Architecture:** `feeHeads: string[]` + string-keyed `feeStructure` in `AppProvider` with `saveFeeStructure(heads, structure)`. `FeeStructureTab` becomes a dynamic-column grid with add/remove head controls.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library.

---

## File Structure

- **Modify** `src/context/AppProvider.tsx` — `feeHeads` + string-keyed `feeStructure` + new `saveFeeStructure` signature.
- **Modify** `src/screens/school/finance.tsx` — rewrite `FeeStructureTab` for dynamic heads.
- **Modify** `src/screens/school/financeFees.test.tsx` — add-head test.

---

### Task 1: AppProvider state — feeHeads + string-keyed structure

**Files:**
- Modify: `src/context/AppProvider.tsx`

- [ ] **Step 1: Update the `AppState` interface**

Replace:

```ts
  /* per-grade fee structure (in-session) */
  feeStructure: Record<string, Record<FeeType, number>>
  saveFeeStructure: (next: Record<string, Record<FeeType, number>>) => void
```

with:

```ts
  /* configurable fee heads + per-grade fee structure (in-session) */
  feeHeads: string[]
  feeStructure: Record<string, Record<string, number>>
  saveFeeStructure: (heads: string[], structure: Record<string, Record<string, number>>) => void
```

- [ ] **Step 2: Update the state + action**

Replace:

```ts
  const [feeStructure, setFeeStructureState] = useState<Record<string, Record<FeeType, number>>>({})
  const saveFeeStructure = (next: Record<string, Record<FeeType, number>>) => setFeeStructureState(next)
```

with:

```ts
  const [feeHeads, setFeeHeads] = useState<string[]>(['Academic', 'Transport', 'Other'])
  const [feeStructure, setFeeStructureState] = useState<Record<string, Record<string, number>>>({})
  const saveFeeStructure = (heads: string[], structure: Record<string, Record<string, number>>) => {
    setFeeHeads(heads)
    setFeeStructureState(structure)
  }
```

- [ ] **Step 3: Expose on the value**

Change:

```ts
    feeStructure, saveFeeStructure,
```

to:

```ts
    feeHeads, feeStructure, saveFeeStructure,
```

- [ ] **Step 4: Drop the now-unused `FeeType` import**

The structure is now string-keyed, so `FeeType` is no longer used in this file. Change the type import from:

```ts
import type { ConsoleKind, Exam, FeePayment, FeeType, PaperSlot, Role, School, Staff, Student, Teacher, Tier } from '@/types'
```

to:

```ts
import type { ConsoleKind, Exam, FeePayment, PaperSlot, Role, School, Staff, Student, Teacher, Tier } from '@/types'
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: `finance.tsx` will error (it still calls `saveFeeStructure(draft)` and uses the old types) — that's fixed in Task 2. To verify Task 1 alone, check only `AppProvider`/types compile conceptually; proceed to Task 2 before re-running typecheck.

> Because `finance.tsx` depends on the old signature, run the full typecheck after Task 2. Commit Task 1 now; the tree is briefly red between Task 1 and Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/context/AppProvider.tsx
git commit -m "feat: configurable feeHeads + string-keyed feeStructure in AppProvider"
```

---

### Task 2: Rewrite `FeeStructureTab` for dynamic heads

**Files:**
- Modify: `src/screens/school/finance.tsx`

- [ ] **Step 1: Replace the structure helpers + component**

Replace the existing structure helpers + `FeeStructureTab` (from `const STRUCTURE_GRADES = grades.slice(4)` through the end of the `FeeStructureTab` function) with:

```tsx
/* ---------- Fee structure (configurable heads × per-grade amounts) ---------- */
const STRUCTURE_GRADES = grades.slice(4)
const DEFAULT_HEADS = ['Academic', 'Transport', 'Other']
const seedAmount = (g: string, head: string): number =>
  head === 'Academic' ? termFeeFor(g) : head === 'Transport' ? 18000 : 0

function FeeStructureTab({ cur, editable }: { cur: string; editable: boolean }) {
  const app = useApp()
  const toast = useToast()
  const [heads, setHeads] = useState<string[]>(() => (app.feeHeads.length ? app.feeHeads : DEFAULT_HEADS))
  const [draft, setDraft] = useState<Record<string, Record<string, number>>>(() => {
    const hs = app.feeHeads.length ? app.feeHeads : DEFAULT_HEADS
    const out: Record<string, Record<string, number>> = {}
    STRUCTURE_GRADES.forEach((g) => {
      out[g] = {}
      hs.forEach((h) => { out[g][h] = app.feeStructure[g]?.[h] ?? seedAmount(g, h) })
    })
    return out
  })
  const [newHead, setNewHead] = useState('')

  const setCell = (g: string, head: string, raw: string) => {
    const n = Math.max(0, Math.round(Number(raw) || 0))
    setDraft((d) => ({ ...d, [g]: { ...d[g], [head]: n } }))
  }
  const addHead = () => {
    const name = newHead.trim()
    if (!name) { toast.danger('Name required', 'Enter a fee head name.'); return }
    if (heads.some((h) => h.toLowerCase() === name.toLowerCase())) { toast.danger('Already exists', `${name} is already a fee head.`); return }
    setHeads((hs) => [...hs, name])
    setDraft((d) => {
      const out: Record<string, Record<string, number>> = {}
      STRUCTURE_GRADES.forEach((g) => { out[g] = { ...d[g], [name]: 0 } })
      return out
    })
    setNewHead('')
  }
  const removeHead = (head: string) => {
    setHeads((hs) => hs.filter((h) => h !== head))
    setDraft((d) => {
      const out: Record<string, Record<string, number>> = {}
      STRUCTURE_GRADES.forEach((g) => { const { [head]: _omit, ...rest } = d[g]; out[g] = rest })
      return out
    })
  }
  const rowTotal = (g: string) => heads.reduce((a, h) => a + (draft[g][h] ?? 0), 0)
  const grandTotal = STRUCTURE_GRADES.reduce((a, g) => a + rowTotal(g), 0)

  const save = () => {
    app.saveFeeStructure(heads, draft)
    toast.success('Fee structure saved', `${STRUCTURE_GRADES.length} grades · ${heads.length} fee heads.`)
  }

  return (
    <Card pad={false}>
      <div className="row ai-center jc-between gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <div><div className="fw6">Fee structure</div><div className="t-sm muted">Per-grade amounts by fee head · {cur}</div></div>
        <div className="row ai-center gap8 wrap">
          {editable && (
            <div className="row ai-center gap6">
              <Input value={newHead} placeholder="New fee head (e.g. Lab fee)" onChange={(e) => setNewHead(e.target.value)} style={{ width: 200 }} />
              <Btn variant="secondary" size="sm" icon="plus" onClick={addHead}>Add fee head</Btn>
            </div>
          )}
          {editable
            ? <Btn variant="primary" icon="check" disabled={heads.length === 0} onClick={save}>Save structure</Btn>
            : <Badge tone="neutral" icon="eye">View only</Badge>}
        </div>
      </div>
      {heads.length === 0 ? (
        <Empty icon="wallet" title="No fee heads" body="Add a fee head (e.g. Academic, Transport, Lab) to define the structure." />
      ) : (
        <>
          <table className="sm-table">
            <thead>
              <tr>
                <th>Grade</th>
                {heads.map((h) => (
                  <th key={h} className="ta-right">
                    <span className="row ai-center jc-end gap6">
                      {h}
                      {editable && <button onClick={() => removeHead(h)} aria-label={`Remove ${h}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'inline-flex', padding: 0 }}><Icon name="x" size={12} /></button>}
                    </span>
                  </th>
                ))}
                <th className="ta-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {STRUCTURE_GRADES.map((g) => (
                <tr key={g}>
                  <td className="fw6">Grade {g}</td>
                  {heads.map((h) => (
                    <td key={h} className="ta-right" style={{ width: 130 }}>
                      <Input type="number" min={0} value={String(draft[g][h] ?? 0)} disabled={!editable}
                        style={{ width: 110, textAlign: 'right' }}
                        onChange={(e) => setCell(g, h, e.target.value)} />
                    </td>
                  ))}
                  <td className="ta-right fw7">{fmtMoney(rowTotal(g), cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row jc-end" style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
            <span className="t-sm">Grand total (all grades) <span className="fw7">{fmtMoney(grandTotal, cur)}</span></span>
          </div>
        </>
      )}
    </Card>
  )
}
```

> `Icon`, `Input`, `Btn`, `Badge`, `Empty`, `fmtMoney`, `grades`, `termFeeFor` are all already imported/in scope. The old `type StructRow` / `defaultStruct` are removed (replaced by `DEFAULT_HEADS`/`seedAmount`).

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors (Task 1 + Task 2 together resolve the `saveFeeStructure` signature).

- [ ] **Step 3: Commit**

```bash
git add src/screens/school/finance.tsx
git commit -m "feat: configurable fee heads (add/remove) in the fee structure"
```

---

### Task 3: Add-head test

**Files:**
- Modify: `src/screens/school/financeFees.test.tsx`

- [ ] **Step 1: Replace the structure test**

Replace the existing `it('shows the fee structure grid and saves edits', ...)` block with:

```tsx
  it('shows configurable fee heads, adds one, and saves', () => {
    const { container, clickTab } = renderScreen()
    clickTab('Structure')
    // default heads render as column headers
    expect(within(container).getByText('Academic')).toBeInTheDocument()
    expect(within(container).getByText('Transport')).toBeInTheDocument()
    expect(within(container).getByText('Other')).toBeInTheDocument()
    // add a custom head
    fireEvent.change(within(container).getByPlaceholderText(/New fee head/i), { target: { value: 'Lab fee' } })
    fireEvent.click(within(container).getByText('Add fee head'))
    expect(within(container).getByText('Lab fee')).toBeInTheDocument()
    // edit an amount + save
    const firstAmount = within(container).getAllByRole('spinbutton')[0] as HTMLInputElement
    fireEvent.change(firstAmount, { target: { value: '50000' } })
    fireEvent.click(within(container).getByText('Save structure'))
    expect(within(container).getByText(/Fee structure saved/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test**

Run: `npm run test -- financeFees`
Expected: PASS (2 tests).

> "Add fee head" and "Save structure" are distinct buttons. `getByText('Lab fee')` matches the new column header span (its text content is exactly "Lab fee"; the remove × button has only an icon, no text).

- [ ] **Step 3: Full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/financeFees.test.tsx
git commit -m "test: custom fee heads add + save in fee structure"
```

---

## Self-Review Notes

- **Spec coverage:** `feeHeads` + string-keyed `feeStructure` + `saveFeeStructure(heads, structure)` (Task 1) ✓; dynamic columns, add/remove head, seed amounts, save gated, empty state (Task 2) ✓; collection fee-type select untouched (not modified) ✓; add-head test (Task 3) ✓.
- **Type consistency:** `Record<string, Record<string, number>>` identical across AppProvider and the tab; `saveFeeStructure(heads, draft)` matches the new two-arg signature. `DEFAULT_HEADS`/`seedAmount` replace `StructRow`/`defaultStruct`.
- **Transient red tree:** Task 1 alone leaves `finance.tsx` calling the old signature; Task 2 resolves it. Full typecheck is run after Task 2 (noted in Task 1 Step 5).
- **Placeholder scan:** none.
