import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveTeacherExtras,
  loadTeacherExtras,
  mergeTeacherExtras,
  extrasFromTeacher,
} from './teacherExtras'
import { tokenStore } from '@/api/auth/tokenStore'
import { clearPersonExtrasMemory } from './personExtrasApi'
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

function jsonOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ data }),
    json: async () => ({ data }),
  } as Response)
}

beforeEach(() => {
  localStorage.clear()
  clearPersonExtrasMemory()
  tokenStore.setTenantId('default')
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    jsonOk({ extras_json: '{}' })))
})

describe('teacherExtras', () => {
  it('round-trips PAN, employee type, and leave balances', async () => {
    const full: Teacher = {
      ...baseTeacher,
      pan: 'ABCDE1234F',
      employeeType: 'Full-time',
      contractType: 'Permanent',
      leaves: { medical: 10, casual: 8, sick: 5, maternity: 90 },
      bank: { holder: 'Jane', account: '123', bank: 'SBI', ifsc: 'SBIN0001234', branch: 'Main' },
    }
    const extras = extrasFromTeacher(full)
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonOk({ extras_json: JSON.stringify(extras) }))
    await saveTeacherExtras('t-1', extras)
    const merged = mergeTeacherExtras(baseTeacher)
    expect(merged.pan).toBe('ABCDE1234F')
    expect(merged.employeeType).toBe('Full-time')
    expect(merged.contractType).toBe('Permanent')
    expect(merged.leaves).toEqual({ medical: 10, casual: 8, sick: 5, maternity: 90 })
    expect(merged.bank?.ifsc).toBe('SBIN0001234')
  })

  it('round-trips HRA, allowances, and tax fields so payroll-off schools still persist them', async () => {
    const full: Teacher = {
      ...baseTeacher,
      hra: '5000',
      allowances: '2000',
      profTax: '200',
      otherDeductions: '100',
    }
    const extras = extrasFromTeacher(full)
    expect(extras.hra).toBe('5000')
    expect(extras.allowances).toBe('2000')
    expect(extras.profTax).toBe('200')
    expect(extras.otherDeductions).toBe('100')
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonOk({ extras_json: JSON.stringify(extras) }))
    await saveTeacherExtras('t-1', extras)
    const merged = mergeTeacherExtras(baseTeacher)
    expect(merged.hra).toBe('5000')
    expect(merged.allowances).toBe('2000')
    expect(merged.profTax).toBe('200')
    expect(merged.otherDeductions).toBe('100')
  })

  it('returns API teacher unchanged when no extras stored', () => {
    expect(mergeTeacherExtras(baseTeacher)).toEqual(baseTeacher)
    expect(loadTeacherExtras('missing')).toBeNull()
  })
})
