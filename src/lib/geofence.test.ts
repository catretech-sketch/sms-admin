import { describe, it, expect } from 'vitest'
import {
  validateGeofenceInput, haversineMeters, testPositionInFence, nearestRadiusPreset,
} from './geofence'

describe('validateGeofenceInput', () => {
  it('accepts valid campus coordinates', () => {
    expect(validateGeofenceInput(12.97, 77.59, 250)).toBeNull()
  })
  it('rejects 0,0', () => {
    expect(validateGeofenceInput(0, 0, 250)).toMatch(/0,0/)
  })
  it('rejects radius out of range', () => {
    expect(validateGeofenceInput(12, 77, 10)).toMatch(/30/)
  })
})

describe('haversineMeters', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineMeters(12.97, 77.59, 12.97, 77.59)).toBeLessThan(1)
  })
})

describe('testPositionInFence', () => {
  const campus = { lat: 12.9716, lng: 77.5946, radius: 250 }

  it('marks same point as inside', () => {
    const r = testPositionInFence(campus.lat, campus.lng, campus.radius, campus.lat, campus.lng)
    expect(r.inside).toBe(true)
    expect(r.distanceMeters).toBeLessThan(1)
  })

  it('marks far point as outside', () => {
    const r = testPositionInFence(campus.lat, campus.lng, campus.radius, 13.1, 77.8)
    expect(r.inside).toBe(false)
  })
})

describe('nearestRadiusPreset', () => {
  it('snaps to closest preset', () => {
    expect(nearestRadiusPreset(240)).toBe(250)
    expect(nearestRadiusPreset(180)).toBe(200)
  })
})
