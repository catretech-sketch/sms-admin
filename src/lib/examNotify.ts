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

/** Send datesheet or results to parents/teachers via email · SMS · app. */
export async function notifyExamAudience(
  exam: Exam,
  schoolName: string,
  kind: 'datesheet' | 'results',
  channels: ExamNotifyChannels,
  audience: 'parents' | 'teachers' | 'everyone' = 'parents',
): Promise<ExamNotifyResult> {
  const channelList = [
    channels.email ? 'email' : '',
    channels.sms ? 'sms' : '',
    channels.app ? 'app' : '',
  ].filter(Boolean)

  if (!channelList.length) throw new Error('Pick at least one channel: Email, SMS, or App.')

  const contacts = await collectAudienceContacts(audience)
  const title = kind === 'datesheet'
    ? `Exam datesheet — ${exam.name}`
    : `Results published — ${exam.name}`

  const body = kind === 'datesheet'
    ? `${schoolName}: The datesheet for ${exam.name} (${exam.grades}) is now available. Dates ${exam.from} to ${exam.to}. Check the parent app for paper-wise schedule.`
    : `${schoolName}: ${exam.name} (${exam.grades}) results are published. Open the parent app or student portal to view report cards.`

  const created = await createAnnouncement({
    title,
    body,
    type: kind === 'datesheet' ? 'exam_datesheet' : 'exam_results',
    audience,
    emails: channels.email ? contacts.emails : [],
    phones: channels.sms ? contacts.phones : [],
    channels: channelList,
    schoolName,
    eventDate: exam.to,
    eventKind: kind,
  })

  return {
    reach: created.reach ?? 0,
    emails: contacts.emails.length,
    phones: contacts.phones.length,
    channels: channelList,
  }
}
