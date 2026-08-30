import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSpeechToText } from './speechToText'

interface FakeRecognitionInstance {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: { transcript: string }[][] }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

function installFakeRecognition(): { instances: FakeRecognitionInstance[] } {
  const instances: FakeRecognitionInstance[] = []
  class FakeRecognition implements FakeRecognitionInstance {
    lang = ''
    interimResults = false
    continuous = false
    onresult = null
    onerror = null
    onend = null
    start = vi.fn()
    stop = vi.fn()
    constructor() { instances.push(this) }
  }
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  return { instances }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSpeechToText', () => {
  it('is unsupported when SpeechRecognition is absent from window', () => {
    const { result } = renderHook(() => useSpeechToText({ lang: 'en', onResult: vi.fn(), onError: vi.fn() }))
    expect(result.current.supported).toBe(false)
  })

  it('starts listening with the mapped language and reports the recognized transcript', () => {
    const { instances } = installFakeRecognition()
    const onResult = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ lang: 'hi', onResult, onError: vi.fn() }))
    expect(result.current.supported).toBe(true)
    act(() => { result.current.start() })
    expect(result.current.listening).toBe(true)
    expect(instances).toHaveLength(1)
    expect(instances[0].lang).toBe('hi-IN')
    act(() => { instances[0].onresult?.({ results: [[{ transcript: 'aaj kitne bacche aaye' }]] }) })
    expect(onResult).toHaveBeenCalledWith('aaj kitne bacche aaye')
  })

  it('maps English to en-IN', () => {
    const { instances } = installFakeRecognition()
    const { result } = renderHook(() => useSpeechToText({ lang: 'en', onResult: vi.fn(), onError: vi.fn() }))
    act(() => { result.current.start() })
    expect(instances[0].lang).toBe('en-IN')
  })

  it('stops listening when start is called again while listening', () => {
    const { instances } = installFakeRecognition()
    const { result } = renderHook(() => useSpeechToText({ lang: 'en', onResult: vi.fn(), onError: vi.fn() }))
    act(() => { result.current.start() })
    act(() => { result.current.start() })
    expect(instances[0].stop).toHaveBeenCalled()
  })

  it('stop() calls the underlying recognition instance stop', () => {
    const { instances } = installFakeRecognition()
    const { result } = renderHook(() => useSpeechToText({ lang: 'en', onResult: vi.fn(), onError: vi.fn() }))
    act(() => { result.current.start() })
    act(() => { result.current.stop() })
    expect(instances[0].stop).toHaveBeenCalled()
  })

  it('reports a not-allowed error and becomes permanently unsupported', () => {
    const { instances } = installFakeRecognition()
    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ lang: 'en', onResult: vi.fn(), onError }))
    act(() => { result.current.start() })
    act(() => { instances[0].onerror?.({ error: 'not-allowed' }) })
    expect(onError).toHaveBeenCalledWith('not-allowed')
    expect(result.current.listening).toBe(false)
    expect(result.current.supported).toBe(false)
  })

  it('reports a no-speech error without permanently disabling', () => {
    const { instances } = installFakeRecognition()
    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ lang: 'en', onResult: vi.fn(), onError }))
    act(() => { result.current.start() })
    act(() => { instances[0].onerror?.({ error: 'no-speech' }) })
    expect(onError).toHaveBeenCalledWith('no-speech')
    expect(result.current.supported).toBe(true)
  })

  it('maps any other error code to "other"', () => {
    const { instances } = installFakeRecognition()
    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ lang: 'en', onResult: vi.fn(), onError }))
    act(() => { result.current.start() })
    act(() => { instances[0].onerror?.({ error: 'network' }) })
    expect(onError).toHaveBeenCalledWith('other')
  })

  it('stops listening when onend fires', () => {
    const { instances } = installFakeRecognition()
    const { result } = renderHook(() => useSpeechToText({ lang: 'en', onResult: vi.fn(), onError: vi.fn() }))
    act(() => { result.current.start() })
    act(() => { instances[0].onend?.() })
    expect(result.current.listening).toBe(false)
  })
})
