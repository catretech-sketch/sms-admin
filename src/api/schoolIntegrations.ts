/* School integrations — Email, SMS and Razorpay settings.
   Secrets are write-only: GET never echoes key_secret/webhook_secret,
   only *_set booleans indicating whether one is stored. */
import { request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type {
  SchoolIntegrations, SchoolEmailSettings, SchoolSmsSettings, SchoolRazorpaySettings, RazorpayStatus,
} from '@/types'

export async function getSchoolIntegrations(): Promise<SchoolIntegrations> {
  const wire = await request<Record<string, unknown>>('/school/integrations')
  return snakeToCamel<SchoolIntegrations>(wire)
}

export type SaveSchoolIntegrationsInput = Partial<{
  email: Partial<SchoolEmailSettings>
  sms: Partial<SchoolSmsSettings>
  razorpay: Partial<SchoolRazorpaySettings>
}>

export async function saveSchoolIntegrations(input: SaveSchoolIntegrationsInput): Promise<SchoolIntegrations> {
  const wire = await request<Record<string, unknown>>('/school/integrations', {
    method: 'PUT',
    body: camelToSnake(input),
  })
  return snakeToCamel<SchoolIntegrations>(wire)
}

export async function verifySchoolRazorpay(): Promise<{ status: RazorpayStatus }> {
  return request<{ status: RazorpayStatus }>('/school/integrations/razorpay/verify', { method: 'POST' })
}
