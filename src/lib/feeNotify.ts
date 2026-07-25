import { collectAudienceContacts } from '@/lib/collectAudienceEmails'
import { createAnnouncement } from '@/api/announcements'
import { fmtMoney } from '@/lib/format'
import { buildFeeReceiptHtml, feeReceiptFileName, feeReceiptToBase64, type FeeReceiptData } from '@/lib/feeReceipt'

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
  /** When set, attaches a downloadable receipt for email + parent/student app. */
  receipt?: FeeReceiptData
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
    ? `${input.schoolName}: We received a payment of ${amount} for ${input.studentName}${input.mode ? ` via ${input.mode}` : ''}. Thank you. Download the attached fee receipt, or open it in the parent / student app.`
    : `${input.schoolName}: A fee payment of ${amount} is due for ${input.studentName}${input.dueDate ? ` by ${input.dueDate}` : ''}. Please pay at the earliest to avoid late fees.`

  let attachmentBase64: string | undefined
  let attachmentFileName: string | undefined
  let attachmentContentType: string | undefined
  if (input.kind === 'receipt' && input.receipt) {
    const html = buildFeeReceiptHtml(input.receipt)
    attachmentBase64 = feeReceiptToBase64(html)
    attachmentFileName = feeReceiptFileName(input.receipt)
    attachmentContentType = 'text/html;charset=utf-8'
  }

  /* App channel still needs contact targets when available. */
  const created = await createAnnouncement({
    title,
    body,
    type: input.kind === 'receipt' ? 'fee_receipt' : 'fee_reminder',
    audience: input.audience ?? 'parents',
    emails: input.channels.email || input.channels.app ? emails : [],
    phones: input.channels.sms || input.channels.app ? phones : [],
    channels: channelList,
    schoolName: input.schoolName,
    eventKind: input.kind === 'receipt' ? 'fee_receipt' : 'fee_reminder',
    attachmentBase64,
    attachmentFileName,
    attachmentContentType,
  })

  return {
    reach: created.reach ?? Math.max(emails.length, phones.length),
    emails: emails.length,
    phones: phones.length,
    channels: channelList,
  }
}
