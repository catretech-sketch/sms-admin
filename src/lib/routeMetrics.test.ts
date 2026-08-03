import { describe, it, expect } from 'vitest'
import { routeDistanceKm, routeDurationMin, routeMetrics } from './routeMetrics'

describe('routeMetrics', () => {
  it('returns zero for empty or single point', () => {
    expect(routeDistanceKm([])).toBe(0)
    expect(routeMetrics([{ lat: 12.97, lng: 77.59 }]).distanceKm).toBe(0)
  })

  it('sums segment distances', () => {
    const stops = [
      { lat: 12.9716, lng: 77.5946 },
      { lat: 12.9816, lng: 77.6046 },
    ]
    expect(routeDistanceKm(stops)).toBeGreaterThan(1)
    expect(routeDurationMin(stops)).toBeGreaterThan(0)
  })
})
