/* Collect CRM emails + mobile numbers for announcement delivery. */
import { listTeachers } from '@/api/teachers'
import { listStudents } from '@/api/students'
import { listStaff } from '@/api/staff'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function addEmail(set: Set<string>, email?: string | null) {
  const v = (email ?? '').trim()
  if (EMAIL_RE.test(v)) set.add(v)
}

function addPhone(set: Set<string>, phone?: string | null) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 10) set.add(digits)
}

export interface AudienceContacts {
  emails: string[]
  phones: string[]
}

/** Unique emails + phones for the announcement audience (parents get guardian mobiles). */
export async function collectAudienceContacts(
  audience: string,
  opts?: { classLabels?: string[] },
): Promise<AudienceContacts> {
  const emails = new Set<string>()
  const phones = new Set<string>()
  const key = (audience || 'everyone').trim().toLowerCase()
  const classFilter = new Set(
    (opts?.classLabels ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean),
  )
  const inClass = (cls?: string | null) => {
    if (!classFilter.size) return true
    const v = (cls ?? '').trim().toLowerCase()
    return !!v && classFilter.has(v)
  }

  if (key === 'everyone' || key === 'all' || key === 'teachers') {
    try {
      for (const t of await listTeachers()) {
        addEmail(emails, t.email)
        addPhone(phones, t.phone)
      }
    } catch { /* best-effort */ }
  }

  if (key === 'everyone' || key === 'all' || key === 'staff') {
    try {
      for (const s of await listStaff()) {
        addEmail(emails, s.email)
        addPhone(phones, s.phone)
      }
    } catch { /* best-effort */ }
  }

  if (
    key === 'everyone' || key === 'all' || key === 'parents'
    || key === 'students' || key === 'grades' || key === 'defaulters' || key === 'specific'
  ) {
    try {
      for (const s of await listStudents()) {
        if (!inClass(s.cls)) continue
        addEmail(emails, s.email)
        addEmail(emails, s.father?.email)
        addEmail(emails, s.mother?.email)
        addPhone(phones, s.phone)
        addPhone(phones, s.father?.phone)
        addPhone(phones, s.mother?.phone)
      }
    } catch { /* best-effort */ }
  }

  if (emails.size === 0 && phones.size === 0 && key !== 'staff' && !classFilter.size) {
    try {
      for (const t of await listTeachers()) {
        addEmail(emails, t.email)
        addPhone(phones, t.phone)
      }
    } catch { /* best-effort */ }
  }

  return { emails: [...emails], phones: [...phones] }
}

/** @deprecated use collectAudienceContacts */
export async function collectAudienceEmails(audience: string): Promise<string[]> {
  return (await collectAudienceContacts(audience)).emails
}
