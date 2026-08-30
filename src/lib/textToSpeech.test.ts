import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTextToSpeech, mapLangToSpeechCode } from './textToSpeech'

interface FakeUtteranceInstance {
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  text: string
}

function installFakeSpeechSynthesis(): {
  utterances: FakeUtteranceInstance[]
  cancel: ReturnType<typeof vi.fn>
} {
  const utterances: FakeUtteranceInstance[] = []
  const cancel = vi.fn()
  const speak = vi.fn()
  class FakeUtterance implements FakeUtteranceInstance {
    lang = ''
    onstart = null
    onend = null
    onerror = null
    text: string
    constructor(text: string) { this.text = text; utterances.push(this) }
  }
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('speechSynthesis', { cancel, speak })
  return { utterances, cancel }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapLangToSpeechCode', () => {
  it('maps en to en-IN', () => expect(mapLangToSpeechCode('en')).toBe('en-IN'))
  it('maps hi to hi-IN', () => expect(mapLangToSpeechCode('hi')).toBe('hi-IN'))
  it('maps hinglish to hi-IN', () => expect(mapLangToSpeechCode('hinglish')).toBe('hi-IN'))
  it('falls back to en-IN for null', () => expect(mapLangToSpeechCode(null)).toBe('en-IN'))
})

describe('useTextToSpeech', () => {
  it('is unsupported when speechSynthesis is absent from window', () => {
    const { result } = renderHook(() => useTextToSpeech())
    expect(result.current.supported).toBe(false)
  })

  it('speaks text with the mapped language and tracks the speaking state', () => {
    const { utterances } = installFakeSpeechSynthesis()
    const { result } = renderHook(() => useTextToSpeech())
    expect(result.current.supported).toBe(true)
    act(() => { result.current.speak('Aaj school mein 428 bachche aaye hain.', 'hinglish') })
    expect(utterances).toHaveLength(1)
    expect(utterances[0].lang).toBe('hi-IN')
    act(() => { utterances[0].onstart?.() })
    expect(result.current.speaking).toBe(true)
    act(() => { utterances[0].onend?.() })
    expect(result.current.speaking).toBe(false)
  })

  it('cancels any prior utterance before speaking a new one', () => {
    const { cancel } = installFakeSpeechSynthesis()
    const { result } = renderHook(() => useTextToSpeech())
    act(() => { result.current.speak('first', 'en') })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('does nothing for an empty (or whitespace-only) string', () => {
    const { utterances } = installFakeSpeechSynthesis()
    const { result } = renderHook(() => useTextToSpeech())
    act(() => { result.current.speak('   ', 'en') })
    expect(utterances).toHaveLength(0)
  })

  it('stop() cancels playback and clears the speaking state', () => {
    const { utterances, cancel } = installFakeSpeechSynthesis()
    const { result } = renderHook(() => useTextToSpeech())
    act(() => { result.current.speak('hello', 'en') })
    act(() => { utterances[0].onstart?.() })
    expect(result.current.speaking).toBe(true)
    act(() => { result.current.stop() })
    expect(cancel).toHaveBeenCalled()
    expect(result.current.speaking).toBe(false)
  })

  it('clears the speaking state on utterance error', () => {
    const { utterances } = installFakeSpeechSynthesis()
    const { result } = renderHook(() => useTextToSpeech())
    act(() => { result.current.speak('hello', 'en') })
    act(() => { utterances[0].onstart?.() })
    act(() => { utterances[0].onerror?.() })
    expect(result.current.speaking).toBe(false)
  })
})
