/* ============================================================
   SchoolMate — Toast notifications
   ============================================================ */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

type ToastTone = 'success' | 'info' | 'danger'
interface Toast { id: number; tone: ToastTone; title: string; sub?: string }

interface ToastApi {
  success: (title: string, sub?: string) => void
  info: (title: string, sub?: string) => void
  danger: (title: string, sub?: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const push = useCallback((tone: ToastTone, title: string, sub?: string) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, tone, title, sub }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const api: ToastApi = {
    success: (t, s) => push('success', t, s),
    info: (t, s) => push('info', t, s),
    danger: (t, s) => push('danger', t, s),
  }

  const toneIcon = (tone: ToastTone) => tone === 'success' ? 'checkCircle' : tone === 'danger' ? 'alert' : 'bell'

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="sm-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`sm-toast sm-toast-${t.tone}`}>
            <span className="sm-toast-ic"><Icon name={toneIcon(t.tone)} size={18} /></span>
            <div className="sm-toast-body">
              <div className="sm-toast-title">{t.title}</div>
              {t.sub && <div className="sm-toast-sub">{t.sub}</div>}
            </div>
            <button className="sm-toast-x" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}><Icon name="x" size={15} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
