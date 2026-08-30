# AI Voice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AI Mode a full hands-free voice conversation loop — a spoken question auto-submits
(no Ask press) and the AI's answer is spoken back via the browser's native text-to-speech, while
typed questions keep behaving exactly as they do today (silent, manual Ask press).

**Architecture:** Extract the existing inline `SpeechRecognition` logic out of `AiSearchScreen` into
a standalone `useSpeechToText` hook, add a new `useTextToSpeech` hook wrapping
`window.speechSynthesis`, and make `AiSearchScreen` the orchestrator: it tags each submitted query
with its `source` ('voice' | 'text'), auto-submits and auto-speaks only for `'voice'`-sourced turns,
and handles the Speak-button conflict (tapping it while the AI is speaking stops speech and starts
listening).

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3 + React Testing Library. Browser
`SpeechRecognition`/`webkitSpeechRecognition` (already in use) and `speechSynthesis` /
`SpeechSynthesisUtterance` (new) — both native Web Speech API, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-ai-voice-mode-design.md`

## Global Constraints

- No backend change of any kind — TTS is 100% frontend (`window.speechSynthesis`); the backend
  contract this feature builds toward continues to return text only.
- Auto-submit and auto-speak apply **only** to voice-sourced queries — typed queries keep requiring
  a manual Ask/Enter press, and are never spoken aloud.
- No new, separate "Error" UI state — every error path stays a toast, matching every other error
  already in this screen.
- Tapping Speak while the AI is speaking stops speech immediately, then starts listening (not:
  disable the button until speech finishes).
- Voice adds no new authorization surface — it flows through the exact same `useAiSearch`/
  `resolveAiQuery`/`TierGate` pipeline typed queries already use. No task in this plan touches
  `aiSearchResolver.ts`, `useAiSearch.ts`, `mockDb.ts`'s `FEATURE_TIER`, or `operations.tsx`.
- `npm test`, `npx tsc -b` (no NEW errors — this repo has pre-existing, unrelated baseline errors in
  `src/components/maps/RouteBuilderMap.tsx`, `src/components/shell/Sidebar.tsx`, `src/lib/format.ts`,
  `src/screens/school/admin.tsx`, `src/screens/school/geoFencePanel.tsx`,
  `src/screens/school/transport.tsx` — not this plan's concern), and `npm run build` must all be
  clean (modulo that known baseline). `noUnusedLocals` is on.
- Reuse existing UI primitives from `@/components/ui` — no new CSS classes, no new icons beyond
  what already exists (the existing `mic` icon covers both "Listening…" and "Stop speaking",
  distinguished by the `danger` button variant already used for the listening state).

---

### Task 1: `useSpeechToText` hook

**Files:**
- Create: `src/lib/speechToText.ts`
- Test: `src/lib/speechToText.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (foundational, self-contained).
- Produces (used by Task 3):
  - `export type SpeechToTextErrorCode = 'not-allowed' | 'no-speech' | 'other'`
  - `export interface UseSpeechToTextOptions { lang: 'en' | 'hi'; onResult: (transcript: string) => void; onError: (code: SpeechToTextErrorCode) => void }`
  - `export interface UseSpeechToTextResult { start: () => void; stop: () => void; listening: boolean; supported: boolean }`
  - `export function useSpeechToText(options: UseSpeechToTextOptions): UseSpeechToTextResult`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/speechToText.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/speechToText.test.ts`
Expected: FAIL — cannot find module `./speechToText`.

- [ ] **Step 3: Implement**

Create `src/lib/speechToText.ts`:
```ts
/** Speech-to-text: thin wrapper over the browser's SpeechRecognition API (Web Speech API),
 *  extracted out of AiSearchScreen so voice input stays swappable/testable independent of
 *  AI search or text-to-speech concerns. See
 *  docs/superpowers/specs/2026-08-30-ai-voice-mode-design.md §2. */
import { useEffect, useRef, useState } from 'react'

interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionResultEventLike { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }
interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: SpeechRecognitionResultEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type SpeechToTextErrorCode = 'not-allowed' | 'no-speech' | 'other'

export interface UseSpeechToTextOptions {
  lang: 'en' | 'hi'
  onResult: (transcript: string) => void
  onError: (code: SpeechToTextErrorCode) => void
}

export interface UseSpeechToTextResult {
  start: () => void
  stop: () => void
  listening: boolean
  supported: boolean
}

/** Voice input as a standalone hook. `start()` toggles: call it to begin listening, call it
 *  again while listening to stop — matching a single Speak/Stop button. `supported` goes
 *  permanently false for the rest of the component's life after a 'not-allowed' (mic
 *  permission denied) error, in addition to reflecting whether the browser exposes
 *  SpeechRecognition at all. */
export function useSpeechToText({ lang, onResult, onError }: UseSpeechToTextOptions): UseSpeechToTextResult {
  const [listening, setListening] = useState(false)
  const [permanentlyDenied, setPermanentlyDenied] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    return () => { recognitionRef.current?.stop() }
  }, [])

  const speechCtor = getSpeechRecognitionCtor()
  const supported = speechCtor != null && !permanentlyDenied

  const start = () => {
    if (!speechCtor || permanentlyDenied) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const recognition = new speechCtor()
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      onResult(event.results[0]?.[0]?.transcript ?? '')
    }
    recognition.onerror = (event) => {
      const code: SpeechToTextErrorCode =
        event.error === 'not-allowed' ? 'not-allowed' : event.error === 'no-speech' ? 'no-speech' : 'other'
      if (code === 'not-allowed') setPermanentlyDenied(true)
      onError(code)
      setListening(false)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  const stop = () => {
    recognitionRef.current?.stop()
  }

  return { start, stop, listening, supported }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/speechToText.test.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b` — expect no new errors (only the known pre-existing baseline list).

```bash
git add src/lib/speechToText.ts src/lib/speechToText.test.ts
git commit -m "feat(comms): extract useSpeechToText hook with error-code awareness"
```

---

### Task 2: `useTextToSpeech` hook

**Files:**
- Create: `src/lib/textToSpeech.ts`
- Test: `src/lib/textToSpeech.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (foundational, self-contained, independent of Task 1).
- Produces (used by Task 3):
  - `export function mapLangToSpeechCode(lang: 'en' | 'hi' | 'hinglish' | null): string`
  - `export interface UseTextToSpeechResult { speak: (text: string, lang: 'en' | 'hi' | 'hinglish' | null) => void; stop: () => void; speaking: boolean; supported: boolean }`
  - `export function useTextToSpeech(): UseTextToSpeechResult`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/textToSpeech.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/textToSpeech.test.ts`
Expected: FAIL — cannot find module `./textToSpeech`.

- [ ] **Step 3: Implement**

Create `src/lib/textToSpeech.ts`:
```ts
/** Text-to-speech: thin wrapper over the browser's SpeechSynthesis API (Web Speech API),
 *  used to speak AI Mode's answer aloud for voice-originated queries. See
 *  docs/superpowers/specs/2026-08-30-ai-voice-mode-design.md §2. */
import { useRef, useState } from 'react'

interface SpeechSynthesisUtteranceLike {
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type SpeechSynthesisUtteranceCtor = new (text: string) => SpeechSynthesisUtteranceLike
interface SpeechSynthesisLike {
  cancel: () => void
  speak: (utterance: SpeechSynthesisUtteranceLike) => void
}

function getSpeechSynthesis(): SpeechSynthesisLike | null {
  const w = window as unknown as { speechSynthesis?: SpeechSynthesisLike }
  return w.speechSynthesis ?? null
}

function getUtteranceCtor(): SpeechSynthesisUtteranceCtor | null {
  const w = window as unknown as { SpeechSynthesisUtterance?: SpeechSynthesisUtteranceCtor }
  return w.SpeechSynthesisUtterance ?? null
}

/** Maps this app's AI-response language field to a speech-synthesis BCP-47 code. Hinglish has
 *  no native voice, so it falls back to Hindi like the rest of AI Mode's Hindi handling
 *  already does. */
export function mapLangToSpeechCode(lang: 'en' | 'hi' | 'hinglish' | null): string {
  if (lang === 'hi' || lang === 'hinglish') return 'hi-IN'
  return 'en-IN'
}

export interface UseTextToSpeechResult {
  speak: (text: string, lang: 'en' | 'hi' | 'hinglish' | null) => void
  stop: () => void
  speaking: boolean
  supported: boolean
}

export function useTextToSpeech(): UseTextToSpeechResult {
  const [speaking, setSpeaking] = useState(false)
  const synthRef = useRef<SpeechSynthesisLike | null>(null)

  const supported = getSpeechSynthesis() != null && getUtteranceCtor() != null

  const speak = (text: string, lang: 'en' | 'hi' | 'hinglish' | null) => {
    const synth = getSpeechSynthesis()
    const UtteranceCtor = getUtteranceCtor()
    if (!synth || !UtteranceCtor || !text.trim()) return
    synth.cancel()
    const utterance = new UtteranceCtor(text)
    utterance.lang = mapLangToSpeechCode(lang)
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    synthRef.current = synth
    synth.speak(utterance)
  }

  const stop = () => {
    synthRef.current?.cancel()
    setSpeaking(false)
  }

  return { speak, stop, speaking, supported }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/textToSpeech.test.ts`
Expected: PASS (all 10 cases).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b` — expect no new errors.

```bash
git add src/lib/textToSpeech.ts src/lib/textToSpeech.test.ts
git commit -m "feat(comms): add useTextToSpeech hook wrapping window.speechSynthesis"
```

---

### Task 3: Wire voice input/output into `AiSearchScreen`

**Files:**
- Modify: `src/screens/school/aiSearch.tsx` (full rewrite of its voice-related logic; the JSX
  structure, resolver/attendance wiring, and pending-query-queue mechanics from the shipped AI Mode
  work are preserved as-is)
- Modify: `src/screens/school/aiSearch.test.tsx` (extend with new voice/TTS test cases; the 6
  existing tests must keep passing unchanged)

**Interfaces:**
- Consumes (from Task 1): `useSpeechToText`, `SpeechToTextErrorCode` from `@/lib/speechToText`.
- Consumes (from Task 2): `useTextToSpeech`, `mapLangToSpeechCode` (used internally by
  `useTextToSpeech`, not called directly here) from `@/lib/textToSpeech`.
- Consumes (existing, unchanged): `useAiSearch`, `useStudents`, `usePeriodAttendanceRangeSummary`,
  `classWiseDayHero`, `studentLiveAttendance`, `useToast`, UI primitives.
- Produces: `AiSearchScreen` keeps its existing `export function AiSearchScreen(): JSX.Element`
  signature — no change to how `CommunicationScreen` (`operations.tsx`) consumes it.

- [ ] **Step 1: Write the failing tests**

Add these test cases to the **end** of the existing `describe('AiSearchScreen', ...)` block in
`src/screens/school/aiSearch.test.tsx` (do not touch the 6 existing tests above them):

```tsx
  it('auto-submits a voice-recognized transcript without pressing Ask', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const recognitionInstances: { onresult: ((e: { results: { transcript: string }[][] }) => void) | null }[] = []
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null
      start = vi.fn()
      stop = vi.fn()
      constructor() { recognitionInstances.push(this) }
    }
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /Speak/i }))
    recognitionInstances[0].onresult?.({ results: [[{ transcript: 'find rahul' }]] })
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "rahul"/i)).toBeInTheDocument())
    vi.unstubAllGlobals()
  })

  it('speaks the answer aloud for a voice-submitted question, using the response language', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const recognitionInstances: { onresult: ((e: { results: { transcript: string }[][] }) => void) | null }[] = []
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null
      start = vi.fn()
      stop = vi.fn()
      constructor() { recognitionInstances.push(this) }
    }
    const utterances: { lang: string; text: string }[] = []
    class FakeUtterance {
      lang = ''
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      text: string
      constructor(text: string) { this.text = text; utterances.push(this) }
    }
    const speak = vi.fn()
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak })
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /Speak/i }))
    recognitionInstances[0].onresult?.({ results: [[{ transcript: 'find rahul' }]] })
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "rahul"/i)).toBeInTheDocument())
    expect(speak).toHaveBeenCalledTimes(1)
    expect(utterances[0].text).toBe('Found 1 student matching "rahul".')
    expect(utterances[0].lang).toBe('en-IN')
    vi.unstubAllGlobals()
  })

  it('does not speak the answer for a typed question', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const speak = vi.fn()
    class FakeUtterance {
      lang = ''
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(_text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak })
    renderScreen()
    fireEvent.change(screen.getByPlaceholderText(/How many students present today/i), { target: { value: 'find rahul' } })
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }))
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "rahul"/i)).toBeInTheDocument())
    expect(speak).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('tapping Speak while the AI is speaking stops speech and starts listening', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const recognitionInstances: { start: ReturnType<typeof vi.fn>; onresult: ((e: { results: { transcript: string }[][] }) => void) | null }[] = []
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null
      start = vi.fn()
      stop = vi.fn()
      constructor() { recognitionInstances.push(this) }
    }
    class FakeUtterance {
      lang = ''
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(_text: string) {}
    }
    const cancel = vi.fn()
    const speak = vi.fn((u: FakeUtterance) => { u.onstart?.() })
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('speechSynthesis', { cancel, speak })
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /Speak/i }))
    recognitionInstances[0].onresult?.({ results: [[{ transcript: 'find rahul' }]] })
    await waitFor(() => expect(screen.getByRole('button', { name: /Stop speaking/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Stop speaking/i }))
    expect(cancel).toHaveBeenCalled()
    expect(recognitionInstances).toHaveLength(2)
    expect(recognitionInstances[1].start).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('permanently disables the mic button after a not-allowed (permission denied) error', () => {
    vi.stubGlobal('fetch', mockFetch())
    const recognitionInstances: { onerror: ((e: { error: string }) => void) | null }[] = []
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: (() => void) | null = null
      onerror: ((e: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      start = vi.fn()
      stop = vi.fn()
      constructor() { recognitionInstances.push(this) }
    }
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /Speak/i }))
    recognitionInstances[0].onerror?.({ error: 'not-allowed' })
    expect(screen.getByRole('button', { name: /Speak/i })).toBeDisabled()
    vi.unstubAllGlobals()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/school/aiSearch.test.tsx`
Expected: the 6 pre-existing tests still PASS (nothing has changed yet); the 5 new tests FAIL
(voice queries don't auto-submit yet, `useTextToSpeech`/`useSpeechToText` aren't wired in yet).

- [ ] **Step 3: Implement**

Replace the full contents of `src/screens/school/aiSearch.tsx` with:
```tsx
/* ============================================================
   SchoolMate — AI Mode: voice/text natural-language search over
   already-live student/attendance data. Local resolver today
   (see aiSearchResolver.ts); same response shape the future
   POST /v1/ai/search backend will return. Platinum-gated by the
   caller (CommunicationScreen wraps this in <TierGate feature="ai_search">).
   Voice input/output are separate hooks (speechToText.ts,
   textToSpeech.ts) — this screen only orchestrates them; see
   docs/superpowers/specs/2026-08-30-ai-voice-mode-design.md.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PageHead, Card, Btn, Badge, Segmented, Input, DataTable, DemoBadge, Empty,
  type Column,
} from '@/components/ui'
import { useToast } from '@/lib/hooks'
import { useStudents } from '@/api/hooks/useStudents'
import { usePeriodAttendanceRangeSummary } from '@/api/hooks/usePeriodAttendanceAdvanced'
import { classWiseDayHero } from '@/api/periodAttendanceAdvanced'
import { studentLiveAttendance } from '@/lib/studentLiveAttendance'
import { useAiSearch } from '@/api/hooks/useAiSearch'
import { useSpeechToText, type SpeechToTextErrorCode } from '@/lib/speechToText'
import { useTextToSpeech } from '@/lib/textToSpeech'
import type { AiSearchResponse, StudentSearchRow } from '@/lib/aiSearchResolver'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type QuerySource = 'voice' | 'text'

interface PendingQuery { query: string; source: QuerySource }
interface ChatTurn { id: number; query: string; response: AiSearchResponse; source: QuerySource }

function isStudentRows(data: AiSearchResponse['data']): data is StudentSearchRow[] {
  return Array.isArray(data)
}

const STUDENT_COLUMNS: Column<StudentSearchRow>[] = [
  { key: 'name', label: 'Student', render: (r) => r.name },
  { key: 'className', label: 'Class', render: (r) => `${r.className}${r.section ? '-' + r.section : ''}` },
  { key: 'attendancePct', label: 'Attendance', render: (r) => (r.attendancePct == null ? '—' : `${r.attendancePct}%`) },
]

export function AiSearchScreen() {
  const toast = useToast()
  const [lang, setLang] = useState<'en' | 'hi'>('en')
  const [text, setText] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [pendingQuery, setPendingQuery] = useState<PendingQuery | null>(null)
  const turnId = useRef(0)

  const studentsQ = useStudents()
  const today = todayIso()
  const attendanceQ = usePeriodAttendanceRangeSummary({ preset: 'custom', from: today, to: today })
  const hero = useMemo(() => classWiseDayHero({ range: attendanceQ.data }), [attendanceQ.data])
  const attendanceSummary = useMemo(() => studentLiveAttendance({
    loaded: attendanceQ.isSuccess || attendanceQ.isError,
    presentTotal: hero.present,
    studentTotal: hero.marked,
    overallPct: hero.pct,
    enrollment: studentsQ.data?.length ?? 0,
  }), [attendanceQ.isSuccess, attendanceQ.isError, hero, studentsQ.data])
  const search = useAiSearch()
  const tts = useTextToSpeech()

  const submit = (query: string, source: QuerySource) => {
    const trimmed = query.trim()
    if (!trimmed) return
    /* Clear the input immediately — decoupled from the async mutation below — so a query
       typed while a prior search is still in flight is never wiped out by that prior
       search's completion handler (see the pendingQuery guard below). */
    setPendingQuery({ query: trimmed, source })
    setText('')
  }

  const handleSpeechResult = (transcript: string) => {
    /* Voice queries auto-submit — no Ask press needed, per the voice-mode acceptance
       criteria ("press Speak, say a question, hear the answer, without typing anything"). */
    submit(transcript, 'voice')
  }

  const handleSpeechError = (code: SpeechToTextErrorCode) => {
    if (code === 'not-allowed') {
      toast.danger('Microphone blocked', 'Voice input has been disabled for this session — allow microphone access and reload to use it again.')
    } else if (code === 'no-speech') {
      toast.danger('No speech detected', 'Try again, or type your question instead.')
    } else {
      toast.danger('Voice input failed', 'Could not hear that — try typing instead.')
    }
  }

  const speechToText = useSpeechToText({ lang, onResult: handleSpeechResult, onError: handleSpeechError })

  /* Students load asynchronously; defer the actual search until the roster is ready so the
     resolver isn't run against a stale/empty list captured at click time. Also acts as a
     one-at-a-time queue: if the user submits a new query while a previous one is still
     in flight, pendingQuery is overwritten to the new query but the in-flight mutation's
     completion handlers only clear pendingQuery when it still matches the query THEY
     resolved — so a newer queued query survives and this effect re-fires for it once the
     prior mutation settles. */
  useEffect(() => {
    if (pendingQuery == null) return
    if (studentsQ.isLoading) return
    if (search.isPending) return
    const resolved = pendingQuery
    const students = (studentsQ.data ?? []).map((s) => ({
      id: s.id, name: s.name, cls: s.cls, section: s.section, attendance: s.attendance,
    }))
    search.mutate(
      {
        query: resolved.query,
        students,
        attendanceHero: {
          present: attendanceSummary.present,
          marked: attendanceSummary.marked,
          absent: Math.max(0, attendanceSummary.marked - attendanceSummary.present),
          pct: attendanceSummary.pct,
        },
      },
      {
        onSuccess: (response) => {
          turnId.current += 1
          setTurns((t) => [...t, { id: turnId.current, query: resolved.query, response, source: resolved.source }])
          setPendingQuery((p) => (p === resolved ? null : p))
          if (resolved.source === 'voice' && response.answer) {
            tts.speak(response.answer, response.language)
          }
        },
        onError: () => {
          toast.danger('Search failed', 'Could not process that question. Try again.')
          setPendingQuery((p) => (p === resolved ? null : p))
        },
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery, studentsQ.data, studentsQ.isLoading, search.isPending, hero, attendanceSummary])

  const handleSpeakTap = () => {
    if (tts.speaking) {
      tts.stop()
      speechToText.start()
      return
    }
    speechToText.start()
  }

  const micActive = tts.speaking || speechToText.listening
  const micDisabled = !speechToText.supported && !tts.speaking
  const micLabel = tts.speaking ? 'Stop speaking' : speechToText.listening ? 'Listening…' : 'Speak'

  return (
    <div>
      <PageHead
        title="AI Mode"
        sub="Ask a question about your school — by voice or text"
        actions={<DemoBadge label="Local answers — Claude-backed search coming soon" />}
      />
      <Card>
        <div className="row ai-center gap12 wrap" style={{ marginBottom: 16 }}>
          <Segmented
            value={lang}
            onChange={(v) => setLang(v as 'en' | 'hi')}
            options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिंदी' }]}
          />
          <Btn
            variant={micActive ? 'danger' : 'secondary'}
            icon="mic"
            onClick={handleSpeakTap}
            disabled={micDisabled}
            title={micDisabled ? 'Voice input not available in this browser — type your question instead' : undefined}
          >
            {micLabel}
          </Btn>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. How many students present today?"
            style={{ flex: 1, minWidth: 240 }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(text, 'text') }}
          />
          <Btn variant="primary" icon="arrowRight" onClick={() => submit(text, 'text')} disabled={!text.trim()}>
            Ask
          </Btn>
        </div>

        {turns.length === 0 && pendingQuery == null ? (
          <Empty icon="sparkle" title="Ask your first question" body='Try: "How many students present today?" or "Find Rahul".' />
        ) : (
          <div className="col gap16">
            {turns.map((t) => (
              <div key={t.id} className="col gap8">
                <div className="row jc-end"><Badge tone="brand">{t.query}</Badge></div>
                <div style={{ color: t.response.success ? undefined : 'var(--danger)' }}>{t.response.answer}</div>
                {isStudentRows(t.response.data) && t.response.data.length > 0 && (
                  <DataTable<StudentSearchRow>
                    columns={STUDENT_COLUMNS}
                    rows={t.response.data}
                    rowKey={(r) => r.studentId}
                    pageSize={5}
                  />
                )}
              </div>
            ))}
            {pendingQuery != null && (
              <div className="col gap8">
                <div className="row jc-end"><Badge tone="brand">{pendingQuery.query}</Badge></div>
                <div className="muted">Thinking…</div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/screens/school/aiSearch.test.tsx`
Expected: PASS — all 11 tests (6 pre-existing + 5 new).

- [ ] **Step 5: Full verification and commit**

Run, in order:
```bash
npx vitest run src/lib/speechToText.test.ts src/lib/textToSpeech.test.ts src/screens/school/aiSearch.test.tsx src/screens/school/communicationAiMode.test.tsx
npx tsc -b
npm run build
```
Expected: all target test files green; `tsc -b` shows only the known pre-existing baseline errors
listed in Global Constraints, nothing new; `npm run build`'s `vite build` step succeeds (its `tsc
-b` step will show the same known baseline errors — that is expected and out of scope for this
plan, not a regression).

```bash
git add src/screens/school/aiSearch.tsx src/screens/school/aiSearch.test.tsx
git commit -m "feat(comms): wire voice auto-submit and TTS auto-speak into AiSearchScreen"
```

---

## Post-plan verification

After Task 3, run the full suite once more to confirm nothing elsewhere broke:
```bash
npm test
npm run typecheck
```
Both must exit 0 (modulo the pre-existing, unrelated baseline `tsc` errors and the pre-existing,
unrelated flaky `src/screens/school/toppers.test.tsx` timing test — both already known and
documented as out of scope for this and the prior AI Mode plan).
