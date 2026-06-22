# OTP-gated password reset / create flow — Design

**Date:** 2026-06-22
**Status:** Approved (design)
**Area:** `sms-admin` authentication (LoginScreen)

## Summary

A single inline flow that lets a user set a password by verifying ownership of
their email or mobile via a one-time code. It serves both cases:

- **Create password** — first-time users who have no password yet.
- **Forgot password** — existing users resetting a forgotten password.

Both are the *same* flow; there is no separate UI or backend path for the two
cases. The flow is reached from the existing (currently dead) **"Forgot
password?"** link on `LoginScreen`.

## Decisions

| Decision | Choice |
|---|---|
| Flow shape | One shared flow for create + forgot |
| Backend | Live API, reusing existing endpoints — no backend changes |
| UI placement | Inline panel on `LoginScreen` (mirrors the existing OTP-login panel) |
| Account existence | Anti-enumeration: always advance after requesting a code with a neutral message |
| On success | Auto sign-in (land in the user's dashboard) |
| Password rule | Minimum 8 characters (configurable), plus confirm-match |

## Existing building blocks (reused, unchanged)

From `src/api/auth.ts`:

- `otpRequest(identifier)` → `POST /auth/otp/request` → `{ sent }`
- `otpVerify(identifier, code)` → `POST /auth/otp/verify` → tokens, sets `tokenStore`
- `setPassword(password)` → `POST /auth/set-password` (requires auth token)

From `src/lib/validation.ts`:

- `validateEmail`, `validatePhone`, `passwordsMatch`

From `src/context/AppProvider.tsx`:

- private `finishLogin(email)` → `/auth/me` + `applySession` (console/role/view)

The whole flow composes these existing endpoints. **No new backend endpoints.**

## Flow — three inline steps

The "Forgot password?" link opens a step panel driven by local state
`resetStep: 'id' | 'code' | 'pw'`, replacing the form region (same approach as
the existing `otpStep` OTP-login panel).

### Step 1 — Identify
- Input: email or mobile number.
- Validate shape using the same email-vs-phone routing already in `sendCode`
  (digits/`+`/`-`/spaces/parens ⇒ phone; otherwise email).
- Call `otpRequest(identifier)`.
- **Anti-enumeration:** on any non-network outcome, advance to Step 2 with a
  neutral message: *"If an account exists for {identifier}, we've sent a 6-digit
  code."* Do not reveal whether the account exists.
- Network failure → show error, stay on Step 1.

### Step 2 — Verify code
- Input: 6-digit code.
- Call `otpVerify(identifier, code)`. On success this sets tokens in
  `tokenStore` — the user is now authenticated but **not yet navigated**.
- Invalid/expired code → surface `ApiError.message` inline; stay on Step 2.
- Secondary actions: **Resend code** (re-calls `otpRequest`) and **Use a
  different email/mobile** (back to Step 1).
- On success → Step 3.

### Step 3 — Set password
- Inputs: new password + confirm password.
- Validate locally first (no network): `validatePassword` (min length) and
  `passwordsMatch`.
- Call `setPassword(password)` (authenticated by the Step-2 tokens).
- On success → establish the session → land in the dashboard.
- `setPassword` API error → show error, allow retry (Step-2 tokens still valid).

## Code changes

### `src/screens/LoginScreen.tsx`
- Wire the dead "Forgot password?" button to open the reset panel.
- Add local state for `resetStep`, identifier, code, password fields, and error.
- Reuse `Field`/`Input`/`Btn`/`Icon` and the existing email/phone shape check.
- Call `otpRequest`, `otpVerify`, `setPassword` directly (the component already
  calls `otpRequest` directly today in `sendCode`).
- After `setPassword` succeeds, call the new `establishSession(identifier)`.

### `src/context/AppProvider.tsx`
- Expose **one** new action `establishSession(identifier: string): Promise<void>`
  that wraps the existing private `finishLogin` plus `authBusy`/`authError`
  handling and `applySession`.
- Refactor `loginWithOtp` to reuse `establishSession` (DRY — it currently does
  `otpVerify` + `finishLogin`).
- Add `establishSession` to the `AppState` interface and the context value.

### `src/lib/validation.ts`
- Add `validatePassword(value)` returning an error string or `null`; rule:
  minimum **8** characters. Empty handled per the file's existing convention
  (required-ness enforced separately at the call site).
- Reuse the existing `passwordsMatch`.

## Error handling summary

| Step | Failure | Behavior |
|---|---|---|
| 1 Identify | Network error | Inline error, stay on Step 1 |
| 1 Identify | Account missing | Indistinguishable — neutral advance to Step 2 |
| 2 Verify | Wrong/expired code | `ApiError.message` inline, stay; offer resend |
| 3 Password | Weak / mismatch | Local validation, no network call |
| 3 Password | `setPassword` API error | Inline error, retry (tokens still valid) |

## Testing

- **Unit** (`src/lib/validation.test.ts`): `validatePassword` — too short, exactly
  at the boundary, valid, empty.
- **Component** (`src/screens/LoginScreen.test.tsx`, React Testing Library):
  mock the `@/api/auth` functions and assert:
  - "Forgot password?" opens Step 1.
  - Submitting an identifier advances to Step 2 and shows the neutral message
    (even when `otpRequest` resolves).
  - Invalid code keeps the user on Step 2 and shows the error.
  - Valid code advances to Step 3.
  - Weak/mismatched password is blocked locally (no `setPassword` call).
  - Valid password calls `setPassword` then `establishSession`.

## Out of scope

- Backend/endpoint changes (all endpoints already exist).
- Rate-limiting / resend cooldown UI (can be added later).
- Password strength meter beyond the min-length rule.
- Changing password while already logged in (a separate settings flow).
