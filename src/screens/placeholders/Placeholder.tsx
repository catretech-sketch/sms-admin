/* ============================================================
   SchoolMate — Generic placeholder for not-yet-built screens
   ============================================================ */
import { PageHead, Empty, Badge } from '@/components/ui'

export function Placeholder({ title, sub, phase }: { title: string; sub?: string; phase: number }) {
  return (
    <div>
      <PageHead title={title} sub={sub} actions={<Badge tone="brand">Phase {phase}</Badge>} />
      <Empty
        icon="layers"
        title={`${title} — coming up`}
        body={`This screen is scheduled for Phase ${phase} of the build. The navigation, shell, theming and data layer it depends on are already in place.`}
      />
    </div>
  )
}
