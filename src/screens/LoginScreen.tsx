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
    if (code.length < 6) { setResetErr('Enter the code we sent you.'); return }
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
