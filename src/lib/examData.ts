/* ============================================================
   SchoolMate — Exam lifecycle pure helpers (keys + progress).
   ============================================================ */
import type { PaperSlot } from '@/types'
export const markKey = (examId: string, studentId: string, subject: string): string =>
  `${examId}|${studentId}|${subject}`

export const attKey = (examId: string, studentId: string, subject: string): string =>
  `${examId}|${studentId}|${subject}`

/** Percentage of an exam's papers that have at least one saved mark. */
export function marksProgress(
  examMarks: Record<string, number>,
  examId: string,
  paperCount: number,
): number {
  const subs = new Set<string>()
  const prefix = examId + '|'
  for (const k of Object.keys(examMarks)) {
    if (k.startsWith(prefix)) subs.add(k.split('|')[2])
  }
  return Math.min(100, Math.round((100 * subs.size) / Math.max(1, paperCount)))
}

function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** End time "HH:MM" from a start + duration, clamped within the day. */
export function endTime(start: string, duration: number): string {
  const base = toMinutes(start)
  if (base === null) return start
  const mins = Math.min(1439, Math.max(0, base + (Number(duration) || 0)))
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const mm = String(mins % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Conflict messages for a single exam's datesheet (empty = clean). */
export function findClashes(slots: PaperSlot[]): string[] {
  const out = new Set<string>()
  const overlap = (a: PaperSlot, b: PaperSlot): boolean => {
    if (a.date !== b.date) return false
    const as = toMinutes(a.start), bs = toMinutes(b.start)
    if (as === null || bs === null) return false
    return as < bs + (b.duration || 0) && bs < as + (a.duration || 0)
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j]
      if (a.subject && b.subject && a.subject === b.subject) {
        out.add(`Subject ${a.subject} — allocated to two papers`)
      }
      if (overlap(a, b)) {
        const ai = [a.inv1, a.inv2].filter(Boolean)
        const bi = [b.inv1, b.inv2].filter(Boolean)
        for (const t of ai) if (bi.includes(t)) out.add(`Invigilator ${t} — overlapping slots on ${a.date}`)
        if (a.room && b.room && a.room === b.room) out.add(`Room ${a.room} — double-booked on ${a.date}`)
      }
    }
  }
  return [...out]
}
