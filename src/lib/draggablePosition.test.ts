import { describe, it, expect } from 'vitest'
import { isClick, clampPosition, CLICK_THRESHOLD_PX } from './draggablePosition'

describe('isClick', () => {
  it('is true when start and end are identical', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true)
  })
  it('is true within the threshold', () => {
    expect(isClick({ x: 0, y: 0 }, { x: CLICK_THRESHOLD_PX, y: 0 })).toBe(true)
  })
  it('is false beyond the threshold', () => {
    expect(isClick({ x: 0, y: 0 }, { x: CLICK_THRESHOLD_PX + 1, y: 0 })).toBe(false)
  })
})

describe('clampPosition', () => {
  it('leaves an in-bounds position unchanged', () => {
    expect(clampPosition({ x: 100, y: 100 }, { width: 46, height: 46 }, { width: 800, height: 600 })).toEqual({ x: 100, y: 100 })
  })
  it('clamps a negative position to 0', () => {
    expect(clampPosition({ x: -20, y: -5 }, { width: 46, height: 46 }, { width: 800, height: 600 })).toEqual({ x: 0, y: 0 })
  })
  it('clamps a position beyond the right/bottom edge', () => {
    expect(clampPosition({ x: 900, y: 700 }, { width: 46, height: 46 }, { width: 800, height: 600 })).toEqual({ x: 754, y: 554 })
  })
  it('handles a viewport smaller than the element by clamping to 0', () => {
    expect(clampPosition({ x: 10, y: 10 }, { width: 500, height: 500 }, { width: 300, height: 300 })).toEqual({ x: 0, y: 0 })
  })
})
