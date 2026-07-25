/** Client-side mail compose via mailto (opens the user's mail app). */

export interface MailtoInput {
  to: string | string[]
  subject: string
  body?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeRecipients(to: string | string[]): string[] {
  const list = (Array.isArray(to) ? to : [to]).map((e) => e.trim()).filter(Boolean)
  if (!list.length) throw new Error('Email is required')
  for (const email of list) {
    if (!EMAIL_RE.test(email)) throw new Error(`Invalid email: ${email}`)
  }
  return list
}

export function buildMailtoHref(input: MailtoInput): string {
  const recipients = normalizeRecipients(input.to)
  const subject = input.subject.trim()
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (input.body?.trim()) params.set('body', input.body.trim())
  const q = params.toString()
  return `mailto:${recipients.join(',')}${q ? `?${q}` : ''}`
}

/** Opens the default mail client. Returns false if blocked / no handler. */
export function openMailCompose(input: MailtoInput): boolean {
  const href = buildMailtoHref(input)
  const opened = window.open(href, '_self')
  return opened !== null
}

export function guardianEmailsFromStudent(s: {
  email?: string | null
  father?: { email?: string | null } | null
  mother?: { email?: string | null } | null
}): string[] {
  const raw = [s.father?.email, s.mother?.email, s.email]
  const out: string[] = []
  for (const e of raw) {
    const v = (e ?? '').trim()
    if (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !out.includes(v)) out.push(v)
  }
  return out
}
