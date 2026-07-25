import { collectAudienceContacts } from '@/lib/collectAudienceEmails'
import { createAnnouncement } from '@/api/announcements'
import type { Exam } from '@/types'

export interface ExamNotifyChannels {
  email: boolean
  sms: boolean
  app: boolean
}

export interface ExamNotifyResult {
  reach: number
  emails: number
  phones: number
  channels: string[]
}

export type ExamNotifyKind = 'datesheet' | 'results' | 'marks' | 'attendance'

/** Send datesheet, marks, attendance, or results to parents/teachers via email · SMS · app. */
export async function notifyExamAudience(
  exam: Exam,
  schoolName: string,
  kind: ExamNotifyKind,
  channels: ExamNotifyChannels,
  audience: 'parents' | 'teachers' | 'everyone' = 'parents',
  opts?: {
    classLabels?: string[]
    classLabel?: string
    subject?: string
    paperDate?: string
    present?: number
    absent?: number
  },
): Promise<ExamNotifyResult> {
  const channelList = [
    channels.email ? 'email' : '',
    channels.sms ? 'sms' : '',
    channels.app ? 'app' : '',
  ].filter(Boolean)

  if (!channelList.length) throw new Error('Pick at least one channel: Email, SMS, or App.')

  const classLabels = [
    ...(opts?.classLabels ?? []),
    ...(opts?.classLabel ? [opts.classLabel] : []),
  ].filter(Boolean)

  const contacts = await collectAudienceContacts(audience, { classLabels })
  if (audience === 'parents' && classLabels.length && contacts.emails.length + contacts.phones.length === 0) {
    throw new Error(`No parent contacts found for ${classLabels.join(', ')}. Add guardian email or phone on the student profile.`)
  }

  const classBit = classLabels.length === 1
    ? classLabels[0]
    : classLabels.length > 1
      ? `${classLabels.length} classes`
      : exam.grades
  const classSuffix = classLabels.length === 1 ? ` · ${classLabels[0]}` : ''
  const subjectBit = opts?.subject?.trim() ? opts.subject.trim() : 'paper'
  const attCounts = opts?.present != null || opts?.absent != null
    ? `${opts?.present ?? 0} present · ${opts?.absent ?? 0} absent`
    : ''

  const copy: Record<ExamNotifyKind, { title: string; body: string; type: string }> = {
    datesheet: {
      title: `Exam datesheet — ${exam.name}${classSuffix}`,
      body: `${schoolName}: The datesheet for ${exam.name} (${classBit}) is now available. Dates ${exam.from} to ${exam.to}. Open the parent app to see your class paper-wise schedule.`,
      type: 'exam_datesheet',
    },
    results: {
      title: `Results published — ${exam.name}${classSuffix}`,
      body: `${schoolName}: ${exam.name} (${classBit}) results are published. Open the parent app or student portal to view report cards.`,
      type: 'exam_results',
    },
    marks: {
      title: `Marks entered — ${exam.name}${classSuffix}${opts?.subject ? ` · ${opts.subject}` : ''}`,
      body: `${schoolName}: Marks for ${subjectBit} (${exam.name}, ${classBit}) are available in CRM. Parents and students see final report cards after results are published.`,
      type: 'exam_marks',
    },
    attendance: {
      title: `Exam attendance — ${exam.name}${classSuffix}${opts?.subject ? ` · ${opts.subject}` : ''}`,
      body: `${schoolName}: Exam attendance for ${subjectBit} on ${opts?.paperDate || exam.from} (${exam.name}, ${classBit})${attCounts ? ` — ${attCounts}` : ''} has been recorded. Open the parent app for your child’s status.`,
      type: 'exam_attendance',
    },
  }
  const { title, body, type } = copy[kind]

  /* App channel still needs contact targets so the backend can push to those parents. */
  const created = await createAnnouncement({
    title,
    body,
    type,
    audience,
    emails: channels.email || channels.app ? contacts.emails : [],
    phones: channels.sms || channels.app ? contacts.phones : [],
    channels: channelList,
    schoolName,
    eventDate: opts?.paperDate || exam.to,
    eventKind: kind,
  })

  const reach = (created.reach != null && created.reach > 0)
    ? created.reach
    : Math.max(contacts.emails.length, contacts.phones.length)

  return {
    reach,
    emails: contacts.emails.length,
    phones: contacts.phones.length,
    channels: channelList,
  }
}
