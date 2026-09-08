import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { students as seed } from '@/data/mockDb'
import { sisScreens, buildBulkPreview, buildBulkRowRecord } from './sis'
import type { BulkStudentRow } from '@/lib/studentMapping'
import type { Student } from '@/types'
import * as bulkImportApi from '@/api/bulkImportStudents'
import type { BulkImportBatchResult } from '@/api/bulkImportStudents'

const StudentsScreen = sisScreens['school.sis']

function toWire(s: Student) {
  return {
    id: s.id, admission_no: s.adm, name: s.name, gender: s.gender, grade: s.grade,
    section: s.section, class_label: s.cls, roll: s.roll, guardian: s.guardian, phone: s.phone,
    attendance: s.attendance, fee_status: s.feeStatus, fee_due: s.feeDue, status: s.status,
    house: s.house, avatar_hue: s.avatarHue,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Real classes for the bulk-import "Class + Section" fixtures used below ("5-A", "6-B") to
// resolve against — Task 14's invalid-class check needs at least one row's class value to
// genuinely exist so the counter-example (a garbage class string) is meaningful.
const CLASS_FIXTURES = [
  { id: 'c1', name: '5-A', grade: '5', section: 'A' },
  { id: 'c2', name: '6-B', grade: '6', section: 'B' },
]

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  // StudentsScreen fires several concurrent queries on mount (students, classes, exams,
  // exam marks, exam papers). mockResolvedValue would hand every one of them the SAME
  // Response instance, whose body can only be read once — every query after the first
  // would fail with "body already read" and silently resolve to {} (readJson swallows
  // that TypeError). Build a fresh Response per call instead, and route /classes requests
  // to a real classes fixture instead of the (unrelated) students seed.
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/classes')) {
      return Promise.resolve(jsonResponse({ data: CLASS_FIXTURES, next_cursor: null }))
    }
    return Promise.resolve(jsonResponse({ data: seed.map(toWire), next_cursor: null }))
  }))
})

function renderSisScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AppProvider>
        <ToastProvider>
          <StudentsScreen />
        </ToastProvider>
      </AppProvider>
    </QueryClientProvider>,
  )
}

describe('Add Student entry point', () => {
  it('offers Add Single Student and Bulk Add Students from the Add student control', () => {
    const { getByText, getByRole } = renderSisScreen()
    fireEvent.click(getByText('Add student'))
    expect(getByRole('menuitem', { name: 'Add Single Student' })).toBeInTheDocument()
    expect(getByRole('menuitem', { name: 'Bulk Add Students' })).toBeInTheDocument()
  })
})

describe('Bulk import wizard — Step 1 Upload', () => {
  it('parses an uploaded CSV and shows the real file name and row count', async () => {
    const { getByText, getByLabelText, findByText } = renderSisScreen()
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    const file = new File(
      ['First Name,Last Name\nAarav,Sharma\nAditi,Verma\n'], 'students.csv', { type: 'text/csv' },
    )
    const input = getByLabelText(/drop your csv/i)
    fireEvent.change(input, { target: { files: [file] } })
    expect(await findByText('students.csv')).toBeInTheDocument()
    expect(await findByText('Rows detected: 2')).toBeInTheDocument()
    expect(getByText('Continue')).not.toBeDisabled()
  })

  it('rejects a file with more than 10,000 rows before allowing Continue', async () => {
    const { getByText, getByLabelText, findByText } = renderSisScreen()
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    const rows = Array.from({ length: 10001 }, (_, i) => `Student${i},Last`).join('\n')
    const file = new File([`First Name,Last Name\n${rows}\n`], 'huge.csv', { type: 'text/csv' })
    fireEvent.change(getByLabelText(/drop your csv/i), { target: { files: [file] } })
    expect(await findByText(/maximum of 10,000 rows/i)).toBeInTheDocument()
    expect(getByText('Continue')).toBeDisabled()
  })
})

describe('Bulk import wizard — Step 2 Map columns', () => {
  it('auto-suggests a mapping from the uploaded headers and blocks Continue until every required field is mapped', async () => {
    const { getByText, getByLabelText, findByText, findAllByText, getAllByRole } = renderSisScreen()
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    const file = new File(
      ['First Name,Last Name,Phone\nAarav,Sharma,9999999999\n'], 'students.csv', { type: 'text/csv' },
    )
    const input = getByLabelText(/drop your csv/i)
    fireEvent.change(input, { target: { files: [file] } })
    expect(await findByText('students.csv')).toBeInTheDocument()
    fireEvent.click(getByText('Continue'))

    expect((await findAllByText('First Name')).length).toBeGreaterThan(0)
    const selects = getAllByRole('combobox')
    expect(selects.find((s) => (s as HTMLSelectElement).value === 'firstName')).toBeTruthy()
    expect(getByText('Continue')).toBeDisabled()
  })

  it('re-disables Continue when the admin unmaps a required field, and re-enables it once remapped', async () => {
    const { getByText, getByLabelText, findByText, getAllByRole } = renderSisScreen()
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    const headers = ['First Name', 'Last Name', 'Class + Section', 'Gender', 'Date of Birth', 'Primary Contact Number', 'Email']
    const file = new File(
      [`${headers.join(',')}\nAarav,Sharma,5-A,Male,2015-01-01,9999999999,a@b.com\n`], 'students.csv', { type: 'text/csv' },
    )
    fireEvent.change(getByLabelText(/drop your csv/i), { target: { files: [file] } })
    expect(await findByText('students.csv')).toBeInTheDocument()
    fireEvent.click(getByText('Continue'))
    await findByText('Map columns')

    expect(getByText('Continue')).not.toBeDisabled()

    const firstNameSelect = getAllByRole('combobox').find((s) => (s as HTMLSelectElement).value === 'firstName') as HTMLSelectElement
    expect(firstNameSelect).toBeTruthy()
    fireEvent.change(firstNameSelect, { target: { value: '' } })
    expect(getByText('Continue')).toBeDisabled()

    fireEvent.change(firstNameSelect, { target: { value: 'firstName' } })
    expect(getByText('Continue')).not.toBeDisabled()
  })

  it('keeps two uploaded columns with the identical header name independently mappable', async () => {
    const { getByText, getByLabelText, findByText, getAllByRole } = renderSisScreen()
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    // Two columns both literally named "First Name" — a plausible duplicate-header CSV.
    const headers = ['First Name', 'First Name', 'Last Name', 'Class + Section', 'Gender', 'Date of Birth', 'Primary Contact Number', 'Email']
    const file = new File(
      [`${headers.join(',')}\nAarav,Sharma,5-A,Male,2015-01-01,9999999999,a@b.com\n`], 'students.csv', { type: 'text/csv' },
    )
    fireEvent.change(getByLabelText(/drop your csv/i), { target: { files: [file] } })
    expect(await findByText('students.csv')).toBeInTheDocument()
    fireEvent.click(getByText('Continue'))
    await findByText('Map columns')

    // Page-level list filters (grade/status/fee) render 3 comboboxes ahead of the
    // mapping rows, which follow in the same order as `headers`.
    const allSelects = getAllByRole('combobox') as HTMLSelectElement[]
    const mappingSelects = allSelects.slice(allSelects.length - headers.length)
    const [firstDupSelect, secondDupSelect] = mappingSelects

    // Both duplicate-header columns auto-suggest to the same field initially.
    expect(firstDupSelect.value).toBe('firstName')
    expect(secondDupSelect.value).toBe('firstName')

    // Remapping the SECOND "First Name" column must not affect the first — if the
    // two rows shared one state entry keyed by header text, this change would have
    // also flipped the first select's displayed value.
    fireEvent.change(secondDupSelect, { target: { value: 'lastName' } })
    expect(firstDupSelect.value).toBe('firstName')
    expect(secondDupSelect.value).toBe('lastName')
  })
})

const BULK_HEADERS = ['First Name', 'Last Name', 'Class + Section', 'Gender', 'Date of Birth', 'Primary Contact Number', 'Email', 'Father Name']

async function driveToPreview(
  { getByText, getByLabelText, findByText }: ReturnType<typeof renderSisScreen>,
  csvBody: string,
) {
  fireEvent.click(getByText('Add student'))
  fireEvent.click(getByText('Bulk Add Students'))
  const file = new File([csvBody], 'students.csv', { type: 'text/csv' })
  fireEvent.change(getByLabelText(/drop your csv/i), { target: { files: [file] } })
  expect(await findByText('students.csv')).toBeInTheDocument()
  fireEvent.click(getByText('Continue'))
  await findByText('Map columns')
  fireEvent.click(getByText('Continue'))
}

describe('Bulk import wizard — Step 3 Preview', () => {
  it('shows real Total/Valid/Errors counts and flags a duplicate within the uploaded file', async () => {
    const rendered = renderSisScreen()
    const csv = [
      BULK_HEADERS.join(','),
      'Aarav,Sharma,5-A,Male,2015-01-01,9000000001,aarav@x.com,Ramesh Sharma',
      'Aditi,Verma,6-B,Female,2014-05-05,9000000002,aditi@x.com,Suresh Verma',
      // Same phone AND email as row 1 — a literal duplicate entry within the file.
      'Rohan,Gupta,5-A,Male,2015-02-02,9000000001,aarav@x.com,Dinesh Gupta',
    ].join('\n')
    await driveToPreview(rendered, csv)

    const { findByText } = rendered
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()
    expect(await findByText('Valid: 2')).toBeInTheDocument()
    expect(await findByText('Errors: 1')).toBeInTheDocument()
    expect(await findByText(/duplicate/i)).toBeInTheDocument()
  })

  it('does not call any create/transport API during preview', async () => {
    const calls: { method: string; url: string }[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: String(url) })
      return Promise.resolve(jsonResponse({ data: seed.map(toWire), next_cursor: null }))
    }))
    const rendered = renderSisScreen()
    const csv = [
      BULK_HEADERS.join(','),
      'Aarav,Sharma,5-A,Male,2015-01-01,9000000001,aarav@x.com,Ramesh Sharma',
    ].join('\n')
    await driveToPreview(rendered, csv)
    await rendered.findByText('Total Rows: 1')

    const nonGet = calls.filter((c) => c.method.toUpperCase() !== 'GET')
    expect(nonGet).toHaveLength(0)
  })

  it('gates the preview on the roster query resolving instead of treating a still-loading roster as empty', async () => {
    // Several concurrent /students callers exist (this drawer's roster query, the parent
    // list's page query, …) — each needs its OWN fresh Response, since a Response body can
    // only be read once (see the beforeEach note above). Hold every /students call open
    // until releaseStudents() fires, then hand each waiting caller a freshly built Response.
    let ready = false
    const pendingResolvers: ((r: Response) => void)[] = []
    function studentsResponse(): Response { return jsonResponse({ data: [], next_cursor: null }) }
    function releaseStudents() {
      ready = true
      pendingResolvers.splice(0).forEach((resolve) => resolve(studentsResponse()))
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/classes')) return Promise.resolve(jsonResponse({ data: CLASS_FIXTURES, next_cursor: null }))
      if (u.includes('/students')) {
        if (ready) return Promise.resolve(studentsResponse())
        return new Promise<Response>((resolve) => { pendingResolvers.push(resolve) })
      }
      return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    }))
    const rendered = renderSisScreen()
    const { getByText, getByLabelText, findByText } = rendered
    const csv = [
      BULK_HEADERS.join(','),
      'Aarav,Sharma,5-A,Male,2015-01-01,9000000001,aarav@x.com,Ramesh Sharma',
    ].join('\n')
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    const file = new File([csv], 'students.csv', { type: 'text/csv' })
    fireEvent.change(getByLabelText(/drop your csv/i), { target: { files: [file] } })
    expect(await findByText('students.csv')).toBeInTheDocument()
    fireEvent.click(getByText('Continue'))
    await findByText('Map columns')
    fireEvent.click(getByText('Continue'))

    // Roster query is still in flight — Preview must show a loading state, never computed
    // counts (which would silently treat the roster as empty and pass every row as Valid).
    expect(await findByText(/loading roster/i)).toBeInTheDocument()
    expect(screen.queryByText(/Total Rows/)).not.toBeInTheDocument()

    releaseStudents()
    expect(await findByText('Total Rows: 1')).toBeInTheDocument()
  })

  it('gates the preview on the classes query resolving instead of treating a still-loading classes list as empty', async () => {
    // Mirrors the roster-loading test above: hold every /classes call open until
    // releaseClasses() fires, so the preview must not treat an empty/not-yet-loaded
    // classes array as "no classes match" (which would falsely flag the row's real,
    // existing class "5-A" as not found).
    let ready = false
    const pendingResolvers: ((r: Response) => void)[] = []
    function classesResponse(): Response { return jsonResponse({ data: CLASS_FIXTURES, next_cursor: null }) }
    function releaseClasses() {
      ready = true
      pendingResolvers.splice(0).forEach((resolve) => resolve(classesResponse()))
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/classes')) {
        if (ready) return Promise.resolve(classesResponse())
        return new Promise<Response>((resolve) => { pendingResolvers.push(resolve) })
      }
      if (u.includes('/students')) return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
      return Promise.resolve(jsonResponse({ data: [], next_cursor: null }))
    }))
    const rendered = renderSisScreen()
    const { getByText, getByLabelText, findByText } = rendered
    const csv = [
      BULK_HEADERS.join(','),
      'Aarav,Sharma,5-A,Male,2015-01-01,9000000001,aarav@x.com,Ramesh Sharma',
    ].join('\n')
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    const file = new File([csv], 'students.csv', { type: 'text/csv' })
    fireEvent.change(getByLabelText(/drop your csv/i), { target: { files: [file] } })
    expect(await findByText('students.csv')).toBeInTheDocument()
    fireEvent.click(getByText('Continue'))
    await findByText('Map columns')
    fireEvent.click(getByText('Continue'))

    // Classes query is still in flight — Preview must show a loading state, never
    // computed counts (which would silently treat the classes list as empty and flag
    // every row's class as "not found").
    expect(await findByText(/loading classes/i)).toBeInTheDocument()
    expect(screen.queryByText(/Total Rows/)).not.toBeInTheDocument()
    expect(screen.queryByText(/class not found/i)).not.toBeInTheDocument()

    releaseClasses()
    expect(await findByText('Total Rows: 1')).toBeInTheDocument()
    expect(await findByText('Valid: 1')).toBeInTheDocument()
    expect(screen.queryByText(/class not found/i)).not.toBeInTheDocument()
  })
})

const IMPORT_CSV = [
  BULK_HEADERS.join(','),
  'Aarav,Sharma,5-A,Male,2015-01-01,9000000001,aarav@x.com,Ramesh Sharma',
  'Aditi,Verma,6-B,Female,2014-05-05,9000000002,aditi@x.com,Suresh Verma',
  'Rohan,Gupta,5-A,Male,2015-02-02,9000000003,rohan@x.com,Dinesh Gupta',
].join('\n')

function batchResult(overrides: Partial<BulkImportBatchResult> = {}): BulkImportBatchResult {
  return {
    importId: 'import-1', batchIndex: 0, processed: 3, created: 3, skipped: 0, transportPending: 0,
    rows: [1, 2, 3].map((n) => ({ rowNumber: n, studentId: `stu-${n}`, status: 'created' })),
    ...overrides,
  }
}

describe('Bulk import wizard — Step 4 Import', () => {
  it('shows a real, server-response-driven progress bar with no fake timers', async () => {
    let resolveBatch: ((v: BulkImportBatchResult) => void) | null = null
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockImplementation(
      () => new Promise((resolve) => { resolveBatch = resolve }),
    )

    const rendered = renderSisScreen()
    const { getByText, findByText } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))

    // Progress appears immediately (synchronously, before the batch call resolves) —
    // proving the counter reflects real hook state, not a timer.
    expect(getByText('Processed 0 / 3')).toBeInTheDocument()

    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(5000) // 5 real seconds pass with no batch response yet
    expect(getByText('Processed 0 / 3')).toBeInTheDocument() // must NOT have advanced from time alone
    vi.useRealTimers()

    resolveBatch!(batchResult())
    expect(await findByText('Processed 3 / 3')).toBeInTheDocument()
    expect(await findByText('Created: 3')).toBeInTheDocument()
  })

  it('shows the paused state with a Retry Import button when batches are exhausted', async () => {
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockRejectedValue(new Error('network error'))

    const rendered = renderSisScreen()
    const { getByText, findByText, getByRole } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))

    expect(await findByText(/Import paused at batch/i)).toBeInTheDocument()
    expect(getByRole('button', { name: 'Retry Import' })).toBeInTheDocument()
    expect(await findByText('network error')).toBeInTheDocument()
  })

  it('resumes from the paused batch on Retry Import instead of restarting', async () => {
    let callCount = 0
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockImplementation(async () => {
      callCount += 1
      if (callCount <= 3) throw new Error('network error')
      return batchResult()
    })

    const rendered = renderSisScreen()
    const { getByText, findByText } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))
    expect(await findByText(/Import paused at batch/i)).toBeInTheDocument()

    fireEvent.click(getByText('Retry Import'))
    expect(await findByText('Processed 3 / 3')).toBeInTheDocument()
    expect(screen.queryByText(/Import paused at batch/i)).not.toBeInTheDocument()
  })

  it('re-closable after a short/partial server response that never reports processed===total', async () => {
    // Regression test for a bug where importInFlight was inferred from
    // `processed < total`: a batch response that under-reports `processed` (partial
    // acceptance, a dropped row, an off-by-one) left that comparison stuck true forever,
    // permanently locking the drawer even though the import loop had actually finished.
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockResolvedValue(batchResult({ processed: 2, created: 2 }))

    const rendered = renderSisScreen()
    const { getByText, findByText, getByLabelText } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))

    // The single batch resolves with processed=2 for 3 sent rows — processed never
    // reaches total, yet the loop has genuinely finished (only one batch existed).
    await findByText('Processed 2 / 3')

    // The drawer must be closable via the real X button, not permanently locked.
    expect(getByLabelText('Close')).toBeInTheDocument()
  })

  it('disables Retry Import while a retry round-trip is in flight, preventing a double-submit', async () => {
    let resolveRetryBatch: ((v: BulkImportBatchResult) => void) | null = null
    let callCount = 0
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockImplementation(() => {
      callCount += 1
      // The initial run exhausts its 3 retry attempts (all reject) and pauses; only the
      // 4th call (issued by clicking Retry Import) hangs, so we can observe the button
      // disabled while that retry round-trip is genuinely outstanding.
      if (callCount <= 3) return Promise.reject(new Error('network error'))
      return new Promise((resolve) => { resolveRetryBatch = resolve })
    })

    const rendered = renderSisScreen()
    const { getByText, findByText, getByRole } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))
    expect(await findByText(/Import paused at batch/i)).toBeInTheDocument()

    fireEvent.click(getByText('Retry Import'))
    // While the retry's batch call is outstanding, the button must be disabled — a second
    // click must not be able to start a concurrent runFrom loop on the same importId.
    expect(getByRole('button', { name: 'Retry Import' })).toBeDisabled()

    resolveRetryBatch!(batchResult())
    await findByText('Processed 3 / 3')
  })

  it('resets the hook\'s import state (progress/paused/error) when the drawer is closed and reopened', async () => {
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockRejectedValue(new Error('network error'))

    const rendered = renderSisScreen()
    const { getByText, findByText, getByLabelText, queryByText } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))
    expect(await findByText(/Import paused at batch/i)).toBeInTheDocument()

    // Close the drawer (real X button — closable since the loop is paused, not running).
    fireEvent.click(getByLabelText('Close'))

    // Reopen the wizard.
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    // Step 1 (Upload) should show, with no stale paused/error state bleeding through.
    expect(queryByText(/Import paused at batch/i)).not.toBeInTheDocument()
    expect(queryByText(/network error/i)).not.toBeInTheDocument()
  })
})

/** Builds an n-row bulk-import CSV of entirely distinct, individually-valid students (unique
 *  phone/email per row so none collide with each other or the roster seed, alternating between
 *  the two real test classes so the class-exists check passes for every row). No admission
 *  number column, so the duplicate-admission-number check never fires. */
function bulkCsv(n: number): string {
  const lines = [BULK_HEADERS.join(',')]
  for (let i = 1; i <= n; i++) {
    const section = i % 2 === 0 ? '6-B' : '5-A'
    const gender = i % 2 === 0 ? 'Female' : 'Male'
    const phone = `9${String(i).padStart(9, '0')}`
    lines.push(`Student${i},Last${i},${section},${gender},2015-01-01,${phone},student${i}@x.com,Father${i}`)
  }
  return lines.join('\n')
}

describe('Bulk import wizard — Step 5 Complete', () => {
  it('shows real final totals and the correct message for a fully successful import', async () => {
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockImplementation(
      async (_importId, batchIndex, rows) => ({
        importId: 'import-1',
        batchIndex,
        processed: rows.length,
        created: rows.length,
        skipped: 0,
        transportPending: 0,
        rows: rows.map((r) => ({ rowNumber: r.rowNumber, studentId: `stu-${r.rowNumber}`, status: 'created' as const })),
      }),
    )

    const rendered = renderSisScreen()
    const { getByText, findByText } = rendered
    await driveToPreview(rendered, bulkCsv(10000))
    expect(await findByText('Total Rows: 10000', undefined, { timeout: 10000 })).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))
    expect(await findByText('10,000 students imported successfully.', undefined, { timeout: 20000 })).toBeInTheDocument()
  }, 30000)

  it('shows the partial-success message and lets the admin download the error report', async () => {
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockImplementation(
      async (_importId, batchIndex, rows) => {
        const outRows = rows.map((r) => {
          const skipped = r.rowNumber <= 250
          return {
            rowNumber: r.rowNumber,
            studentId: skipped ? null : `stu-${r.rowNumber}`,
            status: (skipped ? 'skipped' : 'created') as 'skipped' | 'created',
            error: skipped ? 'Duplicate phone number at creation time' : null,
          }
        })
        return {
          importId: 'import-1',
          batchIndex,
          processed: rows.length,
          created: outRows.filter((r) => r.status === 'created').length,
          skipped: outRows.filter((r) => r.status === 'skipped').length,
          transportPending: 0,
          rows: outRows,
        }
      },
    )

    const rendered = renderSisScreen()
    const { getByText, findByText } = rendered
    await driveToPreview(rendered, bulkCsv(10000))
    expect(await findByText('Total Rows: 10000', undefined, { timeout: 10000 })).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))
    expect(await findByText('9,750 students imported. 250 rows were skipped.', undefined, { timeout: 20000 })).toBeInTheDocument()
    expect(getByText('Download Error Report')).toBeEnabled()
  }, 30000)

  it('downloads an error report with the original row data and the real per-row error reason', async () => {
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockResolvedValue({
      importId: 'import-1', batchIndex: 0, processed: 3, created: 2, skipped: 1, transportPending: 0,
      rows: [
        { rowNumber: 1, studentId: 'stu-1', status: 'created' },
        { rowNumber: 2, studentId: null, status: 'skipped', error: 'Phone already registered' },
        { rowNumber: 3, studentId: 'stu-3', status: 'created' },
      ],
    })
    const feeExport = await import('@/lib/feeExport')
    const downloadSpy = vi.spyOn(feeExport, 'downloadTextFile').mockImplementation(() => {})

    const rendered = renderSisScreen()
    const { getByText, findByText } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()

    fireEvent.click(getByText('Start Import'))
    expect(await findByText('2 students imported. 1 rows were skipped.')).toBeInTheDocument()

    fireEvent.click(getByText('Download Error Report'))
    expect(downloadSpy).toHaveBeenCalledTimes(1)
    const [, csv] = downloadSpy.mock.calls[0]
    // Real original mapped row data (row 2 — Aditi Verma) plus the real error reason —
    // never a placeholder like "Row 2" with no other columns.
    expect(csv).toContain('Aditi')
    expect(csv).toContain('Verma')
    expect(csv).toContain('aditi@x.com')
    expect(csv).toContain('Phone already registered')
  })

  it('View Imported Students closes the drawer; Import Another File resets to Step 1 without closing it', async () => {
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockResolvedValue(batchResult())

    const rendered = renderSisScreen()
    const { getByText, findByText, queryByText } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()
    fireEvent.click(getByText('Start Import'))
    expect(await findByText('3 students imported successfully.')).toBeInTheDocument()

    fireEvent.click(getByText('Import Another File'))
    // Back to Step 1, drawer still open.
    expect(await findByText(/drop your csv/i)).toBeInTheDocument()

    // Re-drive a second import and this time close via View Imported Students.
    await driveToPreview(rendered, IMPORT_CSV)
    fireEvent.click(getByText('Start Import'))
    expect(await findByText('3 students imported successfully.')).toBeInTheDocument()
    fireEvent.click(getByText('View Imported Students'))
    // Drawer closed — its step indicator is gone.
    expect(queryByText('Map columns')).not.toBeInTheDocument()
    expect(queryByText(/drop your csv/i)).not.toBeInTheDocument()
  })

  it('View Errors reveals the skipped-row list', async () => {
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockResolvedValue({
      importId: 'import-1', batchIndex: 0, processed: 3, created: 2, skipped: 1, transportPending: 0,
      rows: [
        { rowNumber: 1, studentId: 'stu-1', status: 'created' },
        { rowNumber: 2, studentId: null, status: 'skipped', error: 'Phone already registered' },
        { rowNumber: 3, studentId: 'stu-3', status: 'created' },
      ],
    })

    const rendered = renderSisScreen()
    const { getByText, findByText, queryByText } = rendered
    await driveToPreview(rendered, IMPORT_CSV)
    expect(await findByText('Total Rows: 3')).toBeInTheDocument()
    fireEvent.click(getByText('Start Import'))
    expect(await findByText('2 students imported. 1 rows were skipped.')).toBeInTheDocument()

    expect(queryByText('Phone already registered')).not.toBeInTheDocument()
    fireEvent.click(getByText('View Errors'))
    expect(await findByText('Phone already registered')).toBeInTheDocument()
    expect(getByText(/Row 2/)).toBeInTheDocument()
  })
})

/** Builds a 450-row bulk-import CSV of otherwise-distinct, individually-valid students (same
 *  shape as bulkCsv above), with two deliberate defects baked in:
 *  - row 300 shares its phone AND email with row 50 verbatim — a duplicate-within-file pair
 *    (buildBulkPreview's `_duplicateInFile` check keys on phone+email together; the LATER
 *    row, 300, is the one flagged, row 50 stays valid).
 *  - row 425 has a blank phone cell — a missing-required-field row (`phone` is in
 *    studentValidation's REQUIRED_FIELDS).
 *  Every other row is unique and valid, so Preview should report exactly 2 error rows. */
function e2eWizardCsv(): string {
  const lines = [BULK_HEADERS.join(',')]
  for (let i = 1; i <= 450; i++) {
    const section = i % 2 === 0 ? '6-B' : '5-A'
    const gender = i % 2 === 0 ? 'Female' : 'Male'
    let phone = `9${String(i).padStart(9, '0')}`
    let email = `student${i}@x.com`
    if (i === 300) { phone = `9${String(50).padStart(9, '0')}`; email = 'student50@x.com' }
    if (i === 425) phone = ''
    lines.push(`Student${i},Last${i},${section},${gender},2015-01-01,${phone},${email},Father${i}`)
  }
  return lines.join('\n')
}

describe('Bulk import wizard — full end to end', () => {
  it('runs the full wizard end to end: upload, map, preview with a duplicate, import, and resume after a paused batch', async () => {
    // Batch 1 (index 1, the middle of 3 batches over 448 valid rows) fails on all 3
    // internal attempts the hook allows per batch (MAX_RETRIES_PER_BATCH in
    // useBulkImportStudents.ts) — exhausting them pauses the import — then succeeds once
    // Retry Import issues the 4th call. Batches 0 and 2 succeed on their first call. Tracks
    // every call's batchIndex so we can assert batch 0 is never called twice (no restart
    // from scratch on retry).
    const calls: number[] = []
    let batch1Attempts = 0
    vi.spyOn(bulkImportApi, 'bulkImportBatch').mockImplementation(
      async (_importId, batchIndex, rows) => {
        calls.push(batchIndex)
        if (batchIndex === 1) {
          batch1Attempts += 1
          if (batch1Attempts <= 3) throw new Error('network error')
        }
        return {
          importId: 'import-1',
          batchIndex,
          processed: rows.length,
          created: rows.length,
          skipped: 0,
          transportPending: 0,
          rows: rows.map((r) => ({ rowNumber: r.rowNumber, studentId: `stu-${r.rowNumber}`, status: 'created' as const })),
        }
      },
    )
    const feeExport = await import('@/lib/feeExport')
    const downloadSpy = vi.spyOn(feeExport, 'downloadTextFile').mockImplementation(() => {})

    const rendered = renderSisScreen()
    const { getByText, getByLabelText, findByText, getAllByRole } = rendered

    // 1. Upload the 450-row fixture.
    fireEvent.click(getByText('Add student'))
    fireEvent.click(getByText('Bulk Add Students'))
    const file = new File([e2eWizardCsv()], 'students.csv', { type: 'text/csv' })
    fireEvent.change(getByLabelText(/drop your csv/i), { target: { files: [file] } })
    expect(await findByText('students.csv')).toBeInTheDocument()
    expect(await findByText('Rows detected: 450')).toBeInTheDocument()
    expect(getByText('Continue')).not.toBeDisabled()

    // 2. Map Columns auto-suggests every header — no manual remapping, Continue enabled.
    fireEvent.click(getByText('Continue'))
    await findByText('Map columns')
    const mappingSelects = (getAllByRole('combobox') as HTMLSelectElement[]).slice(-BULK_HEADERS.length)
    expect(mappingSelects.map((s) => s.value)).toEqual([
      'firstName', 'lastName', 'section', 'gender', 'dob', 'phone', 'email', 'fatherName',
    ])
    expect(getByText('Continue')).not.toBeDisabled()

    // 3. Preview: Total 450, Valid 448, Errors 2 (row 300's duplicate + row 425's blank phone).
    fireEvent.click(getByText('Continue'))
    expect(await findByText('Total Rows: 450', undefined, { timeout: 10000 })).toBeInTheDocument()
    expect(await findByText('Valid: 448')).toBeInTheDocument()
    expect(await findByText('Errors: 2')).toBeInTheDocument()

    // Preview-time error report (Task 16's Download Error Report on this Preview step, wired
    // to preview.errorRows — the Complete screen's own Download Error Report button further
    // below is wired to import-time SKIPS instead, which will be zero in this scenario since
    // every batch below eventually succeeds) — exactly the 2 preview-time error rows.
    fireEvent.click(getByText('Download Error Report'))
    expect(downloadSpy).toHaveBeenCalledTimes(1)
    const [, errorCsv] = downloadSpy.mock.calls[0]
    const errorCsvLines = errorCsv.trim().split('\n')
    expect(errorCsvLines).toHaveLength(3) // header + 2 error rows
    expect(errorCsv).toContain('300')
    expect(errorCsv).toContain('Duplicate row in this file')
    expect(errorCsv).toContain('425')
    expect(errorCsv).toContain('This field is required')

    // 4. Start Import — batch 0 and batch 2 succeed immediately, batch 1 fails 3 times.
    fireEvent.click(getByText('Start Import'))

    // 5. Paused at batch index 1 (displayed 1-based) of 3 total batches (448 valid rows / 200).
    expect(await findByText('Import paused at batch 2 / 3', undefined, { timeout: 10000 })).toBeInTheDocument()
    expect(getByText('network error')).toBeInTheDocument()

    fireEvent.click(getByText('Retry Import'))
    expect(await findByText('Processed 448 / 448', undefined, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.queryByText(/Import paused at batch/i)).not.toBeInTheDocument()

    // Batch 0 was called exactly once — retry resumed from batch 1, not from scratch.
    expect(calls.filter((b) => b === 0)).toHaveLength(1)
    expect(calls.filter((b) => b === 2)).toHaveLength(1)
    // Batch 1 was called 4 times total: 3 failures (exhausting the pause threshold) + 1
    // success (issued by the Retry Import click).
    expect(calls.filter((b) => b === 1)).toHaveLength(4)

    // 6. Complete screen: correct final created/skipped counts.
    expect(await findByText('448 students imported successfully.')).toBeInTheDocument()
    expect(getByText('Created: 448')).toBeInTheDocument()
    expect(getByText('Skipped: 0')).toBeInTheDocument()
  }, 30000)
})

/** Minimal valid SchoolClass fixtures for buildBulkPreview's class-exists check. */
function schoolClass(name: string, grade: string, section: string) {
  return { id: name, name, grade, section, teacherId: '', students: 0, room: '—' }
}
const TEST_CLASSES = [schoolClass('5-A', '5', 'A'), schoolClass('6-B', '6', 'B')]

/** One fully-valid row's cells for the column mapping below (11 columns) — callers overwrite
 *  just the cell(s) relevant to the case under test. */
const VALID_ROW_MAPPING: Record<number, string | null> = {
  0: 'firstName', 1: 'lastName', 2: 'section', 3: 'gender', 4: 'dob', 5: 'phone', 6: 'email',
  7: 'fatherName', 8: 'admissionNo', 9: 'transportOptedIn', 10: 'transportRouteId',
}
function validRowCells(overrides: Partial<{
  firstName: string; lastName: string; section: string; phone: string; email: string
  admissionNo: string; transportOptedIn: string; transportRouteId: string
}> = {}): string[] {
  return [
    overrides.firstName ?? 'Aarav', overrides.lastName ?? 'Sharma', overrides.section ?? '5-A',
    'Male', '2015-01-01', overrides.phone ?? '9000000001', overrides.email ?? 'aarav@x.com',
    'Ramesh Sharma', overrides.admissionNo ?? '', overrides.transportOptedIn ?? '',
    overrides.transportRouteId ?? '',
  ]
}

describe('buildBulkPreview — bulk-only checks (pure)', () => {
  it('names the earlier row a phone+email duplicate collides with', () => {
    const rows = [
      validRowCells(),
      validRowCells({ firstName: 'Aditi', lastName: 'Verma', phone: '9000000002', email: 'aditi@x.com' }),
      // Same phone AND email as row 1.
      validRowCells({ firstName: 'Rohan', lastName: 'Gupta' }),
    ]
    const preview = buildBulkPreview(rows, VALID_ROW_MAPPING, TEST_CLASSES, [], false)
    expect(preview.validRows).toHaveLength(2)
    expect(preview.errorRows).toHaveLength(1)
    expect(Object.values(preview.errorRows[0].errors).join(' ')).toMatch(/same phone & email as row 1/i)
  })

  it('flags an admission number reused within the SAME uploaded file, naming the earlier row', () => {
    const rows = [
      validRowCells({ admissionNo: 'ADM100' }),
      // Different phone/email so only the admission-number check can flag this row.
      validRowCells({ firstName: 'Aditi', lastName: 'Verma', phone: '9000000002', email: 'aditi@x.com', admissionNo: 'adm100' }),
    ]
    const preview = buildBulkPreview(rows, VALID_ROW_MAPPING, TEST_CLASSES, [], false)
    expect(preview.errorRows).toHaveLength(1)
    expect(preview.errorRows[0].rowNumber).toBe(2)
    expect(preview.errorRows[0].errors.admissionNo).toMatch(/same as row 1/i)
  })

  it('flags a class value that does not resolve to any real class', () => {
    const rows = [validRowCells({ section: '99-Z' })]
    const preview = buildBulkPreview(rows, VALID_ROW_MAPPING, TEST_CLASSES, [], false)
    expect(preview.errorRows).toHaveLength(1)
    expect(preview.errorRows[0].errors.cls).toMatch(/class not found/i)
  })

  it('does not flag a class value that resolves to a real class', () => {
    const rows = [validRowCells({ section: '6-B' })]
    const preview = buildBulkPreview(rows, VALID_ROW_MAPPING, TEST_CLASSES, [], false)
    expect(preview.validRows).toHaveLength(1)
    expect(preview.errorRows).toHaveLength(0)
  })

  it('treats a non-lowercase-exact transport opt-in ("Yes") as opted-in, requiring a route', () => {
    const rows = [validRowCells({ transportOptedIn: 'Yes' })]
    const preview = buildBulkPreview(rows, VALID_ROW_MAPPING, TEST_CLASSES, [], true)
    expect(preview.errorRows).toHaveLength(1)
    expect(preview.errorRows[0].errors.transportRouteId).toBeTruthy()
  })

  it('treats "TRUE" as opted-in too', () => {
    const rows = [validRowCells({ transportOptedIn: 'TRUE' })]
    const preview = buildBulkPreview(rows, VALID_ROW_MAPPING, TEST_CLASSES, [], true)
    expect(preview.errorRows[0].errors.transportRouteId).toBeTruthy()
  })

  it('does not require a route when the row has not opted into transport', () => {
    const rows = [validRowCells()]
    const preview = buildBulkPreview(rows, VALID_ROW_MAPPING, TEST_CLASSES, [], true)
    expect(preview.validRows).toHaveLength(1)
  })
})

describe('buildBulkRowRecord — full BulkStudentRow shape', () => {
  it('includes every BulkStudentRow field (defaulted to "") even when only one column is mapped', () => {
    const record = buildBulkRowRecord(['Aarav'], { 0: 'firstName' })
    const expectedKeys: (keyof Omit<BulkStudentRow, 'rowNumber'>)[] = [
      'admissionNo', 'firstName', 'lastName', 'section', 'gender', 'dob', 'phone', 'email',
      'fatherName', 'fatherPhone', 'fatherEmail', 'fatherOccupation',
      'motherName', 'motherPhone', 'motherEmail', 'motherOccupation',
      'bloodGroup', 'house', 'religion', 'category', 'caste', 'motherTongue', 'languages',
      'lastSchool', 'address', 'academicYear', 'admissionDate', 'status',
      'transportOptedIn', 'transportRouteId', 'transportStopId', 'transportFeeHeadId',
    ]
    for (const key of expectedKeys) expect(record).toHaveProperty(key)
    expect(record.firstName).toBe('Aarav')
    expect(record.fatherEmail).toBe('') // unmapped optional field — present, not absent
  })
})
