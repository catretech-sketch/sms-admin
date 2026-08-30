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
