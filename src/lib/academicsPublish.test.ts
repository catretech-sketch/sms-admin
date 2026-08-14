import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadPublishEnvelope, saveDraftSnapshot, publishSnapshot, publishStatusOf, publishMetaLine,
  showPublishButton, fetchPublishEnvelope, __resetTimetablePublishMemoryForTests,
} from './academicsPublish'
import { tokenStore } from '@/api/auth/tokenStore'

beforeEach(() => {
  localStorage.clear()
  __resetTimetablePublishMemoryForTests()
  tokenStore.setTenantId('default')
  vi.stubGlobal('fetch', vi.fn())
})

function jsonOk(data: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    text: async () => JSON.stringify({ data }),
    json: async () => ({ data }),
  } as Response)
}

describe('academicsPublish', () => {
  it('timetable draft stays in session memory (not localStorage)', async () => {
    const draft = [{ label: 'P1' }]
    const env = await saveDraftSnapshot('timetable', draft)
    expect(env.draft).toEqual(draft)
    expect(loadPublishEnvelope('timetable').draft).toEqual(draft)
    expect(publishStatusOf(env, draft)).toBe('draft')
    expect(localStorage.getItem('sms_academics_pub:default:timetable')).toBeNull()
  })

  it('timetable publish clears legacy LS and keeps envelope in memory', async () => {
    localStorage.setItem('sms_academics_pub:default:timetable', JSON.stringify({
      draft: [{ label: 'Stale' }],
      published: [{ label: 'Stale' }],
      draftSavedAt: '2026-01-01T00:00:00Z',
      publishedAt: '2026-01-01T00:00:00Z',
    }))
    const data = [{ label: 'P1' }]
    const pub = await publishSnapshot('timetable', data)
    expect(pub.published).toEqual(data)
    expect(loadPublishEnvelope('timetable').published).toEqual(data)
    expect(localStorage.getItem('sms_academics_pub:default:timetable')).toBeNull()
  })

  it('periods draft/publish go through API', async () => {
    const draft = [{ label: 'P1' }]
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonOk({
        draft_json: null, published_json: null, draft_saved_at: null, published_at: null,
      }))
      .mockResolvedValueOnce(jsonOk({
        draft_json: JSON.stringify(draft),
        published_json: null,
        draft_saved_at: '2026-08-12T10:00:00Z',
        published_at: null,
      }))
      .mockResolvedValueOnce(jsonOk({
        draft_json: JSON.stringify(draft),
        published_json: JSON.stringify(draft),
        draft_saved_at: '2026-08-12T10:01:00Z',
        published_at: '2026-08-12T10:01:00Z',
      }))

    const saved = await saveDraftSnapshot('periods', draft)
    expect(saved.draft).toEqual(draft)
    expect(publishStatusOf(saved, draft)).toBe('draft')

    const pub = await publishSnapshot('periods', draft)
    expect(pub.published).toEqual(draft)
    expect(publishStatusOf(pub, draft)).toBe('published')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/academic-periods')
  })

  it('does not migrate legacy local periods when API empty', async () => {
    localStorage.setItem('sms_academics_pub:default:periods', JSON.stringify({
      draft: [{ label: 'Legacy' }],
      published: null,
      draftSavedAt: '2026-01-01T00:00:00Z',
      publishedAt: null,
    }))
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonOk({
      draft_json: null, published_json: null, draft_saved_at: null, published_at: null,
    }))
    const env = await fetchPublishEnvelope<{ label: string }[]>('periods')
    expect(env.draft).toBeNull()
    expect(localStorage.getItem('sms_academics_pub:default:periods')).toBeNull()
  })

  it('formats publish meta line', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonOk({ draft_json: null, published_json: null }))
      .mockResolvedValueOnce(jsonOk({
        draft_json: '[{"id":1}]', published_json: null, draft_saved_at: '2026-08-12T10:00:00Z',
      }))
    const env = await saveDraftSnapshot('tests', [{ id: 1 }])
    expect(publishMetaLine(env.draftSavedAt, env.publishedAt)).toMatch(/Draft saved/)
  })

  it('hides publish after timetable publish until draft is saved again', async () => {
    const data = [{ label: 'P1' }]
    const pub = await publishSnapshot('timetable', data)
    expect(showPublishButton(publishStatusOf(pub, data), pub, data)).toBe(false)

    const edited = [{ label: 'P1b' }]
    const st = publishStatusOf(pub, edited)
    expect(st).toBe('unpublished')
    expect(showPublishButton(st, pub, edited)).toBe(false)

    const saved = await saveDraftSnapshot('timetable', edited)
    expect(showPublishButton(publishStatusOf(saved, edited), saved, edited)).toBe(true)
  })
})
