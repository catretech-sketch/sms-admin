import { collectAudienceContacts } from '@/lib/collectAudienceEmails'
import { createAnnouncement } from '@/api/announcements'
import { fmtMoney } from '@/lib/format'

export interface FeeNotifyChannels {
  email: boolean
  sms: boolean
  app: boolean
}

export interface FeeNotifyInput {
  kind: 'receipt' | 'reminder'
  schoolName: string
  studentName: string
  amount: number
  mode?: string
  dueDate?: string
  currency?: string
  channels: FeeNotifyChannels
  audience?: string
  emails?: string[]
  phones?: string[]
}

export interface FeeNotifyResult {
  reach: number
  emails: number
  phones: number
  channels: string[]
}

/** Send a fee receipt or reminder to a student's parents via email · SMS · app. */
export async function notifyFeeAudience(input: FeeNotifyInput): Promise<FeeNotifyResult> {
  const channelList = [
    input.channels.email ? 'email' : '',
    input.channels.sms ? 'sms' : '',
    input.channels.app ? 'app' : '',
  ].filter(Boolean)

  if (!channelList.length) throw new Error('Pick at least one channel: Email, SMS, or App.')

  let emails = input.emails
  let phones = input.phones
  if (!emails || !phones) {
    const contacts = await collectAudienceContacts(input.audience ?? 'parents')
    emails = emails ?? contacts.emails
    phones = phones ?? contacts.phones
  }

  const amount = fmtMoney(input.amount, input.currency)
  const title = input.kind === 'receipt'
    ? `Payment received — ${input.studentName}`
    : `Fee reminder — ${input.studentName}`

  const body = input.kind === 'receipt'
    ? `${input.schoolName}: We received a payment of ${amount} for ${input.studentName}${input.mode ? ` via ${input.mode}` : ''}. Thank you — the receipt is available in the parent app.`
    : `${input.schoolName}: A fee payment of ${amount} is due for ${input.studentName}${input.dueDate ? ` by ${input.dueDate}` : ''}. Please pay at the earliest to avoid late fees.`

  const created = await createAnnouncement({
    title,
    body,
    type: input.kind === 'receipt' ? 'fee_receipt' : 'fee_reminder',
    audience: input.audience ?? 'parents',
    emails: input.channels.email ? emails : [],
    phones: input.channels.sms ? phones : [],
    channels: channelList,
    schoolName: input.schoolName,
  })

  return {
    reach: created.reach ?? 0,
    emails: emails.length,
    phones: phones.length,
    channels: channelList,
  }
}
