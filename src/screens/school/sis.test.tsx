import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { students as seed } from '@/data/mockDb'
import { sisScreens } from './sis'
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

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  // StudentsScreen fires several concurrent queries on mount (students, classes, exams,
  // exam marks, exam papers). mockResolvedValue would hand every one of them the SAME
  // Response instance, whose body can only be read once — every query after the first
  // would fail with "body already read" and silently resolve to {} (readJson swallows
  // that TypeError). Build a fresh Response per call instead.
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(jsonResponse({ data: seed.map(toWire), next_cursor: null }))))
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
})
