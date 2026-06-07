/* ============================================================
   SchoolMate — Login screen (role-locked demo accounts)
   ============================================================ */
import { useState } from 'react'
import { useApp } from '@/lib/hooks'
import { DEMO_ACCOUNTS } from '@/context/AppProvider'
import { ROLE_META } from '@/data/mockDb'
import { Icon, Field, Input, Btn, Checkbox, Spinner, Avatar } from '@/components/ui'

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
        <form className="sm-login-form" onSubmit={(e) => { e.preventDefault(); signIn(email) }}>
          <h2>Welcome back</h2>
          <p className="lead">Sign in to your SchoolMate workspace.</p>

          <div className="col gap14">
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
          </div>

          <div className="sm-login-row">
            <Checkbox checked={remember} onChange={setRemember} label="Remember me" />
            <button type="button" className="sm-login-link">Forgot password?</button>
          </div>

          <Btn type="submit" variant="primary" size="lg" style={{ width: '100%' }} disabled={busy}>
            {busy ? <><Spinner size={16} /> Signing in…</> : <>Sign in <Icon name="arrowRight" size={16} /></>}
          </Btn>

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
        </form>
      </div>
    </div>
  )
}
