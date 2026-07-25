import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PublishStatus } from '@/lib/academicsPublish'

export interface AcademicsTabActions {
  saveDraft: () => void
  publish: () => void
  canPublish?: boolean
  showPublish: boolean
  status: PublishStatus
  draftSavedAt: string | null
  publishedAt: string | null
}

interface AcademicsActionsCtx {
  register: (tab: string, actions: AcademicsTabActions | null) => void
  getActions: (tab: string) => AcademicsTabActions | null
  /** bump so consumers re-render when a tab updates status */
  version: number
  bump: () => void
}

const Ctx = createContext<AcademicsActionsCtx | null>(null)

export function AcademicsActionsProvider({ children }: { children: ReactNode }) {
  const map = useRef<Record<string, AcademicsTabActions>>({})
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const register = useCallback((tab: string, actions: AcademicsTabActions | null) => {
    if (actions) map.current[tab] = actions
    else delete map.current[tab]
    setVersion((v) => v + 1)
  }, [])
  const getActions = useCallback((tab: string) => map.current[tab] ?? null, [])
  const value = useMemo(() => ({ register, getActions, version, bump }), [register, getActions, version, bump])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAcademicsActions(): AcademicsActionsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAcademicsActions requires AcademicsActionsProvider')
  return ctx
}
