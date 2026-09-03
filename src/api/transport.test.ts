import { describe, it, expect, vi, afterEach } from 'vitest'
import { startBusTrip, pingBusTrip, endBusTrip, listTransportBuses, createBus, updateBus } from './transport'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('transport buses API', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('GETs bus list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{ bus_id: 'B1', bus_no: 'BUS-01', route_id: 'R1', driver_staff_id: null, stop_count: 5, students_assigned: 12 }],
    })))
    const rows = await listTransportBuses()
    expect(rows[0].busId).toBe('B1')
    expect(rows[0].routeId).toBe('R1')
  })

  it('POSTs create bus with route and driver', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { bus_id: 'B2', bus_no: 'BUS-02', route_id: 'R1', status: 'idle', stop_count: 5, students_riding: 0 },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await createBus({ busNo: 'BUS-02', routeId: 'R1', driverStaffId: 'S1' })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.route_id).toBe('R1')
    expect(body.driver_staff_id).toBe('S1')
  })

  it('PUTs bus update', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { bus_id: 'B1', bus_no: 'BUS-01', route_id: 'R2', driver_staff_id: 'S2', stop_count: 8, students_assigned: 10 },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const row = await updateBus('B1', { routeId: 'R2', driverStaffId: 'S2' })
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/transport\/buses\/B1$/)
    expect(row.routeId).toBe('R2')
    expect(row.driverStaffId).toBe('S2')
  })
})

describe('bus trip GPS', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs trip start', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }))
    vi.stubGlobal('fetch', fetchMock)
    await startBusTrip('B1', 'pickup')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toMatch(/\/transport\/buses\/B1\/trip\/start$/)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.direction).toBe('pickup')
  })

  it('POSTs trip pings batch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: null }))
    vi.stubGlobal('fetch', fetchMock)
    await pingBusTrip('B1', [{ lat: 12.97, lng: 77.59, speedKmh: 30, at: '2026-08-01T10:00:00Z' }])
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/transport\/buses\/B1\/trip\/pings$/)
  })

  it('POSTs trip end', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: { trip_id: 'T1', duration_min: 10, distance_km: 5.2, stops_covered: 3, boarded_count: 12 },
    })))
    const summary = await endBusTrip('B1')
    expect(summary.tripId).toBe('T1')
    expect(summary.distanceKm).toBe(5.2)
  })
})
