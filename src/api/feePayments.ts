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
