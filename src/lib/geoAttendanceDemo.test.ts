import { describe, it, expect } from 'vitest'
import { principalStaffToCheckInMap } from './geoAttendanceDemo'
import type { PrincipalStaffEntry } from '@/api/principalAttendance'

describe('principalStaffToCheckInMap', () => {
  it('maps check-in and check-out by teacher id and name', () => {
    const staff: PrincipalStaffEntry[] = [{
      teacherId: 'ABC-123',
      name: 'Rina Pandey',
      initials: 'RP',
      checkedIn: true,
      checkInAt: '2026-07-30T11:22:00Z',
      checkOutAt: '2026-07-30T12:56:00Z',
    }]
    const m = principalStaffToCheckInMap(staff)
    expect(m.get('abc-123')?.at).toBe('2026-07-30T11:22:00Z')
    expect(m.get('abc-123')?.checkOutAt).toBe('2026-07-30T12:56:00Z')
    expect(m.get('rina pandey')?.checkOutAt).toBe('2026-07-30T12:56:00Z')
  })

  it('normalizes GUID keys without braces', () => {
    const staff: PrincipalStaffEntry[] = [{
      teacherId: 'B1F2C3D4-E5F6-7890-ABCD-EF1234567890',
      name: 'Rina Pandey',
      initials: 'RP',
      checkedIn: true,
      checkInAt: '2026-07-30T11:22:00Z',
      checkOutAt: null,
    }]
    const m = principalStaffToCheckInMap(staff)
    expect(m.get('b1f2c3d4-e5f6-7890-abcd-ef1234567890')?.at).toBe('2026-07-30T11:22:00Z')
  })
})
