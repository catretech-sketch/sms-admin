/* ============================================================
   SchoolMate — Theme + Tweaks (applies CSS-variable switches to
   <html> and persists to localStorage)
   ============================================================ */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'
export type Accent = 'indigo' | 'emerald' | 'azure' | 'plum' | 'sunset'
export type Density = 'compact' | 'regular' | 'comfy'
export type Corners = 'sharp' | 'rounded' | 'pillowy'
export type Canvas = 'cool' | 'warm' | 'paper'

interface TweakState { theme: Theme; accent: Accent; density: Density; corners: Corners; canvas: Canvas }
interface ThemeApi extends TweakState {
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setAccent: (a: Accent) => void
  setDensity: (d: Density) => void
  setCorners: (c: Corners) => void
  setCanvas: (c: Canvas) => void
}

const DEFAULTS: TweakState = { theme: 'light', accent: 'indigo', density: 'regular', corners: 'rounded', canvas: 'cool' }
const KEY = 'schoolmate.tweaks'
const ThemeCtx = createContext<ThemeApi | null>(null)

function load(): TweakState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULTS
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TweakState>(load)

  useEffect(() => {
    const el = document.documentElement
    el.setAttribute('data-theme', state.theme)
    el.setAttribute('data-accent', state.accent === 'indigo' ? '' : state.accent)
    el.setAttribute('data-density', state.density === 'regular' ? '' : state.density)
    el.setAttribute('data-corners', state.corners === 'rounded' ? '' : state.corners)
    el.setAttribute('data-canvas', state.canvas === 'cool' ? '' : state.canvas)
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])

  const api: ThemeApi = {
    ...state,
    setTheme: (theme) => setState((s) => ({ ...s, theme })),
    toggleTheme: () => setState((s) => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' })),
    setAccent: (accent) => setState((s) => ({ ...s, accent })),
    setDensity: (density) => setState((s) => ({ ...s, density })),
    setCorners: (corners) => setState((s) => ({ ...s, corners })),
    setCanvas: (canvas) => setState((s) => ({ ...s, canvas })),
  }

  return <ThemeCtx.Provider value={api}>{children}</ThemeCtx.Provider>
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
