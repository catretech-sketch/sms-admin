# Custom fee heads in the fee structure

**Date:** 2026-06-12
**Screen:** Fees collection → Structure — `src/screens/school/finance.tsx`
**Status:** Approved design

## Summary

Make the fee structure's fee heads configurable: the school manages the
list of fee head names (Academic, Transport, Lab, Library, anything) and
sets each head's amount per grade. Replaces the current fixed three
columns. Frontend-only.

## 1. State (`AppProvider`)

Replace the fixed-typed structure with string-keyed, head-driven state:

```ts
const [feeHeads, setFeeHeads] = useState<string[]>(['Academic', 'Transport', 'Other'])
const [feeStructure, setFeeStructureState] = useState<Record<string, Record<string, number>>>({})
const saveFeeStructure = (heads: string[], structure: Record<string, Record<string, number>>) => {
  setFeeHeads(heads)
  setFeeStructureState(structure)
}
```

`AppState` exposes:

```ts
feeHeads: string[]
feeStructure: Record<string, Record<string, number>>
saveFeeStructure: (heads: string[], structure: Record<string, Record<string, number>>) => void
```

(The `FeeType` import in AppProvider is no longer needed for the
structure — remove it if it becomes unused.)

## 2. Structure tab (`FeeStructureTab`, rewrite)

Local state seeded once from app state:
- `heads: string[]` = `app.feeHeads.length ? app.feeHeads : DEFAULT_HEADS`
  where `DEFAULT_HEADS = ['Academic', 'Transport', 'Other']`.
- `draft: Record<string /*grade*/, Record<string /*head*/, number>>` —
  for each grade `g` in `grades.slice(4)` and each head `h`:
  `app.feeStructure[g]?.[h]` if present, else `seedAmount(g, h)` where
  `seedAmount` returns `termFeeFor(g)` for "Academic", `18000` for
  "Transport", else `0`.

UI:
- A table: first column **Grade**, then **one column per head**, then a
  read-only **Total** (sum of that grade's heads).
- Each head column header shows the head name; when `editable`, a small
  **×** button removes that head (drops the column + its amounts from
  every grade in `draft`).
- An **Add fee head** control above/in the toolbar: a text `Input` +
  **Add** `Btn`. On add: trim the name; reject blank or case-insensitive
  duplicate (toast `danger`); otherwise append the head to `heads` and
  set its amount to `0` for every grade in `draft`; clear the input.
- Each amount cell is a number `Input` (disabled when `!editable`),
  clamped `>= 0`.
- **Save structure** (shown when `editable`): `app.saveFeeStructure(heads,
  draft)` + success toast (`"Fee structure saved"`, `"<N> grades · <M>
  fee heads."`). "View only" `Badge` when not editable.
- Footer: grand total across all grades (`fmtMoney`).
- Guard: if `heads` is empty (all removed), show an `Empty`/hint row
  ("Add a fee head to start") and disable Save.

## 3. Collection fee-type select — unchanged

The Record-payment modal keeps the fixed `FeeType` (academic / transport
/ other) select. Making that dynamic is out of scope; the configurable
heads live only in the structure.

## 4. Testing (`src/screens/school/financeFees.test.tsx`)

Update/extend the structure test:
- Default heads (Academic / Transport / Other) render as column headers.
- Typing a new head name ("Lab fee") into the Add-fee-head input and
  clicking **Add** makes a "Lab fee" column header appear.
- Editing an amount and clicking **Save structure** shows the success
  toast.

## Out of scope (YAGNI)

- Wiring the structure into the Collection term-fee math.
- Per-section (class) granularity, reordering heads, per-head metadata
  (frequency, optional/mandatory), or backend persistence.
- Making the Collection fee-type select read the custom heads.
