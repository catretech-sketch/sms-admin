import { describe, it, expect } from 'vitest'
import { mergeFleetTelemetry } from './useOperations'
import type { FleetBus } from '../transport'

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
