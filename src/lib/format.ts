/* ============================================================
   SchoolMate — Formatting + deterministic academic math
   Ported from data.jsx.
   ============================================================ */
import type { Student, Report, RankInfo, MonthValue } from '@/types'
import { students, subjects } from '@/data/mockDb'

export const fmtMoney = (n: number, cur = '₹'): string => cur + ' ' + Number(n).toLocaleString('en-IN')
export const fmtNum = (n: number): string => Number(n).toLocaleString('en-IN')

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff
  return h
}

export function gradeFor(p: number): string {
  if (p >= 91) return 'A1'
  if (p >= 81) return 'A2'
  if (p >= 71) return 'B1'
  if (p >= 61) return 'B2'
  if (p >= 51) return 'C1'
  if (p >= 41) return 'C2'
  if (p >= 33) return 'D'
  return 'E'
}

export function gpaFor(g: string): number {
  return ({ A1: 10, A2: 9, B1: 8, B2: 7, C1: 6, C2: 5, D: 4, E: 3 } as Record<string, number>)[g] || 0
}

export function studentSubjectMarks(stu: Student, subj: string, examId?: string): number {
  const h = hash(stu.id + subj + (examId || ''))
  const base = stu.attendance
  return Math.max(18, Math.min(99, Math.round(base * 0.55 + (h % 45) + (subj === 'Mathematics' ? -4 : subj === 'English' ? 4 : 0))))
}

export function reportFor(stu: Student, examId?: string): Report {
  const rows = subjects.map((s) => {
    const max = 100
    const marks = studentSubjectMarks(stu, s, examId)
    const pct = (marks / max) * 100
    const g = gradeFor(pct)
    return { subject: s, max, marks, grade: g, gpa: gpaFor(g), pass: marks >= 33 }
  })
  const total = rows.reduce((a, r) => a + r.marks, 0)
  const maxTotal = rows.length * 100
  const pct = +((total / maxTotal) * 100).toFixed(1)
  const gpa = +(rows.reduce((a, r) => a + r.gpa, 0) / rows.length).toFixed(1)
  return { rows, total, maxTotal, pct, grade: gradeFor(pct), gpa, result: rows.every((r) => r.pass) ? 'PASS' : 'COMPARTMENT' }
}

export function classRank(stu: Student, examId?: string): RankInfo {
  const peers = students.filter((s) => s.cls === stu.cls)
  const scored = peers.map((s) => ({ id: s.id, pct: reportFor(s, examId).pct })).sort((a, b) => b.pct - a.pct)
  const rank = scored.findIndex((s) => s.id === stu.id) + 1
  return { rank, classSize: peers.length }
}

export function attendanceMonths(stu: Student): MonthValue[] {
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']
  const h = hash(stu.id)
  return months.map((m, i) => ({ label: m, value: Math.max(60, Math.min(100, stu.attendance + ((h >> i) % 14) - 7)) }))
}
