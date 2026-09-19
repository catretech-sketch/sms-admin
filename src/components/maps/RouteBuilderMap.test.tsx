import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Map: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AdvancedMarker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  MapControl: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ControlPosition: { TOP_LEFT: 'TOP_LEFT' },
  useMap: () => null,
  useMapsLibrary: () => null,
}))

import { RouteBuilderMap, FleetLiveMap } from './RouteBuilderMap'
import type { RouteStop } from '@/api/transport'

// VITE_GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_MAP_ID are provided for the test environment
// via `test.env` in vite.config.ts — Vite replaces `import.meta.env.*` statically at build
// time, so a runtime `vi.stubGlobal('import.meta', ...)` here is a no-op and must not be used.

const stops: RouteStop[] = [
  { id: 's1', routeId: 'r1', name: 'Stop 1', sequence: 1, lat: 12.1, lng: 77.1 },
  { id: 's2', routeId: 'r1', name: 'Stop 2', sequence: 2, lat: 12.2, lng: 77.2 },
]

describe('RouteBuilderMap route geometry', () => {
  it('shows a Route unavailable indicator when geometry status is unavailable', () => {
    render(
      <RouteBuilderMap
        stops={stops}
        geometry={{
          routeId: 'r1', status: 'unavailable', format: null, geometry: null,
          distanceMeters: null, durationSeconds: null, stopSequenceHash: 'h', generatedAt: null,
        }}
      />,
    )
    expect(screen.getByText(/route unavailable/i)).toBeInTheDocument()
  })

  it('does not show the unavailable indicator when geometry is available, and actually renders the map with stops', () => {
    render(
      <RouteBuilderMap
        stops={stops}
        geometry={{
          routeId: 'r1', status: 'available', format: 'google-encoded-polyline', geometry: 'abc',
          distanceMeters: 100, durationSeconds: 10, stopSequenceHash: 'h', generatedAt: '2026-09-19T10:00:00Z',
        }}
      />,
    )
    // Positive assertion beyond "badge is absent": prove the map actually rendered (stop
    // markers present) rather than silently falling back to the "Map not configured" state,
    // which would also make the badge assertion below pass vacuously.
    expect(screen.getByText('Stop 1')).toBeInTheDocument()
    expect(screen.getByText('Stop 2')).toBeInTheDocument()
    expect(screen.queryByText(/map not configured/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/route unavailable/i)).not.toBeInTheDocument()
  })
})

describe('FleetLiveMap route geometry', () => {
  const fleet = [{ busId: 'b1', busNo: 'BUS-01', routeId: 'r1', lat: 12.1, lng: 77.1, speedKmh: 20 }]
  const routeStopsByRouteId = { r1: [
    { id: 's1', routeId: 'r1', name: 'Stop 1', sequence: 1, lat: 12.1, lng: 77.1 },
    { id: 's2', routeId: 'r1', name: 'Stop 2', sequence: 2, lat: 12.2, lng: 77.2 },
  ] }

  it('shows Route unavailable for a selected bus whose route geometry is unavailable', async () => {
    const user = userEvent.setup()
    render(
      <FleetLiveMap
        fleet={fleet}
        routeStopsByRouteId={routeStopsByRouteId}
        routeGeometryByRouteId={{ r1: {
          routeId: 'r1', status: 'unavailable', format: null, geometry: null,
          distanceMeters: null, durationSeconds: null, stopSequenceHash: 'h', generatedAt: null,
        } }}
      />,
    )
    // Selecting the bus is required to trigger route drawing per existing FleetLiveMap behavior
    // (no selection = no routes at all).
    await user.click(screen.getByRole('button', { name: /all buses/i }))
    await user.click(screen.getByRole('checkbox', { name: /bus-01/i }))
    expect(screen.getByText(/route unavailable/i)).toBeInTheDocument()
  })

  it('does not show the unavailable indicator when a selected bus has available geometry', async () => {
    const user = userEvent.setup()
    render(
      <FleetLiveMap
        fleet={fleet}
        routeStopsByRouteId={routeStopsByRouteId}
        routeGeometryByRouteId={{ r1: {
          routeId: 'r1', status: 'available', format: 'google-encoded-polyline', geometry: 'abc',
          distanceMeters: 100, durationSeconds: 10, stopSequenceHash: 'h', generatedAt: '2026-09-19T10:00:00Z',
        } }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /all buses/i }))
    await user.click(screen.getByRole('checkbox', { name: /bus-01/i }))
    // Positive assertion: prove the map/route actually rendered (stop marker present),
    // not just that the badge happens to be absent.
    expect(screen.getByText('Stop 1')).toBeInTheDocument()
    expect(screen.queryByText(/route unavailable/i)).not.toBeInTheDocument()
  })

  it('renders speed, the highlightStop ★ overlay, and available road geometry together in one pass', async () => {
    const user = userEvent.setup()
    const fleetWithSpeed = [{ busId: 'b1', busNo: 'BUS-01', routeId: 'r1', lat: 12.1, lng: 77.1, speedKmh: 42 }]
    render(
      <FleetLiveMap
        fleet={fleetWithSpeed}
        routeStopsByRouteId={routeStopsByRouteId}
        highlightStop={{ name: 'Home', lat: 12.15, lng: 77.15 }}
        routeGeometryByRouteId={{ r1: {
          routeId: 'r1', status: 'available', format: 'google-encoded-polyline', geometry: 'abc',
          distanceMeters: 100, durationSeconds: 10, stopSequenceHash: 'h', generatedAt: '2026-09-19T10:00:00Z',
        } }}
      />,
    )
    // Routes only draw once a bus is selected — same pattern as the geometry-only tests above.
    await user.click(screen.getByRole('button', { name: /all buses/i }))
    await user.click(screen.getByRole('checkbox', { name: /bus-01/i }))

    // Bus marker with live speed.
    expect(screen.getByText('BUS-01 · 42 km/h')).toBeInTheDocument()
    // Bus icon rendered alongside the label, not a bare colored box.
    expect(screen.getByTestId('bus-icon-b1')).toBeInTheDocument()
    // ★ highlightStop overlay.
    expect(screen.getByText('★ Home')).toBeInTheDocument()
    // Road-following geometry rendered (available) — no "unavailable" fallback badge.
    expect(screen.queryByText(/route unavailable/i)).not.toBeInTheDocument()
    // Route stop markers (drawn alongside the road polyline for the selected bus's route).
    expect(screen.getByText('Stop 1')).toBeInTheDocument()
    expect(screen.getByText('Stop 2')).toBeInTheDocument()
  })

  it('rotates the bus icon to match its GPS heading', async () => {
    const user = userEvent.setup()
    const fleetWithHeading = [{ busId: 'b1', busNo: 'BUS-01', routeId: 'r1', lat: 12.1, lng: 77.1, speedKmh: 20, heading: 135 }]
    render(<FleetLiveMap fleet={fleetWithHeading} routeStopsByRouteId={routeStopsByRouteId} />)
    await user.click(screen.getByRole('button', { name: /all buses/i }))
    await user.click(screen.getByRole('checkbox', { name: /bus-01/i }))
    expect(screen.getByTestId('bus-icon-b1')).toHaveStyle({ transform: 'rotate(135deg)' })
  })

  it('does not rotate the bus icon when heading is unavailable', async () => {
    const user = userEvent.setup()
    render(<FleetLiveMap fleet={fleet} routeStopsByRouteId={routeStopsByRouteId} />)
    await user.click(screen.getByRole('button', { name: /all buses/i }))
    await user.click(screen.getByRole('checkbox', { name: /bus-01/i }))
    expect(screen.getByTestId('bus-icon-b1')).toHaveStyle({ transform: 'rotate(0deg)' })
  })

  it('does not show a student count badge on stop markers (count is revealed via click instead)', async () => {
    const user = userEvent.setup()
    render(
      <FleetLiveMap
        fleet={fleet}
        routeStopsByRouteId={routeStopsByRouteId}
      />,
    )
    await user.click(screen.getByRole('button', { name: /all buses/i }))
    await user.click(screen.getByRole('checkbox', { name: /bus-01/i }))
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })

  it('calls onStopClick with the stop id when a stop marker is clicked', async () => {
    const user = userEvent.setup()
    const onStopClick = vi.fn()
    render(
      <FleetLiveMap
        fleet={fleet}
        routeStopsByRouteId={routeStopsByRouteId}
        onStopClick={onStopClick}
      />,
    )
    await user.click(screen.getByRole('button', { name: /all buses/i }))
    await user.click(screen.getByRole('checkbox', { name: /bus-01/i }))
    await user.click(screen.getByText('Stop 1'))
    expect(onStopClick).toHaveBeenCalledWith('s1')
  })
})
