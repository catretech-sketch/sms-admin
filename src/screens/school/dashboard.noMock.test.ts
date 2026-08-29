import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('school dashboard source', () => {
  const src = readFileSync(join(process.cwd(), 'src/screens/school/dashboard.tsx'), 'utf8')

  it('does not import mockDb or invent KPI / chart series', () => {
    expect(src).not.toContain("@/data/mockDb")
    expect(src).not.toContain('delta="3.8%"')
    expect(src).not.toContain('90.4')
    expect(src).not.toContain('share: 0.14')
    expect(src).not.toContain('liveStudents * 0.53')
    expect(src).not.toContain("{ value: 14, label: 'A1'")
  })

  it('loads enrolment counts from the CRM snapshot, not the full student roster', () => {
    expect(src).toContain('useCrmPeopleSnapshot')
    expect(src).not.toContain("from '@/api/hooks/useStudents'")
    expect(src).toContain('enrollmentByStageFromCounts')
  })

  it('keeps approved/rejected SQL history visible after acting', () => {
    expect(src).toContain('inboxApprovals')
    expect(src).not.toContain('acted.has(a.id)')
  })
})
