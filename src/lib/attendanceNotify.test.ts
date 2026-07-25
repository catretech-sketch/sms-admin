import { describe, expect, it } from 'vitest'
import type { Student } from '@/types'
import { pickGuardianContacts } from './attendanceNotify'

function student(over: Partial<Student> & { id: string }): Student {
  return {
    name: over.name ?? 'Test Student',
    cls: 'IV-B',
    ...over,
  } as Student
}

describe('pickGuardianContacts', () => {
  it('collects student + father + mother emails and phones for the given ids', () => {
    const students = [
      student({
        id: 's1',
        email: 'stu1@example.com',
        phone: '9990001111',
        father: { email: 'dad1@example.com', phone: '8880002222' },
        mother: { email: 'mom1@example.com', phone: '7770003333' },
      }),
      student({ id: 's2', email: 'stu2@example.com', phone: '9998887777' }),
    ]
    const { emails, phones } = pickGuardianContacts(students, ['s1'])
    expect(emails.sort()).toEqual(['dad1@example.com', 'mom1@example.com', 'stu1@example.com'])
    expect(phones.sort()).toEqual(['7770003333', '8880002222', '9990001111'])
  })

  it('ignores students not in the id set and invalid contacts', () => {
    const students = [
      student({ id: 's1', email: 'not-an-email', phone: '123' }),
      student({ id: 's2', email: 'ok@example.com', phone: '9998887777' }),
    ]
    const { emails, phones } = pickGuardianContacts(students, ['s2'])
    expect(emails).toEqual(['ok@example.com'])
    expect(phones).toEqual(['9998887777'])
  })

  it('deduplicates shared guardian contacts across siblings', () => {
    const shared = { email: 'dad@example.com', phone: '8880002222' }
    const students = [
      student({ id: 's1', father: shared }),
      student({ id: 's2', father: shared }),
    ]
    const { emails, phones } = pickGuardianContacts(students, ['s1', 's2'])
    expect(emails).toEqual(['dad@example.com'])
    expect(phones).toEqual(['8880002222'])
  })
})
