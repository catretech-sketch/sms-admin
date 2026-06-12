# Fee Collection History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fee type (Academic / Transport (Bus) / Other) to the Record-payment flow and persist every collected payment to an in-session fee history shown on a new History tab.

**Architecture:** A `FeePayment` type + `feePayments`/`addFeePayment` in `AppProvider`. The `PaymentModal` gains a fee-type select and writes a payment; `FeesScreen` gets a Collection/History `Tabs` toggle with a new `FeeHistoryTab`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library.

---

## File Structure

- **Modify** `src/types/index.ts` — `FeeType`, `FeePayment`.
- **Modify** `src/context/AppProvider.tsx` — `feePayments` + `addFeePayment`.
- **Modify** `src/screens/school/finance.tsx` — fee-type select + persist; Collection/History tabs + `FeeHistoryTab`.
- **Create** `src/screens/school/financeFees.test.tsx` — record → history render test.

---

### Task 1: Types + AppProvider state

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/context/AppProvider.tsx`

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, add after the `FeeStatus` type (near the other fee types):

```ts
export type FeeType = 'academic' | 'transport' | 'other'
export interface FeePayment {
  id: number
  studentId: string
  studentName: string
  cls: string
  feeType: FeeType
  amount: number
  mode: string
  ref: string
  date: string
}
```

- [ ] **Step 2: Import the type in AppProvider**

In `src/context/AppProvider.tsx`, add `FeePayment` to the type import:

```ts
import type { ConsoleKind, Exam, FeePayment, PaperSlot, Role, School, Staff, Student, Teacher, Tier } from '@/types'
```

- [ ] **Step 3: Add to the `AppState` interface**

After the datesheet lines:

```ts
  datesheets: Record<string, PaperSlot[]>
  saveDatesheet: (examId: string, slots: PaperSlot[]) => void
```

add:

```ts
  /* fee payment history (in-session) */
  feePayments: FeePayment[]
  addFeePayment: (p: FeePayment) => void
```

- [ ] **Step 4: Add the state + action**

After the `datesheets` state/action:

```ts
  const [datesheets, setDatesheets] = useState<Record<string, PaperSlot[]>>({})
  const saveDatesheet = (examId: string, slots: PaperSlot[]) =>
    setDatesheets((m) => ({ ...m, [examId]: slots }))
```

add:

```ts
  const [feePayments, setFeePayments] = useState<FeePayment[]>([])
  const addFeePayment = (p: FeePayment) => setFeePayments((list) => [p, ...list])
```

- [ ] **Step 5: Expose on the value**

Change:

```ts
    datesheets, saveDatesheet,
```

to:

```ts
    datesheets, saveDatesheet,
    feePayments, addFeePayment,
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test -- AppProvider`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/context/AppProvider.tsx
git commit -m "feat: FeePayment type + feePayments/addFeePayment in AppProvider"
```

---

### Task 2: Fee-type select + persist + history tab

**Files:**
- Modify: `src/screens/school/finance.tsx`

- [ ] **Step 1: Imports + shared fee-type meta**

In `finance.tsx`, add `Tabs` to the `@/components/ui` import and `FeeType, FeePayment` to the types import:

```tsx
  PageHead, Card, CardHead, Kpi, Btn, Badge, Avatar, Search, Select, Field, Input,
  Modal, Tabs, Icon, Empty, Bars, DataTable, type Column, type BadgeTone,
```

```tsx
import type { Student, Teacher, Staff, FeeStatus, FeeType, FeePayment } from '@/types'
```

Add a shared meta map after the existing `PAY_MODES` constant:

```tsx
const feeTypeMeta: Record<FeeType, { label: string; tone: BadgeTone }> = {
  academic: { label: 'Academic', tone: 'brand' },
  transport: { label: 'Transport (Bus)', tone: 'info' },
  other: { label: 'Other', tone: 'neutral' },
}
const FEE_TYPE_OPTS = (Object.keys(feeTypeMeta) as FeeType[]).map((v) => ({ value: v, label: feeTypeMeta[v].label }))
```

- [ ] **Step 2: Add the fee-type select + persist in `PaymentModal`**

Change the top of `PaymentModal`:

```tsx
function PaymentModal({ row, cur, onClose }: { row: FeeRow; cur: string; onClose: () => void }) {
  const toast = useToast()
  const [amount, setAmount] = useState(String(row.due || row.term))
  const [mode, setMode] = useState(PAY_MODES[1])
  const [ref, setRef] = useState('')

  const submit = () => {
    const n = Number(amount)
    if (!n || n <= 0) { toast.danger('Amount required', 'Enter a valid payment amount.'); return }
    toast.success('Payment recorded', `${fmtMoney(n, cur)} · ${mode} · ${row.stu.name} (${row.stu.cls})`)
    onClose()
  }
```

to:

```tsx
function PaymentModal({ row, cur, onClose }: { row: FeeRow; cur: string; onClose: () => void }) {
  const toast = useToast()
  const app = useApp()
  const [amount, setAmount] = useState(String(row.due || row.term))
  const [mode, setMode] = useState(PAY_MODES[1])
  const [ref, setRef] = useState('')
  const [feeType, setFeeType] = useState<FeeType>('academic')

  const submit = () => {
    const n = Number(amount)
    if (!n || n <= 0) { toast.danger('Amount required', 'Enter a valid payment amount.'); return }
    const payment: FeePayment = {
      id: Date.now(), studentId: row.stu.id, studentName: row.stu.name, cls: row.stu.cls,
      feeType, amount: n, mode, ref: ref.trim(),
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    }
    app.addFeePayment(payment)
    toast.success('Payment recorded', `${fmtMoney(n, cur)} · ${feeTypeMeta[feeType].label} · ${mode} · ${row.stu.name} (${row.stu.cls})`)
    onClose()
  }
```

Add the Fee type field as the first field in the modal body — change:

```tsx
      <div className="col gap16">
        <Field label="Amount" required hint={`Term fee ${fmtMoney(row.term, cur)} · paid so far ${fmtMoney(row.paid, cur)}.`}>
```

to:

```tsx
      <div className="col gap16">
        <Field label="Fee type" required>
          <Select options={FEE_TYPE_OPTS} value={feeType} onChange={(e) => setFeeType(e.target.value as FeeType)} />
        </Field>
        <Field label="Amount" required hint={`Term fee ${fmtMoney(row.term, cur)} · paid so far ${fmtMoney(row.paid, cur)}.`}>
```

- [ ] **Step 3: Add the `FeeHistoryTab` component**

Insert before `function FeesScreen() {`:

```tsx
/* ---------- Fee history (saved payments) ---------- */
function FeeHistoryTab({ cur }: { cur: string }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return app.feePayments.filter((p) => {
      if (needle && !(p.studentName.toLowerCase().includes(needle) || p.cls.toLowerCase().includes(needle) || p.ref.toLowerCase().includes(needle))) return false
      if (type !== 'all' && p.feeType !== type) return false
      return true
    })
  }, [app.feePayments, q, type])

  const columns: Column<FeePayment>[] = [
    { key: 'date', label: 'Date', sortValue: (p) => p.id, render: (p) => <span className="muted">{p.date}</span> },
    {
      key: 'student', label: 'Student', sortValue: (p) => p.studentName,
      render: (p) => <div><div className="fw6">{p.studentName}</div><div className="t-xs muted">{p.cls}</div></div>,
    },
    { key: 'feeType', label: 'Fee type', sortValue: (p) => p.feeType, render: (p) => <Badge tone={feeTypeMeta[p.feeType].tone}>{feeTypeMeta[p.feeType].label}</Badge> },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (p) => p.amount, render: (p) => <span className="fw6">{fmtMoney(p.amount, cur)}</span> },
    { key: 'mode', label: 'Mode', sortValue: (p) => p.mode, render: (p) => <Badge tone="neutral">{p.mode}</Badge> },
    { key: 'ref', label: 'Reference', sortValue: (p) => p.ref, render: (p) => p.ref ? <span className="t-sm muted">{p.ref}</span> : <span className="muted">—</span> },
  ]

  return (
    <Card pad={false}>
      <div className="row ai-center gap12 wrap" style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
        <Search value={q} onChange={setQ} placeholder="Search student, class, reference…" style={{ flex: 1, minWidth: 220 }} />
        <Select options={[{ value: 'all', label: 'All fee types' }, ...FEE_TYPE_OPTS]} value={type} onChange={(e) => setType(e.target.value)} />
      </div>
      <DataTable<FeePayment>
        columns={columns}
        rows={rows}
        pageSize={12}
        rowKey={(p) => p.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty={<Empty icon="wallet" title="No payments recorded yet" body="Recorded fee payments will appear here with their type and mode." />}
      />
    </Card>
  )
}
```

- [ ] **Step 4: Add the Collection/History tabs to `FeesScreen`**

In `FeesScreen`, add tab state after the existing `useState` hooks (e.g. after `const [waiveRow, setWaiveRow] = useState<FeeRow | null>(null)`):

```tsx
  const [tab, setTab] = useState('collection')
```

In the returned JSX, insert the tabs right after the `<PageHead ... />` closing and wrap the existing collection content. Change:

```tsx
      />

      {/* Live "payment received" cue */}
```

to:

```tsx
      />

      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'collection', label: 'Collection', icon: 'wallet' }, { value: 'history', label: 'History', icon: 'clock' }]} />
      </div>

      {tab === 'history' && <FeeHistoryTab cur={cur} />}

      {tab === 'collection' && (<>
      {/* Live "payment received" cue */}
```

Then close the collection branch. Change the end of `FeesScreen`'s JSX:

```tsx
      {payRow && <PaymentModal key={payRow.stu.id} row={payRow} cur={cur} onClose={() => setPayRow(null)} />}
      {waiveRow && <WaiverModal key={waiveRow.stu.id} row={waiveRow} cur={cur} onClose={() => setWaiveRow(null)} />}
    </div>
  )
}
```

to:

```tsx
      </>)}

      {payRow && <PaymentModal key={payRow.stu.id} row={payRow} cur={cur} onClose={() => setPayRow(null)} />}
      {waiveRow && <WaiverModal key={waiveRow.stu.id} row={waiveRow} cur={cur} onClose={() => setWaiveRow(null)} />}
    </div>
  )
}
```

> The two modals stay outside the `collection` fragment so recording works regardless of tab; the `<>` opened after the Tabs wraps the live cue + KPIs + chart + table.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/finance.tsx
git commit -m "feat: fee-type select + saved fee history tab on Fees collection"
```

---

### Task 3: Record → history render test

**Files:**
- Create: `src/screens/school/financeFees.test.tsx`

- [ ] **Step 1: Write the test**

Create `src/screens/school/financeFees.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { financeScreens } from './finance'

const FeesScreen = financeScreens['school.fees']

afterEach(cleanup)

function renderScreen() {
  const u = render(
    <AppProvider>
      <ToastProvider>
        <FeesScreen />
      </ToastProvider>
    </AppProvider>,
  )
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  return { ...u, clickTab }
}

describe('Fee collection history', () => {
  it('records a payment with a fee type and lists it in History', () => {
    const { container, clickTab } = renderScreen()
    // open the first row's Record button
    fireEvent.click(within(container).getAllByText('Record')[0])
    const dialog = within(container).getByRole('dialog')
    // fee type select is present; choose Transport
    const typeSelect = within(dialog).getByRole('combobox') // first select in the modal is Fee type
    fireEvent.change(typeSelect, { target: { value: 'transport' } })
    fireEvent.click(within(dialog).getByText('Record payment'))
    // switch to History and assert the row shows the fee type
    clickTab('History')
    expect(within(container).getAllByText('Transport (Bus)').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm run test -- financeFees`
Expected: PASS.

> The first `combobox` inside the modal is the Fee type select (added as the first field in Task 2 Step 2). If selection doesn't take, confirm the field order. `Record` buttons exist because the default role `admin` has the `fees` `E` cap.

- [ ] **Step 3: Full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/financeFees.test.tsx
git commit -m "test: fee payment records into the History tab with its type"
```

---

## Self-Review Notes

- **Spec coverage:** `FeeType`/`FeePayment` (Task 1) ✓; `feePayments`/`addFeePayment` state (Task 1) ✓; fee-type select + persist in `PaymentModal` (Task 2 Steps 1–2) ✓; Collection/History tabs + `FeeHistoryTab` with search/filter/empty (Task 2 Steps 3–4) ✓; shared `feeTypeMeta` for toast + history badge (Task 2 Step 1) ✓; render test (Task 3) ✓.
- **Type consistency:** `FeeType` union values (`academic|transport|other`) identical across the type, `feeTypeMeta`, `FEE_TYPE_OPTS`, and the modal/history. `addFeePayment(p: FeePayment)` defined in Task 1 and called as `app.addFeePayment(payment)` in Task 2. `FeePayment` field names match between the modal builder and the history columns.
- **Placeholder scan:** none.
- **Note:** `Date.now()` / `new Date()` run in normal app/runtime code here (not a workflow script), so they're fine.
