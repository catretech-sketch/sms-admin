/* SignalR live attendance — invalidates CRM queries when teacher app / another tab marks. */
import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import * as signalR from '@microsoft/signalr'
import { ATTENDANCE_CHANGED, ATTENDANCE_SAVED_EVENT } from '../attendance'
import { PEOPLE_ATTENDANCE_CHANGED } from '../peopleAttendance'
import { config } from '../config'
import { tokenStore } from '../auth/tokenStore'
import { snakeToCamel } from '../mapper'

/** Same event class-wise already listens for after a local save. */
export function bumpAttendanceLiveQueries(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['attendance'] })
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ATTENDANCE_SAVED_EVENT))
  window.dispatchEvent(new Event(ATTENDANCE_CHANGED))
  window.dispatchEvent(new Event(PEOPLE_ATTENDANCE_CHANGED))
}

function isAttendanceLiveEvent(wire: unknown): boolean {
  if (!wire || typeof wire !== 'object') return false
  const msg = snakeToCamel<Record<string, unknown>>(wire as Record<string, unknown>)
  return String(msg.type ?? '') === 'attendance'
}

/**
 * Subscribe to LiveHub. On attendance `live_event`, refresh live KPIs / trend
 * without a full page reload. Polls every 20s while the socket is down.
 */
export function useAttendanceLiveSocket(enabled = true): { connected: boolean } {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)
  const connRef = useRef<signalR.HubConnection | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bumpRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backoffRef = useRef(1000)
  const activeRef = useRef(true)

  useEffect(() => {
    if (!enabled || !tokenStore.getAccess()) return
    activeRef.current = true
    backoffRef.current = 1000

    const hubBase = config.apiBaseUrl.replace(/\/v1\/?$/, '')
    const hubUrl = `${hubBase}/hubs/live`

    function scheduleReconnect() {
      if (!activeRef.current) return
      retryRef.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, 30_000)
        connect()
      }, backoffRef.current)
    }

    function bump() {
      if (bumpRef.current) clearTimeout(bumpRef.current)
      bumpRef.current = setTimeout(() => bumpAttendanceLiveQueries(qc), 250)
    }

    function connect() {
      if (!activeRef.current) return
      const connection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl, {
          accessTokenFactory: () => tokenStore.getAccess() ?? '',
          skipNegotiation: true,
          transport: signalR.HttpTransportType.WebSockets,
        })
        .withAutomaticReconnect([0, 2000, 5000, 10_000, 30_000])
        .configureLogging(signalR.LogLevel.Warning)
        .build()

      connection.on('live_event', (wire: unknown) => {
        if (isAttendanceLiveEvent(wire)) bump()
      })
      connection.onreconnected(() => {
        setConnected(true)
        bump()
      })
      connection.onclose(() => {
        setConnected(false)
        connRef.current = null
        scheduleReconnect()
      })

      connRef.current = connection
      connection.start()
        .then(() => {
          setConnected(true)
          backoffRef.current = 1000
        })
        .catch(() => {
          setConnected(false)
          scheduleReconnect()
        })
    }

    connect()

    return () => {
      activeRef.current = false
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
      if (bumpRef.current) { clearTimeout(bumpRef.current); bumpRef.current = null }
      const c = connRef.current
      connRef.current = null
      if (c) c.stop().catch(() => {})
      setConnected(false)
    }
  }, [enabled, qc])

  useEffect(() => {
    if (!enabled || connected || !tokenStore.getAccess()) return
    const id = window.setInterval(() => bumpAttendanceLiveQueries(qc), 20_000)
    return () => window.clearInterval(id)
  }, [enabled, connected, qc])

  return { connected }
}
