/* Shared GET/PUT for person extras JSON (students / teachers / staff). */
import { request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import { tokenStore } from './auth/tokenStore'

export type PersonExtrasKind = 'student' | 'teacher' | 'staff'

function apiPath(kind: PersonExtrasKind, id: string): string {
  const base = kind === 'student' ? 'students' : kind === 'teacher' ? 'teachers' : 'staff'
  return `/${base}/${id}/extras`
}

function legacyKey(kind: PersonExtrasKind, id: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  const prefix = kind === 'student' ? 'sms_student_extras'
    : kind === 'teacher' ? 'sms_teacher_extras'
      : 'sms_staff_extras'
  return `${prefix}:${tenant}:${id}`
}

const memory = new Map<string, string>()

/** Test helper — drop in-memory extras cache. */
export function clearPersonExtrasMemory(): void {
  memory.clear()
}

function memKey(kind: PersonExtrasKind, id: string): string {
  return `${tokenStore.getTenantId() || 'default'}:${kind}:${id}`
}

function clearLegacyExtras(kind: PersonExtrasKind, id: string): void {
  try { localStorage.removeItem(legacyKey(kind, id)) } catch { /* ignore */ }
}

export function cacheExtrasJson(kind: PersonExtrasKind, id: string, json: string): void {
  memory.set(memKey(kind, id), json)
}

export function peekCachedExtrasJson(kind: PersonExtrasKind, id: string): string | null {
  return memory.get(memKey(kind, id)) ?? null
}

function parseExtrasJson(raw: unknown): string {
  if (raw == null) return '{}'
  if (typeof raw === 'string') {
    const t = raw.trim()
    return t || '{}'
  }
  try {
    return JSON.stringify(raw)
  } catch {
    return '{}'
  }
}

export async function fetchPersonExtrasJson(kind: PersonExtrasKind, id: string): Promise<string> {
  const wire = await request<Record<string, unknown>>(apiPath(kind, id))
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const json = parseExtrasJson(c.extrasJson)
  clearLegacyExtras(kind, id)
  cacheExtrasJson(kind, id, json)
  return json
}

export async function putPersonExtrasJson(kind: PersonExtrasKind, id: string, extrasJson: string): Promise<string> {
  const body = camelToSnake({ extrasJson })
  const wire = await request<Record<string, unknown>>(apiPath(kind, id), { method: 'PUT', body })
  const c = snakeToCamel<Record<string, unknown>>(wire)
  const json = parseExtrasJson(c.extrasJson)
  clearLegacyExtras(kind, id)
  cacheExtrasJson(kind, id, json)
  return json
}

/** Sync peek: in-memory cache only (populated after successful API). */
export function loadCachedOrLegacyJson(kind: PersonExtrasKind, id: string): string | null {
  return peekCachedExtrasJson(kind, id)
}
