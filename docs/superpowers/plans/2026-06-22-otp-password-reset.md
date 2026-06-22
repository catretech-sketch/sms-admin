# OTP Password Reset / Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user set a password by verifying ownership of their email/mobile via a one-time code, serving both first-time "create password" and "forgot password" through one inline flow on the login screen.

**Architecture:** A 3-step inline panel on `LoginScreen` (identify → verify code → set password) composes the existing `/auth/otp/request`, `/auth/otp/verify`, and `/auth/set-password` endpoints. `otpVerify` already deposits tokens in `tokenStore`, so step 3's `setPassword` call is authenticated; a new `establishSession` context action then loads `/auth/me` and lands the user in their dashboard (auto sign-in). No backend changes.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + React Testing Library. The codebase tests by stubbing global `fetch` with JSON `Response` objects (not by mocking the api module).

## Global Constraints

- Reuse existing endpoints only — no new backend routes: `/auth/otp/request`, `/auth/otp/verify`, `/auth/set-password`, `/auth/me`.
- Anti-enumeration: after requesting a code, always advance with a neutral message; never reveal whether an account exists. Only a true network failure (non-`ApiError`) blocks advancing.
- Password rule: minimum **8** characters, plus confirm-match.
- Validators live in `src/lib/validation.ts` and return an error string or `null`; empty is treated as valid (required-ness enforced at the call site).
- Tests mock `fetch` via the existing `jsonResponse(body, status)` helper; `beforeEach` clears `localStorage` + `tokenStore` and restores mocks.
- Follow existing inline-panel style (mirror the current `otpStep` OTP-login panel and its CSS classes: `sm-login-form`, `sm-login-otp-hint`, `sm-login-link`, `col gap10`, `lead`).

---

### Task 1: `validatePassword` validator

**Files:**
- Modify: `src/lib/validation.ts` (append after `passwordsMatch`)
- Test: `src/lib/validation.test.ts`

**Interfaces:**
- Consumes: nothing new (uses the file's existing private `isBlank`).
- Produces: `validatePassword(value: string | null | undefined): string | null` — returns `'Password must be at least 8 characters'` when a non-empty value is under 8 chars, else `null`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/validation.test.ts`. First extend the import on lines 2-5 to include `validatePassword`:

```ts
import {
  required, validateAadhaar, validateFile, validateEmail, validatePhone, MAX_FILE_MB,
  validatePAN, validateIFSC, validateURL, passwordsMatch, validatePassword,
} from './validation'
```

Then append this describe block at the end of the file:

```ts
describe('validatePassword', () => {
  it('accepts 8 or more characters', () => {
    expect(validatePassword('12345678')).toBeNull()
    expect(validatePassword('a-longer-password')).toBeNull()
  })
  it('rejects fewer than 8 characters', () => {
    expect(validatePassword('1234567')).not.toBeNull()
    expect(validatePassword('short')).not.toBeNull()
  })
  it('treats empty as valid (required enforced separately)', () => {
    expect(validatePassword('')).toBeNull()
    expect(validatePassword(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/validation.test.ts`
Expected: FAIL — `validatePassword is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/validation.ts` (after the `passwordsMatch` function, at end of file):

```ts
/** Password strength: minimum 8 characters. Empty is allowed (required
 *  enforced separately at the call site). */
export function validatePassword(value: string | null | undefined): string | null {
  if (isBlank(value)) return null
  return (value as string).length >= 8 ? null : 'Password must be at least 8 characters'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/validation.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat(validation): add validatePassword (min 8 chars)"
```

---

### Task 2: `establishSession` context action

**Files:**
- Modify: `src/context/AppProvider.tsx` (the `AppState` interface ~line 82, the auth functions ~lines 147-189, and the `value` object ~line 240)
- Test: `src/context/AppProvider.test.tsx`

**Interfaces:**
- Consumes: existing private `finishLogin(email)`, `otpVerify`, `passwordLogin`, `ApiError`, `setAuthBusy`, `setAuthError`.
- Produces: `establishSession(identifier: string) => Promise<void>` on the `useApp()` context — runs `finishLogin` inside the shared busy/error wrapper, establishing the logged-in session for an already-verified identifier (tokens already in `tokenStore`).

- [ ] **Step 1: Write the failing test**

Add to `src/context/AppProvider.test.tsx`, inside the `describe('AppProvider auth', ...)` block (after the last test, before the closing `})`):

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/context/AppProvider.test.tsx`
Expected: FAIL — `result.current.establishSession is not a function`.

- [ ] **Step 3: Add the type to the `AppState` interface**

In `src/context/AppProvider.tsx`, find these lines (~81-83):

```ts
  loginWithPassword: (email: string, password: string) => Promise<void>
  loginWithOtp: (identifier: string, code: string) => Promise<void>
  logout: () => Promise<void>
```

Insert the new line so it reads:

```ts
  loginWithPassword: (email: string, password: string) => Promise<void>
  loginWithOtp: (identifier: string, code: string) => Promise<void>
  establishSession: (identifier: string) => Promise<void>
  logout: () => Promise<void>
```

- [ ] **Step 4: Refactor the auth functions and add `establishSession`**

In `src/context/AppProvider.tsx`, replace the block from `const finishLogin` through the end of `loginWithOtp` (currently ~lines 158-189):

```ts
  const finishLogin = async (email: string) => {
    const profile = await fetchMe()
    // The backend may return roles outside the UI union (e.g. "school_admin");
    // map anything unknown to a safe default so ROLE_META lookups never crash.
    const known: Role[] = ['admin', 'principal', 'vice_principal', 'teacher']
    const raw = profile.roles[0]
    applySession(email, known.includes(raw as Role) ? (raw as Role) : 'admin')
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

with this DRY version (shared `runAuth` wrapper + new `establishSession`):

```ts
  const finishLogin = async (email: string) => {
    const profile = await fetchMe()
    // The backend may return roles outside the UI union (e.g. "school_admin");
    // map anything unknown to a safe default so ROLE_META lookups never crash.
    const known: Role[] = ['admin', 'principal', 'vice_principal', 'teacher']
    const raw = profile.roles[0]
    applySession(email, known.includes(raw as Role) ? (raw as Role) : 'admin')
  }

  /** Shared busy/error wrapper for the auth flows. */
  const runAuth = async (fn: () => Promise<void>, fallback: string) => {
    setAuthBusy(true); setAuthError(null)
    try {
      await fn()
    } catch (e) {
      setAuthError(e instanceof ApiError ? e.message : fallback)
    } finally {
      setAuthBusy(false)
    }
  }

  const loginWithPassword = (email: string, password: string) =>
    runAuth(async () => {
      await passwordLogin(email, password)
      await finishLogin(email)
    }, 'Sign-in failed. Please try again.')

  const loginWithOtp = (identifier: string, code: string) =>
    runAuth(async () => {
      await otpVerify(identifier, code)
      await finishLogin(identifier)
    }, 'Verification failed. Please try again.')

  /** Establish the logged-in session from an already-verified identifier
   *  (used after the OTP password-reset flow sets tokens via otpVerify). */
  const establishSession = (identifier: string) =>
    runAuth(() => finishLogin(identifier), 'Could not load your profile. Please try again.')
```

- [ ] **Step 5: Expose `establishSession` in the context `value`**

In `src/context/AppProvider.tsx`, find (~line 240):

```ts
    authBusy, authError, clearAuthError, loginWithPassword, loginWithOtp,
    logout, go, clearIntent, setSchoolId, enterSchool, exitToOwner, upgrade, setLang, setMobileNav,
```

Change the first line to add `establishSession`:

```ts
    authBusy, authError, clearAuthError, loginWithPassword, loginWithOtp, establishSession,
    logout, go, clearIntent, setSchoolId, enterSchool, exitToOwner, upgrade, setLang, setMobileNav,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/context/AppProvider.test.tsx`
Expected: PASS — the new `establishSession` test plus all existing auth tests (password login, error, owner routing, unknown role, logout) stay green (they guard the `runAuth` refactor).

- [ ] **Step 7: Commit**

```bash
git add src/context/AppProvider.tsx src/context/AppProvider.test.tsx
git commit -m "feat(auth): add establishSession action; DRY auth flows via runAuth"
```

---

### Task 3: Password-reset inline panel on LoginScreen

**Files:**
- Modify: `src/screens/LoginScreen.tsx` (full file replacement below)
- Test: `src/screens/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `otpRequest`, `otpVerify`, `setPassword` from `@/api/auth`; `ApiError` from `@/api/client`; `validateEmail`, `validatePassword`, `passwordsMatch`, `required` from `@/lib/validation`; `app.establishSession`, `app.clearAuthError`, `app.authBusy` from context.
- Produces: a UI flow only — the "Forgot password?" link opens a `resetStep: 'id' | 'code' | 'pw'` panel. No new exports beyond the existing `normalizePhone` / `findAccountByIdentifier`.

- [ ] **Step 1: Write the failing tests**

Replace the body of `src/screens/LoginScreen.test.tsx` with this (keeps the existing two tests, adds the reset-flow tests):

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

  it('advances to the code step even when the account is unknown (anti-enumeration)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'not_found', message: 'No such user' } }, 404)))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'ghost@nowhere.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    expect(await screen.findByText(/we've sent a 6-digit code/i)).toBeInTheDocument()
  })

  it('keeps the user on the code step when the code is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_otp', message: 'That code is incorrect.' } }, 400)))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    expect(await screen.findByText('That code is incorrect.')).toBeInTheDocument()
  })

  it('blocks a too-short password without calling set-password', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    await userEvent.type(await screen.findByPlaceholderText(/at least 8 characters/i), 'short')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'short')
    await userEvent.click(screen.getByRole('button', { name: /set password & sign in/i }))
    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2) // request + verify only; no set-password
  })

  it('sets the new password then loads the session on the happy path', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))                            // otp/request
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })) // otp/verify
      .mockResolvedValueOnce(new Response(null, { status: 204 }))                               // set-password
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['admin'] } })) // /auth/me
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    await userEvent.type(await screen.findByPlaceholderText(/at least 8 characters/i), 'newpass123')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'newpass123')
    await userEvent.click(screen.getByRole('button', { name: /set password & sign in/i }))
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(urls.some((u) => u.includes('/auth/set-password'))).toBe(true)
      expect(urls.some((u) => u.includes('/auth/me'))).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/screens/LoginScreen.test.tsx`
Expected: FAIL — no "Forgot password" wiring; clicking it does nothing, so "Reset your password" is never found.

- [ ] **Step 3: Implement the reset panel (replace the whole file)**

Replace the entire contents of `src/screens/LoginScreen.tsx` with:

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
import { otpRequest, otpVerify, setPassword } from '@/api/auth'
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

  /* Password reset/create: verify email/mobile via a one-time code, then set a new password. */
  const [resetOpen, setResetOpen] = useState(false)
  const [resetStep, setResetStep] = useState<'id' | 'code' | 'pw'>('id')
  const [resetId, setResetId] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetPw, setResetPw] = useState('')
  const [resetPw2, setResetPw2] = useState('')
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetErr, setResetErr] = useState<string | null>(null)

  const openReset = () => {
    setResetOpen(true); setResetStep('id')
    setResetId(''); setResetCode(''); setResetPw(''); setResetPw2('')
    setResetMsg(null); setResetErr(null)
  }
  const closeReset = () => { setResetOpen(false); app.clearAuthError() }

  const resetRequest = async () => {
    const v = resetId.trim()
    if (!v) { setResetErr('Enter your email or mobile number.'); return }
    if (!looksLikePhone(v) && validateEmail(v)) { setResetErr('Enter a valid email or mobile number.'); return }
    setResetErr(null)
    try {
      await otpRequest(v)
    } catch (e) {
      // A true network failure blocks advancing. An ApiError (e.g. "not found")
      // falls through to a neutral advance so we never reveal which
      // emails/numbers have accounts (anti-enumeration).
      if (!(e instanceof ApiError)) {
        setResetErr('Could not send a code. Check your connection and try again.')
        return
      }
    }
    setResetMsg(`If an account exists for ${v}, we've sent a 6-digit code.`)
    setResetCode('')
    setResetStep('code')
  }

  const resetVerify = async () => {
    const code = resetCode.trim()
    if (code.length < 4) { setResetErr('Enter the code we sent you.'); return }
    setResetErr(null)
    try {
      await otpVerify(resetId.trim(), code)  // deposits tokens in tokenStore
      setResetStep('pw')
    } catch (e) {
      setResetErr(e instanceof ApiError ? e.message : 'That code is invalid or expired. Try again.')
    }
  }

  const resetSubmit = async () => {
    const pwErr = required(resetPw) ?? validatePassword(resetPw)
    if (pwErr) { setResetErr(pwErr); return }
    const matchErr = passwordsMatch(resetPw, resetPw2)
    if (matchErr) { setResetErr(matchErr); return }
    setResetErr(null)
    try {
      await setPassword(resetPw)  // authenticated by the tokens from resetVerify
    } catch (e) {
      setResetErr(e instanceof ApiError ? e.message : 'Could not set your password. Try again.')
      return
    }
    await app.establishSession(resetId.trim())  // loads /auth/me and navigates to the dashboard
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
                  <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy}>
                    Send one-time code <Icon name="arrowRight" size={16} />
                  </Btn>
                </form>
              )}

              {resetStep === 'code' && (
                <form className="col gap10" onSubmit={(e) => { e.preventDefault(); void resetVerify() }}>
                  {resetMsg && (
                    <div className="sm-login-otp-hint"><Icon name="message" size={14} /><span>{resetMsg}</span></div>
                  )}
                  <Field label="Enter the 6-digit code" error={resetErr ?? undefined}>
                    <Input icon="key" inputMode="numeric" maxLength={6} value={resetCode} onChange={(e) => { setResetCode(e.target.value); setResetErr(null) }} placeholder="••••••" />
                  </Field>
                  <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy}>
                    Verify code <Icon name="arrowRight" size={16} />
                  </Btn>
                  <button type="button" className="sm-login-link" onClick={() => { setResetStep('id'); setResetErr(null) }}>
                    <Icon name="arrowLeft" size={13} /> Use a different email/mobile
                  </button>
                </form>
              )}

              {resetStep === 'pw' && (
                <form className="col gap10" onSubmit={(e) => { e.preventDefault(); void resetSubmit() }}>
                  <Field label="New password" error={resetErr ?? undefined}>
                    <Input icon="lock" type="password" value={resetPw} onChange={(e) => { setResetPw(e.target.value); setResetErr(null) }} placeholder="At least 8 characters" />
                  </Field>
                  <Field label="Confirm new password">
                    <Input icon="lock" type="password" value={resetPw2} onChange={(e) => { setResetPw2(e.target.value); setResetErr(null) }} placeholder="Re-enter your password" />
                  </Field>
                  <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy}>
                    {busy ? <><Spinner size={16} /> Setting password…</> : <>Set password &amp; sign in <Icon name="arrowRight" size={16} /></>}
                  </Btn>
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

              <form className="col gap14" onSubmit={(e) => { e.preventDefault(); signIn(email) }}>
                <Field label="Email address">
                  <Input icon="user" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
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

Notes on this change vs. the original file:
- New imports: `validatePassword, passwordsMatch, required` from validation; `otpVerify, setPassword` from auth; `ApiError` from client.
- Extracted a small `looksLikePhone(v)` helper (used by both `sendCode` and `resetRequest`) — DRY, replaces the duplicated inline regex.
- "Forgot password?" button now has `onClick={openReset}`.
- The `sm-login-form` content is split into a reset branch and the original (unchanged) sign-in branch.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/screens/LoginScreen.test.tsx`
Expected: PASS — all `LoginScreen` and `LoginScreen password reset` tests green.

- [ ] **Step 5: Typecheck + full test suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/screens/LoginScreen.tsx src/screens/LoginScreen.test.tsx
git commit -m "feat(auth): OTP-gated password reset/create flow on LoginScreen"
```

---

## Self-Review

**1. Spec coverage:**
- One shared flow reached from "Forgot password?" → Task 3 (`openReset`, single 3-step panel). ✓
- Live API, reuse `/auth/otp/request`, `/auth/otp/verify`, `/auth/set-password`, `/auth/me` → Tasks 2 & 3. ✓
- Inline panel mirroring OTP-login → Task 3 (`sm-login-form` branch, same CSS classes). ✓
- Anti-enumeration neutral advance; network failure blocks → Task 3 `resetRequest` (`ApiError` discriminator) + test "advances … when the account is unknown". ✓
- Auto sign-in on success → Task 2 `establishSession` + Task 3 `resetSubmit`. ✓
- Password rule min 8 + confirm-match → Task 1 `validatePassword` + Task 3 `required`/`passwordsMatch`. ✓
- Error handling table (steps 1/2/3) → Task 3 handlers + 3 reset tests. ✓
- Tests: unit validatePassword (Task 1) + component flow (Task 3). ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected outcome. ✓

**3. Type consistency:** `establishSession(identifier: string): Promise<void>` declared in the `AppState` interface (Task 2 Step 3), implemented (Step 4), exposed in `value` (Step 5), and consumed in Task 3 `resetSubmit`. `validatePassword` signature matches its use. `looksLikePhone` defined once and used in both `sendCode` and `resetRequest`. ✓
```

## Out of scope (carried from spec)
- Backend/endpoint changes (all endpoints already exist).
- Rate-limiting / resend cooldown UI.
- Password strength meter beyond the min-length rule.
- Changing password while already logged in (separate settings flow).
