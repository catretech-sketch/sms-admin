import { describe, it, expect } from 'vitest'
import { snakeToCamel, camelToSnake } from './mapper'

describe('snakeToCamel', () => {
  it('converts keys deeply through arrays and nested objects', () => {
    const input = { student_id: 1, fee_status: 'paid', parent_info: { guardian_name: 'A', alt_phone: 'B' }, rows: [{ max_marks: 100 }] }
    expect(snakeToCamel(input)).toEqual({
      studentId: 1, feeStatus: 'paid', parentInfo: { guardianName: 'A', altPhone: 'B' }, rows: [{ maxMarks: 100 }],
    })
  })

  it('leaves primitive values and nulls untouched', () => {
    expect(snakeToCamel({ a_b: null, c_d: 'x' })).toEqual({ aB: null, cD: 'x' })
  })
})

describe('camelToSnake', () => {
  it('is the inverse for round-trippable shapes', () => {
    const camel = { studentId: 1, parentInfo: { guardianName: 'A' }, rows: [{ maxMarks: 100 }] }
    expect(camelToSnake(camel)).toEqual({ student_id: 1, parent_info: { guardian_name: 'A' }, rows: [{ max_marks: 100 }] })
  })
})
