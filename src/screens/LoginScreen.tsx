/* ============================================================
   SchoolMate — Login screen (role-locked demo accounts)
   ============================================================ */
import { useState } from 'react'
import { useApp } from '@/lib/hooks'
import { DEMO_ACCOUNTS, type DemoAccount } from '@/context/AppProvider'
import { ROLE_META } from '@/data/mockDb'
import { Icon, Field, Input, Btn, Checkbox, Spinner, Avatar } from '@/components/ui'
import { validateEmail, validatePhone } from '@/lib/validation'

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
  const [busy, setBusy] = useState(false)

  const signIn = (e: string) => {
    setBusy(true)
    setTimeout(() => { app.login(e); setBusy(false) }, 450)
  }

  /* OTP sign-in (mock): request a code, then verify it. */
  const [otpId, setOtpId] = useState('')
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request')
  const [otpAcc, setOtpAcc] = useState<DemoAccount | null>(null)
  const [sentCode, setSentCode] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [otpErr, setOtpErr] = useState<string | null>(null)

  const sendCode = () => {
    const v = otpId.trim()
    if (!v) { setOtpErr('Enter your email or mobile number.'); return }
    const err = v.includes('@') ? validateEmail(v) : validatePhone(v)
    if (err) { setOtpErr(err); return }
    const acc = findAccountByIdentifier(v)
    if (!acc) { setOtpErr('No account found for that email or mobile.'); return }
    const code = String(Math.floor(100000 + Math.random() * 900000))
    setOtpAcc(acc)
    setSentCode(code)
    setOtpInput('')
    setOtpErr(null)
    setOtpStep('verify')
  }

  const verifyCode = () => {
    if (otpInput.trim() !== sentCode) { setOtpErr('Incorrect code.'); return }
    if (otpAcc) app.login(otpAcc.email)
  }

  const backToRequest = () => {
    setOtpStep('request')
    setSentCode('')
    setOtpInput('')
    setOtpErr(null)
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
          <h2>Welcome back</h2>
          <p className="lead">Sign in to your SchoolMate workspace.</p>

          <form className="col gap14" onSubmit={(e) => { e.preventDefault(); signIn(email) }}>
            <Field label="Email address">
              <Input icon="user" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
            </Field>
            <Field label="Password">
              <div style={{ position: 'relative' }}>
                <Input icon="lock" type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
                <button type="button" className="sm-login-pw-toggle" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password">
                  <Icon name="eye" size={16} />
                </button>
              </div>
            </Field>

            <div className="sm-login-row">
              <Checkbox checked={remember} onChange={setRemember} label="Remember me" />
              <button type="button" className="sm-login-link">Forgot password?</button>
            </div>

            <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy}>
              {busy ? <><Spinner size={16} /> Signing in…</> : <>Sign in <Icon name="arrowRight" size={16} /></>}
            </Btn>
          </form>

          <div className="sm-login-or"><span>or sign in with a one-time code</span></div>

          {otpStep === 'request' ? (
            <form className="col gap10" onSubmit={(e) => { e.preventDefault(); sendCode() }}>
              <Field label="Email or mobile number" error={otpErr ?? undefined}>
                <Input icon="phone" value={otpId} onChange={(e) => { setOtpId(e.target.value); setOtpErr(null) }} placeholder="you@school.edu or +91…" />
              </Field>
              <Btn type="submit" variant="secondary" size="lg" style={{ width: '100%' }}>
                Send one-time code <Icon name="arrowRight" size={16} />
              </Btn>
            </form>
          ) : (
            <form className="col gap10" onSubmit={(e) => { e.preventDefault(); verifyCode() }}>
              <div className="sm-login-otp-hint">Demo code: <b>{sentCode}</b></div>
              <Field label="Enter the 6-digit code" error={otpErr ?? undefined}>
                <Input icon="key" inputMode="numeric" maxLength={6} value={otpInput} onChange={(e) => { setOtpInput(e.target.value); setOtpErr(null) }} placeholder="••••••" />
              </Field>
              <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }}>
                Verify &amp; sign in <Icon name="arrowRight" size={16} />
              </Btn>
              <button type="button" className="sm-login-link" onClick={backToRequest}>
                <Icon name="arrowLeft" size={13} /> Use a different email/mobile
              </button>
            </form>
          )}

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
        </div>
      </div>
    </div>
  )
}
