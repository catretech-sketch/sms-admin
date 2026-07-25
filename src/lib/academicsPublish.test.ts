import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadPublishEnvelope, saveDraftSnapshot, publishSnapshot, publishStatusOf, publishMetaLine,
  showPublishButton,
} from './academicsPublish'

beforeEach(() => { localStorage.clear() })

describe('academicsPublish', () => {
  it('saves draft and reports draft status until publish', () => {
    const draft = [{ label: 'P1' }]
    saveDraftSnapshot('periods', draft)
    const env = loadPublishEnvelope<typeof draft>('periods')
    expect(env.draft).toEqual(draft)
    expect(env.published).toBeNull()
    expect(publishStatusOf(env, draft)).toBe('draft')
  })

  it('publish sets published and status published', () => {
    const draft = [{ label: 'P1' }]
    publishSnapshot('periods', draft)
    const env = loadPublishEnvelope<typeof draft>('periods')
    expect(env.published).toEqual(draft)
    expect(publishStatusOf(env, draft)).toBe('published')
  })

  it('detects unpublished changes after edit', () => {
    const draft = [{ label: 'P1' }]
    publishSnapshot('periods', draft)
    const edited = [{ label: 'P1b' }]
    const env = saveDraftSnapshot('periods', edited)
    expect(publishStatusOf(env, edited)).toBe('unpublished')
  })

  it('formats publish meta line with draft and published times', () => {
    const env = saveDraftSnapshot('tests', [{ id: 1 }])
    expect(publishMetaLine(env.draftSavedAt, env.publishedAt)).toMatch(/Draft saved/)
    const pub = publishSnapshot('tests', [{ id: 1 }])
    expect(publishMetaLine(pub.draftSavedAt, pub.publishedAt)).toMatch(/Published/)
  })

  it('hides publish after publish until draft is saved again', () => {
    const data = [{ label: 'P1' }]
    const pub = publishSnapshot('timetable', data)
    expect(showPublishButton(publishStatusOf(pub, data), pub, data)).toBe(false)

    const edited = [{ label: 'P1b' }]
    const st = publishStatusOf(pub, edited)
    expect(st).toBe('unpublished')
    expect(showPublishButton(st, pub, edited)).toBe(false)

    const saved = saveDraftSnapshot('timetable', edited)
    expect(showPublishButton(publishStatusOf(saved, edited), saved, edited)).toBe(true)
  })
})
