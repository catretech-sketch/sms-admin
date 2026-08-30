/* ============================================================
   SchoolMate — AI Mode: voice/text natural-language search over
   already-live student/attendance data. Local resolver today
   (see aiSearchResolver.ts); same response shape the future
   POST /v1/ai/search backend will return. Platinum-gated by the
   caller (AiFloatingButton wraps this in <TierGate feature="ai_search">).
   Voice input/output are separate hooks (speechToText.ts,
   textToSpeech.ts) — this screen only orchestrates them; see
   docs/superpowers/specs/2026-08-30-ai-voice-mode-design.md.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PageHead, Card, Btn, Badge, Segmented, Input, DataTable, DemoBadge, Empty, Toggle,
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
import { logUnsupportedAiQuery } from '@/lib/aiSearchQueryLog'
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

const SUGGESTED_QUESTIONS = [
  'How many students present today?',
  'Find Rahul',
]

/** `role` is only used to label entries in the local unsupported-query log (see
 *  aiSearchQueryLog.ts) — passed in by the caller (AiFloatingButton, which already has
 *  `app.role` from useApp()) rather than calling useApp() here, so this screen and its
 *  tests stay independent of session/auth context. Defaults to 'unknown' if omitted. */
export function AiSearchScreen({ role = 'unknown' }: { role?: string } = {}) {
  const toast = useToast()
  const [lang, setLang] = useState<'en' | 'hi'>('en')
  const [viewOnly, setViewOnly] = useState(false)
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
    if (viewOnly) return
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
          if (response.intent === 'Unsupported' || response.intent === 'WriteBlocked') {
            logUnsupportedAiQuery({
              question: resolved.query, language: response.language, intent: response.intent, role,
            })
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
    if (viewOnly) return
    if (tts.speaking) {
      tts.stop()
      speechToText.start()
      return
    }
    speechToText.start()
  }

  const micActive = tts.speaking || speechToText.listening
  const micDisabled = (!speechToText.supported && !tts.speaking) || viewOnly
  const micLabel = speechToText.listening ? 'Listening…' : 'Speak'

  return (
    <div>
      <PageHead
        title="AI Mode"
        sub="Ask a question about your school — by voice or text"
        actions={<DemoBadge label="Local answers — Claude-backed search coming soon" />}
      />
      <Card>
        <div className="row ai-center gap12 wrap" style={{ marginBottom: 12 }}>
          <Toggle checked={viewOnly} onChange={() => setViewOnly((v) => !v)} label="View only" />
        </div>
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
            title={viewOnly ? 'Turn off View only to use voice input' : (micDisabled ? 'Voice input not available in this browser — type your question instead' : undefined)}
          >
            {micLabel}
          </Btn>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. How many students present today?"
            style={{ flex: 1, minWidth: 240 }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(text, 'text') }}
            disabled={viewOnly}
          />
          <Btn variant="primary" icon="arrowRight" onClick={() => submit(text, 'text')} disabled={!text.trim() || viewOnly}>
            Ask
          </Btn>
        </div>

        {turns.length === 0 && pendingQuery == null ? (
          <Empty
            icon="sparkle"
            title="👋 Hello! How can I help you?"
            body="Ask me anything about your school — try one of these, or type your own question."
            action={
              <div className="row ai-center gap8 wrap" style={{ justifyContent: 'center' }}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <Btn key={q} variant="secondary" size="sm" onClick={() => submit(q, 'text')} disabled={viewOnly}>{q}</Btn>
                ))}
              </div>
            }
          />
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
