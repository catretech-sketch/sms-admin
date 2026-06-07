/* ============================================================
   SchoolMate — Overlays: Modal, Drawer, Tooltip
   ============================================================ */
import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

function useEscClose(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open || !onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
}

export function Modal({ open, onClose, size = 'md', icon, title, sub, children, footer }: {
  open: boolean; onClose?: () => void; size?: ModalSize; icon?: string; title?: ReactNode; sub?: ReactNode; children?: ReactNode; footer?: ReactNode
}) {
  useEscClose(open, onClose)
  if (!open) return null
  return (
    <div className="sm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={`sm-modal sm-modal-${size}`} role="dialog" aria-modal="true">
        {(title || icon) && (
          <div className="sm-modal-head">
            <div className="row ai-center gap12">
              {icon && <span className="sm-modal-ic"><Icon name={icon} size={18} /></span>}
              <div>
                {title && <div className="sm-modal-title">{title}</div>}
                {sub && <div className="sm-card-sub">{sub}</div>}
              </div>
            </div>
            {onClose && <button className="sm-iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>}
          </div>
        )}
        <div className="sm-modal-body">{children}</div>
        {footer && <div className="sm-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, width = 460, icon, title, sub, children, footer }: {
  open: boolean; onClose?: () => void; width?: number; icon?: string; title?: ReactNode; sub?: ReactNode; children?: ReactNode; footer?: ReactNode
}) {
  useEscClose(open, onClose)
  if (!open) return null
  return (
    <div className="sm-overlay sm-overlay-r" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="sm-drawer" style={{ width }} role="dialog" aria-modal="true">
        {(title || icon) && (
          <div className="sm-modal-head">
            <div className="row ai-center gap12">
              {icon && <span className="sm-modal-ic"><Icon name={icon} size={18} /></span>}
              <div>
                {title && <div className="sm-modal-title">{title}</div>}
                {sub && <div className="sm-card-sub">{sub}</div>}
              </div>
            </div>
            {onClose && <button className="sm-iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>}
          </div>
        )}
        <div className="sm-drawer-body">{children}</div>
        {footer && <div className="sm-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Tip({ text, children, bottom }: { text: ReactNode; children: ReactNode; bottom?: boolean }) {
  return (
    <span className="sm-tip-wrap">
      {children}
      <span className={['sm-tip', bottom && 'sm-tip-bottom'].filter(Boolean).join(' ')}>{text}</span>
    </span>
  )
}
