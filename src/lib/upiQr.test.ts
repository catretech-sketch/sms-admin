import { describe, expect, it } from 'vitest'
import { buildUpiPayUri, upiQrImageUrl } from './upiQr'

describe('buildUpiPayUri', () => {
  it('builds a scannable upi://pay URI', () => {
    const uri = buildUpiPayUri({ pa: 'school@upi', am: 500, pn: 'SCC', tn: 'Fee IV-B' })
    expect(uri.startsWith('upi://pay?')).toBe(true)
    expect(uri).toContain('pa=school%40upi')
    expect(uri).toContain('am=500.00')
    expect(uri).toContain('pn=SCC')
  })

  it('returns empty when VPA missing', () => {
    expect(buildUpiPayUri({ pa: '', am: 100 })).toBe('')
  })
})

describe('upiQrImageUrl', () => {
  it('wraps URI for QR image', () => {
    const url = upiQrImageUrl('upi://pay?pa=a%40upi&am=1.00')
    expect(url).toContain('api.qrserver.com')
    expect(url).toContain(encodeURIComponent('upi://pay?pa=a%40upi&am=1.00'))
  })
})
