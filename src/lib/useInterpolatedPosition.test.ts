import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInterpolatedPosition } from './useInterpolatedPosition'

describe('useInterpolatedPosition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial position immediately without animating', () => {
    const { result } = renderHook(() => useInterpolatedPosition(12.0, 77.0))
    expect(result.current).toEqual({ lat: 12.0, lng: 77.0 })
  })

  it('returns null when lat or lng is not yet available', () => {
    const { result } = renderHook(({ lat, lng }: { lat: number | null | undefined; lng: number | null | undefined }) =>
      useInterpolatedPosition(lat, lng), { initialProps: { lat: null, lng: null } })
    expect(result.current).toBeNull()
  })

  it('animates smoothly toward a new position over time rather than snapping instantly', () => {
    const { result, rerender } = renderHook(
      ({ lat, lng }) => useInterpolatedPosition(lat, lng, 4000),
      { initialProps: { lat: 12.0, lng: 77.0 } },
    )
    rerender({ lat: 12.01, lng: 77.01 })

    // Shortly after the update, we should not have jumped all the way to the new position.
    act(() => { vi.advanceTimersByTime(16) })
    expect(result.current!.lat).toBeGreaterThan(12.0)
    expect(result.current!.lat).toBeLessThan(12.01)

    // After the full animation duration, we should have arrived exactly at the new position.
    act(() => { vi.advanceTimersByTime(4000) })
    expect(result.current).toEqual({ lat: 12.01, lng: 77.01 })
  })
})
