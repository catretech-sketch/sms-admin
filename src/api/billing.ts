import { listRequest } from './client'
import type { ListEnvelope } from './types'

export type InvoiceStatus = 'paid' | 'open' | 'past_due'
export type SubStatus = string

export interface ApiInvoice {
  id: string
  tenant_id: string
  tenant_name: string | null
  plan_name: string | null
  amount: number
  status: InvoiceStatus
  issued: string
  due: string
  paid_on: string | null
}

export interface ApiSubscription {
  id: string
  tenant_id: string
  tenant_name: string | null
  plan_id: string
  plan_name: string | null
  tier: string | null
  status: SubStatus
  current_period_start: string
  current_period_end: string | null
  next_charge: number | null
  seats: number
}

/** Platform-only: GET /subscriptions */
export function listSubscriptions(params: { status?: string; tenant_id?: string } = {}): Promise<ListEnvelope<ApiSubscription>> {
  return listRequest<ListEnvelope<ApiSubscription>>('/subscriptions', { query: params })
}

/** Platform-only: GET /invoices */
export function listInvoices(params: { status?: string; tenant_id?: string } = {}): Promise<ListEnvelope<ApiInvoice>> {
  return listRequest<ListEnvelope<ApiInvoice>>('/invoices', { query: params })
}
