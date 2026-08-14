/* Server-persisted absence-alert config (thresholds + daily schedule).
   PUT returns null when the endpoint is missing — callers must treat that as
   failure (do not pretend the settings were saved to the DB). */
import { request } from './client'
import { ApiError } from './ApiError'
import { snakeToCamel, camelToSnake } from './mapper'
import type { AttendanceAlertConfig } from '@/lib/attendanceAlerts'
import { saveAlertConfig } from '@/lib/attendanceAlerts'

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

function toConfig(raw: Record<string, unknown>): AttendanceAlertConfig {
  const c = snakeToCamel<Record<string, unknown>>(raw)
  const noticeDays = Number(c.noticeDays)
  const emailDays = Number(c.emailDays)
  return {
    noticeDays: Number.isFinite(noticeDays) ? noticeDays : 3,
    emailDays: Number.isFinite(emailDays) ? emailDays : 5,
    autoSend: Boolean(c.autoSend),
    autoTime: typeof c.autoTime === 'string' ? c.autoTime : '09:00',
    autoChannel: c.autoChannel === 'email' ? 'email' : 'app',
  }
}

/** GET /attendance/alert-config — null when the backend hasn't shipped it yet. */
export async function fetchAlertConfig(): Promise<AttendanceAlertConfig | null> {
  try {
    const raw = await request<Record<string, unknown>>('/attendance/alert-config')
    return toConfig(raw)
  } catch (err) {
    if (isMissingEndpoint(err)) return null
    throw err
  }
}

/** PUT /attendance/alert-config — returns the saved (normalized) config, or null if unavailable. */
export async function putAlertConfig(cfg: AttendanceAlertConfig): Promise<AttendanceAlertConfig | null> {
  try {
    const body = camelToSnake({
      noticeDays: cfg.noticeDays,
      emailDays: cfg.emailDays,
      autoSend: cfg.autoSend,
      autoTime: cfg.autoTime,
      autoChannel: cfg.autoChannel,
    })
    const raw = await request<Record<string, unknown>>('/attendance/alert-config', { method: 'PUT', body })
    return toConfig(raw)
  } catch (err) {
    if (isMissingEndpoint(err)) return null
    throw err
  }
}

/**
 * PUT alert config, then cache locally. Throws when the endpoint is missing or the request fails.
 */
export async function persistAlertConfig(cfg: AttendanceAlertConfig): Promise<AttendanceAlertConfig> {
  const server = await putAlertConfig(cfg)
  if (!server) {
    throw new ApiError(404, 'not_found', 'Alert settings endpoint unavailable')
  }
  return saveAlertConfig(server)
}
