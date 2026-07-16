# Fee Management (SaaS) Design — Offline + Razorpay

**Date:** 2026-07-17  
**Status:** Approved (chat) — updated to include per-school Razorpay + Owner integrations  
**Screen:** `school.fees` + Owner **school integrations** settings + dashboards  
**Scope:** Offline office collection **and** school-wise Razorpay online pay. Mail + SMS + Razorpay are configured **per school** in Owner settings (not shared platform keys for school fee cash).

## Summary

Replace dummy fee KPIs and local-only structure with a real, tenant-scoped fee ledger for school SaaS customers:

1. Configurable fee heads + per-grade structure  
2. Student invoices (billed / paid / due / status)  
3. Offline payments (Cash, UPI manual, Cheque, Card/POS, Bank transfer, DD, Waiver)  
4. **Online pay via each school’s own Razorpay** (keys in Owner school settings)  
5. Parent notices (App + Email + SMS) using **that school’s** mail/SMS config from Owner settings  
6. Reports + live fee figures on Admin / Principal / Owner dashboards  

## Goals

- Schools collect fees offline **or** online; every school can use **its own** Razorpay account.  
- Owner configures **per-school integrations** in one place: Email, SMS, Razorpay.  
- Parents get paid/due notices from the school’s configured email + SMS templates (plus in-app).  
- Owner / Principal / Admin see real collected vs outstanding — no hardcoded dashboard finance.

## Non-goals (this release)

- Platform-owned Razorpay for **student fees** (platform Razorpay may still exist for SaaS subscription billing — separate from school fee cash)  
- Stripe / other gateways  
- PDF receipt generation (toast + history + notification is enough)  
- Multi-currency fee books beyond school `currency`  
- Automatic bank reconciliation beyond Razorpay webhooks  
- Payroll / HR (unchanged)

---

## 1. Owner school integrations (single settings surface)

**Where:** Owner console → open a school (or school settings) → **Integrations** panel.  
Same pattern for every customer school: credentials never live on the Fees screen; Admin only *uses* what Owner enabled.

### 1a. Email (school-wise)

| Setting | Purpose |
|---------|---------|
| Enabled | Toggle email channel for this school |
| From name | e.g. Greenwood Valley School |
| From address | School’s sending address (or platform relay + school identity) |
| Reply-to | Optional |
| Templates | Fee receipt + fee reminder bodies with placeholders |

### 1b. SMS (school-wise)

| Setting | Purpose |
|---------|---------|
| Enabled | Toggle SMS for this school |
| Sender ID / provider config | School DLT / sender as backend supports |
| Templates | Receipt + reminder SMS with `{{student}}`, `{{amount}}`, `{{due}}`, `{{school}}`, `{{mode}}`, `{{ref}}`, `{{pay_link}}` |

### 1c. Razorpay (school-wise — custom per customer)

| Setting | Purpose |
|---------|---------|
| Enabled | Online fee pay on/off for this school |
| Key ID | School’s Razorpay Key ID |
| Key secret | School’s Razorpay Key Secret (write-only in UI; never echo full secret back) |
| Webhook secret | For payment.captured verification |
| Test / Live mode | Explicit mode badge |
| Status | `not_configured` \| `configured` \| `invalid` (after verify) |

**Rules:**

- Each school (tenant) stores **its own** Razorpay keys — no cross-school reuse.  
- Fees UI shows “Collect online / Send pay link” only when this school’s Razorpay is `configured` + enabled.  
- SaaS subscription Razorpay (Catre / platform billing) stays separate; do not mix platform keys into student fee collection.  
- Owner can **Test connection** (lightweight verify) before saving as configured.

### APIs for integrations

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me/schools/{id}/integrations` | Email + SMS + Razorpay status (secrets masked) |
| PUT | `/me/schools/{id}/integrations` | Save email / SMS / Razorpay fields |
| POST | `/me/schools/{id}/integrations/razorpay/verify` | Optional key check |

(If backend splits `comms-settings` vs `payment-settings`, UI still presents **one Integrations** page.)

---

## 2. Domain model

### Fee head (fee type)

| Field | Notes |
|-------|--------|
| `id` | Stable id |
| `name` | e.g. Academic, Transport, Lab |
| `code` | Optional short code |
| `active` | Soft-disable without deleting history |
| `isSystem` | Starter heads cannot be hard-deleted if payments exist |

**Default starter heads (per school):** Academic, Transport, Exam, Admission, Hostel, Lab, Library, Uniform, Other.  
Schools may add custom heads; rename/deactivate allowed when safe.

### Fee structure

Per grade: use live class grades from the Classes API when available; otherwise the existing `grades` list used by Fees today.

`Record<grade, Record<headId, amount>>`

**v1 stores the amount matrix only.** Term/due window lives on the invoice (`term` label + optional `dueDate` on generate).

### Invoice (student fee bill)

| Field | Notes |
|-------|--------|
| `id` | Invoice id |
| `studentId` | |
| `academicYear` | e.g. 2026-27 |
| `term` / label | e.g. Term-2 |
| `lines[]` | `{ headId, headName, amount }` |
| `total` / `paid` / `waived` / `due` | |
| `status` | `paid` \| `partial` \| `due` |

Generate: Structure tab → selected grades + year + term → `POST /fees/invoices/generate`.

### Payment

| Field | Notes |
|-------|--------|
| `id` | |
| `invoiceId` | |
| `studentId`, `studentName`, `cls` | Denormalized for history |
| `headId` | Fee head id |
| `amount` | |
| `mode` | Offline modes **or** `Razorpay` |
| `ref` | Offline ref **or** Razorpay payment id |
| `date` | |
| `note` | Optional |
| `collectedBy` | User for offline; `razorpay` / system for online |
| `cheque` | Optional when mode = Cheque |
| `gateway` | Optional: `{ provider: 'razorpay', orderId, paymentId, signature }` |

**Offline modes:** Cash, UPI (manual), Cheque, Card/POS, Bank transfer, DD, Adjustment / waiver.  

**Online mode:** `Razorpay` — created only after verified webhook (or verified checkout callback); never mark paid on “link sent” alone.

---

## 3. Fee APIs (frontend contract)

Wire is snake_case; follow existing `feePayments.ts` / announcements patterns.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/fees/heads` | List fee heads |
| POST | `/fees/heads` | Create custom head |
| PATCH | `/fees/heads/{id}` | Rename / activate |
| DELETE | `/fees/heads/{id}` | Soft-delete if unused |
| GET | `/fees/structure` | Grade × head amounts |
| PUT | `/fees/structure` | Save structure matrix |
| GET | `/fees/invoices` | List invoices (`q`, `status`, `grade`, `class`) |
| POST | `/fees/invoices/generate` | Generate from structure |
| POST | `/fees/invoices/{id}/pay` | Record **offline** payment (**already bound**) |
| POST | `/fees/invoices/{id}/razorpay/order` | Create order with **this school’s** Razorpay keys |
| POST | `/fees/invoices/{id}/razorpay/verify` | Optional client verify after checkout |
| GET | `/fees/payments` | Payment history (**already bound**) |
| GET | `/fees/reports/summary` | School KPIs + by class + by mode (incl. Razorpay) |
| POST | `/fees/reminders` | Due reminders; may include pay link when Razorpay enabled |
| GET | `/me/schools/fee-summary` | Owner portfolio (**already bound**) |

Webhook (backend): Razorpay → school tenant → mark invoice paid → create payment row mode `Razorpay` → trigger receipt notice.

**Existing keep:** `listFeePayments`, `payInvoice`, `useOwnerFeeSummary`.  

**Stop using for finance KPIs:** mock student fee math, hardcoded dashboard fees, AppProvider-only structure as source of truth.

---

## 4. School Fees UI (`FeesScreen`)

### Collection
- KPIs from `/fees/reports/summary`.  
- Invoice table: search, status filter, Record / Waiver by gate.  
- When school Razorpay configured: **Send pay link** / **Collect online** on due rows (creates order + opens checkout or copies parent link).  
- **Send reminders** → App / Email / SMS; if Razorpay on, reminder can include pay link placeholder.  
- Live cue only from real latest payment (offline or Razorpay).

### History
- `useFeePayments`; filter by mode (includes Razorpay) + date when possible.

### Structure
- Heads + structure via API; **Generate invoices**.

### Record payment (offline)
- Head, amount, full offline mode list, ref, note, cheque fields → `payInvoice`.

### Waiver
- Principal `fees` `A`; mode `Adjustment / waiver` via pay endpoint.

**Roles:** Admin/Owner `E` record + structure + send pay link; Principal `A` waiver; VP/Staff `V`; Teacher none.

---

## 5. Parent notices

**Triggers:** payment recorded (offline or Razorpay webhook); batch due reminder.

**Channels:** App + Email + SMS via announcement / feeNotify pattern (`fee_receipt`, `fee_reminder`), using **that school’s** Owner integration templates and sender identity.

Staff never enter SMTP/Razorpay secrets on Fees — Owner Integrations only.

---

## 6. Dashboards

- **School dashboard:** bind fee KPIs/donut to `/fees/reports/summary`.  
- **Owner revenue:** keep fee-summary; include Razorpay cash in collected.  
- Principal / Admin: same Fees module + dashboard.

---

## 7. Frontend modules

| Area | Files |
|------|--------|
| Types | `FeeHead`, `FeeInvoice`; payment `headId` + gateway fields; `SchoolIntegrations` |
| API | fee heads/structure/invoices/reports/reminders; extend payments; `schoolIntegrations.ts` |
| Hooks | fee hooks + `useSchoolIntegrations` / save / razorpay verify |
| Notify | `src/lib/feeNotify.ts` |
| UI | `finance.tsx`; Owner Integrations (Email · SMS · Razorpay) per school |
| Dashboards | `dashboard.tsx` fee KPIs |
| Tests | API + finance + feeNotify + integrations save/mask secrets |

Query keys: `feeHeads`, `feeStructure`, `feeInvoices`, `feeReports.summary`, `owner.integrations(schoolId)`.

---

## 8. Migration

| Current | Change |
|---------|--------|
| Mock collection rows | Invoices API |
| AppProvider structure | `/fees/structure` + heads |
| Fixed three fee types | Active heads |
| pay + history | Keep; add Razorpay order/verify + webhook-driven rows |
| Dashboard fake fees | Summary API |
| Reminders → communication intent | Fee reminder + optional pay link |
| Owner settings (branding only) | Add per-school Integrations: Email, SMS, Razorpay |

---

## 9. Success criteria

- Owner configures **per school** Email, SMS, and Razorpay keys; secrets masked on reload.  
- Admin records offline modes and (when Razorpay configured) creates pay orders / pay links.  
- Successful Razorpay payment updates invoice + history + parent receipt notice.  
- Reminders use school mail/SMS settings; unpaid reminders can carry pay link.  
- Dashboards show API numbers including Razorpay collections.  
- `npm test`, typecheck, build green.

---

## 10. Phased delivery

1. **Ledger** — heads, structure, invoices, offline pay modes, history, school summary.  
2. **Owner Integrations** — Email + SMS + Razorpay school-wise settings UI + APIs.  
3. **Notify** — feeNotify + reminders (templates from integrations).  
4. **Razorpay collect** — order create, checkout/pay link, webhook → paid + receipt.  
5. **Dashboards** — school fee KPIs from summary.

Platform subscription Razorpay remains out of this fee cash path.
