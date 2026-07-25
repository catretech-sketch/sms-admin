import { describe, it, expect } from 'vitest'
import { computePay, computeSalary, hasPay, toAmount, currentPeriod, periodLabel } from './payroll'

describe('toAmount', () => {
  it('parses numbers and numeric strings', () => {
    expect(toAmount(28000)).toBe(28000)
    expect(toAmount('28000')).toBe(28000)
    expect(toAmount('₹ 28,000')).toBe(28000)
    expect(toAmount('')).toBe(0)
    expect(toAmount(undefined)).toBe(0)
    expect(toAmount(null)).toBe(0)
  })
})

describe('computePay', () => {
  it('uses 12% statutory deduction when no explicit EPF', () => {
    expect(computePay(30000)).toEqual({ gross: 30000, deductions: 3600, net: 26400 })
  })

  it('uses explicit EPF amount when provided', () => {
    expect(computePay(30000, 2000)).toEqual({ gross: 30000, deductions: 2000, net: 28000 })
  })

  it('treats missing/zero salary as zero pay', () => {
    expect(computePay(0)).toEqual({ gross: 0, deductions: 0, net: 0 })
    expect(computePay('' as unknown as number)).toEqual({ gross: 0, deductions: 0, net: 0 })
  })

  it('caps deduction at gross', () => {
    expect(computePay(1000, 5000)).toEqual({ gross: 1000, deductions: 1000, net: 0 })
  })
})

describe('computeSalary (detailed components)', () => {
  it('sums earnings for gross and deductions for net', () => {
    expect(computeSalary({
      basic: 30000, hra: 12000, allowances: 3000, epf: 3600, profTax: 200, otherDeductions: 500,
    })).toEqual({ gross: 45000, deductions: 4300, net: 40700 })
  })

  it('falls back to 12% of basic when EPF is 0', () => {
    // gross 20000, epf = 12% of basic (2400), net 17600
    expect(computeSalary({ basic: 20000, hra: 0, allowances: 0, epf: 0, profTax: 0, otherDeductions: 0 }))
      .toEqual({ gross: 20000, deductions: 2400, net: 17600 })
  })

  it('caps total deductions at gross', () => {
    expect(computeSalary({ basic: 1000, hra: 0, allowances: 0, epf: 5000, profTax: 0, otherDeductions: 0 }))
      .toEqual({ gross: 1000, deductions: 1000, net: 0 })
  })

  it('coerces string amounts', () => {
    expect(computeSalary({ basic: '25000', hra: '5000', allowances: '', epf: '3000', profTax: '', otherDeductions: '' } as never))
      .toEqual({ gross: 30000, deductions: 3000, net: 27000 })
  })
})

describe('hasPay', () => {
  it('is true when any component is positive', () => {
    expect(hasPay({ basic: 10000 })).toBe(true)
    expect(hasPay({ otherDeductions: 100 })).toBe(true)
  })
  it('is false for empty/zero components', () => {
    expect(hasPay(null)).toBe(false)
    expect(hasPay({})).toBe(false)
    expect(hasPay({ basic: 0, hra: 0, allowances: 0, epf: 0, profTax: 0, otherDeductions: 0 })).toBe(false)
  })
})

describe('period helpers', () => {
  it('formats current period as YYYY-MM', () => {
    expect(currentPeriod(new Date(2026, 5, 18))).toBe('2026-06')
    expect(currentPeriod(new Date(2026, 11, 1))).toBe('2026-12')
  })

  it('labels a period', () => {
    expect(periodLabel('2026-06')).toBe('June 2026')
    expect(periodLabel('2026-12')).toBe('December 2026')
    expect(periodLabel('bad')).toBe('bad')
  })
})
