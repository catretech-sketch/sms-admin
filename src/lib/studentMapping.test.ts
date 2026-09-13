import { describe, it, expect } from 'vitest'
import { buildStudentFromRow, toBulkImportRowPayload, parseBulkGender, type BulkStudentRow } from './studentMapping'

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

  it('maps a spelled-out "Female" gender cell to F, not the literal-M/F-only exact match', () => {
    // Regression test: `row.gender === 'F' ? 'F' : 'M'` silently wrote any non-exact-'F'
    // value (including "Female") as Male. Free-text bulk-upload cells need normalization.
    expect(buildStudentFromRow({ ...row, gender: 'Female' }, classInfo).gender).toBe('F')
  })

  it('normalizes case and whitespace variants of F/female to F', () => {
    expect(buildStudentFromRow({ ...row, gender: 'female' }, classInfo).gender).toBe('F')
    expect(buildStudentFromRow({ ...row, gender: 'FEMALE' }, classInfo).gender).toBe('F')
    expect(buildStudentFromRow({ ...row, gender: ' f ' }, classInfo).gender).toBe('F')
    expect(buildStudentFromRow({ ...row, gender: 'F' }, classInfo).gender).toBe('F')
  })

  it('maps M/Male/male spellings to M', () => {
    expect(buildStudentFromRow({ ...row, gender: 'M' }, classInfo).gender).toBe('M')
    expect(buildStudentFromRow({ ...row, gender: 'Male' }, classInfo).gender).toBe('M')
    expect(buildStudentFromRow({ ...row, gender: ' male ' }, classInfo).gender).toBe('M')
  })
})

describe('parseBulkGender', () => {
  it('resolves the common female and male spellings', () => {
    for (const v of ['F', 'f', 'Female', 'female', ' FEMALE ']) expect(parseBulkGender(v)).toBe('F')
    for (const v of ['M', 'm', 'Male', 'male', ' MALE ']) expect(parseBulkGender(v)).toBe('M')
  })

  it('returns null (never a silent Male guess) for blank or uninterpretable cells', () => {
    // The data-corruption guard: an unrecognised cell must be surfaceable as a Preview
    // error, so it must be distinguishable from a real 'M'.
    for (const v of ['', '   ', 'X', 'Other', 'unknown', '1']) expect(parseBulkGender(v)).toBeNull()
  })
})

describe('toBulkImportRowPayload', () => {
  it('shapes a row with no transport opt-in', () => {
    const student = buildStudentFromRow(row, classInfo)
    const payload = toBulkImportRowPayload(student, null, 42)
    // rowNumber is the ORIGINAL file line number, supplied by the caller and always present
    // (BulkImportRowPayload.rowNumber is non-optional — the error-report join keys on it).
    expect(payload.rowNumber).toBe(42)
    expect(payload.createStudentRequest.name).toBe('Aarav Sharma')
    expect(payload.createStudentRequest.roll).toBe(0)
    expect(payload.transport).toBeNull()
    expect(JSON.parse(payload.extrasJson).father.name).toBe('Suresh Sharma')
  })

  it('shapes a row with a transport opt-in', () => {
    const student = buildStudentFromRow(row, classInfo)
    const payload = toBulkImportRowPayload(student, { routeId: 'route-1', stopId: 'stop-1', feeHeadId: 'fh-1' }, 7)
    expect(payload.transport).toEqual({ optedIn: true, routeId: 'route-1', stopId: 'stop-1', feeHeadId: 'fh-1' })
  })
})
