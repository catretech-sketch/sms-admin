import { describe, it, expect, beforeEach } from 'vitest'
import { tokenStore } from './tokenStore'

beforeEach(() => { localStorage.clear(); tokenStore.clear() })

describe('tokenStore', () => {
  it('holds access in memory and persists refresh', () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    expect(tokenStore.getAccess()).toBe('a1')
    expect(tokenStore.getRefresh()).toBe('r1')
    expect(localStorage.getItem('sms_admin_refresh')).toBe('r1')
  })

  it('persists tenant id and clears everything', () => {
    tokenStore.set({ access_token: 'a1', refresh_token: 'r1' })
    tokenStore.setTenantId('tenant-7')
    expect(tokenStore.getTenantId()).toBe('tenant-7')
    tokenStore.clear()
    expect(tokenStore.getAccess()).toBeNull()
    expect(tokenStore.getRefresh()).toBeNull()
    expect(tokenStore.getTenantId()).toBeNull()
  })
})
