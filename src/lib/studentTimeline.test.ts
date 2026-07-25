import { describe, it, expect } from 'vitest'
import { buildStudentTimeline, parseDateTs, formatDate } from './studentTimeline'
import type { Student, FeePayment, FeeInvoice } from '@/types'
import type { AttendanceRecord } from '@/api/attendance'

function mkStudent(over: Partial<Student> = {}): Student {
  return {
    id: 's1', adm: 'ADM1', name: 'Rahul', gender: 'M', grade: 'IV', section: 'B',
    cls: 'IV-B', roll: 1, guardian: 'G', phone: '0', attendance: 0, feeStatus: 'due',
    feeDue: 0, status: 'active', house: 'Ruby', avatarHue: 0, admissionDate: '2025-04-02',
    ...over,
  }
}

describe('date helpers', () => {
  it('parseDateTs handles ISO and blank', () => {
    expect(parseDateTs('2026-04-12')).toBeGreaterThan(0)
    expect(parseDateTs('')).toBe(0)
    expect(parseDateTs(undefined)).toBe(0)
  })
  it('formatDate renders human date, falls back to raw', () => {
    expect(formatDate('2026-04-12')).toBe('12 Apr 2026')
    expect(formatDate('')).toBe('—')
  })
})

describe('buildStudentTimeline', () => {
  const student = mkStudent()

  it('builds events from payments, invoices, attendance and enrolment, newest first', () => {
    const payments: FeePayment[] = [
      { id: 1, studentId: 's1', studentName: 'Rahul', cls: 'IV-B', amount: 5000, mode: 'UPI', ref: 'T1', date: '2026-05-10', headName: 'Tuition' },
    ]
    const invoices: FeeInvoice[] = [
      { id: 'INV1', studentId: 's1', studentName: 'Rahul', cls: 'IV-B', grade: 'IV', academicYear: '2026-27', term: 'Term 1', lines: [], total: 5000, paid: 5000, waived: 0, due: 0, status: 'paid', dueDate: '2026-04-15' },
    ]
    const attendance: AttendanceRecord[] = [
      { id: 'a1', classId: 'c1', studentId: 's1', date: '2026-05-02', status: 'absent' },
      { id: 'a2', classId: 'c1', studentId: 's1', date: '2026-05-03', status: 'present' },
      { id: 'a3', classId: 'c1', studentId: 's2', date: '2026-05-04', status: 'late' },
    ]
    const events = buildStudentTimeline({ student, payments, invoices, attendance })
    // present days and other students are excluded
    expect(events.some((e) => e.title === 'Marked absent')).toBe(true)
    expect(events.some((e) => e.body === 'Class attendance' && e.title === 'Marked late')).toBe(false)
    // newest-first ordering: payment (May 10) before invoice (Apr 15) before enrolment (Apr 2025)
    const titles = events.map((e) => e.title)
    expect(titles[0]).toBe('Fee payment received')
    expect(titles[titles.length - 1]).toBe('Enrolled')
    // payment body carries live amount + head
    expect(events[0].body).toContain('Tuition')
  })

  it('excludes other students\' payments', () => {
    const payments: FeePayment[] = [
      { id: 2, studentId: 'other', studentName: 'X', cls: 'IV-B', amount: 100, mode: 'cash', ref: 'r', date: '2026-06-01' },
    ]
    const events = buildStudentTimeline({ student, payments })
    expect(events.some((e) => e.id === 'pay-2')).toBe(false)
  })

  it('caps attendance exceptions and total events', () => {
    const attendance: AttendanceRecord[] = Array.from({ length: 20 }, (_, i) => ({
      id: `a${i}`, classId: 'c1', studentId: 's1',
      date: `2026-05-${String(i + 1).padStart(2, '0')}`, status: 'absent' as const,
    }))
    const events = buildStudentTimeline({ student, attendance, attendanceLimit: 3, limit: 10 })
    expect(events.filter((e) => e.title === 'Marked absent')).toHaveLength(3)
    expect(events.length).toBeLessThanOrEqual(10)
  })

  it('returns empty when there is nothing (no admission date, no records)', () => {
    expect(buildStudentTimeline({ student: mkStudent({ admissionDate: undefined }) })).toEqual([])
  })
})
