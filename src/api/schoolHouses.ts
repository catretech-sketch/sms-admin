/* School houses catalog (tenant-local) until a Houses API exists. */
import { tokenStore } from './auth/tokenStore'

const DEFAULT_HOUSES = ['Ruby', 'Emerald', 'Sapphire', 'Topaz']

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_houses:${tenant}`
}

export function listSchoolHouses(): string[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) {
      localStorage.setItem(storageKey(), JSON.stringify(DEFAULT_HOUSES))
      return [...DEFAULT_HOUSES]
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_HOUSES]
    const names = parsed.map((h) => String(h ?? '').trim()).filter(Boolean)
    return names.length ? [...new Set(names)] : [...DEFAULT_HOUSES]
  } catch {
    return [...DEFAULT_HOUSES]
  }
}

export function saveSchoolHouses(names: string[]): string[] {
  const next = [...new Set(names.map((h) => h.trim()).filter(Boolean))]
  localStorage.setItem(storageKey(), JSON.stringify(next.length ? next : DEFAULT_HOUSES))
  return listSchoolHouses()
}

export function addSchoolHouse(name: string): string[] {
  const n = name.trim()
  if (!n) return listSchoolHouses()
  const cur = listSchoolHouses()
  if (cur.some((h) => h.toLowerCase() === n.toLowerCase())) return cur
  return saveSchoolHouses([...cur, n])
}

export function removeSchoolHouse(name: string): string[] {
  return saveSchoolHouses(listSchoolHouses().filter((h) => h.toLowerCase() !== name.trim().toLowerCase()))
}

export function renameSchoolHouse(from: string, to: string): string[] {
  const nextName = to.trim()
  if (!nextName) return listSchoolHouses()
  const cur = listSchoolHouses()
  const idx = cur.findIndex((h) => h.toLowerCase() === from.trim().toLowerCase())
  if (idx < 0) return cur
  if (cur.some((h, i) => i !== idx && h.toLowerCase() === nextName.toLowerCase())) return cur
  const next = [...cur]
  next[idx] = nextName
  return saveSchoolHouses(next)
}
