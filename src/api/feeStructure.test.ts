import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getFeeStructure,
  saveFeeStructure,
  normalizeFeeStructure,
  defaultFeeStructureMeta,
  type FeeStructureDocument,
} from './feeStructure'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('normalizeFeeStructure', () => {
  it('wraps a legacy grade×head matrix as amounts with default meta', () => {
    const doc = normalizeFeeStructure({ X: { h1: 36000, h2: 18000 } }, { currency: '₹' })
    expect(doc.amounts).toEqual({ X: { h1: 36000, h2: 18000 } })
    expect(doc.name).toBeTruthy()
    expect(doc.academicYear).toMatch(/\d{4}/)
    expect(doc.currency).toBe('₹')
    expect(doc.status).toBe('active')
    expect(doc.effectiveFrom).toBeTruthy()
  })

  it('maps a snake_case document from the API', () => {
    const doc = normalizeFeeStructure({
      id: 'fs-1',
      name: 'Class 1 Fee 2026-27',
      academic_year: '2026-27',
      class: 'I',
      section: 'A',
      currency: 'INR',
      effective_from: '2026-04-01',
      effective_to: null,
      status: 'active',
      description: 'Term fees',
      amounts: { 'I-A': { h1: 12000 } },
    })
    expect(doc).toMatchObject({
      id: 'fs-1',
      name: 'Class 1 Fee 2026-27',
      academicYear: '2026-27',
      classGrade: 'I',
      section: 'A',
      currency: 'INR',
      effectiveFrom: '2026-04-01',
      status: 'active',
      description: 'Term fees',
      amounts: { 'I-A': { h1: 12000 } },
    })
  })

  it('defaultFeeStructureMeta seeds required fields', () => {
    const meta = defaultFeeStructureMeta({ currency: '₹', academicYear: '2026-27' })
    expect(meta.name).toContain('2026-27')
    expect(meta.academicYear).toBe('2026-27')
    expect(meta.currency).toBe('₹')
    expect(meta.status).toBe('active')
    expect(meta.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('getFeeStructure', () => {
  it('returns a normalized document for a legacy matrix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: { X: { h1: 36000, h2: 18000 } },
    })))
    const doc = await getFeeStructure({ currency: '₹' })
    expect(doc.amounts).toEqual({ X: { h1: 36000, h2: 18000 } })
    expect(doc.status).toBe('active')
  })

  it('returns a normalized document when API sends meta + amounts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      data: {
        name: 'X Fee 2026-27',
        academic_year: '2026-27',
        currency: 'INR',
        effective_from: '2026-04-01',
        status: 'active',
        amounts: { 'X-A': { h1: 1 } },
      },
    })))
    const doc = await getFeeStructure()
    expect(doc.name).toBe('X Fee 2026-27')
    expect(doc.amounts['X-A']).toEqual({ h1: 1 })
  })

  it('falls back to local structure when GET is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)))
    const empty = await getFeeStructure({ currency: 'INR', academicYear: '2026-27' })
    expect(empty.amounts).toEqual({})
    expect(empty.academicYear).toBe('2026-27')
  })
})

describe('saveFeeStructure', () => {
  it('PUTs a camel→snake document to /fees/structure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { name: 'X Fee', academic_year: '2026-27', currency: 'INR', effective_from: '2026-04-01', status: 'active', amounts: { 'X-A': { h1: 1 } } },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const input: FeeStructureDocument = {
      name: 'X Fee',
      academicYear: '2026-27',
      classGrade: 'X',
      section: '',
      currency: 'INR',
      effectiveFrom: '2026-04-01',
      status: 'active',
      description: '',
      amounts: { 'X-A': { h1: 1 } },
    }
    await saveFeeStructure(input)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/fees/structure')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({
      name: 'X Fee',
      academic_year: '2026-27',
      class: 'X',
      currency: 'INR',
      effective_from: '2026-04-01',
      status: 'active',
      amounts: { 'X-A': { h1: 1 } },
    })
  })

  it('saves locally when PUT /fees/structure is 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'x' } }, 404)))
    const input: FeeStructureDocument = {
      name: 'Local Fee',
      academicYear: '2026-27',
      classGrade: '',
      section: '',
      currency: 'INR',
      effectiveFrom: '2026-04-01',
      status: 'active',
      description: '',
      amounts: { 'X-A': { h1: 5000 } },
    }
    const saved = await saveFeeStructure(input)
    expect(saved.name).toBe('Local Fee')
    expect(saved.amounts['X-A']).toEqual({ h1: 5000 })
    const loaded = await getFeeStructure()
    expect(loaded.amounts['X-A']).toEqual({ h1: 5000 })
  })
})
