import { beforeEach, describe, expect, it } from 'vitest'
import type { AttendanceRecord, AttendanceStatus } from '@/api/attendance'
import {
  DEFAULT_ALERT_CONFIG,
  absenceStreakFor,
  dueForAutoSend,
  flagAbsenceStreaks,
  loadAlertConfig,
  saveAlertConfig,
} from './attendanceAlerts'

function rec(studentId: string, date: string, status: AttendanceStatus): AttendanceRecord {
  return { id: `${studentId}-${date}`, classId: 'c1', studentId, date, status }
}

describe('absenceStreakFor', () => {
  it('counts the trailing run of consecutive absences', () => {
    const records = [
      rec('s1', '2026-07-13', 'present'),
      rec('s1', '2026-07-14', 'absent'),
      rec('s1', '2026-07-15', 'absent'),
      rec('s1', '2026-07-16', 'absent'),
    ]
    const alert = absenceStreakFor(records, 's1')
    expect(alert).not.toBeNull()
    expect(alert!.streak).toBe(3)
    expect(alert!.lastDate).toBe('2026-07-16')
    expect(alert!.dates).toEqual(['2026-07-14', '2026-07-15', '2026-07-16'])
  })

  it('stops the run at the most recent present/late day', () => {
    const records = [
      rec('s1', '2026-07-14', 'absent'),
      rec('s1', '2026-07-15', 'present'),
      rec('s1', '2026-07-16', 'absent'),
    ]
    expect(absenceStreakFor(records, 's1')!.streak).toBe(1)
  })

  it('returns null when the latest mark is not absent', () => {
    const records = [rec('s1', '2026-07-16', 'present')]
    expect(absenceStreakFor(records, 's1')).toBeNull()
  })

  it('collapses multiple marks on the same day to the latest status', () => {
    const records = [
      rec('s1', '2026-07-15', 'absent'),
      rec('s1', '2026-07-16', 'absent'),
      { ...rec('s1', '2026-07-16', 'present') }, // corrected later same day
    ]
    // 16th resolves to present → run broken → streak from 15th only counts if trailing
    const alert = absenceStreakFor(records, 's1')
    expect(alert).toBeNull()
  })

  it('matches records keyed by id (teachers/staff) as well as studentId', () => {
    const records: AttendanceRecord[] = [
      { id: 't1', classId: '', studentId: '', date: '2026-07-15', status: 'absent' },
      { id: 't1', classId: '', studentId: '', date: '2026-07-16', status: 'absent' },
    ]
    expect(absenceStreakFor(records, 't1')!.streak).toBe(2)
  })
})

describe('flagAbsenceStreaks', () => {
  it('returns only ids at or above the threshold, worst first', () => {
    const records = [
      rec('s1', '2026-07-14', 'absent'),
      rec('s1', '2026-07-15', 'absent'),
      rec('s1', '2026-07-16', 'absent'),
      rec('s2', '2026-07-15', 'absent'),
      rec('s2', '2026-07-16', 'absent'),
      rec('s3', '2026-07-16', 'present'),
    ]
    const flagged = flagAbsenceStreaks(records, 2)
    expect(flagged.map((f) => f.id)).toEqual(['s1', 's2'])
    expect(flagged[0].streak).toBe(3)
  })

  it('excludes students below the threshold', () => {
    const records = [rec('s2', '2026-07-16', 'absent')]
    expect(flagAbsenceStreaks(records, 3)).toEqual([])
  })
})

describe('alert config', () => {
  beforeEach(() => localStorage.clear())

  it('defaults when nothing is stored', () => {
    expect(loadAlertConfig()).toEqual(DEFAULT_ALERT_CONFIG)
  })

  it('persists and reloads, clamping and keeping email ≥ notice', () => {
    saveAlertConfig({ noticeDays: 4, emailDays: 2 })
    const cfg = loadAlertConfig()
    expect(cfg.noticeDays).toBe(4)
    expect(cfg.emailDays).toBe(4) // email cannot be earlier than notice
  })

  it('clamps out-of-range values', () => {
    saveAlertConfig({ noticeDays: 0, emailDays: 999 })
    const cfg = loadAlertConfig()
    expect(cfg.noticeDays).toBe(1)
    expect(cfg.emailDays).toBe(60)
  })

  it('persists schedule settings and normalizes a bad time', () => {
    const saved = saveAlertConfig({ noticeDays: 2, emailDays: 4, autoSend: true, autoTime: '25:99', autoChannel: 'email' })
    expect(saved.autoSend).toBe(true)
    expect(saved.autoTime).toBe('09:00') // invalid time falls back to default
    expect(saved.autoChannel).toBe('email')
    expect(loadAlertConfig().autoSend).toBe(true)
  })
})

describe('dueForAutoSend', () => {
  const cfg = { noticeDays: 3, emailDays: 5, autoSend: true, autoTime: '09:00', autoChannel: 'app' as const }
  const at = (hhmm: string) => new Date(`2026-07-18T${hhmm}:00`)

  it('is false when disabled', () => {
    expect(dueForAutoSend({ ...cfg, autoSend: false }, at('10:00'), '')).toBe(false)
  })
  it('is false before the scheduled time', () => {
    expect(dueForAutoSend(cfg, at('08:59'), '')).toBe(false)
  })
  it('is true at/after the scheduled time when not sent today', () => {
    expect(dueForAutoSend(cfg, at('09:00'), '2026-07-17')).toBe(true)
    expect(dueForAutoSend(cfg, at('11:30'), '')).toBe(true)
  })
  it('is false when already sent today', () => {
    expect(dueForAutoSend(cfg, at('11:30'), '2026-07-18')).toBe(false)
  })
})
