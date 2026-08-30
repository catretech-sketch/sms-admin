/** Pure math for a draggable, viewport-clamped floating element (e.g. AiFloatingButton) —
 *  no DOM/React dependency, so drag/clamp logic is unit-testable independent of pointer
 *  events. */

export interface Point {
  x: number
  y: number
}

/** Below this distance (px) between pointerdown and pointerup, treat the gesture as a
 *  click rather than a drag. */
export const CLICK_THRESHOLD_PX = 5

export function isClick(start: Point, end: Point): boolean {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return Math.sqrt(dx * dx + dy * dy) <= CLICK_THRESHOLD_PX
}

/** Clamp a top-left position so an element of the given size stays fully within the
 *  given viewport (never partially off-screen). */
export function clampPosition(
  pos: Point,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): Point {
  const maxX = Math.max(0, viewport.width - size.width)
  const maxY = Math.max(0, viewport.height - size.height)
  return {
    x: Math.min(Math.max(pos.x, 0), maxX),
    y: Math.min(Math.max(pos.y, 0), maxY),
  }
}
