import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyExamAudience } from './examNotify'

vi.mock('@/lib/collectAudienceEmails', () => ({
  collectAudienceContacts: vi.fn(async () => ({
    emails: ['parent@school.test'],
    phones: ['9876543210'],
  })),
}))

vi.mock('@/api/announcements', () => ({
  createAnnouncement: vi.fn(async (input: { channels: string[] }) => ({
    id: 'a1',
    title: 't',
    audience: 'parents',
    when: 'today',
    reach: 2,
    ch: input.channels.join('+'),
  })),
}))

beforeEach(() => { vi.clearAllMocks() })

describe('notifyExamAudience', () => {
  const exam = {
    id: 'e1', name: 'Term 1', type: 'Term', grades: 'VI–XII',
    from: '2026-09-01', to: '2026-09-15', subjects: 3,
    status: 'scheduled' as const, marksEntered: 0, published: false,
  }

  it('sends datesheet on selected channels', async () => {
    const { createAnnouncement } = await import('@/api/announcements')
    const res = await notifyExamAudience(exam, 'Demo School', 'datesheet', {
      email: true, sms: true, app: true,
    })
    expect(res.channels).toEqual(['email', 'sms', 'app'])
    expect(res.emails).toBe(1)
    expect(res.phones).toBe(1)
    expect(createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      type: 'exam_datesheet',
      audience: 'parents',
      channels: ['email', 'sms', 'app'],
    }))
  })

  it('rejects when no channel selected', async () => {
    await expect(notifyExamAudience(exam, 'Demo', 'results', {
      email: false, sms: false, app: false,
    })).rejects.toThrow(/channel/i)
  })
})
