import { request, listRequest } from './client'
import { snakeToCamel } from './mapper'
import { mergeStudentExtras } from './studentExtras'
import { toDateInputValue } from '@/lib/dateInput'
import type { Student, ListStudentsOpts } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

function cleanName(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s || s === '—' || s === '-') return ''
  return s
}

/** Map one wire record (snake_case) to the UI `Student` shape.
 *  API uses guardian_name / guardian_phone / attendance_pct — UI uses guardian / phone / attendance. */
export function toStudent(wire: Record<string, unknown>): Student {
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const {
    admissionNo, classLabel, guardianName, guardianPhone, attendancePct,
    ...rest
  } = c
  const guardian = cleanName(guardianName ?? rest.guardian)
  const phone = String(guardianPhone ?? rest.phone ?? '').trim()
  const attendance = Number(attendancePct ?? rest.attendance ?? 0)
  const dob = toDateInputValue(c.dob) || undefined
  const base = {
    ...rest,
    adm: admissionNo,
    cls: classLabel,
    guardian,
    phone,
    attendance,
    dob,
  } as unknown as Student
  return mergeStudentExtras(base)
}

/** Prefer guardian name, then father/mother enrolment names. */
export function studentGuardianName(s: Student): string {
  return (
    cleanName(s.guardian)
    || cleanName(s.father?.name)
    || cleanName(s.mother?.name)
  )
}

/** Display label for Parents — never empty when a student exists. */
export function studentParentLabel(s: Student): string {
  return studentGuardianName(s) || (s.phone ? `Guardian · ${s.phone}` : `Parent of ${s.name}`)
}

export async function listStudents(opts: ListStudentsOpts = {}): Promise<Student[]> {
  const query: Record<string, string | undefined> = {}
  if (opts.q) query.q = opts.q
  if (opts.grade && opts.grade !== 'all') query.grade = opts.grade
  if (opts.status && opts.status !== 'all') query.status = opts.status
  if (opts.fee && opts.fee !== 'all') query.fee = opts.fee
  const env = await listRequest<ListEnvelope>('/students', { query })
  return env.data.map(toStudent)
}

export async function getStudent(id: string): Promise<Student> {
  const wire = await request<Record<string, unknown>>(`/students/${id}`)
  return toStudent(wire)
}

/** Body for POST /students — only fields the SIS create contract accepts. */
export function fromStudent(s: Student): Record<string, unknown> {
  const guardianName = studentGuardianName(s) || null
  const guardianPhone = String(s.phone ?? '').trim()
    || String(s.father?.phone ?? '').trim()
    || String(s.mother?.phone ?? '').trim()
    || null
  return {
    admission_no: s.adm?.trim() || null,
    name: s.name,
    gender: s.gender,
    grade: s.grade,
    section: s.section,
    roll: s.roll,
    guardian_name: guardianName,
    guardian_phone: guardianPhone,
    house: s.house || null,
    avatar_hue: s.avatarHue ?? 0,
    dob: toDateInputValue(s.dob) || null,
    email: s.email || null,
    address: s.address || null,
  }
}

/** Body for PUT /students/{id}. */
export function fromStudentUpdate(s: Student): Record<string, unknown> {
  return {
    name: s.name,
    grade: s.grade,
    section: s.section,
    roll: s.roll,
    guardian_name: studentGuardianName(s) || null,
    guardian_phone: String(s.phone ?? '').trim()
      || String(s.father?.phone ?? '').trim()
      || String(s.mother?.phone ?? '').trim()
      || null,
    house: s.house || null,
    fee_status: s.feeStatus,
    fee_due: s.feeDue,
    status: s.status,
  }
}

export async function createStudent(s: Student): Promise<Student> {
  const wire = await request<Record<string, unknown>>('/students', { method: 'POST', body: fromStudent(s) })
  return toStudent(wire)
}

export async function updateStudent(id: string, s: Student): Promise<Student> {
  const wire = await request<Record<string, unknown>>(`/students/${id}`, {
    method: 'PATCH',
    body: fromStudentUpdate(s),
  })
  return toStudent(wire)
}
