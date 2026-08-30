import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/context/ToastProvider'
import { AiSearchScreen } from './aiSearch'

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

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider><AiSearchScreen /></ToastProvider>
    </QueryClientProvider>,
  )
}

describe('AiSearchScreen', () => {
  it('shows the demo badge and an empty state before any question is asked', () => {
    vi.stubGlobal('fetch', mockFetch())
    renderScreen()
    expect(screen.getByText(/Local answers/i)).toBeInTheDocument()
    expect(screen.getByText(/Ask your first question/i)).toBeInTheDocument()
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
    await waitFor(() => expect(screen.getByText(/of 1 students present today/i)).toBeInTheDocument())
  })
})
