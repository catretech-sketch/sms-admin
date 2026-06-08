/* ============================================================
   SchoolMate — View router (context-driven, mirrors the
   prototype's app.go(view) pattern). Real screens replace
   placeholders as each phase lands.
   ============================================================ */
import { useApp } from '@/lib/hooks'
import { Placeholder } from '@/screens/placeholders/Placeholder'
import { RestrictedScreen } from '@/components/shell/gates'
import { screenRegistry } from '@/screens/registry'

interface ViewMeta { title: string; sub?: string; phase: number }

/* Metadata for every roadmap view. Real components come from the screen registry. */
const VIEWS: Record<string, ViewMeta> = {
  // Owner console (Phase 4)
  'owner.dashboard': { title: 'Portfolio overview', sub: 'All schools at a glance', phase: 4 },
  'owner.schools': { title: 'Schools', sub: 'Your tenants', phase: 4 },
  'owner.create': { title: 'Create school', sub: 'Onboard a new tenant', phase: 4 },
  'owner.reports': { title: 'Cross-school reports', sub: 'Compare across tenants', phase: 4 },
  'owner.billing': { title: 'Subscriptions & billing', sub: 'Plans, invoices & revenue', phase: 4 },
  'owner.users': { title: 'Users & roles', sub: 'Workspace team', phase: 4 },
  'owner.settings': { title: 'Owner settings', sub: 'Company, branding & policies', phase: 4 },

  // School console — flagship (Phase 1)
  'school.dashboard': { title: 'Dashboard', phase: 1 },
  'school.approvals': { title: 'Approvals', sub: 'Pending your action', phase: 1 },
  'school.sis': { title: 'Students (SIS)', phase: 1 },
  'school.student': { title: 'Student profile', phase: 1 },

  // People (Phase 3)
  'school.teachers': { title: 'Teachers', phase: 3 },
  'school.staff': { title: 'Staff & support', phase: 3 },
  'school.parents': { title: 'Parents', phase: 3 },

  // Academics & Exams (Phase 2)
  'school.academics': { title: 'Academics', sub: 'Classes, timetable & subjects', phase: 2 },
  'school.calendar': { title: 'Calendar', sub: 'Academic calendar & events', phase: 2 },
  'school.exams': { title: 'Exams & grading', phase: 2 },

  // People & Ops (Phase 3)
  'school.attendance': { title: 'Attendance', phase: 3 },
  'school.fees': { title: 'Fees', phase: 3 },
  'school.hr': { title: 'HR & Payroll', phase: 3 },
  'school.comm': { title: 'Communication', phase: 3 },
  'school.ops': { title: 'Operations', sub: 'Library · Transport · Hostel · Sports', phase: 3 },
  'school.gps': { title: 'Live bus tracking', phase: 3 },

  // Administration (Phase 5)
  'school.reports': { title: 'Reports', phase: 5 },
  'school.identity': { title: 'Identity & access', phase: 5 },
  'school.settings': { title: 'Settings', phase: 5 },
}

export function Router() {
  const app = useApp()
  const meta = VIEWS[app.view] ?? VIEWS['school.dashboard']

  // Identity & access is Admin-only
  if (app.view === 'school.identity' && app.role !== 'admin') {
    return <RestrictedScreen title="Identity & access" note="Identity & access is limited to the School Admin and the Owner workspace." />
  }

  const Screen = screenRegistry[app.view]
  if (Screen) return <Screen />
  return <Placeholder title={meta.title} sub={meta.sub} phase={meta.phase} />
}
