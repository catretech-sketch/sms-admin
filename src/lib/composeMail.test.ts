import { describe, expect, it } from 'vitest'
import { buildMailtoHref, guardianEmailsFromStudent } from '@/lib/composeMail'

describe('composeMail', () => {
  it('builds a mailto href with subject and body', () => {
    const href = buildMailtoHref({
      to: 'parent@school.test',
      subject: 'Fee reminder',
      body: 'Please pay by Friday.',
    })
    expect(href.startsWith('mailto:parent@school.test?')).toBe(true)
    expect(href).toMatch(/subject=Fee[+%20]reminder/)
    expect(href).toMatch(/body=Please[+%20]pay[+%20]by[+%20]Friday\./)
  })

  it('rejects missing or invalid email', () => {
    expect(() => buildMailtoHref({ to: '', subject: 'Hi' })).toThrow(/email/i)
    expect(() => buildMailtoHref({ to: 'not-an-email', subject: 'Hi' })).toThrow(/email/i)
  })

  it('supports multiple recipients', () => {
    const href = buildMailtoHref({
      to: ['a@x.com', 'b@y.com'],
      subject: 'Notice',
    })
    expect(href.startsWith('mailto:a@x.com,b@y.com?')).toBe(true)
  })

  it('collects unique guardian emails from a student', () => {
    expect(guardianEmailsFromStudent({
      email: 'stu@x.com',
      father: { email: 'dad@x.com' },
      mother: { email: 'mom@x.com' },
    })).toEqual(['dad@x.com', 'mom@x.com', 'stu@x.com'])
    expect(guardianEmailsFromStudent({ email: '', father: null, mother: { email: 'bad' } })).toEqual([])
  })
})
