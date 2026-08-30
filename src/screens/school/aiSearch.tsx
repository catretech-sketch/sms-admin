/* ============================================================
   SchoolMate — AI Mode: voice/text natural-language search over
   already-live student/attendance data. Local resolver today
   (see aiSearchResolver.ts); same response shape the future
   POST /v1/ai/search backend will return. Platinum-gated by the
   caller (CommunicationScreen wraps this in <TierGate feature="ai_search">).
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
import { useAiSearch } from '@/api/hooks/useAiSearch'
import type { AiSearchResponse, StudentSearchRow } from '@/lib/aiSearchResolver'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Minimal local typing for the Web Speech API — not declared in TS's default DOM lib. */
interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface ChatTurn { id: number; query: string; response: AiSearchResponse }

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
  const [listening, setListening] = useState(false)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const turnId = useRef(0)

  const studentsQ = useStudents()
  const today = todayIso()
  const attendanceQ = usePeriodAttendanceRangeSummary({ preset: 'custom', from: today, to: today })
  const hero = useMemo(() => classWiseDayHero({ range: attendanceQ.data }), [attendanceQ.data])
  const search = useAiSearch()

  const speechCtor = getSpeechRecognitionCtor()
  const micSupported = speechCtor != null

  const submit = (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setPendingQuery(trimmed)
  }

  /* Students load asynchronously; defer the actual search until the roster is ready so the
     resolver isn't run against a stale/empty list captured at click time. */
  useEffect(() => {
    if (pendingQuery == null) return
    if (studentsQ.isLoading) return
    if (search.isPending) return
    const students = (studentsQ.data ?? []).map((s) => ({
      id: s.id, name: s.name, cls: s.cls, section: s.section, attendance: s.attendance,
    }))
    search.mutate(
      { query: pendingQuery, students, attendanceHero: hero },
      {
        onSuccess: (response) => {
          turnId.current += 1
          setTurns((t) => [...t, { id: turnId.current, query: pendingQuery, response }])
          setPendingQuery(null)
          setText('')
        },
        onError: () => {
          toast.danger('Search failed', 'Could not process that question. Try again.')
          setPendingQuery(null)
        },
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery, studentsQ.data, studentsQ.isLoading, hero])

  const toggleMic = () => {
    if (!speechCtor) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const recognition = new speechCtor()
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      setText(event.results[0]?.[0]?.transcript ?? '')
    }
    recognition.onerror = () => {
      toast.danger('Voice input failed', 'Could not hear that — try typing instead.')
      setListening(false)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

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
            variant={listening ? 'danger' : 'secondary'}
            icon="mic"
            onClick={toggleMic}
            disabled={!micSupported}
            title={micSupported ? undefined : 'Voice input not available in this browser — type your question instead'}
          >
            {listening ? 'Listening…' : 'Speak'}
          </Btn>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. How many students present today?"
            style={{ flex: 1, minWidth: 240 }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(text) }}
          />
          <Btn variant="primary" icon="arrowRight" onClick={() => submit(text)} disabled={!text.trim() || search.isPending}>
            Ask
          </Btn>
        </div>

        {turns.length === 0 ? (
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
          </div>
        )}
      </Card>
    </div>
  )
}
