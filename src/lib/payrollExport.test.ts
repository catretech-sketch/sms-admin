import { describe, it, expect } from 'vitest'
import { payrollRunToCsv, payrollCsvFileName, buildPayslipHtml } from './payrollExport'
import type { PayrollLine, PayrollRun } from '@/api/payroll'

const line = (over: Partial<PayrollLine> = {}): PayrollLine => ({
  personType: 'teacher', personId: 'p1', name: 'Rajesh Kumar', role: 'Teacher', dept: 'Maths',
  basic: 30000, hra: 12000, allowances: 3000, epf: 3600, profTax: 200, otherDeductions: 0,
  gross: 45000, deductions: 3800, net: 41200, ...over,
})

const run: PayrollRun = {
  period: '2026-06', year: 2026, month: 'June', status: 'run',
  staffCount: 2, gross: 90000, deductions: 7600, net: 82400,
  lines: [line(), line({ personId: 'p2', name: 'Suresh Naidu', personType: 'staff', role: 'Driver', dept: 'Transport' })],
}

describe('payrollRunToCsv', () => {
  it('has a header, one row per person, and a totals row', () => {
    const csv = payrollRunToCsv(run)
    const rows = csv.split('\n')
    expect(rows).toHaveLength(4) // header + 2 people + total
    expect(rows[0]).toContain('Name')
    expect(rows[0]).toContain('Net pay')
    expect(rows[1]).toContain('Rajesh Kumar')
    expect(rows[3]).toContain('TOTAL')
    expect(rows[3]).toContain('82400')
  })

  it('quotes cells containing commas', () => {
    const csv = payrollRunToCsv({ ...run, lines: [line({ name: 'Kumar, Rajesh' })] })
    expect(csv).toContain('"Kumar, Rajesh"')
  })

  it('names the file by period', () => {
    expect(payrollCsvFileName(run)).toBe('Payroll-2026-06.csv')
  })
})

describe('buildPayslipHtml', () => {
  it('renders earnings, deductions and net', () => {
    const html = buildPayslipHtml(line(), { schoolName: 'Sunrise', periodLabel: 'June 2026', currency: 'INR', status: 'run' })
    expect(html).toContain('Rajesh Kumar')
    expect(html).toContain('Earnings')
    expect(html).toContain('Deductions')
    expect(html).toContain('Net pay')
  })

  it('omits zero components', () => {
    const html = buildPayslipHtml(line({ hra: 0, allowances: 0 }), { schoolName: 'Sunrise', periodLabel: 'June 2026' })
    expect(html).not.toContain('>HRA<')
  })
})
