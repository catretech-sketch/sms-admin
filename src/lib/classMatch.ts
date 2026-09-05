import type { Student } from '@/types'
import type { SchoolClass } from '@/api/classes'
import { gradeRank } from './defaultClasses'

export function classLabel(c: SchoolClass): string {
  return (c.name || `${c.grade}-${c.section}`).trim() || '—'
}

/** Short class code e.g. 10-A / N-A for colour chip on attendance. */
export function classCode(c: SchoolClass): string {
  const grade = (c.grade || '').trim()
  const section = (c.section || '').trim()
  if (grade && section) {
    const g = grade.length > 4 ? grade.slice(0, 3) : grade
    return `${g}-${section}`.toUpperCase()
  }
  const name = classLabel(c)
  return name.length > 8 ? name.slice(0, 8).toUpperCase() : name.toUpperCase()
}

/** A student's free-text `cls` field, or grade+section, matches this class. */
export function studentMatchesClass(s: Student, c: SchoolClass): boolean {
  const label = classLabel(c)
  const code = classCode(c)
  const cls = (s.cls || '').trim()
  if (cls && label && cls.toLowerCase() === label.toLowerCase()) return true
  if (cls && code && cls.toLowerCase() === code.toLowerCase()) return true
  if (s.grade && c.grade && s.section && c.section) {
    const sameGrade = gradeRank(s.grade) === gradeRank(c.grade)
    const sameSec = s.section.trim().toLowerCase() === c.section.trim().toLowerCase()
    if (sameGrade && sameSec) return true
  }
  return false
}
