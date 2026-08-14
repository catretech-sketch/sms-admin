/* School houses catalog — GET/PUT /v1/houses (SQL). Legacy localStorage migrated once. */
import { request } from './client'
import { tokenStore } from './auth/tokenStore'

const DEFAULT_HOUSES = ['Ruby', 'Emerald', 'Sapphire', 'Topaz']

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_houses:${tenant}`
}

function clearLegacy(): void {
  try { localStorage.removeItem(storageKey()) } catch { /* ignore */ }
}

export async function listSchoolHouses(): Promise<string[]> {
  const rows = await request<string[]>('/houses')
  const names = (rows ?? []).map((h) => String(h ?? '').trim()).filter(Boolean)
  clearLegacy()
  return names.length ? names : [...DEFAULT_HOUSES]
}

export async function saveSchoolHouses(names: string[]): Promise<string[]> {
  const next = [...new Set(names.map((h) => h.trim()).filter(Boolean))]
  const body = { names: next.length ? next : DEFAULT_HOUSES }
  const rows = await request<string[]>('/houses', { method: 'PUT', body })
  clearLegacy()
  const saved = (rows ?? []).map((h) => String(h ?? '').trim()).filter(Boolean)
  return saved.length ? saved : [...DEFAULT_HOUSES]
}

export async function addSchoolHouse(name: string): Promise<string[]> {
  const n = name.trim()
  const cur = await listSchoolHouses()
  if (!n) return cur
  if (cur.some((h) => h.toLowerCase() === n.toLowerCase())) return cur
  return saveSchoolHouses([...cur, n])
}

export async function removeSchoolHouse(name: string): Promise<string[]> {
  const cur = await listSchoolHouses()
  return saveSchoolHouses(cur.filter((h) => h.toLowerCase() !== name.trim().toLowerCase()))
}

export async function renameSchoolHouse(from: string, to: string): Promise<string[]> {
  const nextName = to.trim()
  const cur = await listSchoolHouses()
  if (!nextName) return cur
  const idx = cur.findIndex((h) => h.toLowerCase() === from.trim().toLowerCase())
  if (idx < 0) return cur
  if (cur.some((h, i) => i !== idx && h.toLowerCase() === nextName.toLowerCase())) return cur
  const next = [...cur]
  next[idx] = nextName
  return saveSchoolHouses(next)
}
