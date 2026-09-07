import { describe, it, expect } from 'vitest'
import { buildStudentFromRow, toBulkImportRowPayload, type BulkStudentRow } from './studentMapping'

const row: BulkStudentRow = {
  rowNumber: 1,
  admissionNo: '', firstName: 'aarav', lastName: 'sharma', section: 'A', gender: 'M', dob: '2015-01-01',
  phone: '9876543210', email: 'aarav@example.com',
  fatherName: 'suresh sharma', fatherPhone: '9111111111', fatherEmail: '', fatherOccupation: '',
  motherName: '', motherPhone: '', motherEmail: '', motherOccupation: '',
  bloodGroup: '', house: '', religion: '', category: '', caste: '', motherTongue: '', languages: '',
  lastSchool: '', address: '', academicYear: '2026–27', admissionDate: '', status: 'active',
  transportOptedIn: '', transportRouteId: '', transportStopId: '', transportFeeHeadId: '',
}
const classInfo = { grade: 'I', section: 'A', cls: 'I-A' }

describe('buildStudentFromRow', () => {
  it('proper-cases names and builds the guardian from father name', () => {
    const student = buildStudentFromRow(row, classInfo)
    expect(student.name).toBe('Aarav Sharma')
    expect(student.guardian).toBe('Suresh Sharma')
    expect(student.roll).toBe(0)
    expect(student.grade).toBe('I')
    expect(student.section).toBe('A')
  })

  it('leaves admissionNo blank when not supplied, for server auto-generation', () => {
    const student = buildStudentFromRow(row, classInfo)
    expect(student.adm).toBe('')
  })

  it('passes through a supplied admission number as-is (legacy migration case)', () => {
    const student = buildStudentFromRow({ ...row, admissionNo: 'legacy/2019/0042' }, classInfo)
    expect(student.adm).toBe('legacy/2019/0042')
  })
})

describe('toBulkImportRowPayload', () => {
  it('shapes a row with no transport opt-in', () => {
    const student = buildStudentFromRow(row, classInfo)
    const payload = toBulkImportRowPayload(student, null)
    expect(payload.rowNumber).toBeUndefined() // rowNumber is attached by the caller, not this function
    expect(payload.createStudentRequest.name).toBe('Aarav Sharma')
    expect(payload.createStudentRequest.roll).toBe(0)
    expect(payload.transport).toBeNull()
    expect(JSON.parse(payload.extrasJson).father.name).toBe('Suresh Sharma')
  })

  it('shapes a row with a transport opt-in', () => {
    const student = buildStudentFromRow(row, classInfo)
    const payload = toBulkImportRowPayload(student, { routeId: 'route-1', stopId: 'stop-1', feeHeadId: 'fh-1' })
    expect(payload.transport).toEqual({ optedIn: true, routeId: 'route-1', stopId: 'stop-1', feeHeadId: 'fh-1' })
  })
})
