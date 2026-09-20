import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mergeFleetTelemetry, useRouteGeometry, useFleetRouteGeometries } from './useOperations'
import type { FleetBus } from '../transport'

vi.mock('@/lib/hooks', () => ({ useApp: () => ({ plan: 'platinum' }) }))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function errorResponse(status = 500): Response {
  return new Response(JSON.stringify({ code: 'internal_error', message: 'boom' }), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children)
}

function bus(overrides: Partial<FleetBus> & { busId: string }): FleetBus {
  return {
    busNo: 'BUS-1', routeId: null, routeName: null, driver: null, driverPhone: null,
    stopCount: 0, studentsRiding: 0, status: 'idle', lat: null, lng: null, speedKmh: null,
    nextStopName: null, lastPingAt: null, ...overrides,
  }
}

describe('mergeFleetTelemetry', () => {
  it('returns the incoming rows as-is when there is no cached data yet', () => {
    const incoming = [bus({ busId: 'b1', routeName: 'Route A' })]
    expect(mergeFleetTelemetry(undefined, incoming)).toBe(incoming)
  })

  it('keeps the cached route/driver assignment fields, taking only live telemetry from the push', () => {
    // Reproduces the reported bug: a bus was just edited to "Route B", refetched correctly,
    // then a live GPS push arrives carrying a stale "Route A" snapshot for the same bus.
    const cached = [bus({
      busId: 'b1', routeId: 'r2', routeName: 'Route B', driver: 'Amit', driverPhone: '999',
      stopCount: 5, studentsRiding: 12, lat: 10, lng: 20, speedKmh: 30, status: 'on_route',
    })]
    const pushed = [bus({
      busId: 'b1', routeId: 'r1', routeName: 'Route A', driver: 'Someone Else', driverPhone: '111',
      stopCount: 1, studentsRiding: 0, lat: 11, lng: 21, speedKmh: 35, status: 'delayed',
      nextStopName: 'Main Gate', lastPingAt: '2026-09-05T10:00:00Z',
    })]

    const merged = mergeFleetTelemetry(cached, pushed)

    expect(merged).toHaveLength(1)
    // Assignment fields stay as cached (the correct, freshly-saved values).
    expect(merged[0].routeId).toBe('r2')
    expect(merged[0].routeName).toBe('Route B')
    expect(merged[0].driver).toBe('Amit')
    expect(merged[0].driverPhone).toBe('999')
    expect(merged[0].stopCount).toBe(5)
    expect(merged[0].studentsRiding).toBe(12)
    // Live telemetry fields come from the push.
    expect(merged[0].lat).toBe(11)
    expect(merged[0].lng).toBe(21)
    expect(merged[0].speedKmh).toBe(35)
    expect(merged[0].status).toBe('delayed')
    expect(merged[0].nextStopName).toBe('Main Gate')
    expect(merged[0].lastPingAt).toBe('2026-09-05T10:00:00Z')
  })

  it('uses the pushed row as-is for a bus not already in the cache', () => {
    const cached = [bus({ busId: 'b1' })]
    const pushed = [bus({ busId: 'b1' }), bus({ busId: 'b2', routeName: 'New Bus Route' })]
    const merged = mergeFleetTelemetry(cached, pushed)
    expect(merged.find((b) => b.busId === 'b2')?.routeName).toBe('New Bus Route')
  })

  it('drops buses no longer present in the push (mirrors the push as the live roster)', () => {
    const cached = [bus({ busId: 'b1' }), bus({ busId: 'b2' })]
    const pushed = [bus({ busId: 'b1' })]
    const merged = mergeFleetTelemetry(cached, pushed)
    expect(merged.map((b) => b.busId)).toEqual(['b1'])
  })
})

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('useRouteGeometry', () => {
  it('surfaces an explicit unavailable geometry object when the request errors, not undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500)))
    const { result } = renderHook(() => useRouteGeometry('r1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toEqual({
      routeId: 'r1', status: 'unavailable', format: null, geometry: null,
      distanceMeters: null, durationSeconds: null, stopSequenceHash: '', generatedAt: null,
    })
  })

  it('leaves data undefined while the query is still pending (no premature unavailable badge)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const { result } = renderHook(() => useRouteGeometry('r1'), { wrapper: makeWrapper() })
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it('resolves the real geometry on success', async () => {
    const geom = {
      route_id: 'r1', status: 'available', format: 'google-encoded-polyline', geometry: 'abc',
      distance_meters: 100, duration_seconds: 10, stop_sequence_hash: 'h', generated_at: '2026-09-19T10:00:00Z',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: geom })))
    const { result } = renderHook(() => useRouteGeometry('r1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.status).toBe('available')
  })
})

describe('useFleetRouteGeometries', () => {
  it('maps an errored route to an unavailable object and leaves a still-pending route absent', async () => {
    const fetchMock = vi.fn((url: string) => (
      String(url).includes('/routes/r1/') ? Promise.resolve(errorResponse(500)) : new Promise(() => {})
    ))
    vi.stubGlobal('fetch', fetchMock)
    const fleet: FleetBus[] = [
      bus({ busId: 'b1', routeId: 'r1' }),
      bus({ busId: 'b2', routeId: 'r2' }),
    ]
    const { result } = renderHook(() => useFleetRouteGeometries(fleet), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.r1?.status).toBe('unavailable'))
    expect(result.current.r2).toBeUndefined()
  })
})
