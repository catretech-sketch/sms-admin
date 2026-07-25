/* Absence-alert notifications — warn parents of flagged students on the app,
   and escalate to email/SMS once the streak crosses the email threshold.
   Reuses the announcement pipeline so delivery is identical to other CRM sends. */
import { listStudents } from '@/api/students'
import { createAnnouncement } from '@/api/announcements'
import type { Staff, Student, Teacher } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AbsenceAudience = 'students' | 'teachers' | 'staff'

export interface AttendanceNotifyChannels {
  app: boolean
  email: boolean
  sms: boolean
}

export interface AttendanceNotifyResult {
  students: number
  emails: number
  phones: number
  reach: number
  channels: string[]
}

function addEmail(set: Set<string>, email?: string | null) {
  const v = (email ?? '').trim()
  if (EMAIL_RE.test(v)) set.add(v)
}

function addPhone(set: Set<string>, phone?: string | null) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 10) set.add(digits)
}

/** Guardian emails + phones for a specific set of student ids (pure/testable). */
export function pickGuardianContacts(
  students: Student[],
  ids: Iterable<string>,
): { emails: string[]; phones: string[] } {
  const wanted = new Set(ids)
  const emails = new Set<string>()
  const phones = new Set<string>()
  for (const s of students) {
    if (!wanted.has(s.id)) continue
    addEmail(emails, s.email)
    addEmail(emails, s.father?.email)
    addEmail(emails, s.mother?.email)
    addPhone(phones, s.phone)
    addPhone(phones, s.father?.phone)
    addPhone(phones, s.mother?.phone)
  }
  return { emails: [...emails], phones: [...phones] }
}

/** Own email/phone for a set of teacher/staff ids (pure/testable). */
export function pickPeopleContacts(
  people: (Teacher | Staff)[],
  ids: Iterable<string>,
): { emails: string[]; phones: string[] } {
  const wanted = new Set(ids)
  const emails = new Set<string>()
  const phones = new Set<string>()
  for (const p of people) {
    if (!wanted.has(p.id)) continue
    addEmail(emails, p.email)
    addPhone(phones, p.phone)
    addPhone(phones, (p as { altPhone?: string }).altPhone)
  }
  return { emails: [...emails], phones: [...phones] }
}

const AUDIENCE_NOUN: Record<AbsenceAudience, { one: string; many: string; tag: string }> = {
  students: { one: 'student', many: 'students', tag: 'parents' },
  teachers: { one: 'teacher', many: 'teachers', tag: 'staff' },
  staff: { one: 'staff member', many: 'staff', tag: 'staff' },
}

function absenceBody(audience: AbsenceAudience, schoolName: string, dayBit: string): string {
  if (audience === 'students') {
    return `${schoolName}: Our records show your ward has been marked absent${dayBit}. `
      + 'Please share the reason with the class teacher or contact the school office. '
      + 'Open the parent app for details.'
  }
  return `${schoolName}: Our records show you have been marked absent${dayBit}. `
    + 'Please contact the school office / HR to regularise your attendance.'
}

/**
 * Notify flagged people. For students we message parents; for teachers/staff we
 * message the person directly. Contacts are resolved by the caller and passed in.
 */
export async function notifyAbsence(
  audience: AbsenceAudience,
  ids: string[],
  contacts: { emails: string[]; phones: string[] },
  schoolName: string,
  channels: AttendanceNotifyChannels,
  opts?: { days?: number },
): Promise<AttendanceNotifyResult> {
  const channelList = [
    channels.app ? 'app' : '',
    channels.email ? 'email' : '',
    channels.sms ? 'sms' : '',
  ].filter(Boolean)
  if (!channelList.length) throw new Error('Pick at least one channel: App, Email, or SMS.')
  if (!ids.length) throw new Error('No flagged people to notify.')

  const noun = AUDIENCE_NOUN[audience]
  const { emails, phones } = contacts
  if (channels.email && !emails.length && !channels.app && !channels.sms) {
    throw new Error(`No ${audience === 'students' ? 'guardian' : 'contact'} emails found. Add an email on the ${noun.many} profiles first.`)
  }

  const days = opts?.days
  const dayBit = days && days > 0 ? ` for ${days}+ consecutive days` : ''
  const title = `Attendance alert — ${ids.length} ${ids.length === 1 ? noun.one : noun.many}`
  const body = absenceBody(audience, schoolName, dayBit)

  const created = await createAnnouncement({
    title,
    body,
    type: 'attendance_alert',
    audience: noun.tag,
    emails: channels.email || channels.app ? emails : [],
    phones: channels.sms || channels.app ? phones : [],
    channels: channelList,
    schoolName,
    eventKind: 'attendance_alert',
  })

  const reach = created.reach > 0 ? created.reach : Math.max(emails.length, phones.length, ids.length)
  return { students: ids.length, emails: emails.length, phones: phones.length, reach, channels: channelList }
}

/** Notify the parents of flagged students. `days` is the streak that triggered it. */
export async function notifyAbsenceAlerts(
  studentIds: string[],
  schoolName: string,
  channels: AttendanceNotifyChannels,
  opts?: { days?: number },
): Promise<AttendanceNotifyResult> {
  const students = await listStudents()
  const contacts = pickGuardianContacts(students, studentIds)
  return notifyAbsence('students', studentIds, contacts, schoolName, channels, opts)
}
