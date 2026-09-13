import { describe, it, expect } from 'vitest'
import { BULK_IMPORT_FIELDS, suggestColumnMapping } from './importColumnMapping'

describe('BULK_IMPORT_FIELDS', () => {
  it('never includes roll number as a mappable field', () => {
    // Compared as plain strings: `f.key` is typed as a union that cannot include 'roll',
    // so a `f.key === 'roll'` comparison is statically impossible (TS2367) and asserts
    // nothing at runtime. Widening to string keeps the assertion real — it would fail if
    // someone ever added a roll field to the union AND to this list.
    const keys: string[] = BULK_IMPORT_FIELDS.map((f) => f.key)
    expect(keys).not.toContain('roll')
    expect(keys).not.toContain('rollNumber')
    // Sanity: the list is non-empty, so `not.toContain` is not vacuously passing.
    expect(keys.length).toBeGreaterThan(0)
    expect(keys).toContain('firstName')
  })

  it('never offers Status as a mappable column (the create payload has no status field)', () => {
    // studentCoreFields()/fromStudent() carry no `status` — a mapped Status column would be
    // silently discarded, so the wizard must not advertise one.
    const keys: string[] = BULK_IMPORT_FIELDS.map((f) => f.key)
    expect(keys).not.toContain('status')
    expect(suggestColumnMapping(['Status'])['Status']).toBeNull()
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
