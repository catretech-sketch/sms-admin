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

  it('scopes datesheet title/body to one class', async () => {
    const { createAnnouncement } = await import('@/api/announcements')
    const { collectAudienceContacts } = await import('@/lib/collectAudienceEmails')
    await notifyExamAudience(exam, 'Demo School', 'datesheet', {
      email: true, sms: false, app: true,
    }, 'parents', { classLabel: 'I-A' })
    expect(collectAudienceContacts).toHaveBeenCalledWith('parents', { classLabels: ['I-A'] })
    expect(createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('I-A'),
      body: expect.stringContaining('I-A'),
    }))
  })

  it('rejects when no channel selected', async () => {
    await expect(notifyExamAudience(exam, 'Demo', 'results', {
      email: false, sms: false, app: false,
    })).rejects.toThrow(/channel/i)
  })

  it('notifies marks and attendance for one class', async () => {
    const { createAnnouncement } = await import('@/api/announcements')
    await notifyExamAudience(exam, 'Demo School', 'marks', {
      email: true, sms: false, app: true,
    }, 'parents', { classLabel: 'VI-A', subject: 'Math' })
    expect(createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      type: 'exam_marks',
      title: expect.stringMatching(/Marks published.*Math/i),
      channels: ['email', 'app'],
      emails: ['parent@school.test'],
      phones: ['9876543210'],
    }))
    await notifyExamAudience(exam, 'Demo School', 'attendance', {
      email: false, sms: false, app: true,
    }, 'parents', {
      classLabel: 'VI-A',
      subject: 'Math',
      paperDate: '2026-09-02',
      present: 1,
      absent: 0,
    })
    expect(createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      type: 'exam_attendance',
      eventKind: 'attendance',
      body: expect.stringContaining('1 present · 0 absent'),
      emails: ['parent@school.test'],
      phones: ['9876543210'],
    }))
  })

  it('fails clearly when class has no parent contacts', async () => {
    const { collectAudienceContacts } = await import('@/lib/collectAudienceEmails')
    vi.mocked(collectAudienceContacts).mockResolvedValueOnce({ emails: [], phones: [] })
    await expect(notifyExamAudience(exam, 'Demo', 'attendance', {
      email: false, sms: false, app: true,
    }, 'parents', { classLabel: 'IV-B' })).rejects.toThrow(/No parent contacts.*IV-B/i)
  })
})
