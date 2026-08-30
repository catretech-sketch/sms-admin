import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/context/ToastProvider'
import { AiSearchScreen } from './aiSearch'
import { getAiSearchQueryLog } from '@/lib/aiSearchQueryLog'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetch() {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('/students')) {
      return Promise.resolve(jsonResponse({
        data: [
          {
            id: 's1', admission_no: 'A1', name: 'Rahul Sharma', gender: 'M', grade: '8',
            section: 'A', class_label: '8', roll: 1, guardian_name: 'G', guardian_phone: '1',
            attendance_pct: 91, fee_status: 'paid', fee_due: 0, status: 'active', house: 'Red',
            avatar_hue: 1,
          },
        ],
        next_cursor: null,
      }))
    }
    if (url.includes('/attendance/period-records/summary/range')) {
      return Promise.resolve(jsonResponse({
        data: { total_marked_periods: 12, present: 10, absent: 2, late: 0, leave: 0, attendance_percentage: 83 },
      }))
    }
    return Promise.resolve(jsonResponse({ data: {} }))
  })
}

function renderScreen(role?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider><AiSearchScreen role={role} /></ToastProvider>
    </QueryClientProvider>,
  )
}

describe('AiSearchScreen', () => {
  it('shows the demo badge and a greeting with suggestion chips before any question is asked', () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    expect(screen.getByText(/Local answers/i)).toBeInTheDocument()
    expect(screen.getByText(/How can I help you/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How many students present today?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find Rahul' })).toBeInTheDocument()
  })

  it('tapping a suggestion chip submits it as a typed question', async () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Find Rahul' }))
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "Rahul"/i)).toBeInTheDocument())
  })

  it('View only blocks Ask, chips, and mic, and clears once toggled off', async () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /View only/i }))

    const input = screen.getByPlaceholderText(/How many students present today/i)
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Ask$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Find Rahul' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Speak/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Find Rahul' }))
    expect(screen.queryByText(/Found 1 student matching/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /View only/i }))
    expect(input).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Find Rahul' }))
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "Rahul"/i)).toBeInTheDocument())
  })

  it('typing a question and pressing Ask renders an answer bubble', async () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    const input = screen.getByPlaceholderText(/How many students present today/i)
    fireEvent.change(input, { target: { value: 'find rahul' } })
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }))
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "rahul"/i)).toBeInTheDocument())
  })

  it('renders a data table for a list-type response', async () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    fireEvent.change(screen.getByPlaceholderText(/How many students present today/i), { target: { value: 'find rahul' } })
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }))
    await waitFor(() => expect(screen.getByText('Rahul Sharma')).toBeInTheDocument())
  })

  it('disables the mic button when SpeechRecognition is unavailable', () => {
    vi.stubGlobal('fetch', mockFetch())
    const original = (window as unknown as Record<string, unknown>).SpeechRecognition
    const originalWebkit = (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    renderScreen()
    expect(screen.getByRole('button', { name: /Speak/i })).toBeDisabled()
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = original
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = originalWebkit
  })

  it('passes the selected language to SpeechRecognition when starting to listen', () => {
    vi.stubGlobal('fetch', mockFetch())
    const instances: { lang: string; start: () => void }[] = []
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: unknown) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null
      start = vi.fn()
      stop = vi.fn()
      constructor() { instances.push(this) }
    }
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'हिंदी' }))
    fireEvent.click(screen.getByRole('button', { name: /Speak/i }))
    expect(instances).toHaveLength(1)
    expect(instances[0].lang).toBe('hi-IN')
    vi.unstubAllGlobals()
  })

  it('does not drop a second query submitted while the first is still in flight', async () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    const input = screen.getByPlaceholderText(/How many students present today/i)
    const ask = screen.getByRole('button', { name: /^Ask$/i })

    // Warm up: let the students roster finish loading via one query/answer round trip,
    // so the next two submissions below actually reach the in-flight mutation (rather
    // than both being queued before the roster is ready, which collapses to "last one
    // wins" — a separate, unremarkable case from the one this test targets).
    fireEvent.change(input, { target: { value: 'find rahul' } })
    fireEvent.click(ask)
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "rahul"/i)).toBeInTheDocument())

    // Fire a second query, then — without awaiting anything — immediately edit the text
    // and fire a third, different query while the second is still in flight. If the
    // second query's completion handler ever unconditionally clears the pending/queued
    // state, the third query gets silently dropped and never renders an answer.
    fireEvent.change(input, { target: { value: 'find sharma' } })
    fireEvent.click(ask)
    fireEvent.change(input, { target: { value: 'how many students present today' } })
    fireEvent.click(ask)

    await waitFor(() => expect(screen.getByText(/Found 1 student matching "sharma"/i)).toBeInTheDocument())
    // totalStudents now comes from the marked-periods denominator (12), not the roster
    // page size (1) — see aiSearchResolver.ts's DailyAttendanceSummary fix.
    await waitFor(() => expect(screen.getByText(/of 12 students present today/i)).toBeInTheDocument())
  })

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
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /^Speak$/i }))
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
    act(() => { recognitionInstances[0].onerror?.({ error: 'not-allowed' }) })
    expect(screen.getByRole('button', { name: /Speak/i })).toBeDisabled()
    vi.unstubAllGlobals()
  })

  it('logs an Unsupported query (with role) to the local query log', async () => {
    vi.stubGlobal('fetch', mockFetch())
    localStorage.clear()
    renderScreen('teacher')
    fireEvent.change(screen.getByPlaceholderText(/How many students present today/i), { target: { value: 'what is the weather today' } })
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }))
    await waitFor(() => expect(screen.getByText(/couldn't understand/i)).toBeInTheDocument())
    const log = getAiSearchQueryLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ question: 'what is the weather today', intent: 'Unsupported', role: 'teacher' })
  })

  it('does not log a successful query', async () => {
    vi.stubGlobal('fetch', mockFetch())
    localStorage.clear()
    renderScreen('admin')
    fireEvent.change(screen.getByPlaceholderText(/How many students present today/i), { target: { value: 'find rahul' } })
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }))
    await waitFor(() => expect(screen.getByText(/Found 1 student matching "rahul"/i)).toBeInTheDocument())
    expect(getAiSearchQueryLog()).toEqual([])
  })
})
