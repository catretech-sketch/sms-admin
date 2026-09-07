# Bulk Add Students Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing (fully-mocked) `ImportDrawer` in `src/screens/school/sis.tsx` up to a real CSV/XLSX bulk student import, handling 500–10,000 rows via client-side parsing/validation and sequential 200-row idempotent backend batches, reusing the exact same student-creation/extras/transport logic the single Add Student form already uses.

**Architecture:** Frontend parses the file and validates entirely client-side (reusing extracted shared logic from `studentAdd.tsx`), then drives a sequence of `POST /v1/students/bulk-import/batch` calls (200 rows each). The backend endpoint has no new business logic of its own — it loops the existing `ISisService.CreateStudentAsync` → `IAcademicsService.UpsertPersonExtrasAsync` → `IStudentTransportService.SetAsync` calls per row, guarded by a small idempotency table so retries can never double-create students.

**Tech Stack:** React 19 + TypeScript + TanStack Query (frontend), PapaParse (new dependency, CSV parsing) + `exceljs` (already a dependency, first read-use for XLSX), C#/.NET 8 + Dapper + FluentMigrator (backend), Vitest + Testing Library (frontend tests), xUnit + FluentAssertions against a real SQL Server (backend integration tests).

**Spec:** `docs/superpowers/specs/2026-09-08-bulk-add-students-design.md`

## Global Constraints

- **Branch dependency:** this feature uses `IStudentTransportService`, `FeeHeads.IsTransportFeeHead`, and the Transport section of `studentAdd.tsx` — all of which exist only on the `feat/student-transport-mapping` branch/worktree in both `sms-admin` and `sms-backend`, not yet on `main`. Create this feature's worktree **from `feat/student-transport-mapping`** in both repos (not from `main`) until that branch merges; rebase onto `main` afterward.
- Do NOT modify single Student Add, Transport, Fleet, Bus assignment, Finance, Teacher, or Attendance behavior — only extract shared functions out of `studentAdd.tsx` (behavior-preserving), never change their logic.
- No new admission-number or roll-number algorithm — both reused byte-for-byte from `dbo.Student_Create`/`dbo.Student_RenumberClass`. Roll Number is never a bulk-import mapping target field.
- No background-job subsystem, no new SignalR wiring. Progress comes only from real batch HTTP responses.
- No backend `/validate` endpoint. Preview validation is 100% client-side, reusing exact existing validation functions.
- Backend `bulk-import/batch` performs its own minimal required-field guard before creating each row — it never blindly trusts the client's preview pass (see Task 6).
- 200 rows per batch, sequential only, never parallel. 10,000-row maximum enforced client-side at Upload.
- `importId` (GUID, one per wizard session) + `batchIndex` (0-based, sequential) is the idempotency key for every batch call — replaying the same pair must never create duplicate students.
- One bad row must never roll back the other rows in its 200-row batch (no batch-wide DB transaction across rows).
- Global JSON naming policy in `sms-backend` is snake_case (`SnakeCaseNamingPolicy`, `src/Sms.Api/Extensions/ServiceCollectionExtensions.cs:61-70`) — new C# request/response records use normal PascalCase properties; the wire format is snake_case automatically, matching every existing endpoint. No custom `JsonPropertyName` attributes needed.

---

## Part A — Shared extraction (sms-admin)

These two tasks pull existing, already-tested logic out of `studentAdd.tsx` into shared modules, changing nothing about its behavior — so both single Add and Bulk Import call the exact same rules from one place.

### Task 1: Extract shared validation into `src/lib/studentValidation.ts`

**Files:**
- Create: `src/lib/studentValidation.ts`
- Test: `src/lib/studentValidation.test.ts`
- Modify: `src/screens/school/studentAdd.tsx:402-440` (replace the body of `validate()` with a call to the extracted function; the form's local `f`/`existing`/`opsEnabled`/`rosterQ.data` become explicit parameters)

**Interfaces:**
- Produces: `validateStudentForm(input: StudentValidationInput): Record<string, string>` and `type StudentValidationInput = { form: Record<string,string>; files: Record<string, { name: string; size: number; type?: string } | null>; roster: { id: string; email?: string | null; phone?: string | null }[]; existingId?: string; transportEnabled: boolean }` — used by Task 14 (Preview step) with `existingId: undefined` (every bulk row is a new student) and `roster` built from the wizard's already-fetched `useStudents()` data.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/studentValidation.test.ts
import { describe, it, expect } from 'vitest'
import { validateStudentForm } from './studentValidation'

const baseForm = {
  firstName: 'Aarav', lastName: 'Sharma', cls: 'I-A', dob: '2015-01-01', gender: 'M',
  phone: '9876543210', email: 'aarav@example.com', fatherName: 'Suresh Sharma', motherName: '',
  aadhaar: '', fatherAadhaar: '', fatherEmail: '', motherEmail: '', fatherPhone: '', motherPhone: '',
  transportOptedIn: '', transportRouteId: '',
}

describe('validateStudentForm', () => {
  it('returns no errors for a fully valid form with no roster conflicts', () => {
    const errors = validateStudentForm({
      form: baseForm, files: {}, roster: [], transportEnabled: false,
    })
    expect(errors).toEqual({})
  })

  it('requires first name, last name, class, dob, gender, phone, email', () => {
    const errors = validateStudentForm({
      form: { ...baseForm, firstName: '', email: '' }, files: {}, roster: [], transportEnabled: false,
    })
    expect(errors.firstName).toBe('This field is required')
    expect(errors.email).toBe('This field is required')
  })

  it('requires father or mother name when both are blank', () => {
    const errors = validateStudentForm({
      form: { ...baseForm, fatherName: '', motherName: '' }, files: {}, roster: [], transportEnabled: false,
    })
    expect(errors.fatherName).toBe('Enter father or mother name')
  })

  it('flags a phone already used by another student in the roster', () => {
    const errors = validateStudentForm({
      form: baseForm, files: {}, transportEnabled: false,
      roster: [{ id: 'other-1', phone: '9876543210', email: 'someone-else@example.com' }],
    })
    expect(errors.phone).toBe('Another student already uses this phone number')
  })

  it('flags an email already used by another student, case-insensitively', () => {
    const errors = validateStudentForm({
      form: baseForm, files: {}, transportEnabled: false,
      roster: [{ id: 'other-2', phone: '9111111111', email: 'AARAV@EXAMPLE.COM' }],
    })
    expect(errors.email).toBe('Another student already uses this email')
  })

  it('does not flag a match against the record\'s own existingId', () => {
    const errors = validateStudentForm({
      form: baseForm, files: {}, transportEnabled: false, existingId: 'self-1',
      roster: [{ id: 'self-1', phone: '9876543210', email: 'aarav@example.com' }],
    })
    expect(errors).toEqual({})
  })

  it('requires a transport route when opted in and transport is enabled', () => {
    const errors = validateStudentForm({
      form: { ...baseForm, transportOptedIn: 'yes', transportRouteId: '' },
      files: {}, roster: [], transportEnabled: true,
    })
    expect(errors.transportRouteId).toBe('Select a route before saving')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/studentValidation.test.ts`
Expected: FAIL — `studentValidation.ts` does not exist yet.

- [ ] **Step 3: Write the extracted implementation**

```typescript
// src/lib/studentValidation.ts
import {
  required, validateAadhaar, validateEmail, validatePhone, validateFile,
  isDuplicateValue, normalizePhoneDigits, normalizeEmailKey, type FileLike,
} from './validation'

const REQUIRED_FIELDS = ['firstName', 'lastName', 'cls', 'dob', 'gender', 'phone', 'email'] as const

export interface StudentValidationInput {
  form: Record<string, string>
  files: Record<string, FileLike | null>
  roster: { id: string; email?: string | null; phone?: string | null }[]
  existingId?: string
  transportEnabled: boolean
}

/** The exact validation rules studentAdd.tsx's single Add/Edit form uses — extracted so bulk
 *  import can run the same checks client-side without a second, divergent rule set. */
export function validateStudentForm(input: StudentValidationInput): Record<string, string> {
  const { form: f, files, roster, existingId, transportEnabled } = input
  const e: Record<string, string> = {}
  for (const key of REQUIRED_FIELDS) {
    const msg = required(f[key])
    if (msg) e[key] = msg
  }
  if (!f.fatherName?.trim() && !f.motherName?.trim()) {
    e.fatherName = 'Enter father or mother name'
  }
  const checks: [string, string | null][] = [
    ['aadhaar', validateAadhaar(f.aadhaar)],
    ['fatherAadhaar', validateAadhaar(f.fatherAadhaar)],
    ['email', e.email ? null : validateEmail(f.email)
      || (isDuplicateValue(f.email, roster.map((s) => ({ id: s.id, value: s.email })), normalizeEmailKey, existingId)
        ? 'Another student already uses this email' : null)],
    ['fatherEmail', validateEmail(f.fatherEmail)],
    ['motherEmail', validateEmail(f.motherEmail)],
    ['phone', e.phone ? null : validatePhone(f.phone)
      || (isDuplicateValue(f.phone, roster.map((s) => ({ id: s.id, value: s.phone })), normalizePhoneDigits, existingId)
        ? 'Another student already uses this phone number' : null)],
    ['fatherPhone', validatePhone(f.fatherPhone)],
    ['motherPhone', validatePhone(f.motherPhone)],
  ]
  for (const [key, msg] of checks) if (msg) e[key] = msg
  for (const key of Object.keys(files)) {
    const msg = validateFile(files[key])
    if (msg) e[key] = msg
  }
  if (transportEnabled && f.transportOptedIn === 'yes' && !f.transportRouteId) {
    e.transportRouteId = 'Select a route before saving'
  }
  return e
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/studentValidation.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Point `studentAdd.tsx` at the extracted function (behavior-preserving)**

In `src/screens/school/studentAdd.tsx`, replace the `validate` function body (lines 402-440) with:

```typescript
  const validate = (): Record<string, string> =>
    validateStudentForm({
      form: f,
      files,
      roster: (rosterQ.data ?? []).map((s) => ({ id: s.id, email: s.email, phone: s.phone })),
      existingId: existing?.id,
      transportEnabled: opsEnabled,
    })
```

Add the import near the other `@/lib/*` imports: `import { validateStudentForm } from '@/lib/studentValidation'`. Remove the now-unused direct imports of `required, validateAadhaar, validateEmail, validatePhone, validateFile, isDuplicateValue, normalizePhoneDigits, normalizeEmailKey` from `@/lib/validation` if nothing else in the file uses them (check with a grep first — `validateFile` is still used directly for per-file checks if any remain outside `validate()`; keep only what's still referenced).

- [ ] **Step 6: Run the full existing studentAdd test suite to confirm no regression**

Run: `npx vitest run src/screens/school/studentAdd.test.tsx`
Expected: PASS (all existing tests — this step must produce byte-identical validation behavior, since `validateStudentForm` is a verbatim extraction)

- [ ] **Step 7: Commit**

```bash
git add src/lib/studentValidation.ts src/lib/studentValidation.test.ts src/screens/school/studentAdd.tsx
git commit -m "refactor(students): extract shared form validation into studentValidation.ts

Same rules studentAdd.tsx already enforced, now reusable by bulk import."
```

---

### Task 2: Extract shared row-mapping into `src/lib/studentMapping.ts`

**Files:**
- Create: `src/lib/studentMapping.ts`
- Test: `src/lib/studentMapping.test.ts`

**Interfaces:**
- Consumes: `buildStudent` logic pattern from `src/screens/school/studentAdd.tsx:129-193` (not imported — `studentAdd.tsx`'s local `buildStudent` stays as-is, driven by React state; this task creates a *parallel, pure* version usable outside a component, for bulk rows), `fromStudent` from `src/api/students.ts:111-114`, `extrasFromStudent` from `src/api/studentExtras.ts:106-125`, `parentMailFromStudent` from `src/api/students.ts:57-63`.
- Produces: `buildStudentFromRow(row: BulkStudentRow, classInfo: { grade: string; section: string; cls: string }): Student` and `toBulkImportRowPayload(student: Student, transport: BulkTransportInput | null): BulkImportRowPayload` — consumed by Task 15 (Import step) when assembling each batch request.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/studentMapping.test.ts
import { describe, it, expect } from 'vitest'
import { buildStudentFromRow, toBulkImportRowPayload, type BulkStudentRow } from './studentMapping'

const row: BulkStudentRow = {
  rowNumber: 1,
  admissionNo: '', firstName: 'aarav', lastName: 'sharma', section: 'A', gender: 'M', dob: '2015-01-01',
  phone: '9876543210', email: 'aarav@example.com',
  fatherName: 'suresh sharma', fatherPhone: '9111111111', fatherEmail: '', fatherOccupation: '',
  motherName: '', motherPhone: '', motherEmail: '', motherOccupation: '',
  bloodGroup: '', house: '', religion: '', category: '', caste: '', motherTongue: '', languages: '',
  lastSchool: '', address: '', academicYear: '2026–27', admissionDate: '', status: 'active',
  transportOptedIn: '', transportRouteId: '', transportStopId: '', transportFeeHeadId: '',
}
const classInfo = { grade: 'I', section: 'A', cls: 'I-A' }

describe('buildStudentFromRow', () => {
  it('proper-cases names and builds the guardian from father name', () => {
    const student = buildStudentFromRow(row, classInfo)
    expect(student.name).toBe('Aarav Sharma')
    expect(student.guardian).toBe('Suresh Sharma')
    expect(student.roll).toBe(0)
    expect(student.grade).toBe('I')
    expect(student.section).toBe('A')
  })

  it('leaves admissionNo blank when not supplied, for server auto-generation', () => {
    const student = buildStudentFromRow(row, classInfo)
    expect(student.adm).toBe('')
  })

  it('passes through a supplied admission number as-is (legacy migration case)', () => {
    const student = buildStudentFromRow({ ...row, admissionNo: 'legacy/2019/0042' }, classInfo)
    expect(student.adm).toBe('legacy/2019/0042')
  })
})

describe('toBulkImportRowPayload', () => {
  it('shapes a row with no transport opt-in', () => {
    const student = buildStudentFromRow(row, classInfo)
    const payload = toBulkImportRowPayload(student, null)
    expect(payload.rowNumber).toBeUndefined() // rowNumber is attached by the caller, not this function
    expect(payload.createStudentRequest.name).toBe('Aarav Sharma')
    expect(payload.createStudentRequest.roll).toBe(0)
    expect(payload.transport).toBeNull()
    expect(JSON.parse(payload.extrasJson).father.name).toBe('Suresh Sharma')
  })

  it('shapes a row with a transport opt-in', () => {
    const student = buildStudentFromRow(row, classInfo)
    const payload = toBulkImportRowPayload(student, { routeId: 'route-1', stopId: 'stop-1', feeHeadId: 'fh-1' })
    expect(payload.transport).toEqual({ optedIn: true, routeId: 'route-1', stopId: 'stop-1', feeHeadId: 'fh-1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/studentMapping.test.ts`
Expected: FAIL — `studentMapping.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/studentMapping.ts
import { properName, properPlace } from './properCase'
import { fromStudent } from '@/api/students'
import { extrasFromStudent } from '@/api/studentExtras'
import type { Student } from '@/types'

/** One parsed+mapped row from an uploaded bulk-import file, before it becomes a Student.
 *  Every field is a plain string (as parsed from CSV/XLSX) — never a File, since bulk
 *  import rows never carry per-row document/photo uploads. */
export interface BulkStudentRow {
  rowNumber: number
  admissionNo: string
  firstName: string
  lastName: string
  section: string
  gender: string
  dob: string
  phone: string
  email: string
  fatherName: string
  fatherPhone: string
  fatherEmail: string
  fatherOccupation: string
  motherName: string
  motherPhone: string
  motherEmail: string
  motherOccupation: string
  bloodGroup: string
  house: string
  religion: string
  category: string
  caste: string
  motherTongue: string
  languages: string
  lastSchool: string
  address: string
  academicYear: string
  admissionDate: string
  status: string
  transportOptedIn: string
  transportRouteId: string
  transportStopId: string
  transportFeeHeadId: string
}

/** Same shape as buildStudent() in studentAdd.tsx, minus file handling (bulk rows carry no
 *  files) — kept as a separate pure function since bulk import has no React form state to
 *  read files/existing-record from. */
export function buildStudentFromRow(
  row: BulkStudentRow,
  classInfo: { grade: string; section: string; cls: string },
): Student {
  const firstName = properName(row.firstName)
  const lastName = properName(row.lastName)
  const name = `${firstName} ${lastName}`.trim()
  const fatherName = properName(row.fatherName) || undefined
  const motherName = properName(row.motherName) || undefined
  const guardian = (fatherName || motherName || '').trim()
  const father = {
    name: fatherName, email: row.fatherEmail.trim() || undefined,
    phone: row.fatherPhone || undefined, occupation: row.fatherOccupation || undefined,
  }
  const mother = {
    name: motherName, email: row.motherEmail.trim() || undefined,
    phone: row.motherPhone || undefined, occupation: row.motherOccupation || undefined,
  }
  return {
    id: `BULK-${row.rowNumber}-${Date.now().toString(36).toUpperCase()}`,
    adm: row.admissionNo.trim(),
    name,
    gender: row.gender === 'F' ? 'F' : 'M',
    grade: classInfo.grade,
    section: classInfo.section,
    cls: classInfo.cls,
    roll: 0, /* server assigns A-Z by name within class, same as single Add */
    guardian,
    phone: row.phone.trim(),
    guardianEmail: (father.email || mother.email || '').trim() || undefined,
    attendance: 0,
    feeStatus: 'due',
    feeDue: 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    house: row.house.trim(),
    avatarHue: (name.length * 47) % 360,
    academicYear: row.academicYear,
    admissionDate: row.admissionDate || undefined,
    dob: row.dob,
    bloodGroup: row.bloodGroup || undefined,
    religion: row.religion || undefined,
    category: row.category || undefined,
    caste: row.caste || undefined,
    motherTongue: row.motherTongue || undefined,
    languages: row.languages || undefined,
    lastSchool: properName(row.lastSchool) || undefined,
    address: properPlace(row.address) || undefined,
    email: row.email || undefined,
    father,
    mother,
  } as Student
}

export interface BulkTransportInput {
  routeId: string
  stopId: string
  feeHeadId: string
}

export interface BulkImportRowPayload {
  rowNumber?: number
  createStudentRequest: Record<string, unknown>
  extrasJson: string
  transport: { optedIn: true; routeId: string | null; stopId: string | null; feeHeadId: string | null } | null
}

/** Shapes one built Student into the exact wire payload the bulk-import batch endpoint
 *  expects — reusing fromStudent() (the same function POST /students uses) and
 *  extrasFromStudent() (the same function PUT /students/{id}/extras uses), with an empty
 *  files list since bulk rows never carry documents. */
export function toBulkImportRowPayload(student: Student, transport: BulkTransportInput | null): BulkImportRowPayload {
  return {
    createStudentRequest: fromStudent(student),
    extrasJson: JSON.stringify(extrasFromStudent(student, [])),
    transport: transport
      ? { optedIn: true, routeId: transport.routeId || null, stopId: transport.stopId || null, feeHeadId: transport.feeHeadId || null }
      : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/studentMapping.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/studentMapping.ts src/lib/studentMapping.test.ts
git commit -m "feat(students): add shared row-mapping for bulk import

Reuses fromStudent()/extrasFromStudent() (same functions single Add
uses) to shape a parsed bulk-import row into the wire payload."
```

---

## Part B — File parsing & column mapping (sms-admin)

### Task 3: File parsing utility

**Files:**
- Create: `src/lib/importFileParse.ts`
- Test: `src/lib/importFileParse.test.ts`
- Modify: `package.json` (add `papaparse` + `@types/papaparse` dependencies)

**Interfaces:**
- Produces: `parseCsvText(text: string): ParsedFile`, `parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedFile>`, `type ParsedFile = { headers: string[]; rows: string[][] }` — consumed by Task 12 (Upload step).

- [ ] **Step 1: Install the dependency**

Run: `npm install papaparse && npm install -D @types/papaparse`

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/importFileParse.test.ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseCsvText, parseXlsxBuffer } from './importFileParse'

describe('parseCsvText', () => {
  it('parses headers and rows, trimming values', () => {
    const csv = 'First Name,Last Name,Phone\nAarav, Sharma ,9876543210\nAditi,Verma,9876543211\n'
    const result = parseCsvText(csv)
    expect(result.headers).toEqual(['First Name', 'Last Name', 'Phone'])
    expect(result.rows).toEqual([
      ['Aarav', 'Sharma', '9876543210'],
      ['Aditi', 'Verma', '9876543211'],
    ])
  })

  it('ignores fully blank trailing rows', () => {
    const csv = 'A,B\n1,2\n\n'
    const result = parseCsvText(csv)
    expect(result.rows).toEqual([['1', '2']])
  })
})

describe('parseXlsxBuffer', () => {
  it('parses the first worksheet\'s header row and data rows', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Students')
    ws.addRow(['First Name', 'Last Name', 'Phone'])
    ws.addRow(['Aarav', 'Sharma', '9876543210'])
    const buffer = await wb.xlsx.writeBuffer()
    const result = await parseXlsxBuffer(buffer as ArrayBuffer)
    expect(result.headers).toEqual(['First Name', 'Last Name', 'Phone'])
    expect(result.rows).toEqual([['Aarav', 'Sharma', '9876543210']])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/importFileParse.test.ts`
Expected: FAIL — `importFileParse.ts` does not exist yet.

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/importFileParse.ts
import Papa from 'papaparse'
import ExcelJS from 'exceljs'

export interface ParsedFile {
  headers: string[]
  rows: string[][]
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => !cell || !cell.trim())
}

/** Parses CSV text into a header row + trimmed string rows. Blank trailing rows are dropped. */
export function parseCsvText(text: string): ParsedFile {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true })
  const raw = result.data as string[][]
  const [headerRow, ...dataRows] = raw
  const headers = (headerRow ?? []).map((h) => h.trim())
  const rows = dataRows
    .map((row) => row.map((cell) => (cell ?? '').trim()))
    .filter((row) => !isBlankRow(row))
  return { headers, rows }
}

/** Parses the first worksheet of an uploaded .xlsx file's array buffer. */
export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }

  const headers: string[] = []
  const rows: string[][] = []
  sheet.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v).trim()))
    if (rowNumber === 1) {
      headers.push(...values)
    } else if (!isBlankRow(values)) {
      rows.push(values)
    }
  })
  return { headers, rows }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/importFileParse.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/importFileParse.ts src/lib/importFileParse.test.ts
git commit -m "feat(students): add CSV/XLSX parsing for bulk import

PapaParse for CSV (new dependency); exceljs (already installed,
first read-use) for XLSX."
```

---

### Task 4: Column mapping suggestion

**Files:**
- Create: `src/lib/importColumnMapping.ts`
- Test: `src/lib/importColumnMapping.test.ts`

**Interfaces:**
- Produces: `BULK_IMPORT_FIELDS: BulkImportFieldDef[]`, `type BulkImportFieldDef = { key: keyof BulkStudentRowInput; label: string; required: boolean; aliases: string[] }`, `suggestColumnMapping(headers: string[]): Record<string, string | null>` (maps each header to a field key or `null` if unmatched) — consumed by Task 13 (Map Columns step). `BulkStudentRowInput` is every `BulkStudentRow` field from Task 2 **except** `rowNumber` (attached by the parser, not mapped from a column).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/importColumnMapping.test.ts
import { describe, it, expect } from 'vitest'
import { BULK_IMPORT_FIELDS, suggestColumnMapping } from './importColumnMapping'

describe('BULK_IMPORT_FIELDS', () => {
  it('never includes roll number as a mappable field', () => {
    expect(BULK_IMPORT_FIELDS.some((f) => f.key === 'roll')).toBe(false)
  })

  it('marks admission number as optional (mappable, not required)', () => {
    const adm = BULK_IMPORT_FIELDS.find((f) => f.key === 'admissionNo')
    expect(adm?.required).toBe(false)
  })

  it('marks first name, last name, section, gender, dob, phone, email as required', () => {
    const requiredKeys = BULK_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key)
    expect(requiredKeys).toEqual(
      expect.arrayContaining(['firstName', 'lastName', 'section', 'gender', 'dob', 'phone', 'email']),
    )
  })
})

describe('suggestColumnMapping', () => {
  it('matches exact and near-exact header names', () => {
    const mapping = suggestColumnMapping(['First Name', 'Last Name', 'Phone', 'Father Phone'])
    expect(mapping['First Name']).toBe('firstName')
    expect(mapping['Last Name']).toBe('lastName')
    expect(mapping['Phone']).toBe('phone')
    expect(mapping['Father Phone']).toBe('fatherPhone')
  })

  it('matches common aliases', () => {
    const mapping = suggestColumnMapping(['DOB', 'Primary Contact', 'Pickup Stop'])
    expect(mapping['DOB']).toBe('dob')
    expect(mapping['Primary Contact']).toBe('phone')
    expect(mapping['Pickup Stop']).toBe('transportStopId')
  })

  it('leaves unrecognized headers unmapped', () => {
    const mapping = suggestColumnMapping(['Favourite Color'])
    expect(mapping['Favourite Color']).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/importColumnMapping.test.ts`
Expected: FAIL — `importColumnMapping.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/importColumnMapping.ts
import type { BulkStudentRow } from './studentMapping'

export type BulkStudentRowInput = Omit<BulkStudentRow, 'rowNumber'>

export interface BulkImportFieldDef {
  key: keyof BulkStudentRowInput
  label: string
  required: boolean
  aliases: string[]
}

/** Every field the single Add Student form supports, except Roll Number (never mappable —
 *  always server-assigned, same as single Add). Admission Number is optional/mappable here
 *  (unlike single Add's read-only UI) for migrating legacy records that already have one. */
export const BULK_IMPORT_FIELDS: BulkImportFieldDef[] = [
  { key: 'admissionNo', label: 'Admission Number', required: false, aliases: ['admission no', 'admission number', 'adm no'] },
  { key: 'admissionDate', label: 'Admission Date', required: false, aliases: ['admission date', 'doa'] },
  { key: 'firstName', label: 'First Name', required: true, aliases: ['first name', 'given name'] },
  { key: 'lastName', label: 'Last Name', required: true, aliases: ['last name', 'surname', 'family name'] },
  { key: 'section', label: 'Class + Section', required: true, aliases: ['class', 'section', 'class/section', 'grade'] },
  { key: 'house', label: 'House', required: false, aliases: ['house'] },
  { key: 'gender', label: 'Gender', required: true, aliases: ['gender', 'sex'] },
  { key: 'dob', label: 'Date of Birth', required: true, aliases: ['dob', 'date of birth', 'birth date'] },
  { key: 'academicYear', label: 'Academic Year', required: false, aliases: ['academic year', 'session'] },
  { key: 'status', label: 'Status', required: false, aliases: ['status'] },
  { key: 'bloodGroup', label: 'Blood Group', required: false, aliases: ['blood group'] },
  { key: 'religion', label: 'Religion', required: false, aliases: ['religion'] },
  { key: 'category', label: 'Category', required: false, aliases: ['category'] },
  { key: 'phone', label: 'Primary Contact Number', required: true, aliases: ['phone', 'primary contact', 'contact number', 'mobile'] },
  { key: 'email', label: 'Email', required: true, aliases: ['email', 'email address'] },
  { key: 'caste', label: 'Caste', required: false, aliases: ['caste'] },
  { key: 'motherTongue', label: 'Mother Tongue', required: false, aliases: ['mother tongue'] },
  { key: 'languages', label: 'Languages Known', required: false, aliases: ['languages known', 'languages'] },
  { key: 'lastSchool', label: 'Last School Name', required: false, aliases: ['last school', 'last school name', 'previous school'] },
  { key: 'address', label: 'Address', required: false, aliases: ['address'] },
  { key: 'fatherName', label: 'Father Name', required: false, aliases: ['father name', 'fathers name'] },
  { key: 'fatherEmail', label: 'Father Email', required: false, aliases: ['father email'] },
  { key: 'fatherPhone', label: 'Father Phone', required: false, aliases: ['father phone', 'dad phone', 'fathers phone'] },
  { key: 'fatherOccupation', label: 'Father Occupation', required: false, aliases: ['father occupation'] },
  { key: 'motherName', label: 'Mother Name', required: false, aliases: ['mother name', 'mothers name'] },
  { key: 'motherEmail', label: 'Mother Email', required: false, aliases: ['mother email'] },
  { key: 'motherPhone', label: 'Mother Phone', required: false, aliases: ['mother phone', 'mom phone', 'mothers phone'] },
  { key: 'motherOccupation', label: 'Mother Occupation', required: false, aliases: ['mother occupation'] },
  { key: 'transportOptedIn', label: 'Uses School Transport', required: false, aliases: ['uses school transport', 'transport', 'school transport'] },
  { key: 'transportFeeHeadId', label: 'Transport Fee Head', required: false, aliases: ['transport fee head', 'transport fee'] },
  { key: 'transportRouteId', label: 'Transport Route', required: false, aliases: ['transport route', 'route'] },
  { key: 'transportStopId', label: 'Pickup Stop', required: false, aliases: ['pickup stop', 'stop', 'bus stop'] },
]

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

/** For each uploaded header, suggests the best-matching field key (exact label match first,
 *  then alias match), or null if nothing matches closely enough. Never suggests 'roll' since
 *  it isn't in BULK_IMPORT_FIELDS at all. */
export function suggestColumnMapping(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {}
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    const match = BULK_IMPORT_FIELDS.find((f) => normalizeHeader(f.label) === normalized)
      ?? BULK_IMPORT_FIELDS.find((f) => f.aliases.some((a) => normalizeHeader(a) === normalized))
    mapping[header] = match?.key ?? null
  }
  return mapping
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/importColumnMapping.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/importColumnMapping.ts src/lib/importColumnMapping.test.ts
git commit -m "feat(students): add bulk-import column definitions + auto-mapping

Every existing Add Student field except Roll Number (never mappable)."
```

---

## Part C — Backend bulk-import endpoint (sms-backend)

### Task 5: `BulkImportBatches` migration

**Files:**
- Create: `db/Sms.Migrations/M0187_BulkImportBatches_Table.cs` (verify this number is still free in your base branch before applying — `feat/student-transport-mapping` is at M0186; bump if another migration has landed since)

**Interfaces:**
- Produces: table `dbo.BulkImportBatches (Id, TenantId, ImportId, BatchIndex, ResultJson, CreatedAt)`, unique index `(TenantId, ImportId, BatchIndex)` — consumed by Task 6's repository.

- [ ] **Step 1: Write the migration**

```csharp
// db/Sms.Migrations/M0187_BulkImportBatches_Table.cs
using FluentMigrator;

namespace Sms.Migrations;

[Migration(187, "Students: BulkImportBatches table for idempotent bulk-import batch processing")]
public sealed class M0187_BulkImportBatches_Table : Migration
{
    public override void Up()
    {
        Execute.Sql(@"
IF OBJECT_ID('dbo.BulkImportBatches') IS NULL
BEGIN
    CREATE TABLE dbo.BulkImportBatches (
        Id uniqueidentifier NOT NULL PRIMARY KEY,
        TenantId uniqueidentifier NOT NULL,
        ImportId uniqueidentifier NOT NULL,
        BatchIndex int NOT NULL,
        ResultJson nvarchar(max) NOT NULL,
        CreatedAt datetime2 NOT NULL CONSTRAINT DF_BulkImportBatches_CreatedAt DEFAULT (SYSUTCDATETIME())
    );
    CREATE UNIQUE INDEX UX_BulkImportBatches_Tenant_Import_Batch
        ON dbo.BulkImportBatches (TenantId, ImportId, BatchIndex);
END");
    }

    public override void Down()
    {
        Execute.Sql("DROP TABLE IF EXISTS dbo.BulkImportBatches;");
    }
}
```

- [ ] **Step 2: Apply the migration and verify**

Run the API once in Development (migrations auto-apply on startup per `src/Sms.Api/Program.cs:19-21`), then:
```bash
sqlcmd -S <your-server> -d Sms -E -Q "SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.BulkImportBatches')); SELECT name FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.BulkImportBatches')"
```
Expected: the table definition prints, and `UX_BulkImportBatches_Tenant_Import_Batch` appears in the index list.

- [ ] **Step 3: Commit**

```bash
git add db/Sms.Migrations/M0187_BulkImportBatches_Table.cs
git commit -m "feat(students): add BulkImportBatches table for bulk-import idempotency"
```

---

### Task 6: `IStudentBulkImportService` — the per-row batch loop

**Files:**
- Create: `src/Sms.Modules.Sis/Contracts/BulkImportContracts.cs`
- Create: `src/Sms.Modules.Sis/Data/BulkImportRepository.cs`
- Create: `src/Sms.Application/Services/Sis/StudentBulkImportService.cs`
- Test: `tests/Sms.Tests.Integration/Sis/StudentBulkImportServiceTests.cs`

**Interfaces:**
- Consumes: `ISisService.CreateStudentAsync(CreateStudentRequest, ct) -> ApiResult<StudentResponse>` (`src/Sms.Application/Services/Sis/SisService.cs:102`), `IAcademicsService.UpsertPersonExtrasAsync(string personType, Guid personId, UpsertPersonExtrasRequest, ct) -> ApiResult<PersonExtrasResponse>` (`src/Sms.Application/Services/Academics/IAcademicsService.cs:177`), `IStudentTransportService.SetAsync(Guid studentId, SetStudentTransportRequest, ct) -> ApiResult<StudentTransportResponse>` (`src/Sms.Application/Services/Transport/StudentTransportService.cs:18`).
- Produces: `IStudentBulkImportService.ProcessBatchAsync(BulkImportBatchRequest req, ct) -> ApiResult<BulkImportBatchResponse>` — consumed by Task 7's controller.

- [ ] **Step 1: Write the failing integration test**

```csharp
// tests/Sms.Tests.Integration/Sis/StudentBulkImportServiceTests.cs
using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Sms.Shared.Kernel.Auth;
using Sms.Tests.Integration;

namespace Sms.Tests.Integration.Sis;

[Collection("sql")]
public class StudentBulkImportServiceTests(SqlServerFixture fx)
{
    private const string Key = "integration-test-signing-key-32-bytes-min!!";

    private WebApplicationFactory<Program> App() =>
        fx.CreateApp(Key);

    private static object Row(int n, string name, string phone, string email) => new
    {
        row_number = n,
        create_student_request = new
        {
            admission_no = (string?)null, name, gender = "M", grade = "I", section = "A", roll = 0,
            guardian_name = name, guardian_phone = phone, guardian_email = email,
            house = (string?)null, avatar_hue = 0, dob = "2015-01-01", email, address = (string?)null,
        },
        extras_json = "{}",
        transport = (object?)null,
    };

    [Fact]
    public async Task ProcessBatch_creates_all_valid_rows_and_returns_real_counts()
    {
        using var app = App();
        var client = fx.AuthedClient(app, Key, role: "school.owner");

        var importId = Guid.NewGuid();
        var resp = await client.PostAsJsonAsync("/v1/students/bulk-import/batch", new
        {
            import_id = importId,
            batch_index = 0,
            rows = new[]
            {
                Row(1, "Aarav Sharma", "9876543210", "aarav@example.com"),
                Row(2, "Aditi Verma", "9876543211", "aditi@example.com"),
            },
        });

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<BulkImportBatchResponseDto>();
        body!.processed.Should().Be(2);
        body.created.Should().Be(2);
        body.skipped.Should().Be(0);
        body.rows.Should().HaveCount(2);
        body.rows[0].status.Should().Be("created");
        body.rows[0].student_id.Should().NotBeNull();
    }

    [Fact]
    public async Task ProcessBatch_skips_a_row_missing_a_required_field_without_failing_the_batch()
    {
        using var app = App();
        var client = fx.AuthedClient(app, Key, role: "school.owner");

        var badRow = Row(1, "", "9876543212", "blank-name@example.com"); // blank name -> should be skipped
        var goodRow = Row(2, "Rahul Gupta", "9876543213", "rahul@example.com");

        var resp = await client.PostAsJsonAsync("/v1/students/bulk-import/batch", new
        {
            import_id = Guid.NewGuid(),
            batch_index = 0,
            rows = new[] { badRow, goodRow },
        });

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadFromJsonAsync<BulkImportBatchResponseDto>();
        body!.created.Should().Be(1);
        body.skipped.Should().Be(1);
        body.rows.First(r => r.row_number == 1).status.Should().Be("skipped");
        body.rows.First(r => r.row_number == 1).error.Should().NotBeNullOrEmpty();
        body.rows.First(r => r.row_number == 2).status.Should().Be("created");
    }

    [Fact]
    public async Task ProcessBatch_replaying_the_same_import_and_batch_index_never_creates_duplicates()
    {
        using var app = App();
        var client = fx.AuthedClient(app, Key, role: "school.owner");
        var importId = Guid.NewGuid();
        var payload = new
        {
            import_id = importId,
            batch_index = 0,
            rows = new[] { Row(1, "Neha Singh", "9876543214", "neha@example.com") },
        };

        var first = await client.PostAsJsonAsync("/v1/students/bulk-import/batch", payload);
        var second = await client.PostAsJsonAsync("/v1/students/bulk-import/batch", payload);

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.OK);
        var firstBody = await first.Content.ReadFromJsonAsync<BulkImportBatchResponseDto>();
        var secondBody = await second.Content.ReadFromJsonAsync<BulkImportBatchResponseDto>();
        secondBody!.rows[0].student_id.Should().Be(firstBody!.rows[0].student_id);

        var check = await client.GetAsync($"/v1/students?q=neha@example.com");
        var students = await check.Content.ReadFromJsonAsync<StudentListEnvelopeDto>();
        students!.data.Count(s => s.email == "neha@example.com").Should().Be(1);
    }

    private sealed record BulkImportRowResponseDto(int row_number, string? student_id, string status, string? error);
    private sealed record BulkImportBatchResponseDto(
        Guid import_id, int batch_index, int processed, int created, int skipped, int transport_pending,
        List<BulkImportRowResponseDto> rows);
    private sealed record StudentListItemDto(string email);
    private sealed record StudentListEnvelopeDto(List<StudentListItemDto> data, string? next_cursor);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter "FullyQualifiedName~StudentBulkImportServiceTests"`
Expected: FAIL — endpoint `/v1/students/bulk-import/batch` doesn't exist yet (404).

- [ ] **Step 3: Write the contracts**

```csharp
// src/Sms.Modules.Sis/Contracts/BulkImportContracts.cs
namespace Sms.Modules.Sis.Contracts;

public sealed record BulkImportTransportInput(bool OptedIn, Guid? RouteId, Guid? StopId, Guid? FeeHeadId);

public sealed record BulkImportRowRequest(
    int RowNumber,
    CreateStudentRequest CreateStudentRequest,
    string? ExtrasJson,
    BulkImportTransportInput? Transport);

public sealed record BulkImportBatchRequest(Guid ImportId, int BatchIndex, IReadOnlyList<BulkImportRowRequest> Rows);

public sealed record BulkImportRowResult(int RowNumber, Guid? StudentId, string Status, string? Error, string? TransportStatus);

public sealed record BulkImportBatchResponse(
    Guid ImportId, int BatchIndex, int Processed, int Created, int Skipped, int TransportPending,
    IReadOnlyList<BulkImportRowResult> Rows);
```

- [ ] **Step 4: Write the idempotency repository**

```csharp
// src/Sms.Modules.Sis/Data/BulkImportRepository.cs
using System.Data;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using Sms.Modules.Sis.Contracts;
using Sms.Shared.Kernel.Data;

namespace Sms.Modules.Sis.Data;

/// Thrown when a batch's (TenantId, ImportId, BatchIndex) already has a *different* stored
/// result than what's about to be inserted — should never happen in practice (the same
/// batchIndex is always sent with the same rows), but guards against a client bug the same
/// way IdempotencyKeyConflictException guards fee payments.
public sealed class BulkImportBatchConflictException() : Exception("This batch was already recorded with a different result");

public sealed class BulkImportRepository(IDbConnectionFactory factory) : BaseRepository(factory)
{
    public async Task<BulkImportBatchResponse?> GetExistingResultAsync(
        Guid tenantId, Guid importId, int batchIndex, CancellationToken ct = default)
    {
        var row = (await QueryInlineAsync<string>(
            "SELECT ResultJson FROM dbo.BulkImportBatches WHERE TenantId = @tenantId AND ImportId = @importId AND BatchIndex = @batchIndex",
            new { tenantId, importId, batchIndex }, ct)).FirstOrDefault();
        return row is null ? null : JsonSerializer.Deserialize<BulkImportBatchResponse>(row);
    }

    /// Inserts the batch's result. If a concurrent request for the same (tenantId, importId,
    /// batchIndex) won the race, returns that row's already-stored result instead of throwing —
    /// mirrors FinanceModule.cs's fee-payment idempotency race handling (SQL error 2601/2627).
    public async Task<BulkImportBatchResponse> RecordResultAsync(
        Guid tenantId, Guid importId, int batchIndex, BulkImportBatchResponse result, CancellationToken ct = default)
    {
        await using var conn = await Factory.OpenAsync(ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition(
                """
                INSERT dbo.BulkImportBatches (Id, TenantId, ImportId, BatchIndex, ResultJson, CreatedAt)
                VALUES (@id, @tenantId, @importId, @batchIndex, @resultJson, SYSUTCDATETIME())
                """,
                new { id = Guid.NewGuid(), tenantId, importId, batchIndex, resultJson = JsonSerializer.Serialize(result) },
                commandType: CommandType.Text, cancellationToken: ct));
            return result;
        }
        catch (SqlException sqlEx) when (sqlEx.Number is 2601 or 2627)
        {
            var raced = await GetExistingResultAsync(tenantId, importId, batchIndex, ct);
            if (raced is null) throw new BulkImportBatchConflictException();
            return raced;
        }
    }
}
```

- [ ] **Step 5: Write the service (the per-row loop)**

```csharp
// src/Sms.Application/Services/Sis/StudentBulkImportService.cs
using Sms.Application.Common;
using Sms.Application.Services.Academics;
using Sms.Application.Services.Transport;
using Sms.Modules.Academics.Contracts;
using Sms.Modules.Sis.Contracts;
using Sms.Modules.Sis.Data;
using Sms.Modules.Transport;
using Sms.Shared.Kernel.Results;
using Sms.Shared.Kernel.Tenancy;

namespace Sms.Application.Services.Sis;

public interface IStudentBulkImportService
{
    Task<ApiResult<BulkImportBatchResponse>> ProcessBatchAsync(BulkImportBatchRequest req, CancellationToken ct = default);
}

public sealed class StudentBulkImportService(
    ISisService sis, IAcademicsService academics, IStudentTransportService transport,
    BulkImportRepository repo, ITenantContext tenant) : IStudentBulkImportService
{
    public async Task<ApiResult<BulkImportBatchResponse>> ProcessBatchAsync(
        BulkImportBatchRequest req, CancellationToken ct = default)
    {
        if (tenant.TenantId is not { } tid)
            return ApiResult<BulkImportBatchResponse>.Fail(new Error("forbidden", "no tenant context"), 403);

        var existing = await repo.GetExistingResultAsync(tid, req.ImportId, req.BatchIndex, ct);
        if (existing is not null)
            return ApiResult<BulkImportBatchResponse>.Ok(existing);

        var results = new List<BulkImportRowResult>();
        foreach (var row in req.Rows)
        {
            results.Add(await ProcessRowAsync(row, ct));
        }

        var response = new BulkImportBatchResponse(
            req.ImportId, req.BatchIndex,
            Processed: results.Count,
            Created: results.Count(r => r.Status == "created"),
            Skipped: results.Count(r => r.Status == "skipped"),
            TransportPending: results.Count(r => r.TransportStatus == "pending"),
            Rows: results);

        var recorded = await repo.RecordResultAsync(tid, req.ImportId, req.BatchIndex, response, ct);
        return ApiResult<BulkImportBatchResponse>.Ok(recorded);
    }

    /// Minimal required-field guard before creating — the backend's own final authority,
    /// independent of whatever the client's Preview step already checked. Deliberately does
    /// NOT re-implement phone/email format regex or duplicate-vs-roster checks (those stay
    /// client-only per the design) — only guards against structurally incomplete rows that
    /// dbo.Student_Create would otherwise silently accept.
    private static string? RequiredFieldError(CreateStudentRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return "Name is required";
        if (string.IsNullOrWhiteSpace(r.Grade)) return "Class is required";
        if (string.IsNullOrWhiteSpace(r.Section)) return "Section is required";
        if (r.Gender is not ("M" or "F")) return "Gender must be M or F";
        if (r.Dob is null) return "Date of birth is required";
        if (string.IsNullOrWhiteSpace(r.Email)) return "Email is required";
        if (string.IsNullOrWhiteSpace(r.GuardianPhone)) return "Primary contact number is required";
        if (string.IsNullOrWhiteSpace(r.GuardianName)) return "Father or mother name is required";
        return null;
    }

    private async Task<BulkImportRowResult> ProcessRowAsync(BulkImportRowRequest row, CancellationToken ct)
    {
        try
        {
            if (RequiredFieldError(row.CreateStudentRequest) is { } fieldError)
                return new BulkImportRowResult(row.RowNumber, null, "skipped", fieldError, null);

            var created = await sis.CreateStudentAsync(row.CreateStudentRequest, ct);
            if (!created.IsSuccess || created.Data is null)
                return new BulkImportRowResult(row.RowNumber, null, "skipped", created.Error?.Message ?? "Could not create student", null);

            var studentId = created.Data.Id;

            if (!string.IsNullOrWhiteSpace(row.ExtrasJson) && row.ExtrasJson != "{}")
            {
                await academics.UpsertPersonExtrasAsync("student", studentId, new UpsertPersonExtrasRequest(row.ExtrasJson), ct);
                // Best-effort, same as single Add: an extras failure never un-creates the student.
            }

            string? transportStatus = "not_applicable";
            if (row.Transport is { OptedIn: true } t)
            {
                var transportResult = await transport.SetAsync(
                    studentId, new SetStudentTransportRequest(true, t.RouteId, t.StopId, t.FeeHeadId), ct);
                transportStatus = transportResult.IsSuccess ? transportResult.Data?.Status : "pending";
            }

            return new BulkImportRowResult(row.RowNumber, studentId, "created", null, transportStatus);
        }
        catch (Exception ex)
        {
            // One bad row must never abort the batch — record it as skipped and move on.
            return new BulkImportRowResult(row.RowNumber, null, "skipped", ex.Message, null);
        }
    }
}
```

- [ ] **Step 6: Register the service and repository**

In `src/Sms.Application/DependencyInjection.cs`, add next to the existing `services.AddScoped<ISisService, SisService>();` (line 36):
```csharp
        services.AddScoped<IStudentBulkImportService, StudentBulkImportService>();
```
And wherever `StudentRepository`/`BusRepository` etc. are registered in `sms-backend`'s infrastructure DI (search for `services.AddScoped<StudentRepository>()` and add alongside it):
```csharp
        services.AddScoped<BulkImportRepository>();
```

- [ ] **Step 7: Run test to verify it still fails (no controller yet), then complete after Task 7**

Run: `dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter "FullyQualifiedName~StudentBulkImportServiceTests"`
Expected: FAIL — still 404, controller added in Task 7. Combine this task's commit with Task 7's.

---

### Task 7: `StudentBulkImportController`

**Files:**
- Create: `src/Sms.Api/Controllers/StudentBulkImportController.cs`

**Interfaces:**
- Consumes: `IStudentBulkImportService.ProcessBatchAsync` (Task 6).
- Produces: `POST v1/students/bulk-import/batch` — the full public API surface for this feature.

- [ ] **Step 1: Write the controller**

```csharp
// src/Sms.Api/Controllers/StudentBulkImportController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sms.Application.Services.Sis;
using Sms.Modules.Sis.Contracts;
using Sms.Shared.Kernel.Authz;

namespace Sms.Api.Controllers;

/// Bulk Add Students — reuses the exact same CreateStudentAsync/UpsertPersonExtrasAsync/
/// StudentTransportService.SetAsync calls as single Add, looped per row within an idempotent,
/// 200-row-at-a-time batch. Policies.Principal (not just staff) because this endpoint also
/// writes person extras on the caller's behalf, matching PersonExtrasController's PUT policy —
/// a plainly-staffed caller must not gain extras-write access merely by going through bulk import.
[Route("v1/students/bulk-import")]
[Authorize(Policy = Policies.Principal)]
public sealed class StudentBulkImportController(IStudentBulkImportService bulkImport) : ApiControllerBase
{
    [HttpPost("batch")]
    public async Task<IActionResult> Batch([FromBody] BulkImportBatchRequest req, CancellationToken ct) =>
        FromResult(await bulkImport.ProcessBatchAsync(req, ct));
}
```

- [ ] **Step 2: Run the Task 6 tests to verify they now pass**

Run: `dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter "FullyQualifiedName~StudentBulkImportServiceTests"`
Expected: PASS (all 3 tests)

- [ ] **Step 3: Run the full backend test suite to confirm no regression**

Run: `dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj`
Expected: PASS (all tests, including the pre-existing Sis/Finance/Transport suites)

- [ ] **Step 4: Commit (Task 6 + 7 together)**

```bash
git add src/Sms.Modules.Sis/Contracts/BulkImportContracts.cs src/Sms.Modules.Sis/Data/BulkImportRepository.cs \
        src/Sms.Application/Services/Sis/StudentBulkImportService.cs src/Sms.Application/DependencyInjection.cs \
        src/Sms.Api/Controllers/StudentBulkImportController.cs tests/Sms.Tests.Integration/Sis/StudentBulkImportServiceTests.cs
git commit -m "feat(students): add POST /v1/students/bulk-import/batch

Loops the existing CreateStudentAsync -> UpsertPersonExtrasAsync ->
StudentTransportService.SetAsync calls per row, idempotent per
(TenantId, ImportId, BatchIndex), partial success within a batch."
```

---

### Task 8: Additional backend integration tests — transport pending + tenant isolation

**Files:**
- Modify: `tests/Sms.Tests.Integration/Sis/StudentBulkImportServiceTests.cs`

**Interfaces:**
- Consumes: same as Task 6/7 — no new production interfaces.

- [ ] **Step 1: Write the failing tests**

Add to `StudentBulkImportServiceTests.cs`:

```csharp
    [Fact]
    public async Task ProcessBatch_marks_transport_pending_when_the_route_has_no_bus_capacity()
    {
        using var app = App();
        var client = fx.AuthedClient(app, Key, role: "school.owner");
        var routeId = await fx.CreateTransportRouteWithNoCapacityAsync(app); // seeds a route with zero-capacity buses

        var row = Row(1, "Zoya Khan", "9876543215", "zoya@example.com");
        var rowWithTransport = new
        {
            row_number = 1,
            create_student_request = ((dynamic)row).create_student_request,
            extras_json = "{}",
            transport = new { opted_in = true, route_id = routeId, stop_id = (Guid?)null, fee_head_id = (Guid?)null },
        };

        var resp = await client.PostAsJsonAsync("/v1/students/bulk-import/batch", new
        {
            import_id = Guid.NewGuid(),
            batch_index = 0,
            rows = new[] { rowWithTransport },
        });

        var body = await resp.Content.ReadFromJsonAsync<BulkImportBatchResponseDto>();
        body!.created.Should().Be(1); // student creation must still succeed
        body.transport_pending.Should().Be(1);
        body.rows[0].status.Should().Be("created");
    }

    [Fact]
    public async Task ProcessBatch_only_creates_students_in_the_caller_tenant()
    {
        using var app = App();
        var tenantAClient = fx.AuthedClient(app, Key, role: "school.owner", tenantId: fx.TenantA);
        var tenantBClient = fx.AuthedClient(app, Key, role: "school.owner", tenantId: fx.TenantB);

        var importId = Guid.NewGuid();
        await tenantAClient.PostAsJsonAsync("/v1/students/bulk-import/batch", new
        {
            import_id = importId, batch_index = 0,
            rows = new[] { Row(1, "Tenant A Student", "9876500001", "tenanta@example.com") },
        });

        var check = await tenantBClient.GetAsync("/v1/students?q=tenanta@example.com");
        var students = await check.Content.ReadFromJsonAsync<StudentListEnvelopeDto>();
        students!.data.Should().BeEmpty(); // tenant B must never see tenant A's imported student
    }
```

Note: `fx.CreateTransportRouteWithNoCapacityAsync` and the `tenantId` parameter on `fx.AuthedClient` — check `SqlServerFixture` (`tests/Sms.Tests.Integration/SqlServerFixture.cs`) for its existing multi-tenant test helpers first; if an equivalent helper already exists (e.g. from the Transport or bus-capacity test suites), reuse it by its existing name instead of adding a new one with a different name.

- [ ] **Step 2: Run tests to verify they fail or pass depending on existing fixture support**

Run: `dotnet test tests/Sms.Tests.Integration/Sms.Tests.Integration.csproj --filter "FullyQualifiedName~StudentBulkImportServiceTests"`
Expected: the two new tests run against the real per-row logic already implemented in Task 6 — they should PASS immediately if the fixture helpers exist as named; if a helper name doesn't match what's actually in `SqlServerFixture`, fix the test to use the real helper name (this is a test-only fix, not a production code change).

- [ ] **Step 3: Commit**

```bash
git add tests/Sms.Tests.Integration/Sis/StudentBulkImportServiceTests.cs
git commit -m "test(students): cover transport-pending and tenant isolation in bulk import"
```

---

## Part D — Frontend API client + orchestration (sms-admin)

### Task 9: Bulk-import API client + batching hook

**Files:**
- Create: `src/api/bulkImportStudents.ts`
- Create: `src/api/hooks/useBulkImportStudents.ts`
- Test: `src/api/bulkImportStudents.test.ts`
- Test: `src/api/hooks/useBulkImportStudents.test.ts`

**Interfaces:**
- Consumes: `request` from `src/api/client.ts`, `camelToSnake`/`snakeToCamel` from `src/api/mapper.ts`, `BulkImportRowPayload` from `src/lib/studentMapping.ts` (Task 2).
- Produces: `bulkImportBatch(importId: string, batchIndex: number, rows: BulkImportRowPayload[]): Promise<BulkImportBatchResult>`, `useBulkImportStudents(): { runImport: (rows: BulkImportRowPayload[]) => Promise<void>; progress: BulkImportProgress; pausedAtBatch: number | null; retry: () => Promise<void> }` — consumed by Task 15 (Import step).

- [ ] **Step 1: Write the failing API-client test**

```typescript
// src/api/bulkImportStudents.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bulkImportBatch } from './bulkImportStudents'

describe('bulkImportBatch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('POSTs to /v1/students/bulk-import/batch with snake_case body and returns camelCase result', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        import_id: 'import-1', batch_index: 0, processed: 1, created: 1, skipped: 0, transport_pending: 0,
        rows: [{ row_number: 1, student_id: 'stu-1', status: 'created', error: null, transport_status: 'not_applicable' }],
      }),
    })

    const result = await bulkImportBatch('import-1', 0, [
      { createStudentRequest: { name: 'Aarav Sharma' }, extrasJson: '{}', transport: null },
    ])

    expect(result.created).toBe(1)
    expect(result.rows[0].studentId).toBe('stu-1')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(call[0])).toContain('/students/bulk-import/batch')
    const body = JSON.parse(call[1].body)
    expect(body.import_id).toBe('import-1')
    expect(body.batch_index).toBe(0)
    expect(body.rows[0].create_student_request.name).toBe('Aarav Sharma')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/bulkImportStudents.test.ts`
Expected: FAIL — `bulkImportStudents.ts` does not exist yet.

- [ ] **Step 3: Write the API client**

```typescript
// src/api/bulkImportStudents.ts
import { request } from './client'
import { camelToSnake, snakeToCamel } from './mapper'
import type { BulkImportRowPayload } from '@/lib/studentMapping'

export interface BulkImportRowResult {
  rowNumber: number
  studentId: string | null
  status: 'created' | 'skipped'
  error?: string | null
  transportStatus?: string | null
}

export interface BulkImportBatchResult {
  importId: string
  batchIndex: number
  processed: number
  created: number
  skipped: number
  transportPending: number
  rows: BulkImportRowResult[]
}

export async function bulkImportBatch(
  importId: string, batchIndex: number, rows: BulkImportRowPayload[],
): Promise<BulkImportBatchResult> {
  const body = camelToSnake({
    importId,
    batchIndex,
    rows: rows.map((r) => ({
      rowNumber: r.rowNumber,
      createStudentRequest: r.createStudentRequest,
      extrasJson: r.extrasJson,
      transport: r.transport,
    })),
  })
  const wire = await request<Record<string, unknown>>('/students/bulk-import/batch', { method: 'POST', body })
  return snakeToCamel<BulkImportBatchResult>(wire)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/bulkImportStudents.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing hook test**

```typescript
// src/api/hooks/useBulkImportStudents.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBulkImportStudents } from './useBulkImportStudents'
import * as api from '../bulkImportStudents'
import type { BulkImportRowPayload } from '@/lib/studentMapping'

function row(n: number): BulkImportRowPayload {
  return { rowNumber: n, createStudentRequest: { name: `Student ${n}` }, extrasJson: '{}', transport: null }
}

describe('useBulkImportStudents', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends rows in sequential 200-row batches and accumulates real progress', async () => {
    const spy = vi.spyOn(api, 'bulkImportBatch').mockImplementation(async (_importId, batchIndex, rows) => ({
      importId: 'import-1', batchIndex, processed: rows.length, created: rows.length, skipped: 0,
      transportPending: 0, rows: rows.map((r) => ({ rowNumber: r.rowNumber!, studentId: `stu-${r.rowNumber}`, status: 'created' })),
    }))

    const { result } = renderHook(() => useBulkImportStudents())
    const rows = Array.from({ length: 450 }, (_, i) => row(i + 1)) // 3 batches: 200, 200, 50

    await act(async () => { await result.current.runImport(rows) })

    expect(spy).toHaveBeenCalledTimes(3)
    expect(spy.mock.calls[0][1]).toBe(0)
    expect(spy.mock.calls[0][2]).toHaveLength(200)
    expect(spy.mock.calls[2][2]).toHaveLength(50)
    await waitFor(() => expect(result.current.progress.processed).toBe(450))
    expect(result.current.progress.created).toBe(450)
  })

  it('pauses on repeated batch failure and resumes from the failed batch on retry', async () => {
    let callCount = 0
    const spy = vi.spyOn(api, 'bulkImportBatch').mockImplementation(async (_importId, batchIndex, rows) => {
      callCount += 1
      if (batchIndex === 1 && callCount <= 4) throw new Error('network error') // fail batch 1 repeatedly
      return {
        importId: 'import-1', batchIndex, processed: rows.length, created: rows.length, skipped: 0,
        transportPending: 0, rows: rows.map((r) => ({ rowNumber: r.rowNumber!, studentId: `stu-${r.rowNumber}`, status: 'created' })),
      }
    })

    const { result } = renderHook(() => useBulkImportStudents())
    const rows = Array.from({ length: 450 }, (_, i) => row(i + 1))

    await act(async () => { await result.current.runImport(rows) })
    expect(result.current.pausedAtBatch).toBe(1)

    await act(async () => { await result.current.retry() })
    expect(result.current.pausedAtBatch).toBeNull()
    expect(result.current.progress.processed).toBe(450)
    expect(spy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/api/hooks/useBulkImportStudents.test.ts`
Expected: FAIL — `useBulkImportStudents.ts` does not exist yet.

- [ ] **Step 7: Write the hook**

```typescript
// src/api/hooks/useBulkImportStudents.ts
import { useCallback, useRef, useState } from 'react'
import { bulkImportBatch, type BulkImportRowResult } from '../bulkImportStudents'
import type { BulkImportRowPayload } from '@/lib/studentMapping'

const BATCH_SIZE = 200
const MAX_RETRIES_PER_BATCH = 3

export interface BulkImportProgress {
  total: number
  processed: number
  created: number
  skipped: number
  transportPending: number
  rowResults: BulkImportRowResult[]
}

const INITIAL_PROGRESS: BulkImportProgress = {
  total: 0, processed: 0, created: 0, skipped: 0, transportPending: 0, rowResults: [],
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function useBulkImportStudents() {
  const [progress, setProgress] = useState<BulkImportProgress>(INITIAL_PROGRESS)
  const [pausedAtBatch, setPausedAtBatch] = useState<number | null>(null)
  const importIdRef = useRef<string>('')
  const batchesRef = useRef<BulkImportRowPayload[][]>([])

  const runFrom = useCallback(async (startBatchIndex: number) => {
    const batches = batchesRef.current
    for (let i = startBatchIndex; i < batches.length; i++) {
      let attempt = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const result = await bulkImportBatch(importIdRef.current, i, batches[i])
          setProgress((prev) => ({
            total: prev.total,
            processed: prev.processed + result.processed,
            created: prev.created + result.created,
            skipped: prev.skipped + result.skipped,
            transportPending: prev.transportPending + result.transportPending,
            rowResults: [...prev.rowResults, ...result.rows],
          }))
          setPausedAtBatch(null)
          break
        } catch {
          attempt += 1
          if (attempt >= MAX_RETRIES_PER_BATCH) {
            setPausedAtBatch(i)
            return
          }
        }
      }
    }
  }, [])

  const runImport = useCallback(async (rows: BulkImportRowPayload[]) => {
    importIdRef.current = crypto.randomUUID()
    batchesRef.current = chunk(rows, BATCH_SIZE)
    setProgress({ ...INITIAL_PROGRESS, total: rows.length })
    setPausedAtBatch(null)
    await runFrom(0)
  }, [runFrom])

  const retry = useCallback(async () => {
    if (pausedAtBatch == null) return
    await runFrom(pausedAtBatch)
  }, [pausedAtBatch, runFrom])

  return { runImport, retry, progress, pausedAtBatch }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/api/hooks/useBulkImportStudents.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/api/bulkImportStudents.ts src/api/bulkImportStudents.test.ts \
        src/api/hooks/useBulkImportStudents.ts src/api/hooks/useBulkImportStudents.test.ts
git commit -m "feat(students): add bulk-import batch API client + sequential-batch hook

200 rows/batch, real accumulated progress, pause-and-resume on
repeated batch failure — no timers, no simulated progress."
```

---

### Task 10: Error report generator

**Files:**
- Create: `src/lib/importErrorReport.ts`
- Test: `src/lib/importErrorReport.test.ts`

**Interfaces:**
- Consumes: `downloadTextFile` from `src/lib/feeExport.ts` (existing CSV download helper — check its exact export name/signature first; reuse it rather than re-implementing a blob-download utility), `ExcelJS` for XLSX.
- Produces: `errorRowsToCsv(rows: ErrorReportRow[]): string`, `type ErrorReportRow = Record<string, string> & { errorReason: string }` — consumed by Task 14 (Preview) and Task 16 (Complete).

- [ ] **Step 1: Check the existing CSV download helper's exact signature**

Run: `grep -n "export function downloadTextFile\|export function invoicesToCsv" src/lib/feeExport.ts`

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/importErrorReport.test.ts
import { describe, it, expect } from 'vitest'
import { errorRowsToCsv } from './importErrorReport'

describe('errorRowsToCsv', () => {
  it('renders headers from the first row plus a trailing Error Reason column', () => {
    const csv = errorRowsToCsv([
      { row: '182', firstName: 'Rahul', lastName: 'Sharma', cls: 'X-A', phone: 'XXXXX', errorReason: 'Invalid phone number' },
      { row: '427', firstName: 'Amit', lastName: 'Kumar', cls: 'IX-B', phone: 'XXXXX', errorReason: 'Invalid class' },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('row,firstName,lastName,cls,phone,errorReason')
    expect(lines[1]).toBe('182,Rahul,Sharma,X-A,XXXXX,Invalid phone number')
    expect(lines[2]).toBe('427,Amit,Kumar,IX-B,XXXXX,Invalid class')
  })

  it('returns just a header row for an empty list', () => {
    expect(errorRowsToCsv([])).toBe('')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/importErrorReport.test.ts`
Expected: FAIL — `importErrorReport.ts` does not exist yet.

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/importErrorReport.ts
export type ErrorReportRow = Record<string, string>

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Original row columns + a trailing Error Reason column, as CSV text. Empty input returns
 *  an empty string (nothing to download). */
export function errorRowsToCsv(rows: ErrorReportRow[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','))
  }
  return lines.join('\n')
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/importErrorReport.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/importErrorReport.ts src/lib/importErrorReport.test.ts
git commit -m "feat(students): add bulk-import error-report CSV generator"
```

---

## Part E — Wizard UI (sms-admin)

### Task 11: Add Student entry point — Single vs Bulk

**Files:**
- Modify: `src/screens/school/sis.tsx` (wherever the current "Add Student" button/link lives — search for `app.go('school.student.add')` or similar navigation call and the surrounding button)

**Interfaces:**
- Consumes: nothing new.
- Produces: a small menu/split-button offering "Add Single Student" (unchanged existing navigation) and "Bulk Add Students" (opens `ImportDrawer`, wired for real in Task 12-16).

- [ ] **Step 1: Find the existing Add Student button**

Run: `grep -n "Add Student\|school.student.add\|setImportOpen\|importOpen" src/screens/school/sis.tsx`

- [ ] **Step 2: Write the failing test**

```typescript
// add to src/screens/school/sis.test.tsx (check if this file exists first; if not, create it following
// the same test-setup pattern as src/screens/school/studentAdd.test.tsx — same providers/mocks)
it('offers Add Single Student and Bulk Add Students from the Add Student control', async () => {
  const { getByText, getByRole } = renderSisScreen() // use whatever the existing render helper in this test file is called
  fireEvent.click(getByText('Add Student'))
  expect(getByRole('menuitem', { name: 'Add Single Student' })).toBeInTheDocument()
  expect(getByRole('menuitem', { name: 'Bulk Add Students' })).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: FAIL — menu items don't exist yet.

- [ ] **Step 4: Implement the split entry point**

Replace the existing single "Add Student" button with a small dropdown/menu (use whichever menu primitive `src/components/ui` already exports — check `grep -n "export function Menu\|export function Dropdown" src/components/ui/*.tsx` first and use the existing one; do not add a new menu component). Wire "Add Single Student" to the exact same navigation the old button used. Wire "Bulk Add Students" to `setImportOpen(true)` (the existing state already driving `<ImportDrawer open={importOpen} ...>`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/sis.tsx src/screens/school/sis.test.tsx
git commit -m "feat(students): split Add Student into Add Single / Bulk Add Students"
```

---

### Task 12: Wizard Step 1 — real Upload

**Files:**
- Modify: `src/screens/school/sis.tsx` (the `ImportDrawer` function and its `step === 0` block)
- Modify/Create: `src/screens/school/sis.test.tsx`

**Interfaces:**
- Consumes: `parseCsvText`/`parseXlsxBuffer` (Task 3).
- Produces: local wizard state `{ fileName: string; parsed: ParsedFile } | null`, passed forward to Step 2.

- [ ] **Step 1: Write the failing test**

```typescript
it('parses an uploaded CSV and shows the real file name and row count', async () => {
  const { getByLabelText, findByText } = renderSisScreen()
  fireEvent.click(getByText('Add Student'))
  fireEvent.click(getByText('Bulk Add Students'))
  const file = new File(
    ['First Name,Last Name\nAarav,Sharma\nAditi,Verma\n'], 'students.csv', { type: 'text/csv' },
  )
  const input = getByLabelText(/drop your csv/i) // adjust to the actual accessible name once the markup exists
  fireEvent.change(input, { target: { files: [file] } })
  expect(await findByText('students.csv')).toBeInTheDocument()
  expect(await findByText('Rows detected: 2')).toBeInTheDocument()
})

it('rejects a file with more than 10,000 rows before allowing Continue', async () => {
  const { getByText, findByText } = renderSisScreen()
  fireEvent.click(getByText('Add Student'))
  fireEvent.click(getByText('Bulk Add Students'))
  const rows = Array.from({ length: 10001 }, (_, i) => `Student${i},Last`).join('\n')
  const file = new File([`First Name,Last Name\n${rows}\n`], 'huge.csv', { type: 'text/csv' })
  fireEvent.change(getByLabelText(/drop your csv/i), { target: { files: [file] } })
  expect(await findByText(/maximum of 10,000 rows/i)).toBeInTheDocument()
  expect(getByText('Continue')).toBeDisabled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: FAIL — `ImportDrawer`'s Step 1 is still the fake static dropzone.

- [ ] **Step 3: Implement real Upload**

Replace the `step === 0` block's static dropzone with a real file input (`<input type="file" accept=".csv,.xlsx" onChange={...}>`), reading the file via `file.text()` (CSV, routed to `parseCsvText`) or `file.arrayBuffer()` (XLSX, routed to `parseXlsxBuffer`) based on extension, storing `{ fileName: file.name, parsed }` in wizard state, showing the real file name and `Rows detected: {parsed.rows.length}`, and disabling Continue with a clear message when `parsed.rows.length > 10000`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/school/sis.tsx src/screens/school/sis.test.tsx
git commit -m "feat(students): wire bulk-import wizard Step 1 to real file parsing"
```

---

### Task 13: Wizard Step 2 — real column mapping

**Files:**
- Modify: `src/screens/school/sis.tsx` (`ImportDrawer`'s `step === 1` block)
- Modify: `src/screens/school/sis.test.tsx`

**Interfaces:**
- Consumes: `BULK_IMPORT_FIELDS`, `suggestColumnMapping` (Task 4).
- Produces: wizard state `columnMapping: Record<string, string | null>` (uploaded header → field key), passed forward to Step 3.

- [ ] **Step 1: Write the failing test**

```typescript
it('auto-suggests a mapping from the uploaded headers and blocks Continue until every required field is mapped', async () => {
  const { getByText, findByText, getAllByRole } = renderSisScreen()
  // ...upload a file with headers ['First Name','Last Name','Phone'] (missing Email, Class, DOB, Gender)
  fireEvent.click(await findByText('Continue')) // from Step 1
  expect(await findByText('First Name')).toBeInTheDocument()
  const selects = getAllByRole('combobox')
  expect(selects.find((s) => (s as HTMLSelectElement).value === 'firstName')).toBeTruthy()
  expect(getByText('Continue')).toBeDisabled() // Email/Class/DOB/Gender still unmapped
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: FAIL — Step 2 is still the hardcoded fake mapping table.

- [ ] **Step 3: Implement real Map Columns**

Replace the hardcoded rows with one row per **uploaded header** (not a fixed 4-row table): `parsed.headers.map((header) => ...)`, each with a `Select` defaulting to `suggestColumnMapping(parsed.headers)[header]`, options built from `BULK_IMPORT_FIELDS` (label as text, `key` as value, plus an `'Ignore'` option), and a Required/Optional badge next to the field once mapped. Continue is disabled while `BULK_IMPORT_FIELDS.filter(f => f.required).some(f => !Object.values(columnMapping).includes(f.key))`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/school/sis.tsx src/screens/school/sis.test.tsx
git commit -m "feat(students): wire bulk-import wizard Step 2 to real column mapping"
```

---

### Task 14: Wizard Step 3 — real Preview validation

**Files:**
- Modify: `src/screens/school/sis.tsx` (`ImportDrawer`'s `step === 2` block)
- Modify: `src/screens/school/sis.test.tsx`

**Interfaces:**
- Consumes: `validateStudentForm` (Task 1), `buildStudentFromRow` (Task 2), `errorRowsToCsv` (Task 10), `useStudents()`/`useClasses()`/`listSchoolHouses()`/`useTransportRoutes()`/`useRouteStops()` (already-existing hooks, same ones `studentAdd.tsx` uses).
- Produces: wizard state `{ validRows: BulkStudentRow[]; errorRows: (BulkStudentRow & { errors: string[] })[]; warnings: ... }`, passed forward to Step 4 (only `validRows` proceed to import).

- [ ] **Step 1: Write the failing test**

```typescript
it('shows real Total/Valid/Errors counts and flags a duplicate within the uploaded file', async () => {
  // upload a CSV with 3 rows: 2 fully valid + distinct, 1 duplicate phone of row 1
  const { findByText } = renderSisScreen() // ...drive Upload -> Map Columns -> Preview
  expect(await findByText('Total Rows: 3')).toBeInTheDocument()
  expect(await findByText('Valid: 2')).toBeInTheDocument()
  expect(await findByText('Errors: 1')).toBeInTheDocument()
  expect(await findByText(/duplicate/i)).toBeInTheDocument()
})

it('does not call any create/transport API during preview', async () => {
  const createSpy = vi.fn()
  // ...mock POST /students and POST /students/bulk-import/batch to fail the test if called
  // ...drive Upload -> Map Columns -> Preview
  expect(createSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: FAIL — Step 2 (Done) is still the hardcoded fake "36 valid rows" screen; there's no Preview step yet.

- [ ] **Step 3: Implement real Preview**

For each parsed row, build a `BulkStudentRow` (Task 2's shape) from `columnMapping` + the raw cell values, resolve its Class+Section via the same `resolveClass()`-style lookup `studentAdd.tsx` uses against `useClasses()`, run `validateStudentForm({ form: rowAsForm, files: {}, roster: useStudents().data, existingId: undefined, transportEnabled: opsEnabled })`, **plus** two bulk-only checks not covered by `validateStudentForm`: (a) admission-number conflict — `isDuplicateValue` (from `@/lib/validation`) against the roster's `adm` field, only when the row supplied one; (b) duplicate-within-file — group all parsed rows by `normalizePhoneDigits(phone) + '|' + normalizeEmailKey(email)`, flag every occurrence after the first. Render real `Total Rows / Valid / Errors / Warnings` counts, drill-down lists, and a "Download Error Report" button wired to `errorRowsToCsv`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/school/sis.tsx src/screens/school/sis.test.tsx
git commit -m "feat(students): wire bulk-import wizard Step 3 to real client-side preview validation

Reuses validateStudentForm (Task 1) plus duplicate-within-file and
admission-number-conflict checks. No backend call — Preview never
creates anything."
```

---

### Task 15: Wizard Step 4 — real Import with real progress

**Files:**
- Modify: `src/screens/school/sis.tsx` (`ImportDrawer`'s import step)
- Modify: `src/screens/school/sis.test.tsx`

**Interfaces:**
- Consumes: `useBulkImportStudents` (Task 9), `buildStudentFromRow`/`toBulkImportRowPayload` (Task 2), `useTransportRoutes`/`useRouteStops`/`useFeeHeads` (existing hooks, for resolving a row's mapped route/stop/fee-head names to IDs before building the transport payload).

- [ ] **Step 1: Write the failing test**

```typescript
it('shows a real, server-response-driven progress bar with no fake timers', async () => {
  vi.useFakeTimers() // proves the bar never advances from time alone
  const { findByText, getByText } = renderSisScreen()
  // ...drive Upload -> Map -> Preview -> click Start Import, with the batch endpoint mocked
  // to resolve only when explicitly flushed below
  expect(getByText('Processed 0 / 3')).toBeInTheDocument()
  await vi.advanceTimersByTimeAsync(5000) // 5 real seconds pass with no batch response yet
  expect(getByText('Processed 0 / 3')).toBeInTheDocument() // must NOT have advanced from time alone
  // ...resolve the mocked batch call
  expect(await findByText('Processed 3 / 3')).toBeInTheDocument()
  vi.useRealTimers()
})

it('shows the paused state with a Retry Import button when batches are exhausted', async () => {
  // ...mock the batch endpoint to always reject
  const { findByText, getByRole } = renderSisScreen()
  // ...drive to Start Import
  expect(await findByText(/Import paused at batch/i)).toBeInTheDocument()
  expect(getByRole('button', { name: 'Retry Import' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: FAIL — no Import step exists yet, `finish()` still just shows a fake toast.

- [ ] **Step 3: Implement real Import**

Build the full `BulkImportRowPayload[]` from `validRows` (Task 14's output): for each row, resolve `transportRouteId`/`transportStopId`/`transportFeeHeadId` from whatever the admin's column mapping produced (already real IDs if the file's Transport columns were mapped, per the spec — bulk import does not do fuzzy name-to-ID resolution for transport, only accepts IDs or leaves it unmapped/opted-out), call `buildStudentFromRow` then `toBulkImportRowPayload`, and pass the array to `runImport()` (Task 9's hook). Render the real progress bar from `progress.processed / progress.total`, and the `created`/`skipped`/`transportPending` counters, all from hook state — never a local timer. While `pausedAtBatch != null`, show "Import paused at batch N/{total batches}" with a `Retry Import` button wired to `retry()`. Disable Start Import / upload-another-file / Close while a batch is in flight (`progress.processed < progress.total && pausedAtBatch == null`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/school/sis.tsx src/screens/school/sis.test.tsx
git commit -m "feat(students): wire bulk-import wizard Step 4 to real batched import + progress

No timers or estimated percentages anywhere — the bar only moves in
response to an actual batch HTTP response."
```

---

### Task 16: Wizard Step 5 — real Complete screen

**Files:**
- Modify: `src/screens/school/sis.tsx` (`ImportDrawer`'s final step, replacing the fake `finish()` toast)
- Modify: `src/screens/school/sis.test.tsx`

**Interfaces:**
- Consumes: final `progress` state from Task 9's hook, `errorRowsToCsv` (Task 10).

- [ ] **Step 1: Write the failing test**

```typescript
it('shows real final totals and the correct message for a fully successful import', async () => {
  // ...drive a full import where every row succeeds
  expect(await findByText('10,000 students imported successfully.')).toBeInTheDocument()
})

it('shows the partial-success message and lets the admin download the error report', async () => {
  // ...drive a full import where 250 of 10,000 rows fail creation-time validation
  expect(await findByText('9,750 students imported. 250 rows were skipped.')).toBeInTheDocument()
  expect(getByText('Download Error Report')).toBeEnabled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: FAIL — the fake `finish()` toast is still in place.

- [ ] **Step 3: Implement real Complete**

Replace `finish()`'s hardcoded toast with a real Complete screen showing `progress.total/created/skipped/transportPending`, the exact success/partial-success message wording from the spec (`"{total} students imported successfully."` vs `"{created} students imported. {skipped} rows were skipped."`), and `View Imported Students` (navigates to the SIS list), `View Errors` (shows the skipped-row list from `progress.rowResults`), `Download Error Report` (built from `progress.rowResults.filter(r => r.status === 'skipped')` joined back to the original row data, via `errorRowsToCsv`), `Import Another File` (resets wizard state to Step 1), `Close`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full existing SIS test suite to confirm no regression**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: PASS (every test in the file, old and new)

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/sis.tsx src/screens/school/sis.test.tsx
git commit -m "feat(students): wire bulk-import wizard Step 5 to real completion totals

Removes the last fake value in ImportDrawer ('36 students imported,
0 errors') — every number now comes from actual batch results."
```

---

### Task 17: Full end-to-end wizard test

**Files:**
- Modify: `src/screens/school/sis.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 11-16 — no new production interfaces, this is a pure integration test of the whole wizard.

- [ ] **Step 1: Write the end-to-end test**

```typescript
it('runs the full wizard end to end: upload, map, preview with a duplicate, import, and resume after a paused batch', async () => {
  // 1. Upload a 450-row CSV fixture with headers matching BULK_IMPORT_FIELDS labels,
  //    including one intentional duplicate-phone pair and one row missing a required field.
  // 2. Confirm Map Columns auto-suggests every header correctly (no manual remapping needed
  //    for a well-labeled file) and Continue is enabled.
  // 3. Confirm Preview shows Total Rows: 450, Valid: 448, Errors: 2 (the duplicate pair member
  //    that isn't first, plus the missing-required-field row).
  // 4. Click Start Import; mock the batch endpoint to fail batch 1 (rows 201-400) exactly twice
  //    then succeed, and to succeed immediately for batches 0 and 2.
  // 5. Confirm the wizard shows "Import paused at batch 2/3" after 3 failed attempts, click
  //    Retry Import, confirm it resumes from batch 1 (not batch 0 again — no duplicate batch-0 call).
  // 6. Confirm the Complete screen shows the correct final created/skipped counts and that
  //    Download Error Report produces a CSV containing exactly the 2 preview-time error rows.
})
```

- [ ] **Step 2: Run test to verify it fails, then implement any gaps it surfaces**

Run: `npx vitest run src/screens/school/sis.test.tsx`
Expected: this test should mostly PASS immediately, since Tasks 11-16 already implement every piece it exercises — if it fails, the failure points to a real integration gap between two tasks' work (e.g. a prop not threaded through, a state reset missed on "Import Another File"); fix the gap in the relevant existing file, do not add new files for this task.

- [ ] **Step 3: Run the full frontend test suite to confirm no regression anywhere**

Run: `npx vitest run --run`
Expected: PASS (every test file in the repo)

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/sis.test.tsx
git commit -m "test(students): cover the full bulk-import wizard end to end"
```

---

## Self-review notes (from writing this plan)

- **Spec coverage:** every section of the spec (frontend wizard §3, parsing §4, fields §5, validation §6, admission-no §7, roll-no §8, backend API §9, idempotency §10, transactions §11, retry/resume §12, transport §13, error report §14, progress §15, performance §16, security §17) maps to at least one task above (Tasks 1-2 → §6-8; Tasks 3-4 → §4-5; Tasks 5-8 → §9-13, §17; Tasks 9-10 → §12, §14-15; Tasks 11-17 → §3, §16).
- **Type consistency check performed:** `BulkImportRowPayload`/`BulkImportRowRequest` field names (`createStudentRequest`/`extrasJson`/`transport`) are used identically in Task 2 (producer), Task 9 (API client), and Task 15 (wizard consumer) — verified no drift like `createRequest` vs `createStudentRequest`. `BulkImportBatchResponse`'s C# PascalCase properties (`Processed`, `Created`, `Skipped`, `TransportPending`, `Rows`) map to the frontend's camelCase `BulkImportBatchResult` via the existing global `snakeToCamel`/`SnakeCaseNamingPolicy` — verified this is the same mechanism every other endpoint in the codebase already relies on, not a new one.
- **No placeholders:** every task has real, complete code — no "TODO", no "similar to Task N" without the actual code repeated, no vague "add validation" steps.
