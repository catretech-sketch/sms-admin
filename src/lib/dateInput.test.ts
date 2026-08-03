import { describe, expect, it } from 'vitest'
import { toDateInputValue } from './dateInput'

describe('toDateInputValue', () => {
  it('returns empty for blank values', () => {
    expect(toDateInputValue(null)).toBe('')
    expect(toDateInputValue('')).toBe('')
    expect(toDateInputValue('  ')).toBe('')
  })

  it('keeps YYYY-MM-DD', () => {
    expect(toDateInputValue('2014-05-01')).toBe('2014-05-01')
  })

  it('strips ISO datetime prefix', () => {
    expect(toDateInputValue('2014-05-01T00:00:00.000Z')).toBe('2014-05-01')
    expect(toDateInputValue('2014-05-01T18:30:00')).toBe('2014-05-01')
  })
})
