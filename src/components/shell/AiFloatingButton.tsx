/* ============================================================
   SchoolMate — AI floating assistant: app-wide entry point for AI Mode,
   mounted once in Shell (App.tsx) alongside Tweaks. Reuses AiSearchScreen
   unmodified. See docs/superpowers/specs/2026-08-30-ai-floating-assistant-design.md.
   ============================================================ */
import { useState } from 'react'
import { useApp } from '@/lib/hooks'
import { tierIncludes } from '@/lib/gating'
import { Icon } from '@/components/ui'
import { TierGate } from '@/components/shell/gates'
import { AiSearchScreen } from '@/screens/school/aiSearch'

export function AiFloatingButton() {
  const app = useApp()
  const [open, setOpen] = useState(false)

  if (app.consoleKind !== 'school') return null

  return (
    <>
      <button className="sm-ai-fab" onClick={() => setOpen((o) => !o)} aria-label="AI Mode">
        <Icon name={open ? 'x' : 'sparkle'} size={20} />
      </button>
      {open && (
        <div className="sm-ai-panel">
          {tierIncludes(app.plan, 'ai_search') ? (
            <AiSearchScreen />
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
