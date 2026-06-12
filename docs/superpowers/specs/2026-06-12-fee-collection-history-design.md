# Fee collection — fee types + saved history

**Date:** 2026-06-12
**Screen:** Fees collection — `src/screens/school/finance.tsx` (`FeesScreen`)
**Status:** Approved design

## Summary

Add a fee type (Academic / Transport (Bus) / Other) to the Record-payment
flow and persist every collected payment to an in-session fee history,
shown on a new History tab. Frontend-only.

## 1. Types & state

`src/types/index.ts`:

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
  date: string   // display date, e.g. "12 Jun 2026"
}
```

`src/context/AppProvider.tsx` (mirror the other in-session collections):

```ts
const [feePayments, setFeePayments] = useState<FeePayment[]>([])
const addFeePayment = (p: FeePayment) => setFeePayments((list) => [p, ...list])
```

Expose `feePayments: FeePayment[]` and `addFeePayment: (p: FeePayment) => void`
on `AppState` and the provided `value`.

## 2. Record-payment modal (`PaymentModal`)

- Add `const app = useApp()`.
- Add a **Fee type** `Select` with options
  `[{ value: 'academic', label: 'Academic' }, { value: 'transport', label: 'Transport (Bus)' }, { value: 'other', label: 'Other' }]`,
  state defaulting to `'academic'`.
- In `submit` (after the existing amount validation), build and persist:

```ts
const payment: FeePayment = {
  id: Date.now(),
  studentId: row.stu.id,
  studentName: row.stu.name,
  cls: row.stu.cls,
  feeType,
  amount: n,
  mode,
  ref: ref.trim(),
  date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
}
app.addFeePayment(payment)
toast.success('Payment recorded', `${fmtMoney(n, cur)} · ${feeLabelType(feeType)} · ${mode} · ${row.stu.name} (${row.stu.cls})`)
onClose()
```

where `feeLabelType` maps the union to a label (module-level helper).

## 3. Fees screen → Collection / History tabs (`FeesScreen`)

- Add `Tabs` import (from `@/components/ui`) and a
  `const [tab, setTab] = useState('collection')` with options
  `Collection` / `History`, rendered under the `PageHead`.
- **Collection** branch: the existing live-cue card, KPIs, by-class
  chart, search/table, and the payment/waiver modals — unchanged (the
  modals stay mounted so recording works from this tab).
- **History** branch: a new `FeeHistoryTab` component:
  - Reads `app.feePayments`.
  - Search box (matches student name / class / ref) + a fee-type
    `Select` filter (`all` / `academic` / `transport` / `other`).
  - `DataTable<FeePayment>` columns: **Date**, **Student** (name + class),
    **Fee type** (Badge — academic `brand`, transport `info`, other
    `neutral`), **Amount** (`fmtMoney`), **Mode**, **Reference** (muted,
    `—` when blank).
  - `Empty` ("No payments recorded yet", icon `wallet`) when the list is
    empty.

The fee-type Badge tone + label use a shared
`feeTypeMeta: Record<FeeType, { label: string; tone: BadgeTone }>` map at
module scope (reused by the modal toast label and the history column).

## 4. Testing (`src/screens/school/financeFees.test.tsx`, new)

Render `FeesScreen` inside `AppProvider` + `ToastProvider`:

- The Record-payment modal (opened from a row's **Record** button) shows
  a **Fee type** select.
- Recording a payment with a chosen fee type then switching to the
  **History** tab shows a row with that fee type label, the amount, and
  the payment mode.
- Default admin role has the `fees` `E` cap, so **Record** is visible.

> The Fees collection table is mounted with the default role `admin`
> (has `fees: ['E']`), so the **Record** action renders. Scope queries to
> the open modal / the history table to avoid collisions with the
> collection table.

## Out of scope (YAGNI)

- Receipts / PDF, per-fee-type billing schedules or invoices.
- Editing/deleting history rows; reconciling history into the KPIs.
- Any backend or cross-session persistence.
