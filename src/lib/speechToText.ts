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
    const prev = recognitionRef.current
    if (prev) { prev.onresult = null; prev.onerror = null; prev.onend = null }
    const recognition = new speechCtor()
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      onResult(event.results[0]?.[0]?.transcript ?? '')
      /* continuous is always false here — a single-shot recognizer ends itself right after
         its one result, matching the real Web Speech API's behavior (the browser fires
         'end' shortly after 'result' for a non-continuous recognizer). Resetting here
         rather than waiting on that later 'end' event lets a caller immediately start a
         fresh recognition session (e.g. after speaking the answer aloud) without the stale
         'still listening' flag blocking it. */
      setListening(false)
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted') {
        /* Emitted on a deliberate stop() or unmount teardown — not a real failure,
           so no error is reported to the consumer (no toast). */
        setListening(false)
        return
      }
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
