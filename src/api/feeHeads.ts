/* Fee heads — production API /v1/fees/heads. */
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import { tokenStore } from './auth/tokenStore'
import type { FeeHead } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_fee_heads:${tenant}`
}

function toHead(wire: Record<string, unknown>): FeeHead {
  const h = snakeToCamel<FeeHead>(wire)
  return {
    id: String(h.id ?? ''),
    name: String(h.name ?? '').trim(),
    code: h.code ? String(h.code) : undefined,
    active: h.active !== false,
    isSystem: Boolean(h.isSystem),
  }
}

function clearLegacy(): void {
  try { localStorage.removeItem(storageKey()) } catch { /* ignore */ }
}

export async function listFeeHeads(): Promise<FeeHead[]> {
  const env = await listRequest<ListEnvelope>('/fees/heads')
  const rows = env.data.map((h) => toHead(h)).filter((h) => h.id && h.name)
  clearLegacy()
  return rows
}

export async function createFeeHead(input: { name: string; code?: string }): Promise<FeeHead> {
  const name = input.name.trim()
  if (!name) throw new Error('Fee type name is required')
  const wire = await request<Record<string, unknown>>('/fees/heads', {
    method: 'POST',
    body: camelToSnake({ name, ...(input.code?.trim() ? { code: input.code.trim() } : {}) }),
  })
  clearLegacy()
  return toHead(wire)
}

export async function updateFeeHead(id: string, patch: Partial<Pick<FeeHead, 'name' | 'code' | 'active'>>): Promise<FeeHead> {
  const wire = await request<Record<string, unknown>>(`/fees/heads/${id}`, {
    method: 'PATCH',
    body: camelToSnake(patch),
  })
  return toHead(wire)
}

export async function deleteFeeHead(id: string): Promise<void> {
  await request<void>(`/fees/heads/${id}`, { method: 'DELETE' })
}
