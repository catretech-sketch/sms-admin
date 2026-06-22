# Password Reset — Real API Rebind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebind the login screen's password-reset flow to the real `/auth/password/forgot` + `/auth/password/reset` endpoints — a 2-step flow (identify → code+password) that returns the user to sign-in with a success banner.

**Architecture:** Two new no-auth API bindings in `auth.ts`; both reset paths added to the client `NO_AUTH` set (so a `401 invalid_code` is a normal error, not session expiry). The LoginScreen reset panel collapses from 3 steps to 2 (one `/password/reset` call carries code+password), surfaces typed error codes, and on `204` returns to the sign-in form with a banner. The now-unused `establishSession` context action is removed.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + React Testing Library. Tests stub global `fetch` with JSON `Response` objects via a local `jsonResponse(body, status)` helper — they do NOT mock the api module.

## Global Constraints

- Base URL `config.apiBaseUrl` already includes `/v1`; endpoint paths are `/auth/password/forgot` and `/auth/password/reset`.
- All request/response keys are snake_case; success wrapped in `{ "data": ... }`; errors `{ "error": { "code", "message" } }`.
- `/auth/password/forgot` and `/auth/password/reset` are **no-auth**: no bearer, and a `401` is a normal error (not session expiry / token refresh).
- `/auth/password/forgot`: `200 → {data:{sent:true}}`, `404 → code "not_registered"`, `429 → code "rate_limited"`.
- `/auth/password/reset` body `{ identifier, code, password }`: `204 → success (no body, no tokens)`, `401 → code "invalid_code"`, `422 → code "weak_password"`, `429 → code "rate_limited"`.
- Password rule: minimum 8 chars (local `validatePassword`) + confirm-match; the 6-digit code must be exactly 6 chars locally.
- After a successful reset: return to the sign-in form, show "Password updated — sign in with your new password.", prefill the email field if the identifier is email-shaped. No tokens, no auto-navigation.
- Surface `not_registered` as "No account is registered for this email/mobile." (no anti-enumeration — the backend already leaks existence via 404).
- `ApiError` carries `.status` and `.code`. `validatePassword`, `passwordsMatch`, `required`, `validateEmail`, and the `looksLikePhone` helper already exist.

---

### Task 1: API bindings — `passwordForgot` + `passwordReset`

**Files:**
- Modify: `src/api/auth.ts` (add two functions)
- Test: `src/api/auth.test.ts`

**Interfaces:**
- Consumes: existing `request<T>` from `./client`.
- Produces:
  - `passwordForgot(identifier: string): Promise<{ sent: boolean }>` → `POST /auth/password/forgot`
  - `passwordReset(identifier: string, code: string, password: string): Promise<void>` → `POST /auth/password/reset` (204, no body)

- [ ] **Step 1: Write the failing tests**

In `src/api/auth.test.ts`, extend the import on line 2 to add the two new functions:

```ts
import { otpRequest, otpVerify, login, me, logout, passwordForgot, passwordReset } from './auth'
```

Then add this describe block at the end of the file (after the existing `describe('auth', ...)` block closes):

```ts
describe('password reset api', () => {
  it('passwordForgot posts the identifier and returns {sent}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await passwordForgot('a@b.edu')).toEqual({ sent: true })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/password/forgot')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ identifier: 'a@b.edu' })
  })

  it('passwordReset posts identifier+code+password and resolves on 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(passwordReset('a@b.edu', '123456', 'newPass123')).resolves.toBeUndefined()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/password/reset')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string))
      .toEqual({ identifier: 'a@b.edu', code: '123456', password: 'newPass123' })
  })

  it('passwordReset rejects with a typed ApiError carrying the error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_code', message: 'bad code' } }, 401)))
    await expect(passwordReset('a@b.edu', '000000', 'newPass123'))
      .rejects.toMatchObject({ status: 401, code: 'invalid_code' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/api/auth.test.ts`
Expected: FAIL — `passwordForgot`/`passwordReset` are not exported (import/undefined error).

- [ ] **Step 3: Implement the two functions**

In `src/api/auth.ts`, add these after the `otpVerify` function (before `login`):

```ts
export async function passwordForgot(identifier: string): Promise<{ sent: boolean }> {
  return request('/auth/password/forgot', { method: 'POST', body: { identifier } })
}

export async function passwordReset(identifier: string, code: string, password: string): Promise<void> {
  await request('/auth/password/reset', { method: 'POST', body: { identifier, code, password } })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/api/auth.test.ts`
Expected: PASS (existing auth tests + 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts src/api/auth.test.ts
git commit -m "feat(auth): bind passwordForgot + passwordReset API endpoints"
```

---

### Task 2: Client `NO_AUTH` for the password reset paths

**Files:**
- Modify: `src/api/client.ts:11`
- Test: `src/api/client.test.ts`

**Interfaces:**
- Consumes: existing `request`, `setOnAuthFailure`, `tokenStore`.
- Produces: no new exports — behavior change only: `/auth/password/forgot` and `/auth/password/reset` are treated as no-auth, so a `401` on them does not trigger refresh/`onAuthFailure`/token clear.

- [ ] **Step 1: Write the failing test**

Add to `src/api/client.test.ts`, inside `describe('request', ...)` (after the "clears tokens and fires onAuthFailure when refresh fails" test):

```ts
  it('treats a 401 on a no-auth password route as a normal error (no refresh, no logout)', async () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    const onFail = vi.fn()
    setOnAuthFailure(onFail)
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_code', message: 'bad code' } }, 401))
    vi.stubGlobal('fetch', fetchMock)
    await expect(request('/auth/password/reset', { method: 'POST', body: {} }))
      .rejects.toMatchObject({ status: 401, code: 'invalid_code' })
    expect(fetchMock).toHaveBeenCalledOnce()      // no refresh retry
    expect(onFail).not.toHaveBeenCalled()         // no session-expiry path
    expect(tokenStore.getRefresh()).toBe('r1')    // tokens untouched
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/api/client.test.ts`
Expected: FAIL — `/auth/password/reset` is not in `NO_AUTH`, so the 401 triggers the refresh branch: `fetchMock` is called more than once and `onFail` fires (tokens cleared).

- [ ] **Step 3: Add the two paths to `NO_AUTH`**

In `src/api/client.ts`, replace line 11:

```ts
const NO_AUTH = new Set(['/auth/otp/request', '/auth/otp/verify', '/auth/refresh', '/auth/login'])
```

with:

```ts
const NO_AUTH = new Set([
  '/auth/otp/request', '/auth/otp/verify', '/auth/refresh', '/auth/login',
  '/auth/password/forgot', '/auth/password/reset',
])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/api/client.test.ts`
Expected: PASS (new test + all existing client tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts
git commit -m "feat(auth): mark /auth/password/* as no-auth (401 is a normal error)"
```

---

### Task 3: LoginScreen — 2-step reset flow against the real API

**Files:**
- Modify: `src/screens/LoginScreen.tsx` (full file replacement below)
- Test: `src/screens/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `passwordForgot`, `passwordReset` (Task 1); `ApiError` from `@/api/client`; `validateEmail`, `validatePassword`, `passwordsMatch`, `required` from `@/lib/validation`; `app.authBusy`, `app.clearAuthError`, `app.loginWithPassword`, `app.loginWithOtp` from context. NOTE: this task STOPS calling `app.establishSession` (removed in Task 4).
- Produces: UI only — no new exports beyond the existing `normalizePhone` / `findAccountByIdentifier`.

- [ ] **Step 1: Write the failing tests**

Replace the entire body of `src/screens/LoginScreen.test.tsx` with this (keeps the two existing `LoginScreen` tests, replaces the reset describe block):

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

describe('LoginScreen password reset', () => {
  it('opens the reset panel from the Forgot password link', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByText(/Reset your password/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/you@school.edu or/i)).toBeInTheDocument()
  })

  it('surfaces a no-account message when the identifier is not registered', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'not_registered', message: 'nope' } }, 404)))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'ghost@nowhere.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    expect(await screen.findByText(/No account is registered/i)).toBeInTheDocument()
    // still on the identify step
    expect(screen.getByPlaceholderText(/you@school.edu or/i)).toBeInTheDocument()
  })

  it('resets the password then returns to sign in with a success banner', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } })) // /auth/password/forgot
      .mockResolvedValueOnce(new Response(null, { status: 204 }))     // /auth/password/reset
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '123456')
    await userEvent.type(screen.getByPlaceholderText(/at least 8 characters/i), 'newPass123')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'newPass123')
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText(/Password updated/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Sign in/i })).toBeInTheDocument()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls[0]).toContain('/auth/password/forgot')
    expect(urls[1]).toContain('/auth/password/reset')
  })

  it('keeps the user on the reset step when the code is invalid', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_code', message: 'bad' } }, 401))
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '000000')
    await userEvent.type(screen.getByPlaceholderText(/at least 8 characters/i), 'newPass123')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'newPass123')
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText(/invalid or expired/i)).toBeInTheDocument()
  })

  it('blocks a too-short password without calling the reset API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } })) // forgot only
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '123456')
    await userEvent.type(screen.getByPlaceholderText(/at least 8 characters/i), 'short')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'short')
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1) // forgot only; no reset call
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/screens/LoginScreen.test.tsx`
Expected: FAIL — the reset flow still hits `/auth/otp/*` and has 3 steps; the new tests expect `/auth/password/*`, a "Reset password" button, and the success banner.

- [ ] **Step 3: Replace `src/screens/LoginScreen.tsx`**

Replace the ENTIRE file with:

```tsx
/* ============================================================
   SchoolMate — Login screen (role-locked demo accounts)
   ============================================================ */
import { useState } from 'react'
import { useApp } from '@/lib/hooks'
import { DEMO_ACCOUNTS, type DemoAccount } from '@/context/AppProvider'
import { ROLE_META } from '@/data/mockDb'
import { Icon, Field, Input, Btn, Checkbox, Spinner, Avatar } from '@/components/ui'
import { validateEmail, validatePassword, passwordsMatch, required } from '@/lib/validation'
import { otpRequest, passwordForgot, passwordReset } from '@/api/auth'
import { ApiError } from '@/api/client'

/* ---------- Sign-in identifier helpers (which account an email/mobile maps to) ---------- */

/** Keep only digits, for tolerant phone matching. */
export function normalizePhone(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * Resolve a typed email or mobile number to a seeded demo account.
 * Email matches case-insensitively; phone matches on the last 10 digits
 * (so the +91 country code and spaces are optional). Returns null if none.
 */
export function findAccountByIdentifier(identifier: string): DemoAccount | null {
  const id = identifier.trim()
  if (!id) return null
  const email = id.toLowerCase()
  const byEmail = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email)
  if (byEmail) return byEmail
  const digits = normalizePhone(id)
  if (digits.length >= 10) {
    const tail = digits.slice(-10)
    const byPhone = DEMO_ACCOUNTS.find((a) => normalizePhone(a.phone).slice(-10) === tail)
    if (byPhone) return byPhone
  }
  return null
}

/** True when the input looks like a phone number (digits, +, -, spaces, parens). */
function looksLikePhone(v: string): boolean {
  return /^[\d+\-\s()]+$/.test(v)
}

/** Map a thrown error to friendly copy by the backend's error code. */
function apiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'not_registered': return 'No account is registered for this email/mobile.'
      case 'invalid_code':   return 'That code is invalid or expired. Request a new one.'
      case 'weak_password':  return 'Password is too weak — use at least 8 characters.'
      case 'rate_limited':   return 'Too many requests — please wait a minute and try again.'
      default:               return e.message || fallback
    }
  }
  return fallback
}

const POINTS = [
  { icon: 'users', t: 'Two-console SaaS — Owner + School' },
  { icon: 'shield', t: 'Tier & role-based access control' },
  { icon: 'sparkle', t: 'Real-time attendance, fees & transport' },
]

export function LoginScreen() {
  const app = useApp()
  const [email, setEmail] = useState('admin@greenwood.edu')
  const [pw, setPw] = useState('demo1234')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const busy = app.authBusy

  const signIn = (e: string) => { void app.loginWithPassword(e, pw) }

  /* OTP sign-in: hidden until the user opts in, then request a code from the API and verify it. */
  const [otpOpen, setOtpOpen] = useState(false)
  const [otpId, setOtpId] = useState('')
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request')
  const [otpId2, setOtpId2] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [otpErr, setOtpErr] = useState<string | null>(null)

  const sendCode = async () => {
    const v = otpId.trim()
    if (!v) { setOtpErr('Enter your email or mobile number.'); return }
    if (!looksLikePhone(v) && validateEmail(v)) { setOtpErr('Enter a valid email or mobile number.'); return }
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

  const verifyCode = () => { void app.loginWithOtp(otpId2, otpInput.trim()) }

  const backToRequest = () => {
    setOtpStep('request')
    setOtpId2('')
    setOtpInput('')
    setOtpErr(null)
  }

  /* Password reset/create: prove the identifier via a one-time code, then set a new
     password in a single /auth/password/reset call. On success, return to sign in. */
  const [resetOpen, setResetOpen] = useState(false)
  const [resetStep, setResetStep] = useState<'id' | 'reset'>('id')
  const [resetId, setResetId] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetPw, setResetPw] = useState('')
  const [resetPw2, setResetPw2] = useState('')
  const [resetErr, setResetErr] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const openReset = () => {
    setResetOpen(true); setResetStep('id'); setResetDone(false)
    setResetId(''); setResetCode(''); setResetPw(''); setResetPw2('')
    setResetErr(null)
  }
  const closeReset = () => { setResetOpen(false); app.clearAuthError() }

  /* Step 1 — send the code via /auth/password/forgot. */
  const resetRequest = async () => {
    if (resetBusy) return
    const v = resetId.trim()
    if (!v) { setResetErr('Enter your email or mobile number.'); return }
    if (!looksLikePhone(v) && validateEmail(v)) { setResetErr('Enter a valid email or mobile number.'); return }
    setResetErr(null)
    setResetBusy(true)
    try {
      await passwordForgot(v)
      setResetCode(''); setResetPw(''); setResetPw2('')
      setResetStep('reset')
    } catch (e) {
      setResetErr(apiErrorMessage(e, 'Could not send a code. Check your connection and try again.'))
    } finally {
      setResetBusy(false)
    }
  }

  /* Resend the code from the reset step. */
  const resendCode = async () => {
    if (resetBusy) return
    setResetErr(null)
    setResetBusy(true)
    try {
      await passwordForgot(resetId.trim())
    } catch (e) {
      setResetErr(apiErrorMessage(e, 'Could not resend the code. Try again.'))
    } finally {
      setResetBusy(false)
    }
  }

  /* Step 2 — code + new password in one /auth/password/reset call (204, no tokens). */
  const resetSubmit = async () => {
    if (resetBusy) return
    const code = resetCode.trim()
    if (code.length !== 6) { setResetErr('Enter the 6-digit code we sent you.'); return }
    const pwErr = required(resetPw) ?? validatePassword(resetPw)
    if (pwErr) { setResetErr(pwErr); return }
    const matchErr = passwordsMatch(resetPw, resetPw2)
    if (matchErr) { setResetErr(matchErr); return }
    setResetErr(null)
    setResetBusy(true)
    try {
      await passwordReset(resetId.trim(), code, resetPw)
    } catch (e) {
      setResetErr(apiErrorMessage(e, 'Could not reset your password. Check your connection and try again.'))
      return
    } finally {
      setResetBusy(false)
    }
    // Success: return to sign in with a banner; prefill the email if it's email-shaped.
    const id = resetId.trim()
    setResetOpen(false); setResetStep('id')
    setResetCode(''); setResetPw(''); setResetPw2(''); setResetErr(null)
    if (validateEmail(id) === null) setEmail(id)
    setResetDone(true)
  }

  return (
    <div className="sm-login">
      <div className="sm-login-brand">
        <div className="sm-login-brand-logo"><span>S</span> SchoolMate</div>
        <div>
          <h1 className="sm-login-headline">Run every school in your group from one console.</h1>
          <p className="sm-login-sub">Admissions to attendance, fees to payroll, timetables to transport — SchoolMate brings it together with tier-based plans and role-based access.</p>
          <div className="sm-login-points">
            {POINTS.map((p, i) => (
              <div className="sm-login-point" key={i}><span><Icon name={p.icon} size={15} /></span>{p.t}</div>
            ))}
          </div>
        </div>
        <div className="sm-login-foot">© 2026 SchoolMate · A multi-tenant school management SaaS</div>
      </div>

      <div className="sm-login-panel">
        <div className="sm-login-form">
          {resetOpen ? (
            <>
              <h2>Reset your password</h2>
              <p className="lead">Verify your email or mobile, then set a new password.</p>

              {resetStep === 'id' && (
                <form className="col gap10" onSubmit={(e) => { e.preventDefault(); void resetRequest() }}>
                  <Field label="Email or mobile number" error={resetErr ?? undefined}>
                    <Input icon="phone" value={resetId} onChange={(e) => { setResetId(e.target.value); setResetErr(null) }} placeholder="you@school.edu or +91…" />
                  </Field>
                  <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy || resetBusy}>
                    Send one-time code <Icon name="arrowRight" size={16} />
                  </Btn>
                </form>
              )}

              {resetStep === 'reset' && (
                <form className="col gap10" onSubmit={(e) => { e.preventDefault(); void resetSubmit() }}>
                  <div className="sm-login-otp-hint">
                    <Icon name="message" size={14} /><span>We sent a 6-digit code to {resetId.trim()}.</span>
                  </div>
                  <Field label="6-digit code" error={resetErr ?? undefined}>
                    <Input icon="key" inputMode="numeric" maxLength={6} value={resetCode} onChange={(e) => { setResetCode(e.target.value); setResetErr(null) }} placeholder="••••••" />
                  </Field>
                  <Field label="New password">
                    <Input icon="lock" type="password" value={resetPw} onChange={(e) => { setResetPw(e.target.value); setResetErr(null) }} placeholder="At least 8 characters" />
                  </Field>
                  <Field label="Confirm new password">
                    <Input icon="lock" type="password" value={resetPw2} onChange={(e) => { setResetPw2(e.target.value); setResetErr(null) }} placeholder="Re-enter your password" />
                  </Field>
                  <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy || resetBusy}>
                    {(busy || resetBusy) ? <><Spinner size={16} /> Updating…</> : <>Reset password <Icon name="arrowRight" size={16} /></>}
                  </Btn>
                  <button type="button" className="sm-login-link" onClick={() => { void resendCode() }}>
                    Resend code
                  </button>
                  <button type="button" className="sm-login-link" onClick={() => { setResetStep('id'); setResetErr(null) }}>
                    <Icon name="arrowLeft" size={13} /> Use a different email/mobile
                  </button>
                </form>
              )}

              <button type="button" className="sm-login-link" onClick={closeReset}>
                <Icon name="arrowLeft" size={13} /> Back to sign in
              </button>
            </>
          ) : (
            <>
              <h2>Welcome back</h2>
              <p className="lead">Sign in to your SchoolMate workspace.</p>

              {resetDone && (
                <div className="sm-login-otp-hint" role="status">
                  <Icon name="checkCircle" size={14} /><span>Password updated — sign in with your new password.</span>
                </div>
              )}

              <form className="col gap14" onSubmit={(e) => { e.preventDefault(); signIn(email) }}>
                <Field label="Email address">
                  <Input icon="user" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setResetDone(false) }} placeholder="you@school.edu" />
                </Field>
                <Field label="Password" error={app.authError ?? undefined}>
                  <div style={{ position: 'relative' }}>
                    <Input icon="lock" type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
                    <button type="button" className="sm-login-pw-toggle" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password">
                      <Icon name="eye" size={16} />
                    </button>
                  </div>
                </Field>

                <div className="sm-login-row">
                  <Checkbox checked={remember} onChange={setRemember} label="Remember me" />
                  <button type="button" className="sm-login-link" onClick={openReset}>Forgot password?</button>
                </div>

                <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy}>
                  {busy ? <><Spinner size={16} /> Signing in…</> : <>Sign in <Icon name="arrowRight" size={16} /></>}
                </Btn>
              </form>

              <div className="sm-login-or"><span>or</span></div>

              <div className="sm-login-otp">
                {!otpOpen ? (
                  <Btn type="button" variant="secondary" size="lg" style={{ width: '100%' }} onClick={() => setOtpOpen(true)} disabled={busy}>
                    <Icon name="key" size={16} /> OTP login
                  </Btn>
                ) : otpStep === 'request' ? (
                  <form className="col gap10" onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
                    <Field label="Email or mobile number" error={otpErr ?? undefined}>
                      <Input icon="phone" value={otpId} onChange={(e) => { setOtpId(e.target.value); setOtpErr(null) }} placeholder="you@school.edu or +91…" />
                    </Field>
                    <Btn type="submit" variant="secondary" size="lg" className="sm-login-otp-send" style={{ width: '100%' }} disabled={busy}>
                      Send one-time code <Icon name="arrowRight" size={16} />
                    </Btn>
                  </form>
                ) : (
                  <form className="col gap10" onSubmit={(e) => { e.preventDefault(); verifyCode() }}>
                    <div className="sm-login-otp-hint">
                      <Icon name="message" size={14} />
                      <span>We sent a 6-digit code to {otpId2}.</span>
                    </div>
                    <Field label="Enter the 6-digit code" error={(otpErr ?? app.authError) ?? undefined}>
                      <Input icon="key" inputMode="numeric" maxLength={6} value={otpInput} onChange={(e) => { setOtpInput(e.target.value); setOtpErr(null) }} placeholder="••••••" />
                    </Field>
                    <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy}>
                      Verify &amp; sign in <Icon name="arrowRight" size={16} />
                    </Btn>
                    <button type="button" className="sm-login-link" onClick={backToRequest}>
                      <Icon name="arrowLeft" size={13} /> Use a different email/mobile
                    </button>
                  </form>
                )}
              </div>

              <div className="sm-demos">
                <div className="sm-demos-label">or try a demo account</div>
                <div className="sm-demo-grid">
                  {DEMO_ACCOUNTS.map((a) => {
                    const label = a.console === 'owner' ? 'Owner' : ROLE_META[a.role].label
                    return (
                      <button key={a.email} type="button" className="sm-demo-chip" onClick={() => signIn(a.email)} disabled={busy}>
                        <Avatar name={a.name} hue={a.hue} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div className="nm">{a.name}</div>
                          <div className="rl">{label}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

Notes on the change:
- Imports: drop `otpVerify` and `setPassword`; add `passwordForgot`, `passwordReset`. `otpRequest` stays (OTP login).
- New module-level `apiErrorMessage(e, fallback)` maps `ApiError.code` → copy.
- Reset state: `resetStep` is now `'id' | 'reset'`; `resetMsg` removed; `resetDone` added for the success banner.
- `resetRequest` calls `passwordForgot` and advances only on success (404/429 surface inline).
- `resetSubmit` validates locally, then one `passwordReset` call; on success closes the panel, sets `resetDone`, and prefills the email if email-shaped. NOTE: it no longer calls `app.establishSession`.
- The success banner renders above the sign-in form and clears when the email field is edited.
- The OTP-login panel and demo grid are unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/screens/LoginScreen.test.tsx`
Expected: PASS — 2 existing + 5 reset tests.

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean (note: `app.establishSession` is now unused but still present on the context — that's removed in Task 4 and does not break typecheck); full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/screens/LoginScreen.tsx src/screens/LoginScreen.test.tsx
git commit -m "feat(auth): 2-step password reset against /auth/password/* with return-to-login"
```

---

### Task 4: Remove the now-unused `establishSession`

**Files:**
- Modify: `src/context/AppProvider.tsx` (interface ~line 83, impl ~lines 185-189, value ~line 240)
- Test: `src/context/AppProvider.test.tsx` (remove the `establishSession` test)

**Interfaces:**
- Consumes: nothing new.
- Produces: removes `establishSession` from the `AppState` context. After Task 3, no code references `app.establishSession`. `runAuth` stays (used by `loginWithPassword` + `loginWithOtp`).

- [ ] **Step 1: Remove the establishSession test**

In `src/context/AppProvider.test.tsx`, delete this entire test (added in the prior feature):

```ts
  it('establishSession loads role/tenant from /auth/me for an already-verified identifier', async () => {
    tokenStore.set({ access_token: 'a', refresh_token: 'r' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['teacher'] } }))) // /auth/me
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.establishSession('teacher@greenwood.edu') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.role).toBe('teacher')
    expect(tokenStore.getTenantId()).toBe('t1')
  })
```

- [ ] **Step 2: Run the file to confirm it's green without that test**

Run: `npm test -- src/context/AppProvider.test.tsx`
Expected: PASS — the remaining auth tests (password login, bad creds, owner routing, unknown role, logout) still pass. (`establishSession` is still defined on the provider at this point, just no longer tested.)

- [ ] **Step 3: Remove the interface member**

In `src/context/AppProvider.tsx`, delete this line from the `AppState` interface:

```ts
  establishSession: (identifier: string) => Promise<void>
```

- [ ] **Step 4: Remove the implementation**

In `src/context/AppProvider.tsx`, delete the `establishSession` definition (the comment + const added in the prior feature):

```ts
  /** Establish the logged-in session from an already-verified identifier
   *  (used after the OTP password-reset flow sets tokens via otpVerify). */
  const establishSession = (identifier: string) =>
    runAuth(() => finishLogin(identifier), 'Could not load your profile. Please try again.')
```

Leave `finishLogin`, `runAuth`, `loginWithPassword`, and `loginWithOtp` intact.

- [ ] **Step 5: Remove it from the context `value`**

In `src/context/AppProvider.tsx`, find:

```ts
    authBusy, authError, clearAuthError, loginWithPassword, loginWithOtp, establishSession,
```

and change it to:

```ts
    authBusy, authError, clearAuthError, loginWithPassword, loginWithOtp,
```

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean (no unused `establishSession`; nothing references it after Task 3); full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/context/AppProvider.tsx src/context/AppProvider.test.tsx
git commit -m "refactor(auth): remove unused establishSession (reset no longer auto-signs-in)"
```

---

## Self-Review

**1. Spec coverage:**
- `passwordForgot` / `passwordReset` bindings → Task 1. ✓
- `/auth/password/*` in `NO_AUTH`; 401 is a normal error → Task 2 (+ falsifiable test asserting no refresh / no logout). ✓
- 2-step flow (identify → code+password, one reset call) → Task 3 `resetStep: 'id' | 'reset'`, `resetSubmit`. ✓
- Error handling: 404 not_registered / 401 invalid_code / 422 weak_password / 429 rate_limited → Task 3 `apiErrorMessage` + tests for not_registered and invalid_code. ✓
- Local validation before network (code length 6, min-8, match) → Task 3 `resetSubmit` + "blocks too-short password" test. ✓
- Return-to-login + banner + email prefill if email-shaped → Task 3 success path + "returns to sign in with a success banner" test. ✓
- Remove `establishSession`; keep `runAuth`, `validatePassword` → Task 4. ✓
- Keep `otpRequest`/`otpVerify` (OTP login) and `setPassword` (unconsumed binding) → Task 1 leaves them; Task 3 keeps OTP login markup. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code; every command has an expected outcome. ✓

**3. Type consistency:** `passwordForgot(identifier): Promise<{sent:boolean}>` and `passwordReset(identifier, code, password): Promise<void>` are declared in Task 1 and consumed with those exact signatures in Task 3. `apiErrorMessage(e: unknown, fallback: string): string` defined and used in Task 3. `resetStep` union (`'id' | 'reset'`) is consistent across state, handlers, and JSX. `establishSession` is removed in Task 4 only after Task 3 drops its sole consumer. ✓

## Out of scope (carried from spec)
- Auto-login after reset (chose return-to-login; `/auth/login` is email-only).
- Logged-in change-password UI (the `set-password` endpoint has no surface yet).
- Resend cooldown timer UI.
- Backend changes.
