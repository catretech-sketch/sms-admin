import { describe, it, expect } from 'vitest'
import { shouldPublishGps, haversineMeters } from './gpsThrottle'

describe('gpsThrottle', () => {
  it('publishes first sample always', () => {
    expect(shouldPublishGps(null, { lat: 12, lng: 77, at: 1000 })).toBe(true)
  })

  it('skips when too soon and barely moved', () => {
    const last = { lat: 12.9716, lng: 77.5946, at: 1000 }
    const next = { lat: 12.9717, lng: 77.5947, at: 2000 }
    expect(shouldPublishGps(last, next, 5000, 20)).toBe(false)
  })

  it('publishes when moved enough', () => {
    const last = { lat: 12.9716, lng: 77.5946, at: 1000 }
    const next = { lat: 12.9816, lng: 77.6046, at: 2000 }
    expect(shouldPublishGps(last, next, 5000, 20)).toBe(true)
    expect(haversineMeters(last, next)).toBeGreaterThan(20)
  })
})
