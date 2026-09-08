import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { students as seed } from '@/data/mockDb'
import { sisScreens, buildBulkPreview, buildBulkRowRecord } from './sis'
import type { BulkStudentRow } from '@/lib/studentMapping'
import type { Student } from '@/types'

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
