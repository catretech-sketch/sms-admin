import { describe, it, expect } from 'vitest'
import { api } from './api'

describe('MockApi', () => {
  it('lists all schools', async () => {
    expect((await api.listSchools()).length).toBe(7)
  })
  it('filters students by query', async () => {
    const all = await api.listStudents()
    const some = await api.listStudents({ q: all[0].name.split(' ')[0] })
    expect(some.length).toBeGreaterThan(0)
    expect(some.length).toBeLessThanOrEqual(all.length)
  })
  it('filters students by fee status', async () => {
    const due = await api.listStudents({ fee: 'due' })
    expect(due.length).toBeGreaterThan(0)
    expect(due.every((s) => s.feeStatus === 'due')).toBe(true)
  })
  it('lists approvals for a role', async () => {
    const a = await api.listApprovals('principal')
    expect(a.length).toBeGreaterThan(0)
    expect(a.every((x) => x.forRoles.includes('principal'))).toBe(true)
  })
  it('computes a report and rank for a real student', async () => {
    const all = await api.listStudents()
    const r = await api.reportFor(all[0].id)
    expect(r).toBeDefined()
    const rank = await api.classRank(all[0].id)
    expect(rank!.rank).toBeGreaterThanOrEqual(1)
  })
})
