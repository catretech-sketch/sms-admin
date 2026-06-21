import { Badge } from './primitives'

/** Marks a surface that is still backed by demo/mock data (no live endpoint yet). */
export function DemoBadge({ label = 'Demo data' }: { label?: string }) {
  return <Badge tone="warning" icon="alert">{label}</Badge>
}
