import { describe, expect, it } from 'vitest'
import { buildFeeReceiptHtml, feeReceiptFileName } from './feeReceipt'

describe('feeReceipt', () => {
  it('builds an HTML receipt with student, amount and mode', () => {
    const html = buildFeeReceiptHtml({
      schoolName: 'SCC',
      studentName: 'Rahul Shrma',
      studentAdm: 'sccrdtb/STU/26/0001',
      cls: 'IV-B',
      amount: 500,
      currency: '₹',
      mode: 'Cash',
      ref: 'R-1',
      paidAt: '17 Jul 2026',
      term: 'Term 1',
    })
    expect(html).toContain('Fee receipt')
    expect(html).toContain('Rahul Shrma')
    expect(html).toContain('sccrdtb/STU/26/0001')
    expect(html).toContain('IV-B')
    expect(html).toContain('Cash')
    expect(html).toContain('500')
  })

  it('names the download file with student and adm', () => {
    expect(feeReceiptFileName({
      studentName: 'rahul shrma',
      studentAdm: 'sccrdtb/STU/26/0001',
      cls: 'IV-B',
    })).toContain('Rahul-Shrma')
    expect(feeReceiptFileName({
      studentName: 'rahul shrma',
      studentAdm: 'sccrdtb/STU/26/0001',
      cls: 'IV-B',
    })).toContain('sccrdtb-STU-26-0001')
  })
})
