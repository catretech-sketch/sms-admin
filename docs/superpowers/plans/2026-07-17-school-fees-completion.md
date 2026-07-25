# School-Level Fee Management — Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Finish school-level fee management so Admin can run Structure → invoices → collect (offline Cash/UPI+QR/Cheque + Razorpay online) with search by admission no., clear History, and CSV export — all tenant-scoped.

**Architecture:** Build on approved spec `docs/superpowers/specs/2026-07-17-offline-fee-management-design.md` and plan `docs/superpowers/plans/2026-07-17-fee-management.md` (mostly shipped). This plan closes UX gaps only; backend contracts stay the same.

**Tech Stack:** React 19, TypeScript, Vitest, existing fee APIs / hooks / `finance.tsx`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-offline-fee-management-design.md`
- School Razorpay keys from `/school/integrations` only — never platform SaaS keys
- Offline modes: Cash, UPI (manual)+QR, Cheque, Card/POS, Bank transfer, DD, Waiver
- Online: Razorpay Collect online + pay link when configured
- Wire snake_case; no new payment gateways

## Already shipped (do not rebuild)

- Fee heads CRUD API + Structure grade×head matrix + Generate invoices  
- Collection KPIs from `/fees/reports/summary`  
- Offline Record payment (incl. Cheque fields) + Waiver  
- Razorpay Collect online / Send pay link + Settings Integrations  
- Reminders (App/Email/SMS + optional pay link)  
- Owner fee summary hooks  

## Gaps this plan closes

| # | Gap | User value |
|---|-----|------------|
| A | Search / show **admission number** | Find student by adm ID |
| B | **UPI QR** when recording offline UPI | Desk collects via scan |
| C | History filter by **fee head** (not legacy FeeType) | Matches Structure heads |
| D | **Export** Collection CSV | Office download |
| E | Generate invoices **due date** | Clear due window |
| F | Empty Structure → **suggest starter heads** | Faster school setup |

## File map

| File | Change |
|------|--------|
| `src/types/index.ts` | Optional `studentAdm` on `FeeInvoice` |
| `src/lib/upiQr.ts` (+ test) | Build `upi://pay` URI + QR image URL |
| `src/lib/feeExport.ts` (+ test) | CSV export for invoices |
| `src/screens/school/finance.tsx` | A–F UI wiring |
| `src/screens/school/financeFees.test.tsx` | Cover search adm, export, UPI QR visible |

---

### Task 1: Admission number on Collection

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/screens/school/finance.tsx`
- Test: `src/screens/school/financeFees.test.tsx`

**Interfaces:**
- Produces: `FeeInvoice.studentAdm?: string`
- Consumes: `useStudents()` to fill adm when API omits it

- [ ] **Step 1: Add optional field**

```ts
// FeeInvoice
studentAdm?: string
```

- [ ] **Step 2: Enrich + search in FeesScreen**

```ts
const studentsQ = useStudents()
const admOf = (inv: FeeInvoice) =>
  inv.studentAdm?.trim()
  || (studentsQ.data ?? []).find((s) => s.id === inv.studentId)?.adm
  || ''

// filter needle also matches admOf(inv)
// Student cell: show `{cls} · {adm}` when adm present
// Search placeholder: "Search name, class, admission no.…"
```

- [ ] **Step 3: Test search by adm**

Assert invoice with adm `sccrdtb/STU/26/0001` appears when `q` is `STU/26`.

- [ ] **Step 4: Typecheck / fee tests pass**

---

### Task 2: Offline UPI + QR

**Files:**
- Create: `src/lib/upiQr.ts`, `src/lib/upiQr.test.ts`
- Modify: `src/screens/school/finance.tsx` (`PaymentModal`)

**Interfaces:**
- Produces: `buildUpiPayUri({ pa, am, pn, tn })`, `upiQrImageUrl(uri)`

- [ ] **Step 1: Failing tests for URI**

```ts
expect(buildUpiPayUri({ pa: 'school@upi', am: 500, pn: 'SCC', tn: 'Fee' }))
  .toContain('upi://pay?pa=school%40upi')
```

- [ ] **Step 2: Implement helpers** (encodeURIComponent; QR via `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=`)

- [ ] **Step 3: PaymentModal** when mode is `UPI (manual)`: VPA input (default empty), amount already set → show QR image + copy UPI string; store VPA in `ref` if ref empty.

---

### Task 3: History fee-head filter + adm search

**Files:**
- Modify: `src/screens/school/finance.tsx` (`FeeHistoryTab`)

- [ ] Replace legacy `FeeType` select with heads from `useFeeHeads` (All heads + each head name).
- [ ] Column shows `p.headName || p.feeType || '—'`.
- [ ] Search also matches `headName` / ref; keep mode filter (Cash…Razorpay).

---

### Task 4: Export Collection CSV

**Files:**
- Create: `src/lib/feeExport.ts`, `src/lib/feeExport.test.ts`
- Modify: `src/screens/school/finance.tsx`

- [ ] `invoicesToCsv(rows)` → CSV with Student, Adm, Class, Term, Total, Paid, Due, Status
- [ ] Export button downloads `fees-collection-{date}.csv` for **filtered** rows (current search/status).

---

### Task 5: Structure polish — due date + starter heads

**Files:**
- Modify: `src/screens/school/finance.tsx` (`FeeStructureTab`)

- [ ] Add optional **Due date** input on Generate; pass `dueDate` to `generateFeeInvoices`.
- [ ] When `heads.length === 0` and editable: button **Add starter heads** that creates Academic, Transport, Exam, Admission, Lab (skip names that already exist); toast progress.

---

### Task 6: Verify

- [ ] `npx vitest run src/lib/upiQr.test.ts src/lib/feeExport.test.ts src/screens/school/financeFees.test.tsx`
- [ ] Manual: Structure save → generate → Collection search by adm → Record UPI (QR) / Cheque → Razorpay if configured → Export CSV → History filter by head

## Out of scope (later)

- Class/section fee matrix (still grade×head per v1 spec)
- PDF receipts
- Stripe / other gateways
- Automatic bank reconciliation beyond Razorpay webhooks
