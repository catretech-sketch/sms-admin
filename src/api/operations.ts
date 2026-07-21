import { request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { BusStatus } from '@/types'

/* ---------- KPI summaries ---------- */
export interface LibrarySummary { catalogue: number; members: number; issued: number; finesDue: number }
export interface TransportSummary { vehicles: number; routes: number; students: number; stops: number }

/* ---------- Live fleet board (GET /v1/transport/fleet) ---------- */
export interface FleetBus {
  busId: string
  routeId?: string | null
  busNo: string
  routeName?: string | null
  driver?: string | null
  driverPhone?: string | null
  stopCount: number
  studentsRiding: number
  status: BusStatus
  lat?: number | null
  lng?: number | null
  speedKmh?: number | null
  nextStopName?: string | null
  lastPingAt?: string | null
}
/* ---------- Student → bus roster (admin) ---------- */
export interface StudentBusAssignment {
  studentId: string
  studentName: string
  initials: string
  admissionNo: string
  busId: string
  busNo: string
  routeName?: string | null
  stopId?: string | null
  stopName?: string | null
}

export interface HostelSummary { blocks: number; rooms: number; residents: number; occupancyPct: number }
export interface SportsSummary { teams: number; events: number; athletes: number; medals: number }

/* ---------- Hostel masters ---------- */
export interface HostelBlock { id: string; name: string; warden: string | null }
export interface HostelRoom { id: string; blockId: string; blockName: string | null; roomNo: string; capacity: number; residents: number }
export interface HostelResident { id: string; roomId: string; roomNo: string | null; studentName: string; studentId: string | null }

export interface CreateHostelBlockInput { name: string; warden?: string | null }
export interface CreateHostelRoomInput { blockId: string; roomNo: string; capacity: number }
export interface CreateHostelResidentInput { roomId: string; studentName: string; studentId?: string | null }

/* ---------- Sports masters ---------- */
export interface SportsTeam { id: string; name: string; sport: string; coach: string | null; athletes: number }
export interface SportsEvent { id: string; name: string; eventDate: string; venue: string | null }
export interface SportsMedal { id: string; kind: string; title: string | null; year: number }

export interface CreateSportsTeamInput { name: string; sport: string; coach?: string | null; athletes: number }
export interface CreateSportsEventInput { name: string; eventDate: string; venue?: string | null }
export interface CreateSportsMedalInput { kind: string; title?: string | null; year?: number | null }

const asObj = <T>(wire: unknown): T => snakeToCamel<T>(wire)
const asList = <T>(wire: unknown): T[] => (Array.isArray(wire) ? wire.map((w) => snakeToCamel<T>(w)) : [])

/* ---------- Library ---------- */
export async function getLibrarySummary(): Promise<LibrarySummary> {
  return asObj<LibrarySummary>(await request<Record<string, unknown>>('/library/summary'))
}

/* ---------- Transport ---------- */
export interface CreateBusInput { busNo: string; routeName?: string | null; driver?: string | null; driverPhone?: string | null }
export interface TransportRoute { id: string; name: string; stops: number }
export interface CreateRouteInput { name: string; stops?: number }

export async function getTransportSummary(): Promise<TransportSummary> {
  return asObj<TransportSummary>(await request<Record<string, unknown>>('/transport/summary'))
}
export async function getTransportFleet(): Promise<FleetBus[]> {
  return asList<FleetBus>(await request<Record<string, unknown>[]>('/transport/fleet'))
}
export async function createBus(input: CreateBusInput): Promise<FleetBus> {
  const busNo = input.busNo.trim()
  if (!busNo) throw new Error('Bus number is required')
  const body = camelToSnake({ busNo, routeName: input.routeName?.trim() || null, driver: input.driver?.trim() || null, driverPhone: input.driverPhone?.trim() || null })
  return asObj<FleetBus>(await request<Record<string, unknown>>('/transport/buses', { method: 'POST', body }))
}
export async function listTransportRoutes(): Promise<TransportRoute[]> {
  return asList<TransportRoute>(await request<Record<string, unknown>[]>('/transport/routes'))
}
export async function createRoute(input: CreateRouteInput): Promise<TransportRoute> {
  const name = input.name.trim()
  if (!name) throw new Error('Route name is required')
  const body = camelToSnake({ name, stops: Math.max(1, (input.stops ?? 1) | 0) })
  return asObj<TransportRoute>(await request<Record<string, unknown>>('/transport/routes', { method: 'POST', body }))
}

export interface RouteStop {
  id: string
  routeId: string
  name: string
  sequence: number
  lat?: number | null
  lng?: number | null
}

export async function listRouteStops(routeId: string): Promise<RouteStop[]> {
  if (!routeId) return []
  return asList<RouteStop>(await request<Record<string, unknown>[]>(`/transport/routes/${routeId}/stops`))
}

export async function listBusStudents(busId: string): Promise<StudentBusAssignment[]> {
  if (!busId) throw new Error('Pick a bus')
  return asList<StudentBusAssignment>(await request<Record<string, unknown>[]>(`/transport/buses/${busId}/students`))
}
export async function assignStudentToBus(busId: string, studentId: string, stopId?: string | null): Promise<void> {
  if (!busId) throw new Error('Pick a bus')
  if (!studentId) throw new Error('Pick a student')
  await request<void>(`/transport/buses/${busId}/students/${studentId}`, {
    method: 'PUT', body: camelToSnake({ stopId: stopId || null }),
  })
}
export async function unassignStudentFromBus(busId: string, studentId: string): Promise<void> {
  if (!busId || !studentId) throw new Error('Missing bus or student')
  await request<void>(`/transport/buses/${busId}/students/${studentId}`, { method: 'DELETE' })
}

export interface BusLocationInput {
  lat?: number
  lng?: number
  speedKmh?: number
  status?: BusStatus
}

export async function updateBusLocation(busId: string, input: BusLocationInput): Promise<void> {
  if (!busId) throw new Error('Bus ID required')
  await request<void>(`/transport/buses/${busId}/location`, {
    method: 'PUT',
    body: camelToSnake(input),
  })
}

export interface SendBusNotificationInput {
  eventType: 'departed' | 'approaching' | 'arrived'
  stopId?: string | null
  channels: ('push' | 'sms')[]
}

export async function sendBusNotification(busId: string, input: SendBusNotificationInput): Promise<{ reach: number }> {
  if (!busId) throw new Error('Bus ID required')
  return request<{ reach: number }>(`/transport/buses/${busId}/notify`, {
    method: 'POST',
    body: camelToSnake(input),
  })
}

/* ---------- Hostel ---------- */
export async function getHostelSummary(): Promise<HostelSummary> {
  return asObj<HostelSummary>(await request<Record<string, unknown>>('/hostel/summary'))
}
export async function listHostelBlocks(): Promise<HostelBlock[]> {
  return asList<HostelBlock>(await request<Record<string, unknown>[]>('/hostel/blocks'))
}
export async function createHostelBlock(input: CreateHostelBlockInput): Promise<HostelBlock> {
  const name = input.name.trim()
  if (!name) throw new Error('Block name is required')
  const body = camelToSnake({ name, warden: input.warden?.trim() || null })
  return asObj<HostelBlock>(await request<Record<string, unknown>>('/hostel/blocks', { method: 'POST', body }))
}
export async function listHostelRooms(): Promise<HostelRoom[]> {
  return asList<HostelRoom>(await request<Record<string, unknown>[]>('/hostel/rooms'))
}
export async function createHostelRoom(input: CreateHostelRoomInput): Promise<HostelRoom> {
  const roomNo = input.roomNo.trim()
  if (!input.blockId) throw new Error('Pick a block')
  if (!roomNo) throw new Error('Room number is required')
  const body = camelToSnake({ blockId: input.blockId, roomNo, capacity: Math.max(1, input.capacity | 0) })
  return asObj<HostelRoom>(await request<Record<string, unknown>>('/hostel/rooms', { method: 'POST', body }))
}
export async function listHostelResidents(): Promise<HostelResident[]> {
  return asList<HostelResident>(await request<Record<string, unknown>[]>('/hostel/residents'))
}
export async function createHostelResident(input: CreateHostelResidentInput): Promise<HostelResident> {
  const studentName = input.studentName.trim()
  if (!input.roomId) throw new Error('Pick a room')
  if (!studentName) throw new Error('Resident name is required')
  const body = camelToSnake({ roomId: input.roomId, studentName, studentId: input.studentId || null })
  return asObj<HostelResident>(await request<Record<string, unknown>>('/hostel/residents', { method: 'POST', body }))
}

/* ---------- Sports ---------- */
export async function getSportsSummary(): Promise<SportsSummary> {
  return asObj<SportsSummary>(await request<Record<string, unknown>>('/sports/summary'))
}
export async function listSportsTeams(): Promise<SportsTeam[]> {
  return asList<SportsTeam>(await request<Record<string, unknown>[]>('/sports/teams'))
}
export async function createSportsTeam(input: CreateSportsTeamInput): Promise<SportsTeam> {
  const name = input.name.trim(); const sport = input.sport.trim()
  if (!name) throw new Error('Team name is required')
  if (!sport) throw new Error('Sport is required')
  const body = camelToSnake({ name, sport, coach: input.coach?.trim() || null, athletes: Math.max(0, input.athletes | 0) })
  return asObj<SportsTeam>(await request<Record<string, unknown>>('/sports/teams', { method: 'POST', body }))
}
export async function listSportsEvents(): Promise<SportsEvent[]> {
  return asList<SportsEvent>(await request<Record<string, unknown>[]>('/sports/events'))
}
export async function createSportsEvent(input: CreateSportsEventInput): Promise<SportsEvent> {
  const name = input.name.trim()
  if (!name) throw new Error('Event name is required')
  if (!input.eventDate) throw new Error('Event date is required')
  const body = camelToSnake({ name, eventDate: input.eventDate, venue: input.venue?.trim() || null })
  return asObj<SportsEvent>(await request<Record<string, unknown>>('/sports/events', { method: 'POST', body }))
}
export async function listSportsMedals(): Promise<SportsMedal[]> {
  return asList<SportsMedal>(await request<Record<string, unknown>[]>('/sports/medals'))
}
export async function createSportsMedal(input: CreateSportsMedalInput): Promise<SportsMedal> {
  const kind = (input.kind || '').trim().toLowerCase()
  if (!['gold', 'silver', 'bronze'].includes(kind)) throw new Error('Pick gold, silver or bronze')
  const body = camelToSnake({ kind, title: input.title?.trim() || null, year: input.year ?? null })
  return asObj<SportsMedal>(await request<Record<string, unknown>>('/sports/medals', { method: 'POST', body }))
}
