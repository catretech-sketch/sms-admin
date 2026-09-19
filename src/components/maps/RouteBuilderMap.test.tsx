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

vi.stubGlobal('import.meta', { env: { VITE_GOOGLE_MAPS_API_KEY: 'test-key', VITE_GOOGLE_MAPS_MAP_ID: 'test-map' } })

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

  it('does not show the unavailable indicator when geometry is available', () => {
    render(
      <RouteBuilderMap
        stops={stops}
        geometry={{
          routeId: 'r1', status: 'available', format: 'google-encoded-polyline', geometry: 'abc',
          distanceMeters: 100, durationSeconds: 10, stopSequenceHash: 'h', generatedAt: '2026-09-19T10:00:00Z',
        }}
      />,
    )
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
    expect(screen.queryByText(/route unavailable/i)).not.toBeInTheDocument()
  })
})
