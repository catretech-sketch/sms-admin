# Bulk Add Students — design spec

**Status:** approved by user, pending implementation plan
**Repos:** `sms-admin` (frontend), `sms-backend` (backend)
**Scope:** wire the existing `ImportDrawer` UI shell in `src/screens/school/sis.tsx` end-to-end for real CSV/XLSX student import, for files of 500–10,000 rows. Strictly scoped to Bulk Add Student — no changes to single Student Add, Transport, Fleet, Bus assignment, Finance, Teacher, or Attendance behavior.

## 1. Goal

Let a school admin upload a CSV/XLSX of students and have them created exactly as if each had been added one at a time through the existing Add Student form — same fields, same admission-number/roll-number rules, same transport-mapping behavior — but able to handle up to 10,000 rows without freezing the browser, issuing one HTTP request per student, or holding one giant request open long enough to time out.

## 2. Current state (what exists today)

- `ImportDrawer` (`src/screens/school/sis.tsx`, function starting ~line 75) is a 3-step wizard (`Upload → Map columns → Done`) that is **entirely fake**: no file input, no parsing, hardcoded "36 students imported, 0 errors" — nothing is created. It reuses a `Drawer` + step-badge UI pattern worth keeping.
- The single Add Student flow (`src/screens/school/studentAdd.tsx`, worktree `feat/student-transport-mapping` version — the current source of truth since it includes the Transport section) saves in three sequential, independently-erroring steps:
  1. `createStudent()` → `POST /students` (blocking; failure here aborts the whole save)
  2. `persistExtras()` → `GET` then `PUT /v1/students/{id}/extras` (best-effort; failure is toasted but does not roll back the student)
  3. (Platinum tier only) `setStudentTransport()` → `PUT /v1/students/{id}/transport` (best-effort; failure is toasted but does not roll back the student or extras)
- Admission Number: client suggests `nextPersonCode()` (max existing `+1`, scanned from the loaded roster) but the **server is authoritative** — `dbo.Student_Create` auto-generates `{tenantSlug}/STU/{yy}/{seq:0000}` when the field is blank, or uses a supplied value as-is.
- Roll Number: fully server-assigned. `dbo.Student_Create` always inserts `Roll = 0` then calls `dbo.Student_RenumberClass`, which re-sorts the **entire** Class+Section by `Name ASC, AdmissionNo ASC, Id ASC` and rewrites every row's `Roll`. This already runs automatically on every single insert today.
- Phone/email uniqueness (commit `4f851dc`) is enforced **entirely client-side** in `studentAdd.tsx`: the full roster is fetched via `useStudents()` and checked in-memory with `isDuplicateValue`/`normalizePhoneDigits`/`normalizeEmailKey` (`src/lib/validation.ts`). There is no backend uniqueness constraint or check today.
- Student Transport mapping (`feat/student-transport-mapping` branch): `IStudentTransportService.SetAsync(studentId, { optedIn, routeId, stopId, feeHeadId })` opts a student in, picks the least-loaded bus with capacity on the route, and — if no bus has room — still persists the mapping with `BusId = NULL` and returns status `"pending"`. Bulk import reuses this exactly, per row.
- No CSV/XLSX parser exists anywhere (frontend or backend). `exceljs` is a frontend dependency today but is only ever used to **write** `.xlsx` files (`src/lib/reportXlsx.ts`), never to read one.
- No background-job/queue infrastructure exists in `sms-backend` beyond a narrow email-dispatch `Channel<T>` worker. The closest "many rows in one request" precedent, `GenerateFeeInvoicesAsync`, runs a synchronous `foreach` over matching students in one HTTP request — the anti-pattern this design explicitly avoids at 10k-row scale.
- The existing `ILiveBroadcaster.PublishAsync(tenantId, type, data)` + `LiveHub` SignalR mechanism is available but **not used by this design** — real progress comes from actual batch HTTP responses, not a push channel (see §11).

## 3. Frontend: wizard

Five real steps replace `ImportDrawer`'s three fake ones, keeping its `Drawer` + step-badge chrome:

### Step 1 — Upload
Real `<input type="file" accept=".csv,.xlsx">` plus drag-and-drop onto the existing dropzone markup. Parsing happens entirely in the browser:
- **CSV** → new dependency **PapaParse** (small, standard, streaming-capable).
- **XLSX** → **exceljs** (already a dependency; this is its first *read* use, via `workbook.xlsx.load(buffer)`).

Shows the real `File: students.xlsx` name and real `Rows detected: 5,000` count from the parse result. Enforces the **10,000-row cap** client-side (reject with a clear message before Continue is enabled).

### Step 2 — Map columns
Reads the parsed file's actual header row. Auto-suggests a mapping to student fields via a small fuzzy-match table (e.g. "Father Phone" / "Fathers Phone" / "Dad Phone" → `fatherPhone`). Every field in the supported list (§5) is offered as a mapping target **except Roll Number**, which is never offered — it is 100% server-assigned, exactly as in single Add today. Each row is marked Required/Optional and Mapped/Unmapped; Continue is blocked while any required field is unmapped.

### Step 3 — Preview (client-side only, no backend call)
Runs the exact same validation rules as `studentAdd.tsx`, extracted into a shared module (§6) so there is exactly one source of truth for both single Add and bulk import. Shows real `Total / Valid / Errors / Warnings` counts, drill-down lists per category, and an error-report download (§14). **Nothing is created here.**

### Step 4 — Import
Sends only the valid+warning rows, chunked into sequential 200-row batches, to `POST /v1/students/bulk-import/batch` (§8). Real progress bar driven strictly by accumulated batch-response counts (§12) — no timers, no estimates. Start Import / Upload another file / Close are disabled while a batch is in flight.

### Step 5 — Complete
Final real totals (`Total`, `Created`, `Skipped`, `Transport Pending`) with `View Imported Students` / `View Errors` / `Download Error Report` / `Import Another File` / `Close`, matching the product spec's exact wording for the all-success and partial-success cases.

## 4. File parsing

- CSV via PapaParse (header row → column names, subsequent rows → string values; no type coercion — all validation/coercion happens in the shared validator, §6).
- XLSX via `exceljs`'s `Workbook.xlsx.load()`, reading the first worksheet, first row as headers.
- Parsing is synchronous-feeling but should run in a microtask-yielding loop (or `requestIdleCallback`/chunked `setTimeout(0)` between row batches) for files at the 10,000-row end, so the tab doesn't visibly freeze during parse — this is a UI-responsiveness detail, not a correctness one.

## 5. Supported fields (bulk import ↔ existing Add Student fields)

Every field `studentAdd.tsx` supports is mappable **except Roll Number**:

**Student:** Admission Number (optional/mappable — see §7), Admission Date, First Name, Last Name, Class, Section, House, Gender, Date of Birth, Academic Year, Status, Blood Group, Religion, Category, Primary Contact Number, Email, Caste, Mother Tongue, Languages Known, Last School Name, Address.
**Father:** Name, Email, Phone, Occupation.
**Mother:** Name, Email, Phone, Occupation.
**Transport:** Uses School Transport (yes/no), Transport Fee Head, Route, Pickup Stop.

No new fields are introduced beyond this list; **Roll Number is excluded from mapping entirely**.

## 6. Validation (client-side only, single source of truth)

Preview validation is **100% client-side** — no new backend validate endpoint. It reuses, verbatim, the exact functions `studentAdd.tsx` already uses:
- `required`, `validateAadhaar`, `validateEmail`, `validatePhone` (`src/lib/validation.ts`) for per-field checks.
- `isDuplicateValue` / `normalizePhoneDigits` / `normalizeEmailKey` (`src/lib/validation.ts`) for phone/email uniqueness — checked against the **same already-fetched roster** (`useStudents()`) the single Add form already loads for this exact purpose today. This inherits that approach's existing scalability ceiling (the whole roster loaded client-side); that is pre-existing behavior, not a new risk introduced by this feature, and is out of scope to change here.
- The father-or-mother-name-required cross-field rule.
- Reference-existence checks (Class/Section, House, Route, Stop-belongs-to-Route) against the small reference lists the wizard already loads via `useClasses()`, `listSchoolHouses()`, `useTransportRoutes()`, `useRouteStops()` — the same hooks `studentAdd.tsx` already uses.
- **New for bulk import**: admission-number-conflict check (same `isDuplicateValue` pattern, applied to the roster's `adm` field) and **duplicate-within-the-uploaded-file** detection (group all parsed rows by normalized name+phone; every occurrence after the first is an error, reported with both row numbers).

These rules are extracted from `studentAdd.tsx` into a new shared module, `src/lib/studentValidation.ts`, imported by **both** the single Add form and the bulk-import Preview step — one rule set, not two.

**Backend re-validation is still mandatory** (§8) — the client preview is a fast-feedback convenience, never the final authority. Stale roster/reference data client-side (e.g. another admin created a conflicting record between Preview and Import) cannot cause an incorrect import, because the backend re-checks before each row is created.

## 7. Admission Number behavior

Unchanged, reused as-is:
- **Optional and mappable** in bulk import (unlike single Add's read-only UI) — legitimate for migrating legacy records that already have real admission numbers.
- If a row's mapped Admission Number is blank, `dbo.Student_Create` auto-generates `{tenantSlug}/STU/{yy}/{seq:0000}` exactly as it does for single Add — no new algorithm.
- If provided, used as-is (subject to the same duplicate check as everything else, §6).
- Because batches are processed **strictly sequentially, never in parallel** (§9), every row's auto-generation sees all prior rows in this import already committed — no new race condition beyond what already exists for two admins adding students back-to-back today.

## 8. Roll Number behavior

Unchanged, reused as-is, **not an import field**:
- Never offered as a mapping target (§3, §5).
- Every created row's `Roll` is left `0` in the request, exactly like single Add's `buildStudent()` does — `dbo.Student_Create` always calls `dbo.Student_RenumberClass` afterward, which re-sorts the whole Class+Section by name and rewrites every Roll number.
- At realistic section sizes (tens of students per section) this repeated full-section renumber is trivially cheap; it is not a performance concern at the stated import scale.

## 9. Backend API

**Single endpoint** (no separate validate endpoint):

```
POST /v1/students/bulk-import/batch
Authorization: staff only (RoleChecks.IsStaff), tenant-scoped (ITenantContext) — same as
                POST /students, PATCH /students/{id}, PUT /students/{id}/transport today.

Request:
{
  importId: string (GUID — one value for the whole import, generated client-side
                     when the wizard enters the Import step),
  batchIndex: number (0-based, strictly sequential),
  rows: [
    {
      rowNumber: number,                    // 1-based position in the original file, for error reporting
      createStudentRequest: {               // shaped exactly like CreateStudentRequest — built
                                             // client-side by the SAME buildStudent()-derived
                                             // mapping function single Add uses, extracted to
                                             // src/lib/studentMapping.ts
        admissionNo, name, gender, grade, section, roll /* always 0 */,
        guardianName, guardianPhone, guardianEmail, house, avatarHue, dob, email, address
      },
      extrasJson: string | null,            // built by the same extrasFromStudent()-derived
                                             // function, or null if no extras fields were mapped
      transport: {                          // present only if the row opted into transport
        optedIn: true, routeId, stopId, feeHeadId
      } | null
    }
  ]
}

Response:
{
  importId, batchIndex,
  processed: number, created: number, skipped: number, transportPending: number,
  rows: [
    {
      rowNumber, studentId?: string,
      status: 'created' | 'skipped',
      error?: string,                       // present when status = 'skipped'
      transportStatus?: 'assigned' | 'pending' | 'not_applicable'
    }
  ]
}
```

### Row shaping happens client-side, on purpose
The frontend does all of the shaping work (reusing the existing, tested `buildStudent()` / `extrasFromStudent()` logic, extracted to a shared `src/lib/studentMapping.ts` used by both single Add and bulk import) — the same way the single Add form already builds these exact payload shapes before its three sequential calls. This means the backend does **not** re-implement row→request mapping in C#; it receives payloads already shaped like the existing `CreateStudentRequest`/extras/transport contracts and simply loops the same three existing service calls it already exposes via other endpoints.

Bulk-import rows never carry files (no per-row photo/document upload in a CSV/XLSX import), so `extrasJson` for a bulk row only ever includes the scalar extras fields (blood group, religion, category, caste, mother tongue, languages, last school, address, academic year, admission date, father/mother contact fields) — the `documents`/`photoName` portions of `extrasFromStudent()`'s output are always empty for bulk-imported students, never populated:

```
for each row in batch.rows (in order, one at a time — no parallelism):
    try:
        student = sis.CreateStudentAsync(row.createStudentRequest)   // dbo.Student_Create (existing, unchanged)
        if row.extrasJson is not null:
            academics.UpsertPersonExtrasAsync(student.id, row.extrasJson)  // existing, unchanged
        if row.transport is not null:
            transportResult = studentTransport.SetAsync(student.id, row.transport)  // existing, unchanged
        record row as created (+ transportResult.status)
    catch (row-level exception):
        record row as skipped, with the exception's message as `error`
        continue to next row  // never abort the batch
```

**Backend re-validation is mandatory before each row is created** — this loop does not blindly trust the client's Preview pass. `sis.CreateStudentAsync` and the existing stored procedures remain the final authority (e.g. reference-existence, required-field enforcement at the DB layer where it already exists); nothing here weakens or bypasses that. No second validation rule set is introduced — the backend simply keeps doing exactly what `Student_Create`/`StudentTransportService` already do for single Add, called in a loop.

## 10. Idempotency

New table `BulkImportBatches` (`Id, TenantId, ImportId, BatchIndex, ResultJson, CreatedAt`), **unique constraint on `(TenantId, ImportId, BatchIndex)`** — a direct copy of the fee-payment idempotency pattern already in the codebase (`FinanceModule.cs`):

1. On receiving a batch request, check for an existing row matching `(TenantId, ImportId, BatchIndex)`.
2. If found, return its stored `ResultJson` immediately — **no reprocessing, no duplicate students**, regardless of whether this is a genuine retry or a race.
3. If not found, process the batch (§9's loop), then insert the result row.
4. If the insert races with a concurrent identical request (SQL error 2601/2627, unique-violation), re-read the row that won and return its result — same handling as the fee-payment code.

`importId` is generated once client-side when the wizard reaches the Import step and reused for every batch call in that session.

## 11. Transactions / partial success

**No batch-wide database transaction.** This is deliberate and matches the product requirement exactly: one bad row must never roll back the other 199 in its batch. Each row's `CreateStudentAsync` → `UpsertPersonExtrasAsync` → `SetAsync` chain is independent and already-existing best-effort semantics (a student row that saves but whose extras/transport call fails still counts as **created**, with a note — identical to single Add's behavior today). If `CreateStudentAsync` itself throws for one row, only that row is marked `skipped`; the loop continues immediately to the next row. A batch of 200 with 3 bad rows returns `created: 197, skipped: 3` — never an all-or-nothing result.

## 12. Retry / resume

- **Network/timeout/5xx on a batch call** → frontend retries the identical `(importId, batchIndex)`. Idempotency (§10) guarantees this can never create duplicate students, whether or not the original request actually completed server-side.
- **A single row failing** is recorded as `skipped` with its reason and included in the final error report (§14) — **never automatically retried**. No retry storms.
- **If retries for one batch are exhausted** (e.g. several consecutive network failures), the wizard pauses:
  > **Import paused at batch 23/50**
  > Created: 4,400 · Processed: 4,400 / 10,000
  > `[Retry Import]`

  Clicking Retry Import simply resumes sending batch 23, then 24, 25, … — because the frontend still holds the full parsed+validated row list in memory (Approach C's accepted trade-off: the import only progresses while this wizard tab stays open), and because idempotency makes it safe to resend any batch whether or not it partially landed. There is no separate "resume token" needed beyond the existing `importId` and the next `batchIndex` to send.

## 13. Transport mapping

Unchanged from the existing single-Add call, reused per row (§9's loop, step 3): `IStudentTransportService.SetAsync(studentId, { optedIn: true, routeId, stopId, feeHeadId })` for any row that opted in. Same best-effort bus-capacity pick; if no bus on the route has room, the mapping still persists with `BusId = NULL` and status `"pending"` — the student is still **created**, never blocked on transport. That row's `transportStatus` is `"pending"`, rolled up into the batch's (and ultimately the whole import's) `transportPending` count. **No bus-allocation/capacity logic is duplicated in bulk import** — it is the exact same service call the single Add flow already makes.

## 14. Error report

Downloadable from the Preview step (client-side errors/warnings) and the Complete step (final skipped-row reasons from actual batch responses). Format: the original row's mapped columns plus one added `Error Reason` column, offered as both CSV and XLSX (reusing the existing `downloadTextFile`/`exceljs`-write helpers already in `src/lib/feeExport.ts`-style utilities). Example:

| Row | First Name | Last Name | Class | Phone | Error Reason |
|---|---|---|---|---|---|
| 182 | Rahul | Sharma | X-A | XXXXX | Invalid phone number |
| 427 | Amit | Kumar | IX-B | XXXXX | Invalid class |
| 891 | Neha | Singh | VIII-A | XXXXX | Duplicate student |

## 15. Progress reporting

Strictly server-response-driven. After every batch response (there is no separate validate call anymore — see §6), the frontend adds that batch's real `processed`/`created`/`skipped`/`transportPending` into running totals and recomputes `processed / total`. The bar only ever advances in response to an actual HTTP response body — no timers, no simulated/estimated percentages, anywhere in this flow.

## 16. Performance at 500 / 5,000 / 10,000 rows

| Rows | Batches (200/batch) | Notes |
|---|---|---|
| 500 | 3 | few seconds total |
| 5,000 | 25 | 25 small sequential requests |
| 10,000 | 50 | 50 small sequential requests |

Every request's cost is bounded by 200 rows regardless of total file size — no single request grows with the import size, and no request holds a database transaction open across hundreds of rows. `Student_RenumberClass`'s per-row full-section re-sort stays cheap at realistic section sizes, as verified in §8. No background-job subsystem is introduced — this design deliberately avoids that scope per the locked decision, since nothing in the codebase today needs it and nothing here requires it either.

## 17. Security / tenant isolation

`POST /v1/students/bulk-import/batch` follows the exact existing pattern used by every other staff mutation endpoint: `RoleChecks.IsStaff(User)` check at the top, `ITenantContext.TenantId` required and used to scope every underlying call (`CreateStudentAsync`, `UpsertPersonExtrasAsync`, `StudentTransportService.SetAsync` are already tenant-scoped). An admin can only import into the school/tenant their session is authorized for — no new authorization surface is introduced.

## 18. Explicit non-goals / out of scope

- No changes to single Student Add, Transport, Fleet, Bus assignment, Finance, Teacher, or Attendance behavior.
- No new admission-number or roll-number algorithm — both are reused byte-for-byte from existing stored procedures.
- No backend `/validate` endpoint.
- No background-job/queue subsystem, no new SignalR wiring — progress comes from real batch responses only.
- No fix to the existing single-Add duplicate-check's full-roster-load approach — bulk import inherits that same approach unchanged.

## 19. New/changed files (indicative — finalized in the implementation plan)

**sms-admin:**
- `src/screens/school/sis.tsx` — replace `ImportDrawer`'s fake steps with the real 5-step wizard.
- `src/lib/studentValidation.ts` (new) — extracted validation rules, shared with `studentAdd.tsx`.
- `src/lib/studentMapping.ts` (new) — extracted `buildStudent()`/`extrasFromStudent()`-derived row-shaping functions, shared with `studentAdd.tsx`.
- `src/api/students.ts` / new `src/api/bulkImportStudents.ts` — `POST /v1/students/bulk-import/batch` client function.
- `src/api/hooks/useBulkImportStudents.ts` (new) — mutation hook driving sequential batches + accumulated progress state.
- New dependency: PapaParse.

**sms-backend:**
- New migration: `BulkImportBatches` table + unique index on `(TenantId, ImportId, BatchIndex)`.
- New controller action(s): `POST v1/students/bulk-import/batch` (on `StudentController` or a new dedicated `StudentBulkImportController`).
- New service `IStudentBulkImportService`/`StudentBulkImportService` — the per-row loop (§9), calling existing `ISisService`, `IAcademicsService` (person extras), `IStudentTransportService` — no changes to any of those three.
- New repository method for idempotency check/insert on `BulkImportBatches` (mirrors `FinanceModule.cs`'s fee-payment idempotency code).

## 20. Testing strategy (high level — detailed in the implementation plan)

- Unit tests for the extracted `studentValidation.ts`/`studentMapping.ts` functions, plus regression tests confirming `studentAdd.tsx`'s existing behavior is unchanged after extraction.
- Frontend tests for the wizard: file parsing (CSV + XLSX fixtures), column auto-mapping suggestions, Preview validation (valid/error/warning/duplicate-within-file cases), sequential batch dispatch with accumulated progress, pause/resume UI on exhausted retries.
- Backend integration tests for `bulk-import/batch`: partial success within a batch (some rows fail, others succeed), idempotent replay of the same `(importId, batchIndex)`, transport pending/assigned outcomes, tenant isolation, admission-number auto-generation across sequential batches with no duplicates, roll-number renumbering correctness after a bulk section fill.
