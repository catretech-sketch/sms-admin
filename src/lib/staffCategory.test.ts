import { describe, it, expect } from 'vitest'
import { normalizeStaffCategory, staffCategoryLabel } from './staffCategory'

describe('normalizeStaffCategory', () => {
  it('keeps API slugs', () => {
    expect(normalizeStaffCategory('support')).toBe('support')
    expect(normalizeStaffCategory('transport')).toBe('transport')
  })

  it('infers from department when category missing', () => {
    expect(normalizeStaffCategory('', 'General Support', 'Peon')).toBe('support')
    expect(normalizeStaffCategory(null, 'Transport', 'Driver')).toBe('transport')
    expect(normalizeStaffCategory(undefined, 'Administration', 'Clerk')).toBe('admin')
  })
})

describe('staffCategoryLabel', () => {
  it('returns label or em dash', () => {
    expect(staffCategoryLabel('support')).toBe('Support')
    expect(staffCategoryLabel('', 'Security', 'Guard')).toBe('Security')
    expect(staffCategoryLabel('', '', '')).toBe('—')
  })
})
