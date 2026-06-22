# School Admin Password Create/Reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire School Admin's create/forgot-password wizard to the dedicated `/auth/password/forgot` + `/auth/password/reset` endpoints — no auto-login, reveal `not_registered`, keep email/mobile and the 3-step wizard.

**Architecture:** Add two functions to the `sms-admin` API layer, mark both paths no-auth in the client, and rewire the three reset handlers in `LoginScreen.tsx`. The OTP-login and password-login paths are untouched. Backend is unchanged (endpoints already live).

**Tech Stack:** React 19 + TypeScript + Vite, Vitest + @testing-library/react. Tests drive the real client→`fetch` path by stubbing `globalThis.fetch`.

## Global Constraints

- New endpoints: `POST /auth/password/forgot` body `{ identifier }`; `POST /auth/password/reset` body `{ identifier, code, password }`.
- Success bodies are `{ "data": ... }`; errors `{ "error": { code, message } }`; keys `snake_case`.
- `/auth/password/reset` returns `204` (no body, **no tokens**) — do NOT establish a session after it.
- Error codes to handle: `not_registered` (404), `invalid_code` (401), `weak_password` (422).
- Reveal `not_registered` (no anti-enumeration). Keep email **or** mobile as identifier.
- Both new paths MUST be in the client `NO_AUTH` set so a `401` is a normal `ApiError`, not a session expiry.
- Password min length 8 (existing `validatePassword`). Reset button label is `Set password`.

---

### Task 1: API layer + no-auth client wiring

**Files:**
- Modify: `src/api/auth.ts` (add two functions)
- Modify: `src/api/client.ts:11` (extend `NO_AUTH`)
- Test: `src/api/auth.test.ts`, `src/api/client.test.ts`

**Interfaces:**
- Consumes: `request` from `./client`.
- Produces: `passwordForgot(identifier: string): Promise<{ sent: boolean }>`; `passwordReset(identifier: string, code: string, password: string): Promise<void>`.

- [ ] **Step 1: Write the failing API tests**

In `src/api/auth.test.ts`, change the import line to include the new functions:

```ts
import { otpRequest, otpVerify, login, me, logout, passwordForgot, passwordReset } from './auth'
```

Add these two tests inside the `describe('auth', ...)` block (after the `logout` test):

```ts
  it('passwordForgot posts the identifier and returns {sent}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { sent: true } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await passwordForgot('a@b.edu')).toEqual({ sent: true })
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/password/forgot')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ identifier: 'a@b.edu' })
  })

  it('passwordReset posts identifier, code, and password', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await passwordReset('a@b.edu', '123456', 'newpass123')
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/password/reset')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string))
      .toEqual({ identifier: 'a@b.edu', code: '123456', password: 'newpass123' })
  })
```

In `src/api/client.test.ts`, add this test inside the `describe('request', ...)` block (after the "clears tokens and fires onAuthFailure when refresh fails" test):

```ts
  it('does not refresh or clear tokens on a 401 from /auth/password/reset', async () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    const onFail = vi.fn()
    setOnAuthFailure(onFail)
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_code', message: 'code invalid or expired' } }, 401))
    vi.stubGlobal('fetch', fetchMock)
    await expect(request('/auth/password/reset', { method: 'POST', body: {} }))
      .rejects.toMatchObject({ status: 401, code: 'invalid_code' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(onFail).not.toHaveBeenCalled()
    expect(tokenStore.getRefresh()).toBe('r1')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api/auth.test.ts src/api/client.test.ts`
Expected: FAIL — `passwordForgot`/`passwordReset` are not exported (auth.test.ts import error); the client test fails because `/auth/password/reset` is not in `NO_AUTH`, so the `401` triggers a refresh attempt (extra fetch call / `onAuthFailure` fired).

- [ ] **Step 3: Add the API functions**

In `src/api/auth.ts`, append after `setPassword`:

```ts

/** Send an OTP to a registered email/phone so the user can set a new password.
 *  Throws ApiError `not_registered` (404) when the identifier has no account. */
export async function passwordForgot(identifier: string): Promise<{ sent: boolean }> {
  return request('/auth/password/forgot', { method: 'POST', body: { identifier } })
}

/** Verify the OTP and set the new password in one call. No session is issued
 *  (the user signs in afterwards). Throws ApiError `invalid_code` (401) for a
 *  bad/expired code or `weak_password` (422) for a password under 8 chars. */
export async function passwordReset(identifier: string, code: string, password: string): Promise<void> {
  await request('/auth/password/reset', { method: 'POST', body: { identifier, code, password } })
}
```

- [ ] **Step 4: Extend the no-auth set**

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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/api/auth.test.ts src/api/client.test.ts`
Expected: PASS (all auth + client tests green).

- [ ] **Step 6: Commit**

```bash
git add src/api/auth.ts src/api/client.ts src/api/auth.test.ts src/api/client.test.ts
git commit -m "feat(auth): add passwordForgot/passwordReset api + mark no-auth"
```

---

### Task 2: Rewire the LoginScreen reset wizard

**Files:**
- Modify: `src/screens/LoginScreen.tsx` (imports, three reset handlers, success notice, button label)
- Test: `src/screens/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `passwordForgot`, `passwordReset` (Task 1); existing `otpRequest`, `validateEmail`, `required`, `validatePassword`, `passwordsMatch`, `ApiError`, `looksLikePhone`.
- Produces: no exports (screen behavior only).

- [ ] **Step 1: Update the failing screen tests**

In `src/screens/LoginScreen.test.tsx`, replace the four tests inside `describe('LoginScreen password reset', ...)` that follow the "opens the reset panel" test (i.e. the `anti-enumeration`, `invalid code`, `too-short password`, and `happy path` tests) with these four:

```ts
  it('reveals an unregistered identifier and stays on the id step', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'not_registered', message: 'Email is not registered.' } }, 404)))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'ghost@nowhere.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    expect(await screen.findByText(/isn't registered/i)).toBeInTheDocument()
    // Stayed on the id step — no 6-digit code input rendered.
    expect(screen.queryByPlaceholderText('••••••')).not.toBeInTheDocument()
  })

  it('shows an error when the reset code is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))                                              // password/forgot
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_code', message: 'code invalid or expired' } }, 401))) // password/reset
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    await userEvent.type(await screen.findByPlaceholderText(/at least 8 characters/i), 'newpass123')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'newpass123')
    await userEvent.click(screen.getByRole('button', { name: /set password/i }))
    expect(await screen.findByText(/that code is incorrect or expired/i)).toBeInTheDocument()
  })

  it('blocks a too-short password without calling reset', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { sent: true } })) // password/forgot only
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    await userEvent.type(await screen.findByPlaceholderText(/at least 8 characters/i), 'short')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'short')
    await userEvent.click(screen.getByRole('button', { name: /set password/i }))
    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1) // forgot only; code step makes no call, reset blocked client-side
  })

  it('sets the new password then returns to sign in (no auto-login)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))  // password/forgot
      .mockResolvedValueOnce(new Response(null, { status: 204 }))     // password/reset
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    await userEvent.type(screen.getByPlaceholderText(/you@school.edu or/i), 'admin@greenwood.edu')
    await userEvent.click(screen.getByRole('button', { name: /send one-time code/i }))
    await userEvent.type(await screen.findByPlaceholderText('••••••'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }))
    await userEvent.type(await screen.findByPlaceholderText(/at least 8 characters/i), 'newpass123')
    await userEvent.type(screen.getByPlaceholderText(/re-enter your password/i), 'newpass123')
    await userEvent.click(screen.getByRole('button', { name: /set password/i }))
    expect(await screen.findByText(/password set\. sign in/i)).toBeInTheDocument()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/auth/password/reset'))).toBe(true)
    expect(urls.some((u) => u.includes('/auth/me'))).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
```

- [ ] **Step 2: Run the screen tests to verify they fail**

Run: `npx vitest run src/screens/LoginScreen.test.tsx`
Expected: FAIL — the old handlers still call `otpRequest`/`otpVerify`/`setPassword` and auto-login, so: the unregistered test still advances (no "isn't registered"), the happy path still hits `/auth/me`, and the button name `set password` may not match the old `set password & sign in` label.

- [ ] **Step 3: Update imports and add the notice state**

In `src/screens/LoginScreen.tsx`, change the auth import (line 10) from:

```ts
import { otpRequest, otpVerify, setPassword } from '@/api/auth'
```

to:

```ts
import { otpRequest, passwordForgot, passwordReset } from '@/api/auth'
```

Add a `notice` state next to the other reset state (after the `const [resetBusy, setResetBusy] = useState(false)` line):

```ts
  const [notice, setNotice] = useState<string | null>(null)
```

In `openReset`, clear the notice — change its body to also reset it:

```ts
  const openReset = () => {
    setResetOpen(true); setResetStep('id')
    setResetId(''); setResetCode(''); setResetPw(''); setResetPw2('')
    setResetMsg(null); setResetErr(null); setNotice(null)
  }
```

- [ ] **Step 4: Rewire the three reset handlers**

Replace `resetRequest`, `resetVerify`, and `resetSubmit` (the block from `const resetRequest = async () => {` through the end of `resetSubmit`) with:

```ts
  // Step 1 — send the OTP to a registered identifier (reveals not-registered).
  const resetRequest = async () => {
    if (resetBusy) return
    const v = resetId.trim()
    if (!v) { setResetErr('Enter your email or mobile number.'); return }
    if (!looksLikePhone(v) && validateEmail(v)) { setResetErr('Enter a valid email or mobile number.'); return }
    setResetErr(null)
    setResetBusy(true)
    try {
      await passwordForgot(v)
    } catch (e) {
      if (e instanceof ApiError) {
        setResetErr(e.code === 'not_registered'
          ? "That email or mobile number isn't registered."
          : e.message)
      } else {
        setResetErr('Could not send a code. Check your connection and try again.')
      }
      return
    } finally {
      setResetBusy(false)
    }
    setResetMsg(`We've sent a 6-digit code to ${v}.`)
    setResetCode('')
    setResetStep('code')
  }

  // Step 2 — collect the code only; it is verified together with the password in step 3.
  const resetVerify = () => {
    const code = resetCode.trim()
    if (code.length < 6) { setResetErr('Enter the code we sent you.'); return }
    setResetErr(null)
    setResetStep('pw')
  }

  // Step 3 — verify the code and set the new password in one call. No auto-login:
  // on success, close the wizard and return to sign-in with a confirmation notice.
  const resetSubmit = async () => {
    if (resetBusy) return
    const pwErr = required(resetPw) ?? validatePassword(resetPw)
    if (pwErr) { setResetErr(pwErr); return }
    const matchErr = passwordsMatch(resetPw, resetPw2)
    if (matchErr) { setResetErr(matchErr); return }
    setResetErr(null)
    setResetBusy(true)
    try {
      await passwordReset(resetId.trim(), resetCode.trim(), resetPw)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'invalid_code') setResetErr('That code is incorrect or expired.')
      else if (e instanceof ApiError && e.code === 'weak_password') setResetErr('Password must be at least 8 characters.')
      else setResetErr(e instanceof ApiError ? e.message : 'Could not set your password. Try again.')
      return
    } finally {
      setResetBusy(false)
    }
    setResetOpen(false)
    setNotice('Password set. Sign in with your new password.')
  }
```

- [ ] **Step 5: Update the code-step form, the button label, and render the notice**

In `LoginScreen.tsx`, the code-step form currently calls `void resetVerify()`. Change its `onSubmit` to call the now-synchronous handler:

```tsx
                <form className="col gap10" onSubmit={(e) => { e.preventDefault(); resetVerify() }}>
```

Change the password-step submit button label from `Set password & sign in` to `Set password`:

```tsx
                  <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy || resetBusy}>
                    {(busy || resetBusy) ? <><Spinner size={16} /> Setting password…</> : <>Set password <Icon name="arrowRight" size={16} /></>}
                  </Btn>
```

In the sign-in view (the `else` branch), render the success notice just after the `<p className="lead">Sign in to your SchoolMate workspace.</p>` line:

```tsx
              {notice && (
                <div className="sm-login-otp-hint" style={{ color: '#15a06a' }}>{notice}</div>
              )}
```

- [ ] **Step 6: Run the screen tests to verify they pass**

Run: `npx vitest run src/screens/LoginScreen.test.tsx`
Expected: PASS (all `LoginScreen` tests green, including the two unchanged sign-in/OTP tests).

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npx vitest run`
Expected: PASS (whole suite green).
Run: `npx tsc --noEmit`
Expected: no output (clean — confirms `otpVerify`/`setPassword` are no longer referenced and nothing else broke).

- [ ] **Step 8: Commit**

```bash
git add src/screens/LoginScreen.tsx src/screens/LoginScreen.test.tsx
git commit -m "feat(auth): School Admin reset uses password/forgot+reset (no auto-login)"
```

---

## Self-Review

**Spec coverage:**
- New `passwordForgot`/`passwordReset` API fns → Task 1 Step 3. ✓
- `NO_AUTH` for both paths (401 not a session expiry) → Task 1 Step 4 + client test. ✓
- `resetRequest` reveals `not_registered`, stays on id → Task 2 Step 4 + test. ✓
- `resetVerify` no API call, advances → Task 2 Step 4 + (covered by happy/invalid tests). ✓
- `resetSubmit` calls `passwordReset`, no auto-login, success notice → Task 2 Steps 4–5 + happy-path test. ✓
- Error handling `invalid_code`/`weak_password`/network/client-validation → Task 2 Step 4 + tests. ✓
- Keep email/mobile (`looksLikePhone`/`validateEmail` guard retained) → Task 2 Step 4. ✓
- Keep 3-step wizard; OTP-login untouched → only the three handlers/label/notice change. ✓
- Min-8 password (`validatePassword`) → Task 2 Step 4. ✓

**Placeholder scan:** none — every step shows full code and exact commands.

**Type consistency:** `passwordForgot(identifier): Promise<{sent}>` and `passwordReset(identifier, code, password): Promise<void>` are defined in Task 1 and consumed with matching arity in Task 2. `resetVerify` becomes synchronous and its single call site is updated (Task 2 Step 5). Removed imports (`otpVerify`, `setPassword`) are verified unused by `tsc --noEmit` (Task 2 Step 7).
