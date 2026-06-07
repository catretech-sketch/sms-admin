import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider, useApp } from './AppProvider'

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>

describe('AppProvider', () => {
  it('routes an owner email to the owner console', () => {
    const { result } = renderHook(() => useApp(), { wrapper })
    act(() => result.current.login('anil@schoolmate.io'))
    expect(result.current.loggedIn).toBe(true)
    expect(result.current.consoleKind).toBe('owner')
    expect(result.current.view).toBe('owner.dashboard')
  })

  it('locks a school account to its role', () => {
    const { result } = renderHook(() => useApp(), { wrapper })
    act(() => result.current.login('principal@greenwood.edu'))
    expect(result.current.consoleKind).toBe('school')
    expect(result.current.role).toBe('principal')
    expect(result.current.view).toBe('school.dashboard')
  })

  it('logout returns to the login state', () => {
    const { result } = renderHook(() => useApp(), { wrapper })
    act(() => result.current.login('teacher@greenwood.edu'))
    act(() => result.current.logout())
    expect(result.current.loggedIn).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('upgrade overrides the current school plan', () => {
    const { result } = renderHook(() => useApp(), { wrapper })
    act(() => result.current.login('admin@greenwood.edu'))
    act(() => result.current.setSchoolId('srt')) // Sunrise = silver
    expect(result.current.plan).toBe('silver')
    act(() => result.current.upgrade('gold'))
    expect(result.current.plan).toBe('gold')
  })
})
