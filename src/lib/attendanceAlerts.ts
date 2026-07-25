/* Attendance absence-streak alerts.
   Flags students (and teachers/staff via the same shape) who have been marked
   absent for N or more consecutive recorded days, so leadership can warn parents
   and escalate to email. Threshold is configurable and persisted per browser. */
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

const CONFIG_KEY = 'sms_attendance_alert_config'
const LAST_AUTO_KEY = 'sms_attendance_alert_last_auto'
const MIN_DAYS = 1
const MAX_DAYS = 60
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

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

/** Read the persisted alert config (falls back to defaults, safe in SSR/tests). */
export function loadAlertConfig(): AttendanceAlertConfig {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CONFIG_KEY) : null
    if (raw) {
      const p = JSON.parse(raw) as Partial<AttendanceAlertConfig>
      const noticeDays = clampDays(p.noticeDays, DEFAULT_ALERT_CONFIG.noticeDays)
      const emailDays = clampDays(p.emailDays, DEFAULT_ALERT_CONFIG.emailDays)
      /* Email escalation should never trigger before the in-app notice. */
      return {
        noticeDays,
        emailDays: Math.max(noticeDays, emailDays),
        autoSend: Boolean(p.autoSend),
        autoTime: normTime(p.autoTime, DEFAULT_ALERT_CONFIG.autoTime),
        autoChannel: normChannel(p.autoChannel),
      }
    }
  } catch { /* ignore malformed config */ }
  return { ...DEFAULT_ALERT_CONFIG }
}

/** Persist the alert config (best-effort). */
export function saveAlertConfig(cfg: Partial<AttendanceAlertConfig>): AttendanceAlertConfig {
  const noticeDays = clampDays(cfg.noticeDays, DEFAULT_ALERT_CONFIG.noticeDays)
  const emailDays = Math.max(noticeDays, clampDays(cfg.emailDays, DEFAULT_ALERT_CONFIG.emailDays))
  const next: AttendanceAlertConfig = {
    noticeDays,
    emailDays,
    autoSend: Boolean(cfg.autoSend),
    autoTime: normTime(cfg.autoTime, DEFAULT_ALERT_CONFIG.autoTime),
    autoChannel: normChannel(cfg.autoChannel),
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CONFIG_KEY, JSON.stringify(next))
  } catch { /* ignore quota / disabled storage */ }
  return next
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
