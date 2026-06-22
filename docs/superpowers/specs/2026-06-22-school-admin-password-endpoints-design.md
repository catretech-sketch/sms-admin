# School Admin — Wire Password Create/Reset to Dedicated Endpoints

**Date:** 2026-06-22
**Scope:** `sms-admin` frontend only. Backend endpoints already exist and are live.

## Problem

School Admin's login screen already has a create/forgot-password wizard, but it
uses the **old chained** auth endpoints (`/auth/otp/request` → `/auth/otp/verify`
→ `/auth/set-password`) and **auto-logs the user in** at the end via
`establishSession`. We are switching it to the new dedicated endpoints
(`/auth/password/forgot` + `/auth/password/reset`) so password reset no longer
doubles as a login, matching the backend's intended contract and the Catre Admin
app.

## Decisions

- **Use the new endpoints**: `/auth/password/forgot` (send OTP) and
  `/auth/password/reset` (verify code + set password in one call).
- **No auto-login.** A successful reset closes the wizard and returns the user to
  the sign-in screen with a success notice; they sign in with the new password.
- **Reveal `not_registered`.** Replace the current privacy-preserving neutral
  message with an explicit "that email/mobile isn't registered" on `404`,
  matching Catre Admin. (Conscious change from the old anti-enumeration stance.)
- **Keep email *or* mobile** as the identifier (unchanged from today).
- **Keep the existing 3-step wizard** (id → code → new password). Do not merge
  into a 2-screen flow.
- OTP *login* (the separate "OTP login" button) is **untouched** — it keeps using
  `otpRequest`/`otpVerify`/`loginWithOtp`.

## Components

### 1. API layer — `src/api/auth.ts`

Add two functions alongside the existing ones:

```ts
export async function passwordForgot(identifier: string): Promise<{ sent: boolean }> {
  return request('/auth/password/forgot', { method: 'POST', body: { identifier } })
}

export async function passwordReset(identifier: string, code: string, password: string): Promise<void> {
  await request('/auth/password/reset', { method: 'POST', body: { identifier, code, password } })
}
```

### 2. Client safety — `src/api/client.ts`

Add both paths to the `NO_AUTH` set so a `401 invalid_code` from `/password/reset`
is surfaced as a normal `ApiError` instead of triggering the token-refresh /
logout path:

```
'/auth/password/forgot', '/auth/password/reset'
```

### 3. Reset wizard — `src/screens/LoginScreen.tsx`

Rewire the three reset handlers (the rest of the screen and the OTP-login block
stay as-is):

- **`resetRequest`** (id step): call `passwordForgot(v)`.
  - `404 not_registered` → set error "That email or mobile number isn't registered."
    and **stay on the id step**.
  - other `ApiError` → show `e.message`.
  - non-`ApiError` (network) → "Could not send a code. Check your connection and try again."
  - success → advance to the code step, show "We've sent a 6-digit code to {v}."
- **`resetVerify`** (code step): **no API call**. Validate `code.length === 6`,
  clear error, advance to the password step. (Verification now happens in the
  reset call.)
- **`resetSubmit`** (pw step): run existing `validatePassword` + `passwordsMatch`
  guards, then call `passwordReset(resetId.trim(), resetCode.trim(), resetPw)`.
  - success → close the wizard (`setResetOpen(false)`), set a sign-in-screen
    success notice "Password set. Sign in with your new password." **Do not call
    `establishSession`.**
  - `401 invalid_code` → error "That code is incorrect or expired." (offer "Use a
    different email/mobile" / back to code step).
  - `422 weak_password` → error "Password must be at least 8 characters."
  - other → `e.message` / generic.

Add a `notice` state shown above the sign-in form (cleared when the user edits the
email/password or reopens the wizard).

Remove the now-unused `otpVerify` / `setPassword` imports from the reset path if no
longer referenced elsewhere in the file (OTP login uses `loginWithOtp` via the app
context, not these directly — verify before removing).

## Error handling summary

| Condition | Source | UI |
| --- | --- | --- |
| Unregistered identifier | `404 not_registered` | Inline error on id step; stay put |
| Wrong/expired/missing code | `401 invalid_code` | Inline error on pw step; can go back to code |
| Password < 8 chars | `422 weak_password` | Inline error on pw step |
| Network failure on forgot | non-ApiError | Generic "check your connection" |
| Client-side: weak/mismatch | local validation | Inline before any call |

## Testing

- `src/screens/LoginScreen.test.tsx`:
  - forgot with unregistered identifier → reveals "isn't registered", stays on id step
  - full flow id → code → new password → wizard closes, success notice shown on
    sign-in, `me()` / session NOT established (no auto-login)
  - reset with invalid code → error shown, stays in wizard
- `src/api/auth.test.ts`: `passwordForgot` posts identifier; `passwordReset` posts
  identifier+code+password.
- `src/api/client.test.ts`: a `401` from `/auth/password/reset` throws `ApiError`
  without calling `onAuthFailure` or clearing tokens.
- Run full `npx vitest run` and `npx tsc --noEmit`.

## Out of scope

- Any backend change (endpoints already exist).
- The OTP-login flow, password-login flow, and demo accounts.
- Phone-number formatting/normalization changes (identifier is sent as typed,
  same as today).
- Merging the wizard into fewer steps.
