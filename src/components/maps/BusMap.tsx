import { useEffect } from 'react'
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import type { FleetBus } from '@/api/operations'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID

/** Fallback view when no bus has a live position yet (centre of India, country zoom). */
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }
const DEFAULT_ZOOM = 5

type Located = { id: string; busNo: string; lat: number; lng: number; speedKmh: number | null; moving: boolean }

/** Deterministic hue per bus number so a bus keeps its colour across renders. */
function busHue(busNo: string): number {
  let h = 0
  for (let i = 0; i < busNo.length; i++) h = (h * 31 + busNo.charCodeAt(i)) % 360
  return h
}

function toLocated(buses: FleetBus[]): Located[] {
  return buses
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => ({
      id: b.busId,
      busNo: b.busNo,
      lat: b.lat as number,
      lng: b.lng as number,
      speedKmh: b.speedKmh ?? null,
      moving: b.status === 'on_route' || b.status === 'delayed',
    }))
}

/**
 * Frame the map to the current buses. Re-runs only when the *set* of buses
 * changes (by id), so it won't reset the user's pan/zoom on every 5s position tick.
 */
function FitBounds({ points }: { points: Located[] }) {
  const map = useMap()
  const key = points.map((p) => p.id).sort().join(',')
  useEffect(() => {
    if (!map || points.length === 0) return
    if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng })
      map.setZoom(15)
      return
    }
    const lats = points.map((p) => p.lat)
    const lngs = points.map((p) => p.lng)
    map.fitBounds(
      { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) },
      64,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

function BusPin({ busNo, speedKmh, moving }: { busNo: string; speedKmh: number | null; moving: boolean }) {
  const hue = busHue(busNo)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, transform: 'translateY(-50%)' }}>
      <span
        style={{
          width: 30, height: 30, borderRadius: 9, flex: '0 0 auto',
          background: `hsl(${hue} 58% 45%)`, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)', border: '2px solid #fff',
          fontSize: 15, lineHeight: 1,
        }}
        aria-hidden="true"
      >
        {/* inline bus glyph so the marker is self-contained */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9H4z" />
          <path d="M4 15h16v2a1 1 0 0 1-1 1h-1M4 15v2a1 1 0 0 0 1 1h1" />
          <circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" />
        </svg>
      </span>
      <span
        style={{
          background: 'var(--surface, #fff)', color: 'var(--text, #111)',
          padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border, #d4d4d8)',
          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }}
      >
        {busNo}
        {moving && speedKmh != null ? ` · ${Math.round(speedKmh)}km/h` : ''}
      </span>
    </div>
  )
}

/**
 * Live Google Map of the bus fleet. Positions come from the backend fleet feed
 * (latest GPS ping per live trip); the parent polls every ~5s, so markers move
 * automatically. Reads the Maps key + Map ID from Vite env.
 */
export function BusMap({ buses, height = 360 }: { buses: FleetBus[]; height?: number }) {
  const points = toLocated(buses)

  if (!API_KEY) {
    return (
      <div
        className="col ai-center jc-center"
        style={{ height, borderRadius: 14, border: '1px dashed var(--border)', background: 'var(--surface-2)', gap: 6, textAlign: 'center', padding: 24 }}
      >
        <div className="fw6">Map not configured</div>
        <div className="t-sm muted">Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>.env.local</code> to enable the live map.</div>
      </div>
    )
  }

  const initialCenter = points.length > 0 ? { lat: points[0].lat, lng: points[0].lng } : DEFAULT_CENTER
  const initialZoom = points.length > 0 ? 13 : DEFAULT_ZOOM

  return (
    <div style={{ position: 'relative', height, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <APIProvider apiKey={API_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={initialCenter}
          defaultZoom={initialZoom}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          style={{ width: '100%', height: '100%' }}
        >
          {points.map((p) => (
            <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }} title={`Bus ${p.busNo}`}>
              <BusPin busNo={p.busNo} speedKmh={p.speedKmh} moving={p.moving} />
            </AdvancedMarker>
          ))}
          <FitBounds points={points} />
        </Map>
      </APIProvider>
      {points.length === 0 && (
        <div
          className="col ai-center jc-center"
          style={{ position: 'absolute', inset: 0, gap: 8, textAlign: 'center', padding: 24, pointerEvents: 'none', background: 'rgba(0,0,0,0.03)' }}
        >
          <div className="fw6">Waiting for live GPS</div>
          <div className="t-sm muted">Buses appear here once a trip starts and the driver device sends pings.</div>
        </div>
      )}
    </div>
  )
}
