/* ============================================================
   SchoolMate — Tier + role gates
   ============================================================ */
import type { ReactNode } from 'react'
import type { Cap } from '@/types'
import { useApp } from '@/lib/hooks'
import { tierIncludes, requiredTier, can } from '@/lib/gating'
import { TIER_META } from '@/data/mockDb'
import { Icon, Btn, TierPill, PageHead, Empty } from '@/components/ui'

/* Wrap any feature. If the current plan doesn't include it -> blurred lock-gate. */
export function TierGate({ feature, title, blurb, minHeight = 220, children }: {
  feature: string; title?: string; blurb?: string; minHeight?: number; children: ReactNode
}) {
  const app = useApp()
  if (tierIncludes(app.plan, feature)) return <>{children}</>
  const need = requiredTier(feature)
  const m = TIER_META[need]
  return (
    <div className="sm-gate" style={{ minHeight }}>
      <div className="sm-gate-blur" aria-hidden="true">{children}</div>
      <div className="sm-gate-veil">
        <div className="sm-gate-card">
          <div className="sm-gate-lock" style={{ background: m.bg, color: m.color }}><Icon name="lock" size={22} /></div>
          <div className="sm-gate-tier"><TierPill plan={need} /></div>
          <h3 className="sm-gate-title">{title || 'Feature locked'}</h3>
          <p className="sm-gate-blurb">{blurb || `This capability is part of the ${m.label} plan. Upgrade to unlock it for this school.`}</p>
          <Btn variant={need === 'platinum' ? 'platinum' : 'gold'} icon="sparkle" onClick={() => app.upgrade(need)}>Upgrade to {m.label}</Btn>
          <button className="sm-gate-link" onClick={() => app.upgrade(need)}>Compare plans</button>
        </div>
      </div>
    </div>
  )
}

/* Render children only if the current role has the capability, else fallback. */
export function RoleGate({ module, cap, fallback = null, children }: {
  module: string; cap: Cap; fallback?: ReactNode; children: ReactNode
}) {
  const app = useApp()
  return can(app.role, module, cap) ? <>{children}</> : <>{fallback}</>
}

export function RestrictedScreen({ title = 'Access restricted', note }: { title?: string; note?: string }) {
  const app = useApp()
  return (
    <div>
      <PageHead title={title} />
      <Empty icon="lock" title="You don't have access to this area"
        body={note || 'This section is limited to specific roles. Contact your administrator if you need access.'}
        action={<Btn variant="secondary" icon="arrowLeft" onClick={() => app.go(app.consoleKind === 'owner' ? 'owner.dashboard' : 'school.dashboard')}>Back to dashboard</Btn>} />
    </div>
  )
}
