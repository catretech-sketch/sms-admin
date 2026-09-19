import { useEffect, useRef, useState } from 'react'

type LatLng = { lat: number; lng: number }

/**
 * Smoothly tweens a marker between successive GPS positions instead of snapping instantly —
 * GPS pings arrive every few seconds, so a direct render would look like a jump-cut.
 * Returns null while lat/lng aren't available yet (never invents a position).
 */
export function useInterpolatedPosition(
  lat: number | null | undefined,
  lng: number | null | undefined,
  durationMs = 4000,
): LatLng | null {
  const [rendered, setRendered] = useState<LatLng | null>(lat != null && lng != null ? { lat, lng } : null)
  const fromRef = useRef<LatLng | null>(rendered)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (lat == null || lng == null) return
    const to = { lat, lng }
    const from = fromRef.current
    if (!from) {
      fromRef.current = to
      setRendered(to)
      return
    }
    if (from.lat === to.lat && from.lng === to.lng) return

    const start = performance.now()
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      setRendered({
        lat: from.lat + (to.lat - from.lat) * t,
        lng: from.lng + (to.lng - from.lng) * t,
      })
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, durationMs])

  return rendered
}
