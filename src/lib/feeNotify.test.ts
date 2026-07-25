import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyFeeAudience } from './feeNotify'

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

describe('notifyFeeAudience', () => {
  it('sends a receipt notice on the selected channels using explicit contacts', async () => {
    const { createAnnouncement } = await import('@/api/announcements')
    const res = await notifyFeeAudience({
      kind: 'receipt',
      schoolName: 'Demo',
      studentName: 'Asha',
      amount: 1000,
      mode: 'Cash',
      channels: { email: true, sms: true, app: true },
      emails: ['p@x.com'],
      phones: ['9999999999'],
    })
    expect(res.channels).toEqual(['email', 'sms', 'app'])
    expect(res.emails).toBe(1)
    expect(res.phones).toBe(1)
    expect(createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      type: 'fee_receipt',
      audience: 'parents',
      channels: ['email', 'sms', 'app'],
      emails: ['p@x.com'],
      phones: ['9999999999'],
    }))
  })

  it('attaches an HTML fee receipt for parent mail and app download', async () => {
    const { createAnnouncement } = await import('@/api/announcements')
    await notifyFeeAudience({
      kind: 'receipt',
      schoolName: 'Demo School',
      studentName: 'Asha',
      amount: 1000,
      mode: 'Cash',
      channels: { email: true, sms: false, app: true },
      emails: ['p@x.com'],
      phones: [],
      receipt: {
        schoolName: 'Demo School',
        studentName: 'Asha',
        cls: 'IV-B',
        amount: 1000,
        mode: 'Cash',
        paidAt: '17 Jul 2026',
        studentAdm: 'ADM-1',
      },
    })
    expect(createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      type: 'fee_receipt',
      attachmentContentType: 'text/html;charset=utf-8',
      attachmentFileName: expect.stringContaining('Fee-receipt'),
      attachmentBase64: expect.any(String),
    }))
    const call = vi.mocked(createAnnouncement).mock.calls[0][0]
    expect(call.attachmentBase64!.length).toBeGreaterThan(20)
    expect(call.body).toMatch(/download|app/i)
  })

  it('falls back to audience contacts for a reminder when explicit contacts are omitted', async () => {
    const { collectAudienceContacts } = await import('@/lib/collectAudienceEmails')
    const { createAnnouncement } = await import('@/api/announcements')
    const res = await notifyFeeAudience({
      kind: 'reminder',
      schoolName: 'Demo',
      studentName: 'Asha',
      amount: 5000,
      dueDate: '2026-08-01',
      channels: { email: true, sms: false, app: true },
    })
    expect(collectAudienceContacts).toHaveBeenCalledWith('parents')
    expect(res.channels).toEqual(['email', 'app'])
    expect(res.emails).toBe(1)
    expect(createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      type: 'fee_reminder',
      channels: ['email', 'app'],
      emails: ['parent@school.test'],
      phones: ['9876543210'],
    }))
  })

  it('rejects when no channel selected', async () => {
    await expect(notifyFeeAudience({
      kind: 'receipt',
      schoolName: 'Demo',
      studentName: 'Asha',
      amount: 1000,
      channels: { email: false, sms: false, app: false },
    })).rejects.toThrow(/channel/i)
  })
})
