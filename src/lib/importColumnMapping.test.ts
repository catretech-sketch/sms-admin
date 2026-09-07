import { describe, it, expect } from 'vitest'
import { BULK_IMPORT_FIELDS, suggestColumnMapping } from './importColumnMapping'

describe('BULK_IMPORT_FIELDS', () => {
  it('never includes roll number as a mappable field', () => {
    expect(BULK_IMPORT_FIELDS.some((f) => f.key === 'roll')).toBe(false)
  })

  it('marks admission number as optional (mappable, not required)', () => {
    const adm = BULK_IMPORT_FIELDS.find((f) => f.key === 'admissionNo')
    expect(adm?.required).toBe(false)
  })

  it('marks first name, last name, section, gender, dob, phone, email as required', () => {
    const requiredKeys = BULK_IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key)
    expect(requiredKeys).toEqual(
      expect.arrayContaining(['firstName', 'lastName', 'section', 'gender', 'dob', 'phone', 'email']),
    )
  })
})

describe('suggestColumnMapping', () => {
  it('matches exact and near-exact header names', () => {
    const mapping = suggestColumnMapping(['First Name', 'Last Name', 'Phone', 'Father Phone'])
    expect(mapping['First Name']).toBe('firstName')
    expect(mapping['Last Name']).toBe('lastName')
    expect(mapping['Phone']).toBe('phone')
    expect(mapping['Father Phone']).toBe('fatherPhone')
  })

  it('matches common aliases', () => {
    const mapping = suggestColumnMapping(['DOB', 'Primary Contact', 'Pickup Stop'])
    expect(mapping['DOB']).toBe('dob')
    expect(mapping['Primary Contact']).toBe('phone')
    expect(mapping['Pickup Stop']).toBe('transportStopId')
  })

  it('leaves unrecognized headers unmapped', () => {
    const mapping = suggestColumnMapping(['Favourite Color'])
    expect(mapping['Favourite Color']).toBeNull()
  })
})
