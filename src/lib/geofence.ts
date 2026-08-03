import type { Role } from '@/types'
import { can } from './gating'

/** Recommended campus radius presets (metres). */
export const RADIUS_PRESETS = [100, 200, 250, 500] as const

/** Validate campus geo-fence inputs before save. */
export function validateGeofenceInput(lat: number, lng: number, radiusMeters: number): string | null {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitude must be between -90 and 90.'
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'Longitude must be between -180 and 180.'
  if (!Number.isFinite(radiusMeters) || radiusMeters < 30 || radiusMeters > 5000) {
    return 'Radius must be between 30 m and 5 km.'
  }
  if (lat === 0 && lng === 0) return 'Set a real campus location (0,0 is not valid).'
  return null
}

/** Great-circle distance between two WGS-84 points (metres). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type FenceTestResult = {
  distanceMeters: number
  inside: boolean
  atBoundary: boolean
}

/** Client-side fence test — mirrors server punch tolerance (accuracy cap 30 m). */
export function testPositionInFence(
  campusLat: number,
  campusLng: number,
  radiusMeters: number,
  testLat: number,
  testLng: number,
  accuracyMeters = 0,
): FenceTestResult {
  const ACCURACY_CAP = 30
  const distanceMeters = haversineMeters(campusLat, campusLng, testLat, testLng)
  const effectiveRadius = radiusMeters + Math.min(accuracyMeters, ACCURACY_CAP)
  const inside = distanceMeters <= effectiveRadius
  const atBoundary = inside && distanceMeters > radiusMeters * 0.85
  return {
    distanceMeters: Math.round(distanceMeters * 10) / 10,
    inside,
    atBoundary,
  }
}

/** Owner, admin, and principals with attendance edit/approve can configure the campus fence. */
export function canConfigureGeofence(role: Role): boolean {
  if (role === 'owner' || role === 'admin') return true
  return can(role, 'attendance', 'A') || can(role, 'attendance', 'E')
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

/** Visual circle size (px) scaled from radius — clamped for the admin preview card. */
export function fencePreviewDiameterPx(radiusMeters: number): number {
  const scaled = 80 + Math.sqrt(Math.min(radiusMeters, 1000) / 1000) * 120
  return Math.round(Math.min(220, Math.max(90, scaled)))
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`
}

export function nearestRadiusPreset(radiusMeters: number): number {
  return RADIUS_PRESETS.reduce((best, p) => (
    Math.abs(p - radiusMeters) < Math.abs(best - radiusMeters) ? p : best
  ), RADIUS_PRESETS[0])
}
