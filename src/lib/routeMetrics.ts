import { haversineMeters } from './gpsThrottle'

export type RoutePoint = { lat: number; lng: number }

/** Sum of segment distances along ordered stops (km). */
export function routeDistanceKm(stops: RoutePoint[]): number {
  if (stops.length < 2) return 0
  let metres = 0
  for (let i = 1; i < stops.length; i++) metres += haversineMeters(stops[i - 1], stops[i])
  return Math.round((metres / 1000) * 10) / 10
}

/** Rough duration at typical urban bus speed (km/h). */
export function routeDurationMin(stops: RoutePoint[], speedKmh = 25): number {
  const km = routeDistanceKm(stops)
  if (km <= 0 || speedKmh <= 0) return 0
  return Math.max(1, Math.round((km / speedKmh) * 60))
}

export function routeMetrics(stops: RoutePoint[], speedKmh = 25): { distanceKm: number; durationMin: number } {
  return { distanceKm: routeDistanceKm(stops), durationMin: routeDurationMin(stops, speedKmh) }
}
