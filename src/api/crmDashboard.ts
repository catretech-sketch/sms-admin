import { request } from './client'
import { snakeToCamel } from './mapper'

export type CrmGradeCount = { grade: string; count: number }

export type CrmPeopleSnapshot = {
  studentCount: number
  teacherCount: number
  staffCount: number
  uniqueGrades: number
  boys: number
  girls: number
  unspecified: number
  grades: CrmGradeCount[]
}

export async function getCrmPeopleSnapshot(): Promise<CrmPeopleSnapshot> {
  const wire = await request<Record<string, unknown>>('/crm/dashboard/people')
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const gradesRaw = Array.isArray(c.grades) ? c.grades as Record<string, unknown>[] : []
  return {
    studentCount: Number(c.studentCount) || 0,
    teacherCount: Number(c.teacherCount) || 0,
    staffCount: Number(c.staffCount) || 0,
    uniqueGrades: Number(c.uniqueGrades) || 0,
    boys: Number(c.boys) || 0,
    girls: Number(c.girls) || 0,
    unspecified: Number(c.unspecified) || 0,
    grades: gradesRaw.map((row) => {
      const g = snakeToCamel<Record<string, unknown>>(row)
      return { grade: String(g.grade ?? ''), count: Number(g.count) || 0 }
    }),
  }
}
