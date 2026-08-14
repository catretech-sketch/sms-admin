/* Fee payments — live API only (fail closed). */
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { FeePayment } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

function toFeePayment(row: Record<string, unknown>): FeePayment {
  const p = snakeToCamel<FeePayment & Record<string, unknown>>(row)
  const mode = String(p.mode ?? (p as { method?: string }).method ?? '').trim()
  const cls = String(p.cls ?? (p as { classLabel?: string }).classLabel ?? '').trim()
  return {
    ...p,
    id: (typeof p.id === 'number' ? p.id : Number(p.id)) || (p.id as unknown as number),
    mode,
    cls,
    ref: String(p.ref ?? ''),
    amount: Number(p.amount) || 0,
  }
}

export async function listFeePayments(): Promise<FeePayment[]> {
  const env = await listRequest<ListEnvelope>('/fees/payments')
  return env.data.map((p) => toFeePayment(p))
}

export async function payInvoice(invoiceId: string, payment: FeePayment): Promise<FeePayment> {
  const wire = await request<Record<string, unknown>>(`/fees/invoices/${invoiceId}/pay`, {
    method: 'POST',
    body: camelToSnake({
      ...payment,
      method: payment.mode,
      classLabel: payment.cls,
      feeType: payment.feeType ?? payment.headName,
    }),
  })
  return toFeePayment(wire)
}

export interface FeeRazorpayOrder {
  orderId: string
  amount: number
  currency: string
  keyId: string
  /** Optional shareable checkout link — only present when the server supports pay-by-link. */
  payLink?: string
}

export interface FeeRazorpayVerifyBody {
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}

export async function createFeeRazorpayOrder(invoiceId: string): Promise<FeeRazorpayOrder> {
  const wire = await request<Record<string, unknown>>(`/fees/invoices/${invoiceId}/razorpay/order`, { method: 'POST' })
  return snakeToCamel<FeeRazorpayOrder>(wire)
}

export async function verifyFeeRazorpayPayment(invoiceId: string, body: FeeRazorpayVerifyBody): Promise<FeePayment> {
  const wire = await request<Record<string, unknown>>(`/fees/invoices/${invoiceId}/razorpay/verify`, {
    method: 'POST',
    body: camelToSnake(body),
  })
  return snakeToCamel<FeePayment>(wire)
}
