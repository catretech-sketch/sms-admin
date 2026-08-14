import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFeeInvoices, generateFeeInvoices } from './feeInvoices'
import { ApiError } from './ApiError'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)
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

  it('maps live API amount + student join fields to UI totals/name/class', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'inv2',
        student_id: 's2',
        student_name: 'Rahul',
        class_label: 'X-A',
        admission_no: 'STU/26/0001',
        grade: 'X',
        period: '2025-26 Term 1',
        amount: 12000,
        status: 'due',
        due_date: '2026-07-01',
        avatar_hue: 120,
        photo_url: 'https://cdn.example/p.jpg',
      }],
      next_cursor: null,
    })))
    const rows = await listFeeInvoices()
    expect(rows[0]).toMatchObject({
      id: 'inv2',
      studentId: 's2',
      studentName: 'Rahul',
      cls: 'X-A',
      studentAdm: 'STU/26/0001',
      grade: 'X',
      term: '2025-26 Term 1',
      total: 12000,
      paid: 0,
      due: 12000,
      status: 'due',
      avatarHue: 120,
      photoUrl: 'https://cdn.example/p.jpg',
    })
  })

  it('maps paid_amount for partial collection (does not invent full paid)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'inv4',
        student_id: 's4',
        amount: 133055,
        paid_amount: 5000,
        status: 'partial',
      }],
      next_cursor: null,
    })))
    const [row] = await listFeeInvoices()
    expect(row).toMatchObject({
      total: 133055,
      paid: 5000,
      due: 128055,
      status: 'partial',
    })
  })

  it('reopens phantom paid (paid_amount 0) as due with full outstanding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'inv-phantom',
        student_id: 's9',
        amount: 133055,
        paid_amount: 0,
        status: 'paid',
      }],
      next_cursor: null,
    })))
    const [row] = await listFeeInvoices()
    expect(row).toMatchObject({
      total: 133055,
      paid: 0,
      due: 133055,
      status: 'due',
    })
  })

  it('treats partial without paid_amount as unpaid (not full)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: 'inv5',
        student_id: 's5',
        amount: 10000,
        status: 'partial',
      }],
      next_cursor: null,
    })))
    const [row] = await listFeeInvoices()
    expect(row).toMatchObject({ total: 10000, paid: 0, due: 10000, status: 'partial' })
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

  it('fails closed when generate API is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()))
    await expect(generateFeeInvoices({
      classes: ['X-A', 'X-B'],
      academicYear: '2025-26',
      term: 'Term 1',
      dueDate: '2026-07-01',
    })).rejects.toBeInstanceOf(ApiError)
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

describe('listFeeInvoices', () => {
  it('fails closed when list API is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()))
    await expect(listFeeInvoices({ status: 'due' })).rejects.toBeInstanceOf(ApiError)
  })
})
