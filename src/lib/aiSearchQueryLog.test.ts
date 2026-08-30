import { describe, it, expect, beforeEach } from 'vitest'
import { logUnsupportedAiQuery, getAiSearchQueryLog, clearAiSearchQueryLog } from './aiSearchQueryLog'

beforeEach(() => {
  localStorage.clear()
})

describe('aiSearchQueryLog', () => {
  it('starts empty', () => {
    expect(getAiSearchQueryLog()).toEqual([])
  })

  it('records an entry with a timestamp', () => {
    logUnsupportedAiQuery({ question: 'what is the weather', language: 'en', intent: 'Unsupported', role: 'teacher' })
    const log = getAiSearchQueryLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ question: 'what is the weather', language: 'en', intent: 'Unsupported', role: 'teacher' })
    expect(typeof log[0].timestamp).toBe('string')
  })

  it('appends multiple entries in order', () => {
    logUnsupportedAiQuery({ question: 'q1', language: 'en', intent: 'Unsupported', role: 'admin' })
    logUnsupportedAiQuery({ question: 'q2', language: 'hi', intent: 'WriteBlocked', role: 'admin' })
    const log = getAiSearchQueryLog()
    expect(log.map((e) => e.question)).toEqual(['q1', 'q2'])
  })

  it('caps the log at 200 entries, dropping the oldest', () => {
    for (let i = 0; i < 205; i++) {
      logUnsupportedAiQuery({ question: `q${i}`, language: 'en', intent: 'Unsupported', role: 'admin' })
    }
    const log = getAiSearchQueryLog()
    expect(log).toHaveLength(200)
    expect(log[0].question).toBe('q5')
    expect(log[199].question).toBe('q204')
  })

  it('clearAiSearchQueryLog empties the log', () => {
    logUnsupportedAiQuery({ question: 'q1', language: 'en', intent: 'Unsupported', role: 'admin' })
    clearAiSearchQueryLog()
    expect(getAiSearchQueryLog()).toEqual([])
  })

  it('never throws when localStorage is unavailable', () => {
    const original = globalThis.localStorage
    // @ts-expect-error -- simulate an environment where localStorage access throws
    delete globalThis.localStorage
    expect(() => logUnsupportedAiQuery({ question: 'q', language: 'en', intent: 'Unsupported', role: 'admin' })).not.toThrow()
    expect(() => getAiSearchQueryLog()).not.toThrow()
    globalThis.localStorage = original
  })
})
