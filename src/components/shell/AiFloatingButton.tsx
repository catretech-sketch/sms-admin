/* ============================================================
   SchoolMate — AI floating assistant: app-wide entry point for AI Mode,
   mounted once in Shell (App.tsx) alongside Tweaks. Reuses AiSearchScreen
   unmodified. Draggable, viewport-clamped, position persisted per browser.
   See docs/superpowers/specs/2026-08-30-ai-floating-assistant-design.md.
   ============================================================ */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useApp } from '@/lib/hooks'
import { tierIncludes } from '@/lib/gating'
import { Icon } from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { AiSearchScreen } from '@/screens/school/aiSearch'
import { clampPosition, isClick, type Point } from '@/lib/draggablePosition'

const FAB_SIZE = 64
const PANEL_WIDTH = 420
const PANEL_GAP = 8
const EDGE_MARGIN = 8
const POSITION_STORAGE_KEY = 'sm_ai_fab_position'

function loadPosition(): Point | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Point>
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return { x: parsed.x, y: parsed.y }
    return null
  } catch {
    return null
  }
}

function savePosition(pos: Point): void {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos))
  } catch {
    /* ignore — dragging still works for this session, just isn't remembered */
  }
}

/** Matches the fab's original fixed CSS position (bottom:20px, right:80px) so a
 *  first-time visitor sees no jump once the position state takes over. */
function defaultPosition(): Point {
  return {
    x: window.innerWidth - 80 - FAB_SIZE,
    y: window.innerHeight - 20 - FAB_SIZE,
  }
}

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight }
}

export function AiFloatingButton() {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ pointer: Point; position: Point } | null>(null)
  /* True only while the most recent pointerdown->pointerup gesture moved past the click
     threshold. Read (and reset) by handleClick, so a real drag never also opens/closes
     the panel — but plain clicks (mouse, keyboard, or fireEvent.click in tests) still
     open it via the native onClick handler below, not via pointer events. */
  const wasDragged = useRef(false)

  useEffect(() => {
    const initial = loadPosition() ?? defaultPosition()
    setPosition(clampPosition(initial, { width: FAB_SIZE, height: FAB_SIZE }, viewportSize()))
  }, [])

  useEffect(() => {
    const onResize = () => {
      setPosition((p) => (p ? clampPosition(p, { width: FAB_SIZE, height: FAB_SIZE }, viewportSize()) : p))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (app.consoleKind !== 'school') return null
  if (app.school.status !== 'active' && !app.isPlatform) return null

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!position) return
    dragStart.current = { pointer: { x: e.clientX, y: e.clientY }, position }
    wasDragged.current = false
    setDragging(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* not implemented in some test environments — dragging still works via direct events */
    }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return
    if (!isClick(dragStart.current.pointer, { x: e.clientX, y: e.clientY })) {
      wasDragged.current = true
    }
    const dx = e.clientX - dragStart.current.pointer.x
    const dy = e.clientY - dragStart.current.pointer.y
    setPosition(
      clampPosition(
        { x: dragStart.current.position.x + dx, y: dragStart.current.position.y + dy },
        { width: FAB_SIZE, height: FAB_SIZE },
        viewportSize(),
      ),
    )
  }

  const handlePointerUp = () => {
    if (!dragStart.current) return
    dragStart.current = null
    setDragging(false)
    if (position) savePosition(position)
  }

  const handleClick = () => {
    if (wasDragged.current) {
      wasDragged.current = false
      return
    }
    setOpen((o) => !o)
  }

  const fabStyle = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : undefined

  /* Anchor the panel near the fab's current position using `left`/`bottom` (not `top`) —
     bottom-anchoring lets the panel grow upward from the fab regardless of its actual
     rendered height (which depends on AiSearchScreen's content), so there's no need to
     measure it. Clamped so the panel never runs off any edge of the viewport. */
  const panelStyle = position
    ? {
        left: Math.min(Math.max(position.x, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerWidth - PANEL_WIDTH - EDGE_MARGIN)),
        bottom: Math.min(Math.max(window.innerHeight - position.y + PANEL_GAP, EDGE_MARGIN), window.innerHeight - 100),
        right: 'auto',
        top: 'auto',
      }
    : undefined

  return (
    <>
      <button
        className={['sm-ai-fab', dragging && 'is-dragging'].filter(Boolean).join(' ')}
        style={fabStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        aria-label="AI Mode"
        title="AI Mode"
      >
        <Icon name={open ? 'x' : 'bot'} size={28} />
      </button>
      {open && (
        <div className="sm-ai-panel" style={panelStyle}>
          {tierIncludes(app.plan, 'ai_search') ? (
            <AiSearchScreen role={app.role} />
          ) : (
            // TierGate mounts its children inside an aria-hidden blur div (never omits them), so
            // always wrapping AiSearchScreen here would still mount it (and its data fetches) for
            // non-Platinum schools. Branch explicitly instead so the gated path never mounts it.
            <TierGate feature="ai_search" title="AI Mode" blurb="Ask natural-language questions about your school on the Platinum plan.">
              <div />
            </TierGate>
          )}
        </div>
      )}
    </>
  )
}
