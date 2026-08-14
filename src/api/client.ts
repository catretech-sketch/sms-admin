import { config } from './config'
import { tokenStore } from './auth/tokenStore'
import { ApiError } from './ApiError'
import type { ErrorBody } from './types'

export { ApiError }

let onAuthFailure: () => void = () => {}
export function setOnAuthFailure(cb: () => void): void { onAuthFailure = cb }

const NO_AUTH = new Set([
  '/auth/refresh', '/auth/login',
  '/auth/password/forgot', '/auth/password/reset',
])

export interface RequestOpts {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  auth?: boolean
}

function buildUrl(path: string, query?: RequestOpts['query']): string {
  const url = new URL(config.apiBaseUrl + path)
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v))
  return url.toString()
}

async function rawFetch(path: string, opts: RequestOpts, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const useAuth = opts.auth !== false && !NO_AUTH.has(path)
  if (useAuth && accessToken) headers.Authorization = `Bearer ${accessToken}`
  // Tenant comes from /auth/me — never send X-Tenant-Id on /auth/* (stale header → 403).
  const tenant = tokenStore.getTenantId()
  if (useAuth && tenant && !path.startsWith('/auth/')) headers['X-Tenant-Id'] = tenant
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    /* Hard cap so a wedged API cannot freeze CRM screens (esp. attendance fan-out). */
    signal: AbortSignal.timeout(25_000),
  })
}

async function readJson(res: Response): Promise<unknown> {
  try {
    const text = await res.text()
    return text ? JSON.parse(text) : {}
  } catch (e) {
    if (!(e instanceof TypeError)) throw e
    return {}
  }
}

function throwIfError(res: Response, json: unknown): void {
  if (res.ok) return
  const err = (json as { error?: ErrorBody }).error
  throw new ApiError(res.status, err?.code ?? 'internal_error', err?.message ?? res.statusText, err?.details ?? null)
}

async function tryRefresh(): Promise<boolean> {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return false
  const res = await rawFetch('/auth/refresh', { method: 'POST', body: { refresh_token: refresh } }, null)
  if (!res.ok) return false
  const body = (await res.json()) as { data: { access_token: string; refresh_token: string } }
  tokenStore.set(body.data)
  return true
}

async function executeWithRefresh(path: string, opts: RequestOpts): Promise<Response> {
  let res = await rawFetch(path, opts, tokenStore.getAccess())
  if (res.status === 401 && !NO_AUTH.has(path)) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await rawFetch(path, opts, tokenStore.getAccess())
      if (res.status === 401) { tokenStore.clear(); onAuthFailure() }
    } else {
      tokenStore.clear(); onAuthFailure()
    }
  }
  return res
}

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const res = await executeWithRefresh(path, opts)
  const json = await readJson(res)
  throwIfError(res, json)
  return (json as { data: T }).data
}

/** Returns the full parsed body (no `.data` unwrap) — for list endpoints whose
 *  response IS the envelope: `{ data: [...], next_cursor }`. */
export async function listRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const res = await executeWithRefresh(path, opts)
  const json = await readJson(res)
  throwIfError(res, json)
  return json as T
}
