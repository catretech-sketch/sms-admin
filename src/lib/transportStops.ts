import type { TransportMappedStudent } from '@/api/transport'

/** Groups mapped students by their assigned stop id. Students without a stop are excluded. */
export function groupStudentsByStop(students: TransportMappedStudent[]): Record<string, TransportMappedStudent[]> {
  const grouped: Record<string, TransportMappedStudent[]> = {}
  for (const s of students) {
    if (!s.stopId) continue
    ;(grouped[s.stopId] ??= []).push(s)
  }
  return grouped
}
