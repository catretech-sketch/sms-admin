import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveTeacherExtras,
  loadTeacherExtras,
  mergeTeacherExtras,
  extrasFromTeacher,
} from './teacherExtras'
import type { Teacher } from '@/types'

const baseTeacher: Teacher = {
  id: 't-1',
  name: 'Jane Doe',
  gender: 'F',
  dept: 'Science',
  desig: 'Teacher',
  subjects: ['Physics'],
  classTeacher: null,
  phone: '999',
  email: 'jane@school.test',
  exp: 5,
  rating: 0,
  attendance: 0,
  result: 0,
  load: 0,
  status: 'active',
  avatarHue: 120,
  top: false,
}

beforeEach(() => { localStorage.clear() })

describe('teacherExtras', () => {
  it('round-trips PAN, employee type, and leave balances', () => {
    const full: Teacher = {
      ...baseTeacher,
      pan: 'ABCDE1234F',
      employeeType: 'Full-time',
      contractType: 'Permanent',
      leaves: { medical: 10, casual: 8, sick: 5, maternity: 90 },
      bank: { holder: 'Jane', account: '123', bank: 'SBI', ifsc: 'SBIN0001234', branch: 'Main' },
    }
    saveTeacherExtras('t-1', extrasFromTeacher(full))
    const merged = mergeTeacherExtras(baseTeacher)
    expect(merged.pan).toBe('ABCDE1234F')
    expect(merged.employeeType).toBe('Full-time')
    expect(merged.contractType).toBe('Permanent')
    expect(merged.leaves).toEqual({ medical: 10, casual: 8, sick: 5, maternity: 90 })
    expect(merged.bank?.ifsc).toBe('SBIN0001234')
  })

  it('returns API teacher unchanged when no extras stored', () => {
    expect(mergeTeacherExtras(baseTeacher)).toEqual(baseTeacher)
    expect(loadTeacherExtras('missing')).toBeNull()
  })
})
