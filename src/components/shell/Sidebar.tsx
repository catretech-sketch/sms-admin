/* ============================================================
   SchoolMate — Sidebar (console + role aware navigation)
   ============================================================ */
import { useApp } from '@/lib/hooks'
import { Icon, Btn, Tip, TierPill } from '@/components/ui'
import { tierIncludes } from '@/lib/gating'
import { approvals } from '@/data/mockDb'
import type { Tier } from '@/types'

interface NavItem { label: string; view: string; icon: string; lockTier?: Tier; adminOnly?: boolean; badge?: number }
interface NavGroup { label?: string; items: NavItem[] }

const OWNER_NAV: NavGroup[] = [
  { items: [
    { label: 'Overview', view: 'owner.dashboard', icon: 'grid' },
    { label: 'Schools', view: 'owner.schools', icon: 'building' },
  ] },
  { label: 'Insights', items: [
    { label: 'Cross-school reports', view: 'owner.reports', icon: 'trend' },
    { label: 'Subscriptions & billing', view: 'owner.billing', icon: 'wallet' },
  ] },
  { label: 'Workspace', items: [
    { label: 'Users & roles', view: 'owner.users', icon: 'users' },
    { label: 'Owner settings', view: 'owner.settings', icon: 'settings' },
  ] },
]

function schoolNav(role: string, approvalCount: number): NavGroup[] {
  return [
    { items: [
      { label: 'Dashboard', view: 'school.dashboard', icon: 'grid' },
      { label: 'Approvals', view: 'school.approvals', icon: 'inbox', badge: approvalCount || undefined },
    ] },
    { label: 'People', items: [
      { label: 'Students (SIS)', view: 'school.sis', icon: 'users' },
      { label: 'Teachers', view: 'school.teachers', icon: 'cap' },
      { label: 'Staff & support', view: 'school.staff', icon: 'briefcase' },
      { label: 'Parents', view: 'school.parents', icon: 'user' },
    ] },
    { label: 'Academic', items: [
      { label: 'Academics', view: 'school.academics', icon: 'book' },
      { label: 'Calendar', view: 'school.calendar', icon: 'calendar' },
      { label: 'Attendance', view: 'school.attendance', icon: 'checkCircle' },
      { label: 'Exams & grading', view: 'school.exams', icon: 'clipboard' },
    ] },
    { label: 'Operations', items: [
      { label: 'Fees', view: 'school.fees', icon: 'rupee' },
      { label: 'HR & Payroll', view: 'school.hr', icon: 'wallet', lockTier: 'gold' },
      { label: 'Communication', view: 'school.comm', icon: 'message' },
      { label: 'Operations', view: 'school.ops', icon: 'box' },
      { label: 'Live bus tracking', view: 'school.gps', icon: 'bus' },
    ] },
    { label: 'Administration', items: [
      { label: 'Reports', view: 'school.reports', icon: 'trend' },
      { label: 'Identity & access', view: 'school.identity', icon: 'key', adminOnly: true },
      { label: 'Settings', view: 'school.settings', icon: 'settings' },
    ].filter((i) => !i.adminOnly || role === 'admin') },
  ]
}

export function Sidebar() {
  const app = useApp()
  const isOwner = app.consoleKind === 'owner'
  const approvalCount = approvals.filter((a) => a.forRoles.includes(app.role)).length
  const groups = isOwner ? OWNER_NAV : schoolNav(app.role, approvalCount)

  return (
    <aside className="sm-sidebar">
      <div className="sm-sidebar-head">
        <span className="sm-sidebar-logo">S</span>
        <div className="sm-sidebar-brand">SchoolMate<small>{isOwner ? 'Owner console' : 'School console'}</small></div>
      </div>

      {!isOwner && (
        <div style={{ padding: '12px 12px 0' }}>
          <div className="sm-school-switch" style={{ width: '100%' }}>
            <span className="sm-school-logo" style={{ background: app.school.color }}>{app.school.logo}</span>
            <div className="flex1" style={{ minWidth: 0 }}>
              <div className="fw6 t-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.school.name}</div>
              <div className="t-xs muted3">{app.school.city}</div>
            </div>
            <TierPill plan={app.plan} />
          </div>
        </div>
      )}

      <nav className="sm-nav">
        {groups.map((g, gi) => (
          <div className="sm-nav-group" key={gi}>
            {g.label && <div className="sm-nav-label">{g.label}</div>}
            {g.items.map((it) => {
              const locked = it.lockTier && !tierIncludes(app.plan, it.lockTier === 'gold' ? 'hr_payroll' : 'transport.gps')
              return (
                <button key={it.view} className={['sm-nav-item', app.view === it.view && 'on'].filter(Boolean).join(' ')} onClick={() => app.go(it.view)}>
                  <span className="sm-nav-ic"><Icon name={it.icon} size={17} /></span>
                  <span className="flex1" style={{ textAlign: 'left' }}>{it.label}</span>
                  {it.badge != null && <span className="sm-nav-badge">{it.badge}</span>}
                  {locked && <Tip text={`${it.lockTier} feature`}><span className="sm-nav-lock"><Icon name="lock" size={13} /></span></Tip>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {!isOwner && app.plan !== 'platinum' && (
        <div className="sm-sidebar-foot">
          <div className="sm-upsell">
            <div className="t">Unlock more</div>
            <div className="s">Upgrade for {app.plan === 'silver' ? 'HR, payroll & analytics' : 'live GPS & geo-fencing'}.</div>
            <Btn size="sm" variant={app.plan === 'silver' ? 'gold' : 'platinum'} icon="sparkle" style={{ width: '100%' }}
              onClick={() => app.upgrade(app.plan === 'silver' ? 'gold' : 'platinum')}>
              Upgrade plan
            </Btn>
          </div>
        </div>
      )}
    </aside>
  )
}
