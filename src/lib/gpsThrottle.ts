const R = 6_371_000

export interface GpsSample { lat: number; lng: number; at: number }

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Publish if enough time passed or the device moved far enough (battery-friendly). */
export function shouldPublishGps(
  last: GpsSample | null,
  next: GpsSample,
  cadenceMs = 5000,
  minMeters = 20,
): boolean {
  if (!last) return true
  if (next.at - last.at >= cadenceMs) return true
  if (haversineMeters(last, next) >= minMeters) return true
  return false
}
