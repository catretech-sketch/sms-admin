import { describe, it, expect, vi, beforeEach } from 'vitest'
import { contactsForStudentIds } from './collectAudienceEmails'

vi.mock('@/api/students', () => ({
  listStudents: vi.fn(async () => [
    { id: 's1', name: 'Asha Verma', guardianEmail: 'asha.parent@x.com', phone: '9111111111' },
    { id: 's2', name: 'Rohan Iyer', guardianEmail: 'rohan.parent@x.com', phone: '9222222222' },
    { id: 's3', name: 'Meera Nair', guardianEmail: 'meera.parent@x.com', phone: '9333333333' },
  ]),
}))
vi.mock('@/api/teachers', () => ({ listTeachers: vi.fn(async () => []) }))
vi.mock('@/api/staff', () => ({ listStaff: vi.fn(async () => []) }))

beforeEach(() => { vi.clearAllMocks() })

describe('contactsForStudentIds', () => {
  it('only returns contacts for the given student ids, not every student', async () => {
    const res = await contactsForStudentIds(['s1', 's3'])
    expect(res.emails.sort()).toEqual(['asha.parent@x.com', 'meera.parent@x.com'])
    expect(res.phones.sort()).toEqual(['9111111111', '9333333333'])
  })

  it('returns empty contacts for an empty id list without calling listStudents', async () => {
    const { listStudents } = await import('@/api/students')
    const res = await contactsForStudentIds([])
    expect(res).toEqual({ emails: [], phones: [] })
    expect(listStudents).not.toHaveBeenCalled()
  })
})
