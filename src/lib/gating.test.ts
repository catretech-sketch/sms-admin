import { describe, it, expect } from 'vitest'
import {
  tierIncludes, requiredTier, can, caps,
  effectiveCaps, cellState, overrideCount, NEXT_CELL_STATE,
  gateRole,
} from './gating'
import type { UserOverrides } from '@/types'
import type { RoleTemplateOverride } from '@/api/roleTemplates'

describe('gateRole (exported)', () => {
  it('maps owner to admin', () => {
    expect(gateRole('owner')).toBe('admin')
  })
  it('passes through every other role unchanged', () => {
    expect(gateRole('admin')).toBe('admin')
    expect(gateRole('principal')).toBe('principal')
    expect(gateRole('vice_principal')).toBe('vice_principal')
    expect(gateRole('teacher')).toBe('teacher')
  })
})

describe('gating', () => {
  it('tierIncludes respects tier order', () => {
    expect(tierIncludes('silver', 'sis')).toBe(true)
    expect(tierIncludes('silver', 'hr_payroll')).toBe(false)
    expect(tierIncludes('gold', 'hr_payroll')).toBe(false)
    expect(tierIncludes('gold', 'transport.gps')).toBe(false)
    expect(tierIncludes('platinum', 'hr_payroll')).toBe(true)
    expect(tierIncludes('silver', 'operations')).toBe(false)
    expect(tierIncludes('platinum', 'operations')).toBe(true)
    expect(tierIncludes('platinum', 'staff_support')).toBe(true)
    expect(tierIncludes('gold', 'staff_support')).toBe(false)
    expect(tierIncludes('platinum', 'transport.gps')).toBe(true)
    expect(tierIncludes('silver', 'attendance.geofence')).toBe(false)
    expect(tierIncludes('gold', 'attendance.geofence')).toBe(false)
    expect(tierIncludes('platinum', 'attendance.geofence')).toBe(true)
    expect(tierIncludes('silver', 'ai_search')).toBe(false)
    expect(tierIncludes('gold', 'ai_search')).toBe(false)
    expect(tierIncludes('platinum', 'ai_search')).toBe(true)
  })
  it('requiredTier defaults to silver for unknown features', () => {
    expect(requiredTier('nonexistent')).toBe('silver')
    expect(requiredTier('hr_payroll')).toBe('platinum')
  })
  it('can() reads the permission matrix', () => {
    expect(can('admin', 'sis', 'E')).toBe(true)
    expect(can('teacher', 'fees', 'E')).toBe(false)
    expect(can('principal', 'exams', 'A')).toBe(true)
    expect(can('principal', 'fees', 'E')).toBe(true)
    expect(can('principal', 'fees', 'A')).toBe(true)
  })
  it('caps() returns the capability array', () => {
    expect(caps('admin', 'sis')).toContain('E')
    expect(caps('teacher', 'fees')).toEqual([])
  })
  it('owner has full access to every module (admin + principal powers)', () => {
    for (const mod of ['setup', 'sis', 'academics', 'fees', 'hr', 'dashboard', 'attendance']) {
      expect(caps('owner', mod)).toEqual(['V', 'E', 'A'])
      for (const cap of ['V', 'E', 'A'] as const)
        expect(can('owner', mod, cap)).toBe(true)
    }
  })
  it('owner, admin and principal can view and edit all attendance', () => {
    for (const role of ['owner', 'admin', 'principal'] as const) {
      expect(can(role, 'attendance', 'V')).toBe(true)
      expect(can(role, 'attendance', 'E')).toBe(true)
    }
  })
  it('admin and principal can mark anyone like owner', () => {
    for (const role of ['admin', 'principal'] as const) {
      expect(can(role, 'attendance', 'V')).toBe(true)
      expect(can(role, 'attendance', 'E')).toBe(true)
      expect(can(role, 'attendance', 'A')).toBe(true)
    }
  })
})

describe('per-user overrides', () => {
  it('effectiveCaps returns role caps when there are no overrides', () => {
    expect(effectiveCaps('admin', 'sis', {})).toEqual(['E'])
    expect(effectiveCaps('teacher', 'fees', {})).toEqual([])
  })
  it('grant adds a cap the role lacks', () => {
    const ov: UserOverrides = { fees: { E: 'grant' } }
    expect(effectiveCaps('teacher', 'fees', ov)).toEqual(['E'])
  })
  it('revoke removes a cap the role has', () => {
    const ov: UserOverrides = { sis: { E: 'revoke' } }
    expect(effectiveCaps('admin', 'sis', ov)).toEqual([])
  })
  it('grant of an already-held cap is a no-op (no duplicates)', () => {
    const ov: UserOverrides = { sis: { E: 'grant' } }
    expect(effectiveCaps('admin', 'sis', ov)).toEqual(['E'])
  })
  it('revoke of a cap the role never had is a no-op', () => {
    const ov: UserOverrides = { fees: { V: 'revoke' } }
    expect(effectiveCaps('teacher', 'fees', ov)).toEqual([])
  })
  it('keeps caps ordered V -> E -> A', () => {
    const ov: UserOverrides = { academics: { A: 'grant' } }
    // teacher already has V + E for academics in mockDb; granting A appends in order.
    expect(effectiveCaps('teacher', 'academics', {})).toEqual(['V', 'E'])
    expect(effectiveCaps('teacher', 'academics', ov)).toEqual(['V', 'E', 'A'])
  })
  it('cellState reports the override or inherit', () => {
    const ov: UserOverrides = { fees: { E: 'grant' } }
    expect(cellState('fees', 'E', ov)).toBe('grant')
    expect(cellState('fees', 'V', ov)).toBe('inherit')
    expect(cellState('sis', 'E', {})).toBe('inherit')
  })
  it('overrideCount counts non-inherit cells across modules', () => {
    const ov: UserOverrides = { fees: { E: 'grant', V: 'revoke' }, sis: { A: 'grant' } }
    expect(overrideCount(ov)).toBe(3)
    expect(overrideCount({})).toBe(0)
  })
  it('NEXT_CELL_STATE cycles inherit -> grant -> revoke -> inherit', () => {
    expect(NEXT_CELL_STATE.inherit).toBe('grant')
    expect(NEXT_CELL_STATE.grant).toBe('revoke')
    expect(NEXT_CELL_STATE.revoke).toBe('inherit')
  })
})

describe('tenant role-template overrides', () => {
  it('a tenant grant adds a capability the static default lacks', () => {
    const tenantOv: RoleTemplateOverride[] = [{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }]
    expect(effectiveCaps('teacher', 'fees', {}, tenantOv)).toEqual(['E'])
  })
  it('a tenant revoke removes a capability the static default has', () => {
    const tenantOv: RoleTemplateOverride[] = [{ role: 'admin', module: 'sis', cap: 'E', effect: 'revoke' }]
    expect(effectiveCaps('admin', 'sis', {}, tenantOv)).toEqual([])
  })
  it('a per-user override still wins over a tenant override on the same cell', () => {
    const tenantOv: RoleTemplateOverride[] = [{ role: 'teacher', module: 'fees', cap: 'E', effect: 'grant' }]
    const userOv: UserOverrides = { fees: { E: 'revoke' } }
    expect(effectiveCaps('teacher', 'fees', userOv, tenantOv)).toEqual([])
  })
  it('defaults to no tenant overrides when the 4th arg is omitted', () => {
    expect(effectiveCaps('admin', 'sis', {})).toEqual(['E'])
  })
})
