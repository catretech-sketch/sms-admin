import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { FeeInvoice } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listFeeInvoices(opts: { q?: string; status?: string; grade?: string; class?: string } = {}): Promise<FeeInvoice[]> {
  const env = await listRequest<ListEnvelope>('/fees/invoices', { query: opts })
  return env.data.map((row) => snakeToCamel<FeeInvoice>(row))
}

export async function generateFeeInvoices(input: {
  grades: string[]
  academicYear: string
  term: string
  dueDate?: string
}): Promise<{ created: number }> {
  return request<{ created: number }>('/fees/invoices/generate', {
    method: 'POST',
    body: camelToSnake(input),
  })
}
