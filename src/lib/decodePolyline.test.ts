import { describe, it, expect } from 'vitest'
import { decodePolyline } from './decodePolyline'

describe('decodePolyline', () => {
  it('decodes a known Google encoded polyline fixture', () => {
    // Google's own documented example: _p~iF~ps|U_ulLnnqC_mqNvxq`@
    // decodes to [(38.5,-120.2),(40.7,-120.95),(43.252,-126.453)]
    const result = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(result).toHaveLength(3)
    expect(result[0].lat).toBeCloseTo(38.5, 4)
    expect(result[0].lng).toBeCloseTo(-120.2, 4)
    expect(result[1].lat).toBeCloseTo(40.7, 4)
    expect(result[1].lng).toBeCloseTo(-120.95, 4)
    expect(result[2].lat).toBeCloseTo(43.252, 4)
    expect(result[2].lng).toBeCloseTo(-126.453, 4)
  })

  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([])
  })
})
