import { useEffect, useMemo } from 'react'
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import type { RouteStop } from '@/api/transport'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }
const DEFAULT_ZOOM = 12

type LatLng = { lat: number; lng: number }

function placedStops(stops: RouteStop[]): RouteStop[] {
  return stops.filter((s) => s.lat != null && s.lng != null && (s.lat !== 0 || s.lng !== 0))
}

function FitStops({ stops }: { stops: LatLng[] }) {
  const map = useMap()
  const key = stops.map((s) => `${s.lat},${s.lng}`).join('|')
  useEffect(() => {
    if (!map || stops.length === 0) return
    if (stops.length === 1) {
      map.setCenter(stops[0])
      map.setZoom(15)
      return
    }
    const lats = stops.map((s) => s.lat)
    const lngs = stops.map((s) => s.lng)
    map.fitBounds({
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    }, 48)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

function RoutePolyline({ path, strokeColor = '#2563eb' }: { path: LatLng[]; strokeColor?: string }) {
  const map = useMap()
  const pathKey = path.map((p) => `${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    if (!map || path.length < 2 || typeof google === 'undefined') return
    const line = new google.maps.Polyline({
      path,
      strokeColor,
      strokeOpacity: 0.85,
      strokeWeight: 4,
      geodesic: true,
      map,
    })
    return () => line.setMap(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pathKey, strokeColor])
  return null
}

function StopPin({ sequence, name, selected }: { sequence: number; name: string; selected?: boolean }) {
  return (
    <div style={{ transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 28, height: 28, borderRadius: 999, flex: '0 0 auto',
          background: selected ? 'var(--brand-600, #2563eb)' : '#0f766e',
          color: '#fff', fontSize: 12, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}
      >
        {sequence}
      </span>
      <span
        style={{
          background: 'var(--surface, #fff)', padding: '2px 8px', borderRadius: 6,
          border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}
      >
        {name}
      </span>
    </div>
  )
}

export type RouteBuilderMapProps = {
  stops: RouteStop[]
  height?: number
  selectedStopId?: string | null
  onMapClick?: (lat: number, lng: number) => void
  onStopClick?: (stopId: string) => void
}

/**
 * Interactive route editor map: click to add stops (via parent), polyline through placed stops,
 * numbered markers. Parent handles persistence.
 */
export function RouteBuilderMap({
  stops, height = 420, selectedStopId, onMapClick, onStopClick,
}: RouteBuilderMapProps) {
  const placed = useMemo(() => placedStops(stops), [stops])
  const path = useMemo(
    () => placed.sort((a, b) => a.sequence - b.sequence).map((s) => ({ lat: s.lat as number, lng: s.lng as number })),
    [placed],
  )
  const initialCenter = path[0] ?? DEFAULT_CENTER
  const initialZoom = path.length > 0 ? 14 : DEFAULT_ZOOM

  if (!API_KEY) {
    return (
      <div
        className="col ai-center jc-center"
        style={{ height, borderRadius: 14, border: '1px dashed var(--border)', background: 'var(--surface-2)', padding: 24, textAlign: 'center' }}
      >
        <div className="fw6">Map not configured</div>
        <div className="t-sm muted">Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to enable the route builder.</div>
      </div>
    )
  }

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
          onClick={(e) => {
            if (!onMapClick || !e.detail.latLng) return
            onMapClick(e.detail.latLng.lat, e.detail.latLng.lng)
          }}
        >
          {path.length >= 2 && <RoutePolyline path={path} />}
          {placed.map((s) => (
            <AdvancedMarker
              key={s.id}
              position={{ lat: s.lat as number, lng: s.lng as number }}
              onClick={() => onStopClick?.(s.id)}
            >
              <StopPin sequence={s.sequence} name={s.name} selected={s.id === selectedStopId} />
            </AdvancedMarker>
          ))}
          <FitStops stops={path} />
        </Map>
      </APIProvider>
      {onMapClick && (
        <div className="t-xs muted3" style={{ position: 'absolute', bottom: 10, left: 12, background: 'var(--surface)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
          Click map to add a stop
        </div>
      )}
    </div>
  )
}

export type MapStop = { id: string; name: string; sequence: number; lat: number; lng: number }

/** Fleet map with optional route polyline + stop markers. */
export function TransportRouteMap({
  stops, buses, height = 360,
}: {
  stops?: MapStop[]
  buses?: { id: string; busNo: string; lat: number; lng: number; speedKmh?: number | null; moving?: boolean }[]
  height?: number
}) {
  const path = useMemo(
    () => (stops ?? []).sort((a, b) => a.sequence - b.sequence).map((s) => ({ lat: s.lat, lng: s.lng })),
    [stops],
  )

  if (!API_KEY) {
    return (
      <div className="col ai-center jc-center" style={{ height, borderRadius: 14, border: '1px dashed var(--border)', background: 'var(--surface-2)' }}>
        <div className="t-sm muted">Map not configured</div>
      </div>
    )
  }

  const busPoints = buses ?? []
  const initialCenter = busPoints[0] ? { lat: busPoints[0].lat, lng: busPoints[0].lng } : path[0] ?? DEFAULT_CENTER

  return (
    <div style={{ position: 'relative', height, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <APIProvider apiKey={API_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={initialCenter}
          defaultZoom={13}
          gestureHandling="greedy"
          style={{ width: '100%', height: '100%' }}
        >
          {path.length >= 2 && <RoutePolyline path={path} />}
          {(stops ?? []).map((s) => (
            <AdvancedMarker key={s.id} position={{ lat: s.lat, lng: s.lng }}>
              <StopPin sequence={s.sequence} name={s.name} />
            </AdvancedMarker>
          ))}
          {busPoints.map((b) => (
            <AdvancedMarker key={b.id} position={{ lat: b.lat, lng: b.lng }}>
              <span style={{ background: '#16a34a', color: '#fff', padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                {b.busNo}{b.moving && b.speedKmh != null ? ` · ${Math.round(b.speedKmh)}` : ''}
              </span>
            </AdvancedMarker>
          ))}
          <FitStops stops={path.length > 0 ? path : busPoints.map((b) => ({ lat: b.lat, lng: b.lng }))} />
        </Map>
      </APIProvider>
    </div>
  )
}

const ROUTE_COLORS = ['#2563eb', '#0d9488', '#c026d3', '#ea580c', '#64748b']

function routeHue(routeId: string): number {
  let h = 0
  for (let i = 0; i < routeId.length; i++) h = (h * 31 + routeId.charCodeAt(i)) % ROUTE_COLORS.length
  return h
}

/** Live fleet map with route polylines per assigned route and bus markers. */
export function FleetLiveMap({
  fleet,
  routeStopsByRouteId,
  height = 360,
}: {
  fleet: { busId: string; busNo: string; routeId?: string | null; lat?: number | null; lng?: number | null; speedKmh?: number | null; status?: string }[]
  routeStopsByRouteId: Record<string, RouteStop[]>
  height?: number
}) {
  const busPoints = fleet
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => ({
      id: b.busId,
      busNo: b.busNo,
      lat: b.lat as number,
      lng: b.lng as number,
      speedKmh: b.speedKmh ?? null,
      moving: b.status === 'on_route' || b.status === 'delayed',
    }))

  const routePaths = Object.entries(routeStopsByRouteId).map(([routeId, stops]) => {
    const placed = placedStops(stops)
    const path = placed.sort((a, b) => a.sequence - b.sequence).map((s) => ({ lat: s.lat as number, lng: s.lng as number }))
    return { routeId, path, stops: placed }
  }).filter((r) => r.path.length >= 2)

  if (!API_KEY) {
    return (
      <div className="col ai-center jc-center" style={{ height, borderRadius: 14, border: '1px dashed var(--border)', background: 'var(--surface-2)' }}>
        <div className="t-sm muted">Map not configured</div>
      </div>
    )
  }

  const initialCenter = busPoints[0]
    ? { lat: busPoints[0].lat, lng: busPoints[0].lng }
    : routePaths[0]?.path[0] ?? DEFAULT_CENTER

  return (
    <div style={{ position: 'relative', height, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <APIProvider apiKey={API_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={initialCenter}
          defaultZoom={13}
          gestureHandling="greedy"
          style={{ width: '100%', height: '100%' }}
        >
          {routePaths.map((r) => (
            <RoutePolyline key={r.routeId} path={r.path} strokeColor={ROUTE_COLORS[routeHue(r.routeId)]} />
          ))}
          {routePaths.flatMap((r) => r.stops.map((s) => (
            <AdvancedMarker key={s.id} position={{ lat: s.lat as number, lng: s.lng as number }}>
              <StopPin sequence={s.sequence} name={s.name} />
            </AdvancedMarker>
          )))}
          {busPoints.map((b) => (
            <AdvancedMarker key={b.id} position={{ lat: b.lat, lng: b.lng }}>
              <span style={{ background: '#16a34a', color: '#fff', padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
                {b.busNo}{b.moving && b.speedKmh != null ? ` · ${Math.round(b.speedKmh)}` : ''}
              </span>
            </AdvancedMarker>
          ))}
          <FitStops stops={
            busPoints.length > 0
              ? busPoints.map((b) => ({ lat: b.lat, lng: b.lng }))
              : routePaths.flatMap((r) => r.path)
          } />
        </Map>
      </APIProvider>
      {busPoints.length === 0 && routePaths.length === 0 && (
        <div className="col ai-center jc-center" style={{ position: 'absolute', inset: 0, gap: 8, textAlign: 'center', padding: 24, pointerEvents: 'none', background: 'rgba(0,0,0,0.03)' }}>
          <div className="fw6">Waiting for live GPS</div>
          <div className="t-sm muted">Assign routes to buses and start a trip to see polylines and positions.</div>
        </div>
      )}
    </div>
  )
}
