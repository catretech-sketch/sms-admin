import { describe, it, expect } from 'vitest'
import { tierIncludes, requiredTier, can, caps } from './gating'

describe('gating', () => {
  it('tierIncludes respects tier order', () => {
    expect(tierIncludes('silver', 'sis')).toBe(true)
    expect(tierIncludes('silver', 'hr_payroll')).toBe(false)
    expect(tierIncludes('gold', 'hr_payroll')).toBe(true)
    expect(tierIncludes('gold', 'transport.gps')).toBe(false)
    expect(tierIncludes('platinum', 'transport.gps')).toBe(true)
  })
  it('requiredTier defaults to silver for unknown features', () => {
    expect(requiredTier('nonexistent')).toBe('silver')
    expect(requiredTier('hr_payroll')).toBe('gold')
  })
  it('can() reads the permission matrix', () => {
    expect(can('admin', 'sis', 'E')).toBe(true)
    expect(can('teacher', 'fees', 'E')).toBe(false)
    expect(can('principal', 'exams', 'A')).toBe(true)
  })
  it('caps() returns the capability array', () => {
    expect(caps('admin', 'sis')).toContain('E')
    expect(caps('teacher', 'fees')).toEqual([])
  })
})
