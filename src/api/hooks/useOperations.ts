import { useState, useEffect, useRef } from 'react'
import {
  useQuery, useMutation, useQueryClient,
  type UseQueryResult, type UseMutationResult,
} from '@tanstack/react-query'
import { queryKeys } from '../queryKeys'
import { config } from '../config'
import { tokenStore } from '../auth/tokenStore'
import {
  getLibrarySummary, getTransportSummary, getTransportFleet,
  listBusStudents, assignStudentToBus, unassignStudentFromBus, updateBusLocation, sendBusNotification,
  createBus, listTransportRoutes, createRoute, listRouteStops,
  getHostelSummary, listHostelBlocks, createHostelBlock, listHostelRooms, createHostelRoom,
  listHostelResidents, createHostelResident,
  getSportsSummary, listSportsTeams, createSportsTeam, listSportsEvents, createSportsEvent,
  listSportsMedals, createSportsMedal,
  type LibrarySummary, type TransportSummary, type FleetBus, type StudentBusAssignment,
  type TransportRoute, type CreateBusInput, type CreateRouteInput, type RouteStop, type BusLocationInput, type SendBusNotificationInput,
  type HostelSummary, type SportsSummary,
  type HostelBlock, type HostelRoom, type HostelResident,
  type SportsTeam, type SportsEvent, type SportsMedal,
  type CreateHostelBlockInput, type CreateHostelRoomInput, type CreateHostelResidentInput,
  type CreateSportsTeamInput, type CreateSportsEventInput, type CreateSportsMedalInput,
} from '../operations'

/* ---------- Library ---------- */
export function useLibrarySummary(): UseQueryResult<LibrarySummary> {
  return useQuery({ queryKey: queryKeys.operations.librarySummary, queryFn: getLibrarySummary })
}

/* ---------- Transport ---------- */
export function useTransportSummary(): UseQueryResult<TransportSummary> {
  return useQuery({ queryKey: queryKeys.operations.transportSummary, queryFn: getTransportSummary })
}
/**
 * Live fleet board. Polls every `refetchMs` (default 5s) while mounted so
 * positions / speed / status stay current without a manual refresh.
 */
export function useTransportFleet(enabled = true, refetchMs = 5000): UseQueryResult<FleetBus[]> {
  return useQuery({
    queryKey: queryKeys.operations.transportFleet,
    queryFn: getTransportFleet,
    enabled,
    refetchInterval: enabled ? refetchMs : false,
    refetchIntervalInBackground: false,
  })
}

/** Students assigned to a bus (admin roster). Disabled until a bus is selected. */
export function useBusStudents(busId: string | null): UseQueryResult<StudentBusAssignment[]> {
  return useQuery({
    queryKey: queryKeys.operations.busStudents(busId ?? ''),
    queryFn: () => listBusStudents(busId as string),
    enabled: !!busId,
  })
}

export function useAssignStudentToBus(): UseMutationResult<void, Error, { busId: string; studentId: string; stopId?: string | null }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ busId, studentId, stopId }) => assignStudentToBus(busId, studentId, stopId),
    onSuccess: (_r, { busId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.busStudents(busId) })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportSummary })
    },
  })
}

export function useUnassignStudentFromBus(): UseMutationResult<void, Error, { busId: string; studentId: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ busId, studentId }) => unassignStudentFromBus(busId, studentId),
    onSuccess: (_r, { busId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.busStudents(busId) })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportSummary })
    },
  })
}

export function useUpdateBusLocation(): UseMutationResult<void, Error, { busId: string } & BusLocationInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ busId, ...input }) => updateBusLocation(busId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportFleet })
    },
  })
}

export function useSendBusNotification(): UseMutationResult<{ reach: number }, Error, { busId: string } & SendBusNotificationInput> {
  return useMutation({
    mutationFn: ({ busId, ...input }) => sendBusNotification(busId, input),
  })
}

/**
 * WebSocket subscription for live fleet updates.
 * Connects to `{apiBase}/transport/fleet/live` (ws:// or wss://).
 * When connected, it writes incoming messages directly into the
 * transportFleet query cache — no HTTP round-trip needed.
 * Falls back gracefully: if the backend doesn't support WS, the caller
 * can fall back to polling (check the returned `connected` flag).
 * Reconnects with exponential back-off (1 s → 2 s → … → 30 s).
 */
export function useFleetWebSocket(enabled = true): { connected: boolean } {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backoffRef = useRef(1000)
  const activeRef = useRef(true)

  useEffect(() => {
    if (!enabled) return
    activeRef.current = true
    backoffRef.current = 1000

    const wsBase = config.apiBaseUrl.replace(/^http/, 'ws')
    const endpoint = wsBase + '/transport/fleet/live'

    function connect() {
      if (!activeRef.current) return
      const token = tokenStore.getAccess()
      const url = token ? `${endpoint}?token=${encodeURIComponent(token)}` : endpoint
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        backoffRef.current = 1000
      }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type: string; data: unknown }
          if (msg.type === 'fleet_update' && Array.isArray(msg.data)) {
            qc.setQueryData(queryKeys.operations.transportFleet, msg.data)
          } else if (msg.type === 'bus_update' && msg.data && typeof msg.data === 'object') {
            qc.setQueryData<FleetBus[]>(queryKeys.operations.transportFleet, (prev) => {
              const update = msg.data as FleetBus
              if (!prev) return [update]
              const idx = prev.findIndex((b) => b.busId === update.busId)
              if (idx === -1) return [...prev, update]
              const next = [...prev]
              next[idx] = update
              return next
            })
          }
        } catch { /* ignore malformed messages */ }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (!activeRef.current) return
        retryRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, 30_000)
          connect()
        }, backoffRef.current)
      }

      ws.onerror = () => { ws.close() }
    }

    connect()

    return () => {
      activeRef.current = false
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
      setConnected(false)
    }
  }, [enabled, qc])

  return { connected }
}

export function useCreateBus(): UseMutationResult<FleetBus, Error, CreateBusInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createBus,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportFleet })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportSummary })
    },
  })
}
export function useTransportRoutes(): UseQueryResult<TransportRoute[]> {
  return useQuery({ queryKey: queryKeys.operations.transportRoutes, queryFn: listTransportRoutes })
}
export function useRouteStops(routeId: string | null): UseQueryResult<RouteStop[]> {
  return useQuery({
    queryKey: queryKeys.operations.transportRouteStops(routeId ?? ''),
    queryFn: () => listRouteStops(routeId as string),
    enabled: !!routeId,
  })
}
export function useCreateRoute(): UseMutationResult<TransportRoute, Error, CreateRouteInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createRoute,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportRoutes })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.transportSummary })
    },
  })
}

/* ---------- Hostel ---------- */
export function useHostelSummary(): UseQueryResult<HostelSummary> {
  return useQuery({ queryKey: queryKeys.operations.hostelSummary, queryFn: getHostelSummary })
}
export function useHostelBlocks(): UseQueryResult<HostelBlock[]> {
  return useQuery({ queryKey: queryKeys.operations.hostelBlocks, queryFn: listHostelBlocks })
}
export function useHostelRooms(): UseQueryResult<HostelRoom[]> {
  return useQuery({ queryKey: queryKeys.operations.hostelRooms, queryFn: listHostelRooms })
}
export function useHostelResidents(): UseQueryResult<HostelResident[]> {
  return useQuery({ queryKey: queryKeys.operations.hostelResidents, queryFn: listHostelResidents })
}

export function useCreateHostelBlock(): UseMutationResult<HostelBlock, Error, CreateHostelBlockInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createHostelBlock,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.hostelBlocks })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.hostelSummary })
    },
  })
}
export function useCreateHostelRoom(): UseMutationResult<HostelRoom, Error, CreateHostelRoomInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createHostelRoom,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.hostelRooms })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.hostelSummary })
    },
  })
}
export function useCreateHostelResident(): UseMutationResult<HostelResident, Error, CreateHostelResidentInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createHostelResident,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.hostelResidents })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.hostelRooms })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.hostelSummary })
    },
  })
}

/* ---------- Sports ---------- */
export function useSportsSummary(): UseQueryResult<SportsSummary> {
  return useQuery({ queryKey: queryKeys.operations.sportsSummary, queryFn: getSportsSummary })
}
export function useSportsTeams(): UseQueryResult<SportsTeam[]> {
  return useQuery({ queryKey: queryKeys.operations.sportsTeams, queryFn: listSportsTeams })
}
export function useSportsEvents(): UseQueryResult<SportsEvent[]> {
  return useQuery({ queryKey: queryKeys.operations.sportsEvents, queryFn: listSportsEvents })
}
export function useSportsMedals(): UseQueryResult<SportsMedal[]> {
  return useQuery({ queryKey: queryKeys.operations.sportsMedals, queryFn: listSportsMedals })
}

export function useCreateSportsTeam(): UseMutationResult<SportsTeam, Error, CreateSportsTeamInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSportsTeam,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.sportsTeams })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.sportsSummary })
    },
  })
}
export function useCreateSportsEvent(): UseMutationResult<SportsEvent, Error, CreateSportsEventInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSportsEvent,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.sportsEvents })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.sportsSummary })
    },
  })
}
export function useCreateSportsMedal(): UseMutationResult<SportsMedal, Error, CreateSportsMedalInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSportsMedal,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.operations.sportsMedals })
      void qc.invalidateQueries({ queryKey: queryKeys.operations.sportsSummary })
    },
  })
}
