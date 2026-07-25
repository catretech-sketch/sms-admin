/* Fee heads — live API when available, tenant-local store as fallback (404/405). */
import { request, listRequest } from './client'
import { ApiError } from './ApiError'
import { snakeToCamel, camelToSnake } from './mapper'
import { tokenStore } from './auth/tokenStore'
import type { FeeHead } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_fee_heads:${tenant}`
}

function loadLocal(): FeeHead[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((row) => {
      const h = snakeToCamel<FeeHead>(row as Record<string, unknown>)
      return {
        id: String(h.id ?? ''),
        name: String(h.name ?? '').trim(),
        code: h.code ? String(h.code) : undefined,
        active: h.active !== false,
        isSystem: Boolean(h.isSystem),
      }
    }).filter((h) => h.id && h.name)
  } catch {
    return []
  }
}

function saveLocal(heads: FeeHead[]): void {
  localStorage.setItem(storageKey(), JSON.stringify(heads))
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

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

function newLocalId(): string {
  return `local-head-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export async function listFeeHeads(): Promise<FeeHead[]> {
  try {
    const env = await listRequest<ListEnvelope>('/fees/heads')
    const rows = env.data.map((h) => toHead(h)).filter((h) => h.id && h.name)
    if (rows.length) saveLocal(rows)
    return rows.length ? rows : loadLocal()
  } catch (err) {
    if (isMissingEndpoint(err)) return loadLocal()
    throw err
  }
}

export async function createFeeHead(input: { name: string; code?: string }): Promise<FeeHead> {
  const name = input.name.trim()
  if (!name) throw new Error('Fee type name is required')
  try {
    const wire = await request<Record<string, unknown>>('/fees/heads', {
      method: 'POST',
      body: camelToSnake({ name, ...(input.code?.trim() ? { code: input.code.trim() } : {}) }),
    })
    const head = toHead(wire)
    const local = loadLocal().filter((h) => h.id !== head.id)
    saveLocal([...local, head])
    return head
  } catch (err) {
    if (!isMissingEndpoint(err)) throw err
    const existing = loadLocal()
    if (existing.some((h) => h.name.toLowerCase() === name.toLowerCase() && h.active !== false)) {
      throw new Error(`${name} is already a fee type`)
    }
    const head: FeeHead = {
      id: newLocalId(),
      name,
      code: input.code?.trim() || undefined,
      active: true,
      isSystem: false,
    }
    saveLocal([...existing, head])
    return head
  }
}

export async function updateFeeHead(id: string, patch: Partial<Pick<FeeHead, 'name' | 'code' | 'active'>>): Promise<FeeHead> {
  try {
    const wire = await request<Record<string, unknown>>(`/fees/heads/${id}`, {
      method: 'PATCH',
      body: camelToSnake(patch),
    })
    const head = toHead(wire)
    saveLocal(loadLocal().map((h) => (h.id === id ? head : h)))
    return head
  } catch (err) {
    if (!isMissingEndpoint(err)) throw err
    const local = loadLocal()
    const idx = local.findIndex((h) => h.id === id)
    if (idx < 0) throw new Error('Fee type not found')
    const next: FeeHead = {
      ...local[idx],
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      ...(patch.code !== undefined ? { code: patch.code?.trim() || undefined } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    }
    const copy = [...local]
    copy[idx] = next
    saveLocal(copy)
    return next
  }
}

export async function deleteFeeHead(id: string): Promise<void> {
  try {
    await request<void>(`/fees/heads/${id}`, { method: 'DELETE' })
    saveLocal(loadLocal().filter((h) => h.id !== id))
  } catch (err) {
    if (!isMissingEndpoint(err)) throw err
    saveLocal(loadLocal().filter((h) => h.id !== id))
  }
}
