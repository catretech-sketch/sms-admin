# OTP Login Option — Design

**Goal:** Add an email/mobile one-time-code (OTP) sign-in option to the SchoolMate login screen, alongside the existing email + password sign-in.

**Scope:** Functional mock only — consistent with the rest of the app. No backend, no real SMS/email delivery, no change to `app.login`'s signature. Login still resolves to a seeded demo account.

---

## Context

`src/screens/LoginScreen.tsx` renders the login screen. Sign-in today calls
`app.login(email)`, which looks up `DEMO_ACCOUNTS` (in `src/context/AppProvider.tsx`)
by email and routes to the matching console/role. The password field is decorative —
it is not verified. There is currently no `LoginScreen.test.tsx`.

`DemoAccount` (in `AppProvider.tsx`) has `email`, `name`, `role`, `console`, `hue` —
**no phone number**. The app already ships `validateEmail` and `validatePhone`
(10–13 digits after stripping non-digits) in `src/lib/validation.ts`.

---

## Layout

Single login screen, top → bottom:

```
┌───────────────────────────┐
│ Welcome back               │
│ Email                      │
│ [____________________]     │
│ Password           [👁]    │
│ [____________________]     │
│ [ Sign in ]                │  ← primary (existing, unchanged behavior)
│ ─────── or ───────         │
│ Email or mobile number     │
│ [____________________]     │
│ [ Send one-time code ]     │  ← OTP (new)
│ [ demo chips… ]            │
└───────────────────────────┘
```

The password block stays first/primary. The OTP block sits below an "or" divider.
Demo chips remain at the bottom, unchanged.

---

## Data — the mock "database"

There is no real database; `DEMO_ACCOUNTS` is the account store. Emails already exist
there. Add a `phone` field so mobile login has something to match:

- Add `phone: string` to the `DemoAccount` interface.
- Seed each of the 5 demo accounts with an Indian-format number (e.g. `+91 98765 43210`),
  each passing `validatePhone` (10–13 digits) and unique.

The OTP code itself is **not** stored — it is generated when "Send code" is clicked and
shown on screen (mock delivery).

---

## OTP flow

Local state in `LoginScreen` drives a two-step flow (`otpStep: 'request' | 'verify'`).

### Request step
- One field: "Email or mobile number" + a "Send one-time code" button.
- On submit:
  1. Validate the entry is a valid email **or** a valid phone (reuse `validateEmail`/`validatePhone`).
     Invalid → inline error, stay on request step.
  2. `findAccountByIdentifier(entry)` → account | null.
     - **null** → error message "No account found for that email or mobile." Stay on request step.
     - **found** → generate a random 6-digit code, store it in state, move to verify step,
       and show the code inline as a hint: "Demo code: 123456".

### Verify step
- A 6-digit code input + "Verify & sign in" button.
- A "← Use a different email/mobile" link returns to the request step (clears the code).
- On submit:
  - Entered code === generated code → `app.login(account.email)`.
  - Mismatch → inline error "Incorrect code." Stay on verify step.

The existing password "Sign in" button is untouched and continues to call `signIn(email)`.

---

## Pure helpers (in `LoginScreen.tsx`, exported for unit tests)

```ts
/** Strip everything but digits, for tolerant phone matching. */
export function normalizePhone(s: string): string

/**
 * Find the demo account whose email (case-insensitive) or normalized phone
 * matches the identifier. Returns the account or null.
 */
export function findAccountByIdentifier(identifier: string): DemoAccount | null
```

`findAccountByIdentifier` matches email case-insensitively/trimmed, and matches phone by
comparing `normalizePhone(identifier)` against `normalizePhone(account.phone)` (so the user
can type with or without `+`, spaces, or country code as long as the digits match).

---

## Testing

New file `src/screens/LoginScreen.test.tsx`:

**Helper units**
- `normalizePhone` strips `+`, spaces, dashes.
- `findAccountByIdentifier` matches by email (any case), matches by phone (formatted and
  raw digits), returns `null` for an unknown identifier.

**Component**
- OTP happy path: type a seeded email → "Send one-time code" → read the shown 6-digit code
  from the DOM → enter it → "Verify & sign in" → app is logged in (assert a logged-in marker).
- Unknown identifier → "No account found" message, no verify step.
- Password path still works: the existing email + password "Sign in" logs in.

Test reads the generated code from the rendered hint, so randomness needs no seeding.

---

## Out of scope (YAGNI)

- Real SMS/email delivery, providers, secrets, backend.
- Code expiry timers, resend cooldowns, rate limiting, attempt lockouts.
- Changing `app.login`'s signature or the password verification (still a mock).
- Remembering OTP as the preferred method across sessions.
