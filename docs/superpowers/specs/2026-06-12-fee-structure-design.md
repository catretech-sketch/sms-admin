# Fee structure (class-wise)

**Date:** 2026-06-12
**Screen:** Fees collection — `src/screens/school/finance.tsx` (`FeesScreen`)
**Status:** Approved design

## Summary

Add a **Structure** tab to the Fees screen where admin defines, per grade,
the amount for each fee head (Academic / Transport / Other) and saves it
to an in-session fee structure. Frontend-only; reuses the `FeeType`
union added for fee collection.

## 1. State (`AppProvider`)

```ts
const [feeStructure, setFeeStructureState] = useState<Record<string, Record<FeeType, number>>>({})
const saveFeeStructure = (next: Record<string, Record<FeeType, number>>) => setFeeStructureState(next)
```

Expose `feeStructure: Record<string, Record<FeeType, number>>` and
`saveFeeStructure: (next: Record<string, Record<FeeType, number>>) => void`
on `AppState` and the provided `value`. (`FeeType` already imported.)

## 2. Fees screen tabs

Extend the existing `Tabs` to three options:
`Collection` (`wallet`) · `History` (`clock`) · `Structure` (`rupee`).
Render `{tab === 'structure' && <FeeStructureTab cur={cur} editable={canRecord} />}`
(`canRecord = can(app.role, 'fees', 'E')`, already computed in `FeesScreen`).

## 3. `FeeStructureTab` (new in `finance.tsx`)

- **Rows**: `grades.slice(4)` (the grades students belong to — same set
  the by-class chart uses).
- **Columns**: Academic, Transport, Other — editable number `Input`s —
  plus a read-only **Total** (sum of the three).
- **Initial values** (local state seeded once): for each grade `g`,
  `app.feeStructure[g]` if present, else
  `{ academic: termFeeFor(g), transport: 18000, other: 0 }`.
- **Edit**: number inputs update local state; clamp to `>= 0`
  (`Math.max(0, Math.round(Number(v) || 0))`). Disabled when `!editable`.
- **Save**: a **Save structure** button (shown when `editable`) calls
  `app.saveFeeStructure(local)` and toasts
  ("Fee structure saved", "<N> grades updated."). A footer line shows the
  grand total across all grades (`fmtMoney`). When not `editable`, show a
  "View only" `Badge` instead of Save.
- Built as a `Card pad={false}` with an `sm-table` (rows/inputs), matching
  the Periods tab's editable-table pattern.

## 4. Testing (`src/screens/school/financeFees.test.tsx`, add a case)

- Switch to the **Structure** tab; assert grade rows render (e.g. a known
  grade label) and the three fee-head column headers (Academic /
  Transport / Other) are present.
- Edit one amount input and click **Save structure**; assert a success
  toast ("Fee structure saved") appears.

## Out of scope (YAGNI)

- Wiring the structure into the Collection term-fee math (`termFeeFor`
  stays as-is); billing/invoice generation.
- Per-section (class) granularity — grade-level only.
- Effective-dated structures, versioning, or backend persistence.
