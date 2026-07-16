# Offline Fee Management (SaaS) Design

**Date:** 2026-07-17  
**Status:** Approved (chat)  
**Screen:** `school.fees` (`src/screens/school/finance.tsx`) + Owner settings + dashboards  
**Scope:** Offline / manual office collection only — no Razorpay / online gateway in this release.

## Summary

Replace dummy fee KPIs and local-only structure with a real, tenant-scoped fee ledger for school SaaS customers:

1. Configurable fee heads + per-grade structure  
2. Student invoices (billed / paid / due / status)  
3. Manual office payments (Cash, UPI, Cheque, Card/POS, Bank transfer, DD, Waiver/adjustment)  
4. Parent notices (App + Email + SMS) using school-branded sender/templates from Owner settings  
5. Reports + live fee figures on Admin / Principal / Owner dashboards  

## Goals

- Schools can define fee heads and class/grade amounts, then collect offline payments with full audit trail.  
- Parents get paid/due notices from the school’s configured email + SMS templates (plus in-app).  
- Owner / Principal / Admin see real collected vs outstanding — no hardcoded dashboard finance.  
- Payment modes cover every common office possibility without online checkout.

## Non-goals (this release)

- Razorpay / Stripe / parent self-pay links  
- PDF receipt generation (toast + history + notification is enough)  
- Multi-currency fee books beyond school `currency`  
- Automatic bank reconciliation  
- Payroll / HR (unchanged; stays separate)

---

## 1. Domain model

### Fee head (fee type)

| Field | Notes |
|-------|--------|
| `id` | Stable id |
| `name` | e.g. Academic, Transport, Lab |
| `code` | Optional short code |
| `active` | Soft-disable without deleting history |
| `isSystem` | Starter heads cannot be hard-deleted if payments exist |

**Default starter heads (per school):** Academic, Transport, Exam, Admission, Hostel, Lab, Library, Uniform, Other.  
Schools may add custom heads; rename/deactivate allowed when no open invoices block it.

### Fee structure

Per grade: use live class grades from the Classes API when available; otherwise the existing `grades` list used by Fees today.

`Record<grade, Record<headId, amount>>`

**v1 stores the amount matrix only** (no installment schedules). Term/due window lives on the invoice (`term` label + optional `dueDate` string on generate).

### Invoice (student fee bill)

| Field | Notes |
|-------|--------|
| `id` | Invoice id (pay endpoint already uses `/fees/invoices/{id}/pay`) |
| `studentId` | |
| `academicYear` | e.g. 2026-27 |
| `term` / label | e.g. Term-2 |
| `lines[]` | `{ headId, headName, amount }` |
| `total` | Sum of lines |
| `paid` | Sum of successful payments |
| `waived` | Sum of waiver adjustments |
| `due` | `total - paid - waived` |
| `status` | `paid` \| `partial` \| `due` |

Generating invoices from structure: Admin action “Generate term invoices” for selected grades (or on first open of fee year). Exact generate UX can be a single button + grade multi-select on Structure tab.

### Payment (offline)

| Field | Notes |
|-------|--------|
| `id` | |
| `invoiceId` | |
| `studentId`, `studentName`, `cls` | Denormalized for history table |
| `headId` | Fee head id; UI shows head name from heads list (`feeType` legacy field accepted only as display fallback) |
| `amount` | |
| `mode` | See modes below |
| `ref` | UPI txn / cheque no / POS slip / transfer ref |
| `date` | Payment date |
| `note` | Optional |
| `collectedBy` | User id / name from session |
| `cheque` | Optional: `{ number, bank, date, status }` when mode = Cheque |

**Payment modes (v1):**

- Cash  
- UPI (manual)  
- Cheque  
- Card / POS  
- Bank transfer  
- DD  
- Adjustment / waiver  

Recording a payment updates invoice `paid`/`due`/`status` and appends to payment history. Waiver mode increases `waived` (Principal `fees` `A` cap); other modes require `fees` `E`.

---

## 2. API surface (frontend contract)

Wire is snake_case; follow existing `feePayments.ts` / `announcements.ts` patterns.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/fees/heads` | List fee heads |
| POST | `/fees/heads` | Create custom head |
| PATCH | `/fees/heads/{id}` | Rename / activate |
| DELETE | `/fees/heads/{id}` | Soft-delete if unused |
| GET | `/fees/structure` | Grade × head amounts |
| PUT | `/fees/structure` | Save structure matrix |
| GET | `/fees/invoices` | List invoices (`q`, `status`, `grade`, `class`) |
| POST | `/fees/invoices/generate` | Generate from structure for grades/term |
| POST | `/fees/invoices/{id}/pay` | Record offline payment (**already bound**) |
| GET | `/fees/payments` | Payment history (**already bound**) |
| GET | `/fees/reports/summary` | School KPIs: collected today/term, outstanding, defaulters, by class, by mode |
| POST | `/fees/reminders` | Send due reminders (audience = defaulters or selected students) |
| GET | `/me/schools/fee-summary` | Owner portfolio rollup (**already bound**) |

Owner notification settings (school-scoped, edited in Owner console):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me/schools/{id}/comms-settings` | Email from-name/from-address, SMS sender/templates |
| PUT | `/me/schools/{id}/comms-settings` | Save |

If backend uses different path names, keep this contract as the UI binding target and adapt resource modules once.

**Existing keep:** `listFeePayments`, `payInvoice`, `useOwnerFeeSummary`.

**Remove / stop using for finance KPIs:** mock `students` fee math, hardcoded dashboard `feesToday` / `outstanding`, in-session-only structure as source of truth (migrate to API; AppProvider may keep cache only until hooks land).

---

## 3. School Fees UI (`FeesScreen`)

Tabs (keep three; enrich):

### Collection
- KPIs from `/fees/reports/summary` (collected today, term collected, outstanding, defaulters).  
- Collection-by-class bars from same summary.  
- Table of invoices (not mock student feeStatus): search, status filter, Record / Waiver actions by gate.  
- Remove fake “Live payment received” cue unless summary exposes a latest payment; if present, show real latest payment.  
- **Send reminders** → modal: channels App / Email / SMS, audience defaulters or selected rows → `POST /fees/reminders` (reuse announcement-style channel payload + `collectAudienceContacts` for selected students).  
- Export remains stub or CSV of current filtered rows if easy; not blocking.

### History
- Already wired to `useFeePayments`; add filters for mode + date range if API supports query params; otherwise client filter.

### Structure
- Load/save heads + structure via API (replace DemoBadge / AppProvider-only save).  
- Add head / remove inactive head / edit amounts / Save structure.  
- **Generate invoices** button: selected grades + academic year + term label → `POST /fees/invoices/generate`.

### Record payment modal
- Fee head select from active heads (not hard-coded Academic/Transport/Other only).  
- Amount, mode (full mode list), ref, note; cheque fields when mode = Cheque.  
- Submit → `payInvoice(invoiceId, payment)`.

### Waiver modal
- Principal (`fees` `A`); posts via the same pay endpoint with mode `Adjustment / waiver` (no separate waiver API in v1). Keep audit toast.

**Roles (existing gating):**

| Role | Caps |
|------|------|
| Admin / Owner-as-admin | `E` record + structure |
| Principal | `A` waiver (+ view) |
| Vice Principal | `V` view |
| Staff | `V` view |
| Teacher | none |

---

## 4. Parent notices (App · Email · SMS)

### Triggers
1. **Payment recorded** — receipt notice to guardians of that student.  
2. **Due reminder** — batch from Collection “Send reminders”.  

### Channels
Same pattern as `examNotify`: `createAnnouncement` with `channels`, `emails`, `phones`, school name, type `fee_receipt` | `fee_reminder`.

### Branding / Owner settings
Owner console (per school in portfolio):

- **Email:** from display name, from address (or “use platform relay with school reply-to”), optional reply-to.  
- **SMS:** sender id / template slots for receipt and reminder body (placeholders: `{{student}}`, `{{amount}}`, `{{due}}`, `{{school}}`, `{{mode}}`, `{{ref}}`).  
- Save via comms-settings API.  

School staff do not invent SMTP credentials in Fees screen — Owner configures once; Fees only picks channels.

If SMTP/SMS provider is not ready on backend, UI still posts reminders/announcements; delivery is best-effort via existing announcement pipeline.

---

## 5. Dashboards

### School dashboard (`school.dashboard`)
- Replace derived `feesToday` / `outstanding` / fee donut with `/fees/reports/summary` (or a thin school dashboard fee slice).  
- Activity line for latest fee payment when available.  
- Fee announcements row can remain from live announcements list later; not required for v1 of this spec.

### Owner revenue (`owner.revenue`)
- Already live via fee-summary — keep; ensure school pay + invoices flow updates backend so portfolio numbers stay real.

### Principal / Admin
- Same school Fees module + same dashboard KPIs; no separate fee UI.

---

## 6. Frontend modules (implementation sketch)

| Area | Files |
|------|--------|
| Types | `src/types/index.ts` — add `FeeHead`, `FeeInvoice`; payments use `headId`; deprecate fixed `FeeType` union in UI |
| API | `feeHeads.ts`, `feeStructure.ts`, `feeInvoices.ts`, extend `feePayments.ts`, `feeReports.ts`, `feeReminders.ts`, owner `commsSettings` |
| Hooks | `useFeeHeads`, `useFeeStructure`, `useFeeInvoices`, extend pay/list, `useFeeSummary`, `useFeeReminders` |
| Notify | `src/lib/feeNotify.ts` (mirror `examNotify.ts`) |
| UI | `finance.tsx` Collection/History/Structure; Owner settings panel for comms |
| Dashboards | `dashboard.tsx` fee KPIs; leave owner revenue as-is |
| Tests | API module tests + `financeFees.test.tsx` + feeNotify + dashboard summary smoke |

Query keys: extend `queryKeys` with `feeHeads`, `feeStructure`, `feeInvoices`, `feeReports.summary`, `owner.commsSettings(schoolId)`.

---

## 7. Migration from current code

| Current | Change |
|---------|--------|
| Collection built from mock `students` + `feeStatus` | Switch to invoices API |
| Structure in AppProvider only | Persist via `/fees/structure` + heads API |
| Hard-coded `FeeType` three values | Active heads list |
| `payInvoice` + history | Keep; enrich payment payload |
| Dashboard fake fee math | Bind summary API |
| Send reminders → communication intent only | Real fee reminder modal + API |
| DemoBadge on Structure | Remove when API-backed |

---

## 8. Success criteria

- Admin can add a fee head, set grade amounts, generate/open invoices, record Cash/UPI/Cheque/POS/etc., see history.  
- Principal can approve waiver.  
- Reminder/receipt can target App + Email + SMS using Owner-configured school templates when backend supports them.  
- School dashboard and Owner fee collection show numbers from APIs, not `mockDb` fee %.  
- `npm test`, typecheck, and build stay green.

## 9. Phased delivery (within this design)

1. **Ledger** — heads, structure, invoices list, pay (modes), history, school summary reports.  
2. **Notify + Owner comms settings** — feeNotify + reminders + settings UI.  
3. **Dashboards** — wire school dashboard fee KPIs to summary.  

Razorpay / online pay is explicitly **out**; may be a follow-up spec later.
