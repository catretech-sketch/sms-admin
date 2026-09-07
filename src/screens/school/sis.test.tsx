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
