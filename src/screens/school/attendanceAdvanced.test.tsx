import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PeriodAttendanceAdvancedFilters } from '@/api/periodAttendanceAdvanced'

const advancedFilters = vi.fn<(filters: PeriodAttendanceAdvancedFilters) => unknown>()
const refetch = vi.fn()

vi.mock('@/api/hooks/usePeriodAttendanceAdvanced', () => ({
  usePeriodAttendanceAdvanced: (filters: PeriodAttendanceAdvancedFilters) => {
    advancedFilters(filters)
    return {
      data: {
        items: [{
          id: 'mark-1',
          classId: 'class-1',
          grade: 'IX',
          section: 'A',
          classLabel: 'IX-A',
          studentId: 'student-1',
          studentName: 'Aarav Shah',
          admissionNo: 'ADM-001',
          date: '2026-08-13',
          period: 2,
          periodId: 'period-2',
          subject: 'Mathematics',
          subjectId: 'subject-1',
          startTime: '09:45',
          endTime: '10:30',
          status: 'present',
          assignedTeacherId: 'teacher-1',
          assignedTeacherName: 'Meera Krishnan',
          markedBy: 'user-1',
          markedByName: 'Admin User',
          markedByRole: 'admin',
          markedAt: '2026-08-13T10:00:00Z',
          geoFenceStatus: 'not_required',
        }],
        totalCount: 30,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 25,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    }
  },
}))

vi.mock('@/api/hooks/useClasses', () => ({
  useClasses: () => ({
    data: [
      { id: 'class-1', name: 'IX-A', grade: 'IX', section: 'A', subjects: ['Mathematics'] },
      { id: 'class-2', name: 'X-B', grade: 'X', section: 'B', subjects: ['Science'] },
    ],
    isLoading: false,
  }),
}))

vi.mock('@/api/hooks/useTeachers', () => ({
  useTeachers: () => ({
    data: [{ id: 'teacher-1', name: 'Meera Krishnan' }],
    isLoading: false,
  }),
}))

vi.mock('@/api/hooks/useStudents', () => ({ useStudents: () => ({ data: [] }) }))
vi.mock('@/api/hooks/useStaff', () => ({ useStaff: () => ({ data: [] }) }))
vi.mock('@/api/hooks/usePrincipalAttendance', () => ({
  usePrincipalAttendance: () => ({ data: undefined, isLoading: false, isSuccess: false }),
}))
vi.mock('@/lib/hooks', () => ({
  useApp: () => ({ role: 'admin', plan: 'platinum' }),
  useToast: () => ({ success: vi.fn(), danger: vi.fn() }),
}))
vi.mock('./attendanceClassWise', () => ({
  ClassWiseStudents: () => <div>Students mark path</div>,
}))

import { AttendanceAdvanced } from './attendanceAdvanced'
import { attendanceScreens } from './attendance'

afterEach(cleanup)

beforeEach(() => {
  advancedFilters.mockClear()
  refetch.mockClear()
})

describe('AttendanceAdvanced', () => {
  it('starts with today and 25-row pagination, then sends status changes to the query', async () => {
    render(<AttendanceAdvanced />)

    expect(advancedFilters).toHaveBeenLastCalledWith(expect.objectContaining({
      preset: 'today',
      page: 1,
      pageSize: 25,
    }))
    expect(screen.getByText('Aarav Shah')).toBeInTheDocument()
    expect(screen.getByText('Not required')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'absent' } })

    await waitFor(() => expect(advancedFilters).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'absent',
      page: 1,
    })))
  })

  it('uses live classes and teachers in filter dropdowns and pages server results', async () => {
    render(<AttendanceAdvanced />)

    expect(screen.getByRole('option', { name: 'IX-A' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Meera Krishnan' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => expect(advancedFilters).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('uses a supported week preset and clears custom bounds when leaving custom range', async () => {
    render(<AttendanceAdvanced />)

    expect(screen.getByRole('option', { name: 'This week' })).toHaveValue('this_week')
    expect(screen.queryByRole('option', { name: 'Last 7 days' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Date preset'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-07' } })
    fireEvent.change(screen.getByLabelText('Date preset'), { target: { value: 'today' } })

    await waitFor(() => expect(advancedFilters).toHaveBeenLastCalledWith({
      preset: 'today',
      page: 1,
      pageSize: 25,
    }))
  })

  it('clears the selected section when the class grade changes', async () => {
    render(<AttendanceAdvanced />)

    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'IX' } })
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'class-1' } })
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'X' } })

    await waitFor(() => expect(advancedFilters).toHaveBeenLastCalledWith(expect.objectContaining({
      grade: 'X',
    })))
    expect(advancedFilters).toHaveBeenLastCalledWith(expect.not.objectContaining({
      classId: expect.anything(),
    }))
  })

  it('forwards Staff as a marked-by role filter', async () => {
    render(<AttendanceAdvanced />)

    fireEvent.change(screen.getByLabelText('Marked by role'), { target: { value: 'staff' } })

    await waitFor(() => expect(advancedFilters).toHaveBeenLastCalledWith(expect.objectContaining({
      markedByRole: 'staff',
      page: 1,
    })))
  })
})

describe('Attendance screen Advanced wiring', () => {
  it('keeps the Students mark path and mounts the Advanced list from its tab', () => {
    const AttendanceScreen = attendanceScreens['school.attendance']
    render(<AttendanceScreen />)

    expect(screen.getByText('Students mark path')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByText('Advanced period attendance')).toBeInTheDocument()
  })
})
