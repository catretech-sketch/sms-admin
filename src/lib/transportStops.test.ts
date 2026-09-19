import { describe, it, expect } from 'vitest'
import { groupStudentsByStop } from './transportStops'
import type { TransportMappedStudent } from '@/api/transport'

function student(overrides: Partial<TransportMappedStudent>): TransportMappedStudent {
  return {
    studentId: 's1', studentName: 'A', admissionNo: 'A1', stopId: null, routeId: null, busId: null, busOccupied: 0, mappingStatus: 'mapped',
    ...overrides,
  }
}

describe('groupStudentsByStop', () => {
  it('groups mapped students under their stop id', () => {
    const students = [
      student({ studentId: 's1', stopId: 'stop-1' }),
      student({ studentId: 's2', stopId: 'stop-1' }),
      student({ studentId: 's3', stopId: 'stop-2' }),
    ]
    const grouped = groupStudentsByStop(students)
    expect(grouped['stop-1'].map((s) => s.studentId)).toEqual(['s1', 's2'])
    expect(grouped['stop-2'].map((s) => s.studentId)).toEqual(['s3'])
  })

  it('excludes students with no stop assigned', () => {
    const students = [student({ studentId: 's1', stopId: null })]
    const grouped = groupStudentsByStop(students)
    expect(grouped).toEqual({})
  })
})
