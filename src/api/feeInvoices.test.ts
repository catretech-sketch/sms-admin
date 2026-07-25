import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeeInvoices, generateFeeInvoices } from './feeInvoices'
import { ApiError } from './ApiError'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)
}

function seedLocalFees(): void {
  localStorage.setItem('sms_fee_heads:default', JSON.stringify([
    { id: 'h1', name: 'Academic', active: true },
    { id: 'h2', name: 'Transport', active: true },
  ]))
  localStorage.setItem('sms_fee_structure:default', JSON.stringify({
    name: 'School fees 2025-26',
    academicYear: '2025-26',
    classGrade: '',
    section: '',
    currency: 'INR',
    effectiveFrom: '2025-04-01',
    status: 'active',
    description: '',
    amounts: { 'X-A': { h1: 10000, h2: 2000 }, 'X-B': { h1: 10000 } },
  }))
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

const wireInvoice = {
  id: 'inv1',
  student_id: 's1',
  student_name: 'Asha',
  cls: 'X-A',
  grade: 'X',
  academic_year: '2025-26',
  term: 'Term 1',
  lines: [{ head_id: 'h1', head_name: 'Academic', amount: 36000 }],
  total: 36000,
  paid: 0,
  waived: 0,
  due: 36000,
  status: 'due',
  due_date: '2026-07-01',
}

describe('listFeeInvoices', () => {
  it('maps snake_case invoices', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [wireInvoice],
      next_cursor: null,
    })))
    const rows = await listFeeInvoices()
    expect(rows[0]).toMatchObject({
      id: 'inv1',
      studentId: 's1',
      studentName: 'Asha',
      academicYear: '2025-26',
      dueDate: '2026-07-01',
      lines: [{ headId: 'h1', headName: 'Academic', amount: 36000 }],
    })
  })
})

describe('generateFeeInvoices', () => {
  it('POSTs grades/academic_year/term to /fees/invoices/generate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { created: 42 } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateFeeInvoices({
      grades: ['X', 'XI'],
      academicYear: '2025-26',
      term: 'Term 1',
      dueDate: '2026-07-01',
    })
    expect(result).toEqual({ created: 42 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/fees/invoices/generate')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      grades: ['X', 'XI'],
      academic_year: '2025-26',
      term: 'Term 1',
      due_date: '2026-07-01',
    })
  })

  it('POSTs class-wise generate with classes (not both classes + grades)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { created: 10 } }))
    vi.stubGlobal('fetch', fetchMock)
    await generateFeeInvoices({
      classes: ['X-A', 'X-B'],
      grades: ['X'],
      academicYear: '2026-27',
      term: 'Term 1',
    })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({
      classes: ['X-A', 'X-B'],
      academic_year: '2026-27',
      term: 'Term 1',
    })
    expect(body.grades).toBeUndefined()
  })

  it('builds local invoices when generate API is 404', async () => {
    seedLocalFees()
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/students')) {
        return Promise.resolve(jsonResponse({
          data: [
            {
              id: 's1', name: 'Asha', admission_no: 'ADM1',
              class_label: 'X-A', grade: 'X', section: 'A', gender: 'F',
              status: 'active', fee_status: 'due', fee_due: 0, attendance_pct: 0,
            },
            {
              id: 's2', name: 'Ravi', admission_no: 'ADM2',
              class_label: 'X-B', grade: 'X', section: 'B', gender: 'M',
              status: 'active', fee_status: 'due', fee_due: 0, attendance_pct: 0,
            },
            {
              id: 's3', name: 'Other', admission_no: 'ADM3',
              class_label: 'IX-A', grade: 'IX', section: 'A', gender: 'F',
              status: 'active', fee_status: 'due', fee_due: 0, attendance_pct: 0,
            },
          ],
          next_cursor: null,
        }))
      }
      return Promise.resolve(notFound())
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateFeeInvoices({
      classes: ['X-A', 'X-B'],
      academicYear: '2025-26',
      term: 'Term 1',
      dueDate: '2026-07-01',
    })
    expect(result.created).toBe(2)

    const rows = await listFeeInvoices()
    expect(rows).toHaveLength(2)
    const asha = rows.find((r) => r.studentId === 's1')
    expect(asha).toMatchObject({
      studentName: 'Asha',
      studentAdm: 'ADM1',
      cls: 'X-A',
      grade: 'X',
      academicYear: '2025-26',
      term: 'Term 1',
      total: 12000,
      paid: 0,
      due: 12000,
      status: 'due',
      dueDate: '2026-07-01',
    })
    expect(asha?.lines).toEqual([
      { headId: 'h1', headName: 'Academic', amount: 10000 },
      { headId: 'h2', headName: 'Transport', amount: 2000 },
    ])
  })

  it('still throws non-404 generate errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'forbidden', message: 'no' } }, 403),
    ))
    await expect(generateFeeInvoices({
      classes: ['X-A'],
      academicYear: '2025-26',
      term: 'Term 1',
    })).rejects.toBeInstanceOf(ApiError)
  })
})

describe('listFeeInvoices local fallback', () => {
  it('returns local invoices when list API is 404', async () => {
    seedLocalFees()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('/students')) {
        return Promise.resolve(jsonResponse({
          data: [{
            id: 's1', name: 'Asha', admission_no: 'ADM1',
            class_label: 'X-A', grade: 'X', section: 'A', gender: 'F',
            status: 'active', fee_status: 'due', fee_due: 0, attendance_pct: 0,
          }],
          next_cursor: null,
        }))
      }
      return Promise.resolve(notFound())
    }))
    await generateFeeInvoices({
      classes: ['X-A'],
      academicYear: '2025-26',
      term: 'Term 1',
    })
    const rows = await listFeeInvoices({ status: 'due' })
    expect(rows.some((r) => r.studentId === 's1' && r.status === 'due')).toBe(true)
  })
})
