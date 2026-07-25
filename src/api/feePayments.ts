/* Fee payments — live API when available, tenant-local store as fallback (404/405). */
import { request, listRequest } from './client'
import { ApiError } from './ApiError'
import { snakeToCamel, camelToSnake } from './mapper'
import { tokenStore } from './auth/tokenStore'
import { getLocalInvoice, patchLocalInvoice } from './feeInvoices'
import type { FeePayment } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_fee_payments:${tenant}`
}

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

function loadLocal(): FeePayment[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((p) => snakeToCamel<FeePayment>(p as Record<string, unknown>))
  } catch {
    return []
  }
}

function saveLocal(rows: FeePayment[]): void {
  localStorage.setItem(storageKey(), JSON.stringify(rows))
}

function nextLocalId(rows: FeePayment[]): number {
  const max = rows.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0)
  return max + 1
}

export async function listFeePayments(): Promise<FeePayment[]> {
  try {
    const env = await listRequest<ListEnvelope>('/fees/payments')
    const rows = env.data.map((p) => snakeToCamel<FeePayment>(p))
    if (rows.length) saveLocal(rows)
    return rows.length ? rows : loadLocal()
  } catch (err) {
    if (isMissingEndpoint(err)) return loadLocal()
    throw err
  }
}

export async function payInvoice(invoiceId: string, payment: FeePayment): Promise<FeePayment> {
  try {
    const wire = await request<Record<string, unknown>>(`/fees/invoices/${invoiceId}/pay`, {
      method: 'POST',
      body: camelToSnake(payment),
    })
    const mapped = snakeToCamel<FeePayment>(wire)
    const local = loadLocal().filter((p) => p.id !== mapped.id)
    saveLocal([mapped, ...local])
    return mapped
  } catch (err) {
    if (!isMissingEndpoint(err)) throw err
    const inv = getLocalInvoice(invoiceId)
    if (!inv) throw new Error('Invoice not found')
    const amount = Number(payment.amount) || 0
    if (amount <= 0) throw new Error('Payment amount must be greater than zero')
    if (amount > inv.due) throw new Error('Payment exceeds amount due')

    const rows = loadLocal()
    const saved: FeePayment = {
      ...payment,
      id: nextLocalId(rows),
      invoiceId,
      studentId: payment.studentId || inv.studentId,
      studentName: payment.studentName || inv.studentName,
      cls: payment.cls || inv.cls,
      amount,
    }
    saveLocal([saved, ...rows])
    patchLocalInvoice(invoiceId, { paid: inv.paid + amount })
    return saved
  }
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

/** Used by feeReports local summary. */
export function listLocalFeePayments(): FeePayment[] {
  return loadLocal()
}
