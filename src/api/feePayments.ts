import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { FeePayment } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

export async function listFeePayments(): Promise<FeePayment[]> {
  const env = await listRequest<ListEnvelope>('/fees/payments')
  return env.data.map((p) => snakeToCamel<FeePayment>(p))
}

export async function payInvoice(invoiceId: string, payment: FeePayment): Promise<FeePayment> {
  const wire = await request<Record<string, unknown>>(`/fees/invoices/${invoiceId}/pay`, { method: 'POST', body: camelToSnake(payment) })
  return snakeToCamel<FeePayment>(wire)
}
