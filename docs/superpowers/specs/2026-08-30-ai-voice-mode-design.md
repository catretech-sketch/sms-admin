# AI Voice Mode — End-to-End Voice Conversation — Design Spec

Status: Approved for planning
Date: 2026-08-30
Scope: Architectural (new voice-output subsystem layered onto the existing AI Mode)

## 1. Objective

Extend the existing "AI Mode" on the school Communication screen (built per
`docs/superpowers/specs/2026-08-30-communication-ai-mode-design.md`) so a user can have a full
hands-free voice conversation: tap Speak, ask a question naturally in English/Hindi/Hinglish, and
hear the AI's answer spoken back — without typing anything.

Today, AI Mode already has voice *input* (`SpeechRecognition` fills the text box, user must press
Ask) and always-silent text answers. This spec adds:
- **Auto-submit** for voice-originated queries (no manual Ask press needed).
- **Voice output**: the AI's answer is spoken aloud via the browser's native
  `speechSynthesis` API, in a language matched to the response.
- A small voice-state indicator (Idle / Listening / Processing / Speaking) and conflict handling
  between listening and speaking.

Non-goals (explicitly out of scope for this iteration):
- Extending AI Mode to any other screen, console, or app (Owner console, Teacher/Parent/Staff
  apps) — that is a separate, larger effort with its own scoping, tracked separately.
- Any backend change. The backend already only ever returns text (per the original AI Search
  spec); this feature is 100% frontend, using the browser's built-in TTS — no new backend
  endpoint, no server-side audio generation.
- Real per-role data-scoping tests (Teacher-own-class, Parent-own-child) — this codebase's AI Mode
  only exists in the School admin console today; there is no Teacher/Parent app integration to
  test that scoping against. Voice adds no new authorization surface beyond what already exists
  (see §7) — it is simply another way to produce the same text query.
- A persistent, always-visible "Error" UI state — errors continue to surface as toasts, consistent
  with every other error path already in this screen.

## 2. Architecture

Per this feature's own layering requirement, voice input/output logic is extracted out of
`AiSearchScreen` into two new, independently testable modules — `AiSearchScreen` becomes a thin
orchestrator over three collaborators, none of which know about each other's business logic:

```
AiSearchScreen (orchestrator)
  ├─ useSpeechToText({ lang, onResult, onError }) → { start, stop, listening, supported }
  │     (src/lib/speechToText.ts — extracted from today's inline SpeechRecognition logic)
  ├─ useAiSearch() → existing mutation over resolveAiQuery (unchanged)
  └─ useTextToSpeech() → { speak(text, lang), stop(), speaking, supported }
        (src/lib/textToSpeech.ts — new, wraps window.speechSynthesis)
```

**`useSpeechToText`** (`src/lib/speechToText.ts`): moves the existing
`SpeechRecognitionLike`/`getSpeechRecognitionCtor`/`toggleMic` logic out of `aiSearch.tsx` verbatim,
reshaped as a hook. Adds one behavior change: the `onerror` handler now reads the browser's
`event.error` code (`'not-allowed'`, `'no-speech'`, etc.) instead of treating every error
identically, so a permission denial can be told apart from "didn't hear anything" (see §5).

**`useTextToSpeech`** (`src/lib/textToSpeech.ts`, new): wraps `window.speechSynthesis` /
`SpeechSynthesisUtterance`. `speak(text, lang)` maps `'en'` → `'en-IN'`, `'hi'`/`'hinglish'` →
`'hi-IN'` for the utterance's `.lang`, tracks `speaking` via the utterance's `onstart`/`onend`/
`onerror` events, and exposes `stop()` (`window.speechSynthesis.cancel()`). `supported` reflects
`'speechSynthesis' in window`.

Both hooks are pure UI-adjacent utilities with no knowledge of `AiSearchResponse`, `resolveAiQuery`,
or tier gating — `AiSearchScreen` is the only place that wires "voice in → search → voice out"
together, exactly matching this feature's own architecture requirement (§11 of the original ask):
voice stays replaceable without touching AI business logic, and AI business logic stays untouched
by how the query arrived.

## 3. Voice-only auto-submit and auto-speak

Each submitted query is tagged with `source: 'voice' | 'text'`, carried through to its
`ChatTurn`. This tag changes two behaviors **only for `source: 'voice'`**:

- **Auto-submit**: `useSpeechToText`'s `onResult` callback, instead of only populating the text
  box (today's behavior), submits immediately — no Ask press required. Typed queries are
  unaffected: pressing Ask/Enter is still required, and editing the text box before sending still
  works exactly as today.
- **Auto-speak**: once a `source: 'voice'` turn's answer arrives, `AiSearchScreen` calls
  `textToSpeech.speak(response.answer, response.language)` automatically. Typed queries remain
  silent — the answer is only shown as text, never read aloud — so a keyboard-only user in a quiet
  room isn't surprised by sudden audio.

This mirrors the acceptance criteria exactly: "press Speak, say a question, hear the AI answer
back, without typing anything" — while leaving today's typed-question experience unchanged.

## 4. Voice state and conflict handling

One derived status, not a fifth independently-tracked piece of state:

```
listening ? 'Listening' : pendingQuery ? 'Processing' : ttsSpeaking ? 'Speaking' : 'Idle'
```

No separate status pill is built for this — three simple, already-existing UI elements cover
all four states without a new widget: the Speak button's own label (`'Listening…'` while
`listening`, `'Speak'` otherwise) plus its red/danger styling whenever `listening || speaking`
is true, together with the pre-existing "Thinking…" bubble that AI Mode already renders in the
transcript for a pending query. Idle and Processing need no dedicated affordance beyond that
existing bubble; Listening and Speaking are both covered by the button's danger styling, with
its label distinguishing the former (this was simplified from an earlier standalone-pill design
during brainstorming, once it was clear the button and transcript already said everything a pill
would).

**Conflict resolution** (tapping Speak while the AI is currently speaking): stops speech
immediately (`textToSpeech.stop()`), then starts listening — chosen over disabling the button,
since it reads as a natural conversational interruption (confirmed with the user). This is the
button's only behavior while speaking; there is no separate stop-only mode.

**Stop controls**: the same Speak button doubles as the "stop" affordance while `listening` —
tapping it then stops listening (unchanged from today). While `speaking`, tapping it always
starts a new voice turn (per the conflict resolution above), silencing the current speech as a
side effect rather than as its own action; the button is intentionally never labeled "Stop
speaking", since that would promise a stop-only behavior it doesn't have. Stopping speech never
deletes the turn's answer text from the transcript — only the audio playback ends.

## 5. Error handling

All errors surface as toasts — consistent with every other error path already in this screen; no
persistent "Error" visual state is introduced (confirmed with the user, since one would be
inconsistent with how every other failure in this app already surfaces).

- **Mic permission denied**: `useSpeechToText`'s `onerror` distinguishes `event.error ===
  'not-allowed'` → toast, and **permanently disables** the mic button for the rest of the session
  (closes a pre-existing gap where the button stayed enabled after a denial).
- **Speech recognition unavailable**: unchanged — mic button disabled with a tooltip (existing
  behavior).
- **No speech detected**: `event.error === 'no-speech'` → toast, mic re-enabled, state returns to
  Idle.
- **Speech recognition error (other)**: generic toast, state returns to Idle.
- **AI API error**: unchanged — existing `onError` → toast (this path doesn't change with voice).
- **TTS unavailable**: `!textToSpeech.supported` → silently skip auto-speak, no toast (a silent
  capability degradation, not a user-initiated action failing — the text answer is still shown).
- **Empty AI response**: if `response.answer` is null/empty, skip `speak()` — nothing to say.

None of these paths can crash the app; every one resolves back to a well-defined state (Idle, or
Listening/Processing continuing as appropriate).

## 6. Data flow (unchanged data flow, one new hop)

```
Speak tap
  → useSpeechToText.start()
  → SpeechRecognition (existing) → onResult(transcript)
  → AiSearchScreen: submit(transcript, source: 'voice')       ← auto-submit, no Ask press
  → useAiSearch() mutation → resolveAiQuery (existing, unchanged)
  → AiSearchResponse
  → render answer text (existing)
  → if source === 'voice': useTextToSpeech.speak(answer, language)
  → SpeechSynthesisUtterance → audio playback
```

No change to `resolveAiQuery`, `useAiSearch`, `aiSearchResolver.ts`, `FEATURE_TIER`, or the
`TierGate` wiring in `operations.tsx` — voice is purely an alternate way to produce a text query
and an alternate way to present a text answer, on both sides of the exact same pipeline typed
queries already use.

## 7. Security

Voice introduces no new authorization surface. It is a UI-only extension: `useSpeechToText`
produces plain text, which flows through the identical `useAiSearch`/`resolveAiQuery` call typed
input already uses, behind the identical `TierGate feature="ai_search"` (Platinum-only) already
wrapping `AiSearchScreen` in `CommunicationScreen`. Silver/Gold schools cannot reach AI Mode at all
(voice or text) — the gate is upstream of everything in this spec. There is no separate "voice
authorization path" to build or audit.

## 8. Testing

- `src/lib/speechToText.test.ts` (new): start/stop lifecycle, error-code branching (`'not-allowed'`
  vs `'no-speech'` vs other), language (`en-IN`/`hi-IN`) passed to the recognition instance —
  against mocked Web Speech API globals, matching the existing `aiSearch.test.tsx` mocking pattern.
- `src/lib/textToSpeech.test.ts` (new): `speak()` maps language correctly, `stop()` cancels,
  `speaking` state tracks utterance lifecycle events, `supported` reflects API presence — against a
  mocked `window.speechSynthesis`/`SpeechSynthesisUtterance`.
- `src/screens/school/aiSearch.test.tsx` (extended): voice-submitted query auto-submits without an
  Ask click; a voice-turn's answer triggers `speak()` with the response's mapped language; a
  typed-query turn never triggers `speak()`; tapping Speak while `speaking` stops speech then
  starts listening; the mic button becomes permanently disabled after a `'not-allowed'` error.
  Every existing test in this file (6 as of the last commit) must keep passing unchanged, since
  typed-query behavior is untouched.
- No test targets Silver/Gold gating or Teacher/Parent scoping (per §1's non-goals) — that
  coverage already exists at the `TierGate`/backend-spec level and is unaffected by this feature.
