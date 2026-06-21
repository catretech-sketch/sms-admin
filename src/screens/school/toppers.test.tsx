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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: seed.map(toWire), next_cursor: null })))
})

function renderScreen() {
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

describe('Students Toppers view', () => {
  it('defaults to the All students list', () => {
    renderScreen()
    expect(screen.getByPlaceholderText(/Search name/i)).toBeInTheDocument()
  })

  it('switches to the Toppers leaderboard and class cards', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    expect(await screen.findByText('Overall toppers')).toBeInTheDocument()
    expect(screen.getAllByText(/^Class /).length).toBeGreaterThan(0)
  })

  it('switches the category to Attendance toppers', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    await screen.findByText('Overall toppers')
    fireEvent.click(screen.getByText('Attendance toppers'))
    expect(await screen.findByText('Attendance %')).toBeInTheDocument()
  })

  it('returns to the list when All students is reselected', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    await screen.findByText('Overall toppers')
    fireEvent.click(screen.getByText('All students'))
    expect(screen.getByPlaceholderText(/Search name/i)).toBeInTheDocument()
  })
})
