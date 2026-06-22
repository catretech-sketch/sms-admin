# Password reset — real `/auth/password/*` API rebind — Design

**Date:** 2026-06-22
**Status:** Approved (design)
**Area:** `sms-admin` authentication (LoginScreen)
**Supersedes:** `2026-06-22-otp-password-reset-design.md` — that spec assumed
`/auth/otp/request` → `/auth/otp/verify` (tokens) → `/auth/set-password`
(authenticated) → auto sign-in. The real backend exposes dedicated
password-reset endpoints with a different shape; this spec overrides the API
binding and the post-success behavior of that earlier design.

## Why this rework

The shipped feature (commits f2a37c0..db3e2b9) composed the OTP-login
endpoints to reset a password. The real backend has dedicated endpoints that
differ in three material ways:

1. `/auth/password/reset` takes **identifier + code + password in one call** —
   "verify code" and "set password" are no longer separate API calls.
2. `/auth/password/reset` returns **204 with no tokens** — the previous
   auto-sign-in (which relied on `otpVerify` returning tokens) is gone.
3. `/auth/password/forgot` returns a distinct **404 `not_registered`** — this
   collides with the earlier anti-enumeration choice.

## Backend contract (base `http://localhost:5162/v1`; `config.apiBaseUrl` already includes `/v1`)

All keys snake_case; success wrapped in `{ "data": ... }`; errors
`{ "error": { "code", "message" } }`. Treat `/password/forgot` and
`/password/reset` as **no-auth** (no bearer; a 401 is a normal error, not
session expiry).

### POST /auth/password/forgot
- body: `{ "identifier": "user@school.com" }` (email or phone)
- `200` → `{ "data": { "sent": true } }`
- `404` → `error.code = "not_registered"`
- `429` → `error.code = "rate_limited"`

### POST /auth/password/reset
- body: `{ "identifier", "code": "123456", "password": "newPass123" }`
- `204` → success (empty body, no tokens)
- `401` → `error.code = "invalid_code"` (bad / expired / missing code)
- `422` → `error.code = "weak_password"` (< 8 chars)
- `429` → `error.code = "rate_limited"`

### POST /auth/login (existing — used to sign in after reset)
- body: `{ "email", "password" }`
- `200` → `{ "data": { "access_token", "refresh_token" } }`
- `401` → `error.code = "invalid_credentials"`

## Decisions

| Decision | Choice |
|---|---|
| Flow shape | 2 steps: identify → (code + password together, one reset call) |
| After reset | Return to login + success banner (204 has no tokens) |
| Not-registered | Surface "No account is registered for this email/mobile." |
| forgot/reset auth | No-auth: added to the client `NO_AUTH` set |

## API bindings — `src/api/auth.ts`

Add:

```ts
export async function passwordForgot(identifier: string): Promise<{ sent: boolean }> {
  return request('/auth/password/forgot', { method: 'POST', body: { identifier } })
}

export async function passwordReset(identifier: string, code: string, password: string): Promise<void> {
  await request('/auth/password/reset', { method: 'POST', body: { identifier, code, password } })
}
```

Unchanged:
- `otpRequest` / `otpVerify` — still used by **OTP login**.
- `setPassword` (`/auth/set-password`) — pre-existing; the logged-in
  change-password binding. Currently unconsumed; reserved for a future
  settings flow. Not removed.

## Client no-auth — `src/api/client.ts`

The `NO_AUTH` set currently holds `/auth/otp/request`, `/auth/otp/verify`,
`/auth/refresh`, `/auth/login`. Add `/auth/password/forgot` and
`/auth/password/reset`. Effect: `executeWithRefresh` skips the
refresh-on-401 / `onAuthFailure` path for these, so a `401 invalid_code` is
returned as a normal `ApiError` instead of clearing the session.

## Flow — two inline steps on LoginScreen

Reuse the existing inline-panel pattern. `resetStep: 'id' | 'reset'`.

### Step `id` — identify
- Input: email or mobile (validate shape via the existing `looksLikePhone`
  / `validateEmail` check).
- Call `passwordForgot(identifier)`:
  - `200` → advance to step `reset`.
  - `404 not_registered` → "No account is registered for this email/mobile." (stay)
  - `429 rate_limited` → "Too many requests — please wait a minute and try again." (stay)
  - network failure (non-`ApiError`) → "Could not send a code. Check your connection and try again." (stay)

### Step `reset` — code + new password
- Inputs: 6-digit code, new password, confirm password.
- Local validation first (no network): code length is 6; `required(password)`,
  `validatePassword(password)` (min 8), `passwordsMatch(password, confirm)`.
- Call `passwordReset(identifier, code, password)`:
  - `204` → success → return to login (see below).
  - `401 invalid_code` → "That code is invalid or expired. Request a new one." (stay)
  - `422 weak_password` → "Password is too weak — use at least 8 characters." (backstop; stay)
  - `429 rate_limited` → "Too many attempts — please wait and try again." (stay)
  - network failure → "Could not reset your password. Check your connection and try again." (stay)
- Secondary links: **Resend code** (re-calls `passwordForgot(identifier)`) and
  **Use a different email/mobile** (back to step `id`).

A small helper maps an `ApiError` to friendly copy by `.code`:

```ts
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
```

Keep the `resetBusy` re-entrancy guard (from the prior double-submit fix) on
both async handlers.

## After success → return to login

On `204`:
- Close the reset panel (`resetStep` back to `id`, clear reset fields).
- Show a success banner above the sign-in form: "Password updated — sign in
  with your new password."
- Prefill the email field with the identifier **if it is email-shaped**
  (a phone identifier just shows the banner; `/auth/login` takes an email).
- No tokens, no navigation — the user signs in via the existing password form.

Banner state lives in `LoginScreen` (e.g. `resetDone: boolean`); it clears
when the user edits the email field or reopens the reset panel.

## Removals / cleanup

- `establishSession` (added in the superseded design for auto-sign-in) is now
  unused → remove from the `AppState` interface, the `AppProvider`
  implementation, and the context `value`; delete its test in
  `AppProvider.test.tsx`. The existing auth tests (password login, bad creds,
  owner routing, unknown role, logout) stay green.
- Keep the `runAuth` DRY wrapper — still used by `loginWithPassword` and
  `loginWithOtp`.
- Keep `validatePassword`.

## Error handling summary

| Step | Result | UI |
|---|---|---|
| id | 200 | advance to `reset` |
| id | 404 not_registered | inline "no account" message, stay |
| id | 429 rate_limited | inline rate-limit message, stay |
| id | network | inline connection message, stay |
| reset | local invalid (code≠6 / weak / mismatch) | inline, no network call |
| reset | 204 | return to login + banner (+ email prefill if email-shaped) |
| reset | 401 invalid_code | inline, stay |
| reset | 422 weak_password | inline (backstop), stay |
| reset | 429 rate_limited | inline, stay |
| reset | network | inline connection message, stay |

## Testing

- **`src/api/auth.test.ts`**: `passwordForgot` posts to `/auth/password/forgot`
  and returns `{ sent: true }`; `passwordReset` posts to
  `/auth/password/reset` and resolves on 204; a 401/422/429 rejects with an
  `ApiError` carrying the right `.code`.
- **`src/api/client.test.ts`**: a `401` from `/auth/password/reset` does NOT
  trigger token refresh or `onAuthFailure` (it's in `NO_AUTH`) — it surfaces
  as an `ApiError`.
- **`src/screens/LoginScreen.test.tsx`** (rewrite the reset tests for 2 steps):
  - "Forgot password?" opens step `id`.
  - 404 not_registered shows the "no account" message and stays on step `id`.
  - Happy path: identifier → `/auth/password/forgot` (200) → enter code +
    password → `/auth/password/reset` (204) → back on the sign-in form with
    the success banner.
  - Invalid code (`401`) stays on step `reset` with the error.
  - Too-short password is blocked locally (no `/auth/password/reset` call).
- **`src/context/AppProvider.test.tsx`**: remove the `establishSession` test.

## Out of scope
- Auto-login after reset (chose return-to-login; `/auth/login` is email-only).
- A logged-in change-password UI (the `set-password` endpoint exists but has
  no surface yet).
- Resend cooldown timer UI (the backend rate-limits; we surface 429).
- Backend changes (endpoints already exist).
