import { describe, it, expect } from 'vitest'
import { schoolCodeSlug, personCodeYear, personCodePrefix, nextPersonCode } from './personCodes'

describe('schoolCodeSlug', () => {
  it('lowercases and strips non-alphanumerics', () => {
    expect(schoolCodeSlug('Greenwood International!')).toBe('greenwoodinternational')
  })
  it('falls back when blank/missing', () => {
    expect(schoolCodeSlug('')).toBe('sch')
    expect(schoolCodeSlug(null)).toBe('sch')
    expect(schoolCodeSlug(undefined)).toBe('sch')
  })
  it('accepts a custom fallback', () => {
    expect(schoolCodeSlug(undefined, 'grv')).toBe('grv')
  })
})

describe('personCodeYear', () => {
  it('takes the last 2 digits', () => {
    expect(personCodeYear(2026)).toBe('26')
    expect(personCodeYear(2099)).toBe('99')
  })
  it('pads a single digit', () => {
    expect(personCodeYear(2005)).toBe('05')
  })
})

describe('personCodePrefix', () => {
  it('builds slug/KIND/yy/', () => {
    expect(personCodePrefix('Greenwood', 'STU', 2026)).toBe('greenwood/STU/26/')
    expect(personCodePrefix('Greenwood', 'TCH', 2026)).toBe('greenwood/TCH/26/')
    expect(personCodePrefix('Greenwood', 'STF', 2026)).toBe('greenwood/STF/26/')
  })
  it('falls back to "sch" when the slug is missing', () => {
    expect(personCodePrefix(undefined, 'STU', 2026)).toBe('sch/STU/26/')
  })
})

describe('nextPersonCode (the auto-increment)', () => {
  it('starts at 0001 for an empty roster', () => {
    expect(nextPersonCode('sch/STU/26/', [])).toBe('sch/STU/26/0001')
  })
  it('increments past the highest existing number under the same prefix', () => {
    const existing = ['sch/STU/26/0001', 'sch/STU/26/0003', 'sch/STU/26/0002']
    expect(nextPersonCode('sch/STU/26/', existing)).toBe('sch/STU/26/0004')
  })
  it('ignores codes under a different prefix (different school/kind/year)', () => {
    const existing = ['sch/STU/25/0009', 'other/STU/26/0009', 'sch/TCH/26/0009']
    expect(nextPersonCode('sch/STU/26/', existing)).toBe('sch/STU/26/0001')
  })
  it('is case-insensitive when matching the prefix', () => {
    const existing = ['SCH/STU/26/0005']
    expect(nextPersonCode('sch/STU/26/', existing)).toBe('sch/STU/26/0006')
  })
  it('ignores null/undefined/blank entries in the roster', () => {
    const existing = [null, undefined, '', 'sch/STU/26/0002']
    expect(nextPersonCode('sch/STU/26/', existing)).toBe('sch/STU/26/0003')
  })
  it('pads to 4 digits and grows past 9999 without truncating', () => {
    expect(nextPersonCode('sch/STU/26/', ['sch/STU/26/9999'])).toBe('sch/STU/26/10000')
  })
})
