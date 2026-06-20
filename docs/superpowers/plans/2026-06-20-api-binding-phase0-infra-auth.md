# School Admin API Binding — Phase 0: Infrastructure + Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `src/api/` HTTP layer (client, token lifecycle, error type, casing mapper) and make the login screen authenticate against the live School Admin API (OTP primary, password fallback) — with no visible UI change.

**Architecture:** Mirror the proven `sms-catreadmin` pattern — a thin `fetch` wrapper that injects `Authorization: Bearer` + `X-Tenant-Id`, unwraps `{data}`/`{error}` envelopes, and on `401` rotates the refresh token and retries once. TanStack React Query wraps the app for later data phases. The UI stays camelCase; the wire is snake_case, converted at the boundary.

**Tech Stack:** React 19, TypeScript 5, Vite 6, Vitest 3, `@tanstack/react-query` 5, native `fetch`.

## Global Constraints

- **No UI/markup changes.** Only data sources swap. Login screen JSX/classNames stay byte-identical except where wiring requires it.
- **Wire is snake_case** both ways; envelopes `{data}` / `{data,next_cursor}` / `{error:{code,message,details}}`.
- **Base URL** from `VITE_API_BASE`, default `http://localhost:5162/v1`.
- **Auth bootstrap routes** (no Bearer): `/auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/login`.
- **Tenant header:** `X-Tenant-Id: <tenant_id>` (from `/auth/me`) on every other call.
- **Refresh rotates** — always persist the newly returned `refresh_token`.
- Tests must stay green (`npm test`) and `npm run build` must pass at each task's end.
- No new runtime deps beyond `@tanstack/react-query`.

---

### Task 1: Dependency, config, and env

**Files:**
- Modify: `package.json` (add `@tanstack/react-query`)
- Create: `src/api/config.ts`
- Create: `src/api/config.test.ts`
- Create: `.env.example`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Produces: `config.apiBaseUrl: string` from `src/api/config.ts`.

- [ ] **Step 1: Install the dependency**

Run: `npm install @tanstack/react-query@^5.59.0`
Expected: `package.json` gains the dependency; `npm install` exits 0.

- [ ] **Step 2: Write the failing config test**

Create `src/api/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { config } from './config'

describe('config', () => {
  it('exposes an apiBaseUrl ending in /v1', () => {
    expect(config.apiBaseUrl).toMatch(/\/v1$/)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/api/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 4: Create the config**

Create `src/api/config.ts`:
```ts
const apiBaseUrl = import.meta.env.VITE_API_BASE ?? 'http://localhost:5162/v1'

export const config = { apiBaseUrl } as const
```

- [ ] **Step 5: Add the env typing**

Replace `src/vite-env.d.ts` contents with:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 6: Create `.env.example`**

Create `.env.example`:
```
# School Admin API base URL (must include /v1).
# Local `dotnet run --project src/Sms.Api` -> http://localhost:5162/v1 (default)
VITE_API_BASE=http://localhost:5162/v1
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/api/config.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/api/config.ts src/api/config.test.ts .env.example src/vite-env.d.ts
git commit -m "feat(api): add react-query dep, api config, and env scaffolding"
```

---

### Task 2: Typed `ApiError`

**Files:**
- Create: `src/api/ApiError.ts`
- Create: `src/api/ApiError.test.ts`

**Interfaces:**
- Produces: `class ApiError extends Error { status:number; code:string; details: Record<string,string[]>|null }`.

- [ ] **Step 1: Write the failing test**

Create `src/api/ApiError.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { ApiError } from './ApiError'

describe('ApiError', () => {
  it('carries status, code, message, and details', () => {
    const e = new ApiError(404, 'not_found', 'missing', { id: ['required'] })
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(404)
    expect(e.code).toBe('not_found')
    expect(e.message).toBe('missing')
    expect(e.details).toEqual({ id: ['required'] })
  })

  it('defaults details to null', () => {
    expect(new ApiError(500, 'internal_error', 'boom').details).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/ApiError.test.ts`
Expected: FAIL — cannot find module `./ApiError`.

- [ ] **Step 3: Implement**

Create `src/api/ApiError.ts`:
```ts
export class ApiError extends Error {
  status: number
  code: string
  details: Record<string, string[]> | null
  constructor(status: number, code: string, message: string, details: Record<string, string[]> | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/ApiError.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/ApiError.ts src/api/ApiError.test.ts
git commit -m "feat(api): typed ApiError"
```

---

### Task 3: Wire envelope types

**Files:**
- Create: `src/api/types.ts`

**Interfaces:**
- Produces: `ErrorBody`, `Envelope<T>`, `ListEnvelope<T>`, `AuthTokens`, `Me`.

- [ ] **Step 1: Create the types (no test — pure type declarations)**

Create `src/api/types.ts`:
```ts
export interface ErrorBody {
  code: string
  message: string
  details?: Record<string, string[]> | null
}

export interface Envelope<T> { data: T }
export interface ListEnvelope<T> { data: T[]; next_cursor: string | null }

export interface AuthTokens { access_token: string; refresh_token: string }

export type Role = 'admin' | 'principal' | 'vice_principal' | 'teacher'
export interface Me { id: string; tenant_id: string | null; roles: Role[] }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(api): wire envelope + auth types"
```

---

### Task 4: Token store

**Files:**
- Create: `src/api/auth/tokenStore.ts`
- Create: `src/api/auth/tokenStore.test.ts`

**Interfaces:**
- Consumes: `AuthTokens` from `src/api/types.ts`.
- Produces: `tokenStore` with `getAccess()`, `getRefresh()`, `getTenantId()`, `setTenantId(id:string|null)`, `set(tokens:AuthTokens)`, `clear()`.

- [ ] **Step 1: Write the failing test**

Create `src/api/auth/tokenStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { tokenStore } from './tokenStore'

beforeEach(() => { localStorage.clear(); tokenStore.clear() })

describe('tokenStore', () => {
  it('holds access in memory and persists refresh', () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    expect(tokenStore.getAccess()).toBe('a1')
    expect(tokenStore.getRefresh()).toBe('r1')
    expect(localStorage.getItem('sms_admin_refresh')).toBe('r1')
  })

  it('persists tenant id and clears everything', () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    tokenStore.setTenantId('tenant-7')
    expect(tokenStore.getTenantId()).toBe('tenant-7')
    tokenStore.clear()
    expect(tokenStore.getAccess()).toBeNull()
    expect(tokenStore.getRefresh()).toBeNull()
    expect(tokenStore.getTenantId()).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/auth/tokenStore.test.ts`
Expected: FAIL — cannot find module `./tokenStore`.

- [ ] **Step 3: Implement**

Create `src/api/auth/tokenStore.ts`:
```ts
import type { AuthTokens } from '../types'

const REFRESH_KEY = 'sms_admin_refresh'
const TENANT_KEY = 'sms_admin_tenant'
let accessToken: string | null = null

export const tokenStore = {
  getAccess(): string | null { return accessToken },
  getRefresh(): string | null { return localStorage.getItem(REFRESH_KEY) },
  getTenantId(): string | null { return localStorage.getItem(TENANT_KEY) },
  setTenantId(id: string | null): void {
    if (id) localStorage.setItem(TENANT_KEY, id)
    else localStorage.removeItem(TENANT_KEY)
  },
  set(tokens: AuthTokens): void {
    accessToken = tokens.access_token
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
  },
  clear(): void {
    accessToken = null
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(TENANT_KEY)
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/auth/tokenStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/tokenStore.ts src/api/auth/tokenStore.test.ts
git commit -m "feat(api): token store (access in memory, refresh + tenant in localStorage)"
```

---

### Task 5: HTTP client (Bearer + tenant injection, envelope unwrap, refresh-retry)

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/client.test.ts`

**Interfaces:**
- Consumes: `config`, `tokenStore`, `ApiError`, `ErrorBody`.
- Produces: `request<T>(path, opts?)`, `listRequest<T>(path, opts?)`, `setOnAuthFailure(cb)`, re-export `ApiError`. `RequestOpts = { method?, body?, query?, auth? }`.

- [ ] **Step 1: Write the failing test**

Create `src/api/client.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { request, listRequest, ApiError, setOnAuthFailure } from './client'
import { tokenStore } from './auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

describe('request', () => {
  it('unwraps the data envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { ok: 1 } })))
    expect(await request<{ ok: number }>('/ping')).toEqual({ ok: 1 })
  })

  it('attaches the bearer token and tenant header when authed', async () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    tokenStore.setTenantId('t9')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await request('/secure')
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer a1')
    expect(headers['X-Tenant-Id']).toBe('t9')
  })

  it('does not send Bearer on auth bootstrap routes', async () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await request('/auth/otp/verify', { method: 'POST', body: {} })
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('throws a typed ApiError on error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'forbidden', message: 'nope', details: null } }, 403)))
    await expect(request('/x')).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    await expect(request('/x')).rejects.toBeInstanceOf(ApiError)
  })

  it('refreshes once on 401 then retries the original request', async () => {
    tokenStore.set({ access_token: 'old', refresh_token: 'r1' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_token', message: 'exp' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'new', refresh_token: 'r2' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await request<{ ok: boolean }>('/secure')).toEqual({ ok: true })
    expect(tokenStore.getAccess()).toBe('new')
    const retryHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>
    expect(retryHeaders.Authorization).toBe('Bearer new')
  })

  it('clears tokens and fires onAuthFailure when refresh fails', async () => {
    tokenStore.set({ access_token: 'old', refresh_token: 'r1' })
    const onFail = vi.fn()
    setOnAuthFailure(onFail)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_token', message: 'exp' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_token', message: 'bad' } }, 401)))
    await expect(request('/secure')).rejects.toBeInstanceOf(ApiError)
    expect(onFail).toHaveBeenCalledOnce()
    expect(tokenStore.getRefresh()).toBeNull()
  })
})

describe('listRequest', () => {
  it('returns the full envelope (no .data unwrap)', async () => {
    const envelope = { data: [{ id: 1 }], next_cursor: 'abc' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(envelope)))
    expect(await listRequest<typeof envelope>('/items')).toEqual(envelope)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/client.test.ts`
Expected: FAIL — cannot find module `./client`.

- [ ] **Step 3: Implement the client**

Create `src/api/client.ts`:
```ts
import { config } from './config'
import { tokenStore } from './auth/tokenStore'
import { ApiError } from './ApiError'
import type { ErrorBody } from './types'

export { ApiError }

let onAuthFailure: () => void = () => {}
export function setOnAuthFailure(cb: () => void): void { onAuthFailure = cb }

const NO_AUTH = new Set(['/auth/otp/request', '/auth/otp/verify', '/auth/refresh', '/auth/login'])

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
  const tenant = tokenStore.getTenantId()
  if (useAuth && tenant) headers['X-Tenant-Id'] = tenant
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/client.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts
git commit -m "feat(api): http client with bearer+tenant injection, envelope unwrap, refresh-retry"
```

---

### Task 6: Casing mapper (snake ⇄ camel)

**Files:**
- Create: `src/api/mapper.ts`
- Create: `src/api/mapper.test.ts`

**Interfaces:**
- Produces: `snakeToCamel<T>(input:unknown):T` and `camelToSnake(input:unknown):unknown` — deep recursive key converters (arrays + nested objects), values untouched. (Per-resource field *renames* like `adm↔admission_no` are layered on top in later resource phases; this task delivers the generic casing engine they build on.)

- [ ] **Step 1: Write the failing test**

Create `src/api/mapper.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { snakeToCamel, camelToSnake } from './mapper'

describe('snakeToCamel', () => {
  it('converts keys deeply through arrays and nested objects', () => {
    const input = { student_id: 1, fee_status: 'paid', parent_info: { guardian_name: 'A', alt_phone: 'B' }, rows: [{ max_marks: 100 }] }
    expect(snakeToCamel(input)).toEqual({
      studentId: 1, feeStatus: 'paid', parentInfo: { guardianName: 'A', altPhone: 'B' }, rows: [{ maxMarks: 100 }],
    })
  })

  it('leaves primitive values and nulls untouched', () => {
    expect(snakeToCamel({ a_b: null, c_d: 'x' })).toEqual({ aB: null, cD: 'x' })
  })
})

describe('camelToSnake', () => {
  it('is the inverse for round-trippable shapes', () => {
    const camel = { studentId: 1, parentInfo: { guardianName: 'A' }, rows: [{ maxMarks: 100 }] }
    expect(camelToSnake(camel)).toEqual({ student_id: 1, parent_info: { guardian_name: 'A' }, rows: [{ max_marks: 100 }] })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/mapper.test.ts`
Expected: FAIL — cannot find module `./mapper`.

- [ ] **Step 3: Implement**

Create `src/api/mapper.ts`:
```ts
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const snakeKey = (k: string): string => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const camelKey = (k: string): string => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())

function convert(input: unknown, keyFn: (k: string) => string): unknown {
  if (Array.isArray(input)) return input.map((v) => convert(v, keyFn))
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) out[keyFn(k)] = convert(v, keyFn)
    return out
  }
  return input
}

export function snakeToCamel<T = unknown>(input: unknown): T { return convert(input, snakeKey) as T }
export function camelToSnake(input: unknown): unknown { return convert(input, camelKey) }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/mapper.ts src/api/mapper.test.ts
git commit -m "feat(api): deep snake<->camel casing mapper"
```

---

### Task 7: Auth module

**Files:**
- Create: `src/api/auth.ts`
- Create: `src/api/auth.test.ts`

**Interfaces:**
- Consumes: `request` from `./client`, `tokenStore`, `AuthTokens`, `Me`.
- Produces: `otpRequest(identifier)`, `otpVerify(identifier, code)`, `login(email, password)`, `refresh()`, `me()`, `logout()`, `setPassword(password)`. `otpVerify`/`login`/`refresh` persist tokens; `me()` persists `tenant_id`; `logout()` clears the store.

- [ ] **Step 1: Write the failing test**

Create `src/api/auth.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { otpRequest, otpVerify, login, me, logout } from './auth'
import { tokenStore } from './auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

describe('auth', () => {
  it('otpRequest posts the identifier and returns {sent}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await otpRequest('a@b.edu')).toEqual({ sent: true })
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ identifier: 'a@b.edu' })
  })

  it('otpVerify stores both tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })))
    await otpVerify('a@b.edu', '123456')
    expect(tokenStore.getAccess()).toBe('a')
    expect(tokenStore.getRefresh()).toBe('r')
  })

  it('login stores tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { access_token: 'a2', refresh_token: 'r2' } })))
    await login('a@b.edu', 'pw')
    expect(tokenStore.getAccess()).toBe('a2')
  })

  it('me persists the tenant id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['admin'] } })))
    const profile = await me()
    expect(profile.tenant_id).toBe('t1')
    expect(tokenStore.getTenantId()).toBe('t1')
  })

  it('logout clears the store even when the call succeeds', async () => {
    tokenStore.set({ access_token: 'a', refresh_token: 'r' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await logout()
    expect(tokenStore.getAccess()).toBeNull()
    expect(tokenStore.getRefresh()).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/api/auth.test.ts`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 3: Implement**

Create `src/api/auth.ts`:
```ts
import { request } from './client'
import { tokenStore } from './auth/tokenStore'
import type { AuthTokens, Me } from './types'

export async function otpRequest(identifier: string): Promise<{ sent: boolean }> {
  return request('/auth/otp/request', { method: 'POST', body: { identifier } })
}

export async function otpVerify(identifier: string, code: string): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>('/auth/otp/verify', { method: 'POST', body: { identifier, code } })
  tokenStore.set(tokens)
  return tokens
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>('/auth/login', { method: 'POST', body: { email, password } })
  tokenStore.set(tokens)
  return tokens
}

export async function refresh(): Promise<AuthTokens> {
  const refresh_token = tokenStore.getRefresh()
  const tokens = await request<AuthTokens>('/auth/refresh', { method: 'POST', body: { refresh_token } })
  tokenStore.set(tokens)
  return tokens
}

export async function me(): Promise<Me> {
  const profile = await request<Me>('/auth/me')
  tokenStore.setTenantId(profile.tenant_id)
  return profile
}

export async function logout(): Promise<void> {
  const refresh_token = tokenStore.getRefresh()
  try {
    if (refresh_token) await request('/auth/logout', { method: 'POST', body: { refresh_token } })
  } finally {
    tokenStore.clear()
  }
}

export async function setPassword(password: string): Promise<void> {
  await request('/auth/set-password', { method: 'POST', body: { password } })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts src/api/auth.test.ts
git commit -m "feat(api): auth module (otp, password login, refresh, me, logout, set-password)"
```

---

### Task 8: Wrap the app in `QueryClientProvider`

**Files:**
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: a single shared `QueryClient` available to all hooks added in later phases.

- [ ] **Step 1: Update `main.tsx`**

Replace `src/main.tsx` contents with:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/tokens.css'
import './styles/components.css'
import './styles/layout.css'
import './styles/login.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: type-check + Vite build succeed.

- [ ] **Step 3: Run the full suite (nothing regressed)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx
git commit -m "feat(app): provide a shared react-query client at the root"
```

---

### Task 9: Make `AppProvider` auth API-backed

**Files:**
- Modify: `src/context/AppProvider.tsx` (login/logout actions + `authError`/`authBusy` state)
- Modify: `src/context/AppProvider.test.tsx` (login is now async, fetch mocked)

**Interfaces:**
- Consumes: `otpVerify`, `login` (as `passwordLogin`), `me`, `logout` from `@/api/auth`; `setOnAuthFailure` from `@/api/client`.
- Produces (on `AppState`): replaces `login(email)` with `loginWithPassword(email, password): Promise<void>` and `loginWithOtp(identifier, code): Promise<void>`; keeps async `logout()`. Adds `authBusy: boolean`, `authError: string | null`, `clearAuthError()`. Console/role/tenant are derived from `me()`.

- [ ] **Step 1: Write the failing test**

Replace `src/context/AppProvider.test.tsx` with:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AppProvider, useApp } from './AppProvider'
import { tokenStore } from '@/api/auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

const wrapper = ({ children }: { children: React.ReactNode }) => <AppProvider>{children}</AppProvider>

describe('AppProvider auth', () => {
  it('password login authenticates then loads role/tenant from /auth/me', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })) // /auth/login
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['principal'] } }))) // /auth/me
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('p@greenwood.edu', 'pw') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.role).toBe('principal')
    expect(tokenStore.getTenantId()).toBe('t1')
  })

  it('surfaces an auth error on bad credentials and stays logged out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_credentials', message: 'Wrong email or password.' } }, 401)))
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('x@y.edu', 'bad') })
    expect(result.current.loggedIn).toBe(false)
    expect(result.current.authError).toBe('Wrong email or password.')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/context/AppProvider.test.tsx`
Expected: FAIL — `loginWithPassword`/`authError` do not exist.

- [ ] **Step 3: Update `AppProvider` — imports + state**

In `src/context/AppProvider.tsx`, add near the top imports:
```tsx
import { useEffect } from 'react'
import { ApiError, setOnAuthFailure } from '@/api/client'
import { login as passwordLogin, otpVerify, me as fetchMe, logout as apiLogout } from '@/api/auth'
import { tokenStore } from '@/api/auth/tokenStore'
```
(Keep the existing `useMemo, useState` import; merge `useEffect` into the existing `react` import line if you prefer a single import.)

- [ ] **Step 4: Update the `AppState` interface**

In the `interface AppState` block, replace the line `login: (email: string) => void` with:
```tsx
  authBusy: boolean
  authError: string | null
  clearAuthError: () => void
  loginWithPassword: (email: string, password: string) => Promise<void>
  loginWithOtp: (identifier: string, code: string) => Promise<void>
```
Change `logout: () => void` to `logout: () => Promise<void>`.

- [ ] **Step 5: Replace the login/logout implementation**

In the `AppProvider` function body, add state beside the other `useState` hooks:
```tsx
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const clearAuthError = () => setAuthError(null)
```
Replace the existing `const login = (email: string) => { ... }` block with:
```tsx
  /** Apply the identity from /auth/me to console/role/view state. */
  const applySession = (email: string, role: Role) => {
    const isOwner = email.endsWith('@schoolmate.io')
    setUser({ name: email.split('@')[0], email, role, hue: isOwner ? 250 : 210 })
    setConsoleKind(isOwner ? 'owner' : 'school')
    setRole(role)
    setOwnerViewing(false)
    setView(isOwner ? 'owner.dashboard' : 'school.dashboard')
    setLoggedIn(true)
  }

  const finishLogin = async (email: string) => {
    const profile = await fetchMe()
    applySession(email, (profile.roles[0] ?? 'admin') as Role)
  }

  const loginWithPassword = async (email: string, password: string) => {
    setAuthBusy(true); setAuthError(null)
    try {
      await passwordLogin(email, password)
      await finishLogin(email)
    } catch (e) {
      setAuthError(e instanceof ApiError ? e.message : 'Sign-in failed. Please try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  const loginWithOtp = async (identifier: string, code: string) => {
    setAuthBusy(true); setAuthError(null)
    try {
      await otpVerify(identifier, code)
      await finishLogin(identifier)
    } catch (e) {
      setAuthError(e instanceof ApiError ? e.message : 'Verification failed. Please try again.')
    } finally {
      setAuthBusy(false)
    }
  }
```
Replace the existing `const logout = () => { ... }` block with:
```tsx
  const logout = async () => {
    try { await apiLogout() } finally {
      setLoggedIn(false)
      setUser(null)
      setOwnerViewing(false)
      setView('school.dashboard')
      setMobileNav(false)
    }
  }
```
Add an effect (after the action definitions, before `const value`):
```tsx
  useEffect(() => { setOnAuthFailure(() => { tokenStore.clear(); logout() }) }, [])
```

- [ ] **Step 6: Update the exported `value`**

In the `const value: AppState = { ... }` object, remove `login,` and add:
```tsx
    authBusy, authError, clearAuthError, loginWithPassword, loginWithOtp,
```
(keep `logout,` — its signature changed, not its name.)

- [ ] **Step 7: Run the AppProvider test**

Run: `npx vitest run src/context/AppProvider.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck (surfaces every remaining `app.login(` caller)**

Run: `npm run typecheck`
Expected: FAIL — `LoginScreen.tsx` still calls `app.login(...)`. That is fixed in Task 10. Do not fix other callers here; `LoginScreen` is the only `login(` caller (verified: `grep -rn "\.login(" src` → `LoginScreen.tsx`).

- [ ] **Step 9: Commit**

```bash
git add src/context/AppProvider.tsx src/context/AppProvider.test.tsx
git commit -m "feat(auth): API-backed login/logout in AppProvider (password + otp, /auth/me)"
```

---

### Task 10: Wire the login screen to real auth (no markup change)

**Files:**
- Modify: `src/screens/LoginScreen.tsx`
- Modify: `src/screens/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `loginWithPassword`, `loginWithOtp`, `authBusy`, `authError` from `useApp()`; `otpRequest` from `@/api/auth`.
- Produces: no new exports. `signIn` → `loginWithPassword`; OTP request → `otpRequest`; OTP verify → `loginWithOtp`. `findAccountByIdentifier`/`normalizePhone` remain exported (demo-chip convenience) but no longer gate OTP.

- [ ] **Step 1: Write the failing test**

Replace `src/screens/LoginScreen.test.tsx` with:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from './LoginScreen'
import { AppProvider } from '@/context/AppProvider'
import { tokenStore } from '@/api/auth/tokenStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => { localStorage.clear(); tokenStore.clear(); vi.restoreAllMocks() })

const renderLogin = () => render(<AppProvider><LoginScreen /></AppProvider>)

describe('LoginScreen', () => {
  it('requests an OTP from the API when the user submits an identifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /OTP login/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /Send one-time code/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/otp/request')
    expect(await screen.findByText(/Enter the 6-digit code/i)).toBeInTheDocument()
  })

  it('shows the API error message when password sign-in fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_credentials', message: 'Wrong email or password.' } }, 401)))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /^Sign in/i }))
    expect(await screen.findByText('Wrong email or password.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/screens/LoginScreen.test.tsx`
Expected: FAIL — screen still uses the mock OTP/login path.

- [ ] **Step 3: Rewire imports and remove the mock code generator**

In `src/screens/LoginScreen.tsx`:
- Add import: `import { otpRequest } from '@/api/auth'`
- Add `useState`-adjacent reads from `useApp()`: the component already has `const app = useApp()`. Use `app.authBusy` / `app.authError` instead of the local `busy` where the buttons are disabled, and keep the local `busy` only for the OTP request spinner. Simplest: replace `const [busy, setBusy] = useState(false)` with `const busy = app.authBusy`.

- [ ] **Step 4: Replace the `signIn` handler (password login)**

Replace:
```tsx
  const signIn = (e: string) => {
    setBusy(true)
    setTimeout(() => { app.login(e); setBusy(false) }, 450)
  }
```
with:
```tsx
  const signIn = (e: string) => { void app.loginWithPassword(e, pw) }
```
(The form already passes `email`; the demo chips call `signIn(a.email)` — they now attempt a real password login with whatever is in the password field, which defaults to the demo password.)

- [ ] **Step 5: Replace the OTP request handler with a real API call**

Replace the `sendCode` function with:
```tsx
  const sendCode = async () => {
    const v = otpId.trim()
    if (!v) { setOtpErr('Enter your email or mobile number.'); return }
    const looksPhone = /^[\d+\-\s()]+$/.test(v)
    if (!looksPhone && validateEmail(v)) { setOtpErr('Enter a valid email or mobile number.'); return }
    setOtpErr(null)
    try {
      await otpRequest(v)
      setOtpId2(v)         // remember the identifier for the verify step
      setOtpInput('')
      setOtpStep('verify')
    } catch (e) {
      setOtpErr(e instanceof Error ? e.message : 'Could not send a code. Try again.')
    }
  }
```
Add the identifier-carry state beside the other OTP `useState` hooks:
```tsx
  const [otpId2, setOtpId2] = useState('')
```
Remove the now-unused mock state: delete `const [otpAcc, setOtpAcc] = ...`, `const [sentCode, setSentCode] = ...`, and any `findAccountByIdentifier`/`Math.random` usage inside `sendCode`. (`findAccountByIdentifier`/`normalizePhone` stay exported and defined — only their use inside `sendCode` is removed.)

- [ ] **Step 6: Replace the verify handler (real OTP verify)**

Replace:
```tsx
  const verifyCode = () => {
    if (otpInput.trim() !== sentCode) { setOtpErr('Incorrect code.'); return }
    if (otpAcc) app.login(otpAcc.email)
    else setOtpErr('Something went wrong — please request a new code.')
  }
```
with:
```tsx
  const verifyCode = () => { void app.loginWithOtp(otpId2, otpInput.trim()) }
```

- [ ] **Step 7: Replace the demo-code hint and wire the auth error**

In the verify-step JSX, remove the mock hint block:
```tsx
                <div className="sm-login-otp-hint">
                  <Icon name="message" size={14} />
                  <span>Demo code: <b>{sentCode}</b></span>
                </div>
```
and replace it with a real-delivery hint (keeps the same element/classNames):
```tsx
                <div className="sm-login-otp-hint">
                  <Icon name="message" size={14} />
                  <span>We sent a 6-digit code to {otpId2}.</span>
                </div>
```
In the verify `Field`, surface server-side verify failures by widening the error source:
```tsx
                <Field label="Enter the 6-digit code" error={(otpErr ?? app.authError) ?? undefined}>
```
And in the password `<form>`, show `app.authError` under the password field (reuse the existing `Field` error prop on the Password field):
```tsx
            <Field label="Password" error={app.authError ?? undefined}>
```
Reset `backToRequest` to also clear `otpId2`:
```tsx
  const backToRequest = () => { setOtpStep('request'); setOtpId2(''); setOtpInput(''); setOtpErr(null) }
```

- [ ] **Step 8: Run the login test**

Run: `npx vitest run src/screens/LoginScreen.test.tsx`
Expected: PASS.

- [ ] **Step 9: Typecheck + full suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS (no remaining `app.login(` callers; `sentCode`/`otpAcc` removed cleanly).

- [ ] **Step 10: Commit**

```bash
git add src/screens/LoginScreen.tsx src/screens/LoginScreen.test.tsx
git commit -m "feat(auth): wire login screen to live OTP + password auth (no markup change)"
```

---

## Phase 0 done — what later phases build on

After Phase 0: the app boots with a React Query provider, a complete `src/api/` HTTP foundation (`client`, `tokenStore`, `ApiError`, `mapper`, `auth`), and a login screen that authenticates against the live API with tenant scoping. Later plans (one per spec phase) add per-resource modules + hooks and migrate each screen off `mockDb`:

- **Phase 1** — read-only binds: dashboard counts, students/SIS + Student 360, teachers, staff, approvals list, notifications.
- **Phase 2** — mutations: student/teacher/staff add+edit, `users` + import, approvals PATCH.
- **Phase 3** — academics (classes, subjects) + attendance roll-call.
- **Phase 4** — exams + exam-papers + grades (adapt datesheet/marks UI; report cards from real grades).
- **Phase 5** — finance (payments/invoices/pay, payslips, leave) + comms (threads/complaints/announcements).
- **Phase 6** — "Demo data" badges on mock-only screens (buses/GPS, timetable, homework, fee-structure, calendar, owner console, derived parents); cleanup.

Each later phase reuses Task 1–7 primitives: build `<resource>.ts` with `request`/`listRequest` + `snakeToCamel`/`camelToSnake` (+ per-resource rename maps), wrap in `hooks/useX.ts`, then swap the screen's `mockDb` import for the hook — keeping all JSX intact.

## Self-Review notes

- **Spec coverage (Phase 0 slice):** §1 api layer scaffolding (Tasks 1–7), §2 auth+tenant+token lifecycle (Tasks 4,5,7,9,10), §3 mapper engine (Task 6), §7 env/QueryClient wiring (Tasks 1,8). Screen/data binds (§4) and state migration of rosters (§5) are explicitly deferred to Phases 1–6 and listed above. Test strategy (§6): MockApi/mockDb left intact; new modules carry co-located fetch-mocked tests.
- **Type consistency:** `tokenStore` methods (`getAccess/getRefresh/getTenantId/setTenantId/set/clear`) are used identically in `client.ts`, `auth.ts`, and tests. `Role` is defined once in `types.ts` and imported by `AppProvider`. `request`/`listRequest`/`setOnAuthFailure`/`RequestOpts` names match across client + auth + AppProvider.
- **No placeholders:** every step ships full code or an exact command + expected result.
</content>
