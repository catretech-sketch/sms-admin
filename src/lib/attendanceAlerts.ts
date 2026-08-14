/* Attendance absence-streak alerts.
   Flags students (and teachers/staff via the same shape) who have been marked
   absent for N or more consecutive recorded days, so leadership can warn parents
   and escalate to email. Thresholds are persisted via `/attendance/alert-config`;
   in-memory cache only after a successful API response (never browser SoT). */
import { toAttendanceDate, type AttendanceRecord, type AttendanceStatus } from '@/api/attendance'

export interface AbsenceAlert {
  /** Student (or person) id. */
  id: string
  /** Consecutive absent recorded days ending at the most recent mark. */
  streak: number
  /** Most recent absent date in the run (YYYY-MM-DD). */
  lastDate: string
  /** All absent dates in the run, ascending. */
  dates: string[]
}

export type AlertChannel = 'app' | 'email'

export interface AttendanceAlertConfig {
  /** ≥ this many consecutive absences → in-app notice + highlight + warning popup. */
  noticeDays: number
  /** ≥ this many consecutive absences → escalate to email/SMS to parents. */
  emailDays: number
  /** Auto-send alerts once per day at {@link autoTime}. */
  autoSend: boolean
  /** Local time of day to auto-send, "HH:MM" (24h). */
  autoTime: string
  /** Channel used by the scheduled auto-send. */
  autoChannel: AlertChannel
}

export const DEFAULT_ALERT_CONFIG: AttendanceAlertConfig = {
  noticeDays: 3,
  emailDays: 5,
  autoSend: false,
  autoTime: '09:00',
  autoChannel: 'app',
}

const LAST_AUTO_KEY = 'sms_attendance_alert_last_auto'
const LEGACY_CONFIG_KEY = 'sms_attendance_alert_config'
const MIN_DAYS = 1
const MAX_DAYS = 60
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Session memory — populated only after successful API GET/PUT. */
let memoryConfig: AttendanceAlertConfig | null = null

function clampDays(v: unknown, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n))
}

function normTime(v: unknown, fallback: string): string {
  return typeof v === 'string' && TIME_RE.test(v) ? v : fallback
}

function normChannel(v: unknown): AlertChannel {
  return v === 'email' ? 'email' : 'app'
}

/** Normalize/clamp alert config (no I/O). */
export function normalizeAlertConfig(cfg: Partial<AttendanceAlertConfig>): AttendanceAlertConfig {
  const noticeDays = clampDays(cfg.noticeDays, DEFAULT_ALERT_CONFIG.noticeDays)
  const emailDays = Math.max(noticeDays, clampDays(cfg.emailDays, DEFAULT_ALERT_CONFIG.emailDays))
  return {
    noticeDays,
    emailDays,
    autoSend: Boolean(cfg.autoSend),
    autoTime: normTime(cfg.autoTime, DEFAULT_ALERT_CONFIG.autoTime),
    autoChannel: normChannel(cfg.autoChannel),
  }
}

function clearLegacyConfigStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_CONFIG_KEY)
  } catch { /* ignore */ }
}

/**
 * Session-cached alert config after a successful API load/save.
 * Returns null when the API has not successfully provided config this session.
 */
export function loadAlertConfig(): AttendanceAlertConfig | null {
  clearLegacyConfigStorage()
  return memoryConfig ? { ...memoryConfig } : null
}

/**
 * Update in-memory cache only (after successful API GET/PUT).
 * Never writes business config to localStorage.
 */
export function saveAlertConfig(cfg: Partial<AttendanceAlertConfig>): AttendanceAlertConfig {
  const next = normalizeAlertConfig(cfg)
  memoryConfig = next
  clearLegacyConfigStorage()
  return { ...next }
}

/** Test helper — drop in-memory alert config. */
export function clearAlertConfigMemory(): void {
  memoryConfig = null
  clearLegacyConfigStorage()
}

/** Local YYYY-MM-DD for a date (used to dedupe one auto-send per day). */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Last date (YYYY-MM-DD) the scheduled auto-send fired, or '' if never. */
export function getLastAutoSent(): string {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(LAST_AUTO_KEY)) || ''
  } catch { return '' }
}

/** Record that the scheduled auto-send fired on `now`'s local day. */
export function markAutoSent(now: Date = new Date()): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LAST_AUTO_KEY, localDay(now))
  } catch { /* ignore */ }
}

/**
 * True when a scheduled auto-send is due: enabled, the clock has reached
 * {@link AttendanceAlertConfig.autoTime}, and it hasn't already fired today.
 * Pure — caller supplies `now` and the last-sent day.
 */
export function dueForAutoSend(cfg: AttendanceAlertConfig, now: Date, lastSent: string): boolean {
  if (!cfg.autoSend) return false
  if (lastSent === localDay(now)) return false
  const [h, m] = cfg.autoTime.split(':').map(Number)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return nowMin >= h * 60 + m
}

function isAbsent(status: AttendanceStatus): boolean {
  return status === 'absent'
}

/**
 * Trailing consecutive-absence run for one id. Considers only recorded days
 * (unmarked days are unknown, not counted). Multiple marks on one day collapse
 * to the latest recorded status for that day.
 */
export function absenceStreakFor(records: AttendanceRecord[], id: string): AbsenceAlert | null {
  const byDate = new Map<string, AttendanceStatus>()
  for (const r of records) {
    if (r.id === id || r.studentId === id) {
      const date = toAttendanceDate(r.date)
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) byDate.set(date, r.status)
    }
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a)) // newest first
  const run: string[] = []
  for (const date of dates) {
    if (isAbsent(byDate.get(date)!)) run.push(date)
    else break
  }
  if (!run.length) return null
  const asc = run.slice().sort((a, b) => a.localeCompare(b))
  return { id, streak: asc.length, lastDate: asc[asc.length - 1], dates: asc }
}

/** All ids whose trailing absent run is ≥ threshold, worst first. */
export function flagAbsenceStreaks(records: AttendanceRecord[], threshold: number): AbsenceAlert[] {
  const min = Math.max(1, Math.round(threshold) || 1)
  const ids = new Set<string>()
  for (const r of records) {
    const key = r.studentId || r.id
    if (key) ids.add(key)
  }
  const out: AbsenceAlert[] = []
  for (const id of ids) {
    const alert = absenceStreakFor(records, id)
    if (alert && alert.streak >= min) out.push(alert)
  }
  return out.sort((a, b) => b.streak - a.streak || b.lastDate.localeCompare(a.lastDate))
}
