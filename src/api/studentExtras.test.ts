import { describe, it, expect } from 'vitest'
import { extrasFromStudent, mergeStudentExtras } from './studentExtras'
import { cacheExtrasJson, clearPersonExtrasMemory } from './personExtrasApi'
import type { Student } from '@/types'

const base: Student = {
  id: 'stu-1', adm: 'A-1', name: 'Kid', gender: 'M', grade: 'IV', section: 'B', cls: 'IV-B',
  roll: 1, guardian: '', phone: '', attendance: null, feeStatus: 'due', feeDue: 0,
  status: 'active', house: 'Ruby', avatarHue: 1,
}

describe('extrasFromStudent', () => {
  it('writes every enrolment extra field into extras JSON (not only father/mother)', () => {
    const extras = extrasFromStudent({
      ...base,
      bloodGroup: 'B+',
      religion: 'Hindu',
      category: 'General',
      caste: '—',
      motherTongue: 'Hindi',
      languages: 'Hindi, English',
      lastSchool: 'ABC School',
      address: 'Vill- Harpur',
      aadhaar: '123412341234',
      academicYear: '2026–27',
      admissionDate: '2026-04-01',
      father: { name: 'Vaibhav', email: 'dad@test', phone: '7080080089', occupation: 'Job' },
      mother: { name: 'Meera', email: 'mom@test', phone: '7000000000' },
    })
    expect(extras).toMatchObject({
      bloodGroup: 'B+',
      religion: 'Hindu',
      category: 'General',
      motherTongue: 'Hindi',
      languages: 'Hindi, English',
      lastSchool: 'ABC School',
      address: 'Vill- Harpur',
      aadhaar: '123412341234',
      academicYear: '2026–27',
      admissionDate: '2026-04-01',
      father: { name: 'Vaibhav', email: 'dad@test', phone: '7080080089', occupation: 'Job' },
      mother: { name: 'Meera', email: 'mom@test', phone: '7000000000' },
    })
  })

  it('mergeStudentExtras hydrates address and blood group from extras', () => {
    clearPersonExtrasMemory()
    cacheExtrasJson('student', 'stu-1', JSON.stringify({
      address: 'Vill- Harpur',
      bloodGroup: 'O+',
      father: { name: 'Vaibhav', phone: '7080080089' },
    }))
    const merged = mergeStudentExtras(base)
    expect(merged.address).toBe('Vill- Harpur')
    expect(merged.bloodGroup).toBe('O+')
    expect(merged.father?.phone).toBe('7080080089')
  })
})
