/* ============================================================
   SchoolMate — Navigation primitives: Tabs, Segmented,
   Breadcrumb, Popover, Menu
   ============================================================ */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface TabItem { value: string; label: ReactNode; count?: number; icon?: string }
export function Tabs({ value, onChange, tabs }: { value: string; onChange: (v: string) => void; tabs: TabItem[] }) {
  return (
    <div className="sm-tabs">
      {tabs.map((t) => (
        <button key={t.value} className={['sm-tab', value === t.value && 'on'].filter(Boolean).join(' ')} onClick={() => onChange(t.value)}>
          {t.icon && <Icon name={t.icon} size={15} />}
          {t.label}
          {t.count != null && <span className="sm-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export interface SegItem { value: string; label: ReactNode }
export function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: SegItem[] }) {
  return (
    <div className="sm-seg">
      {options.map((o) => (
        <button key={o.value} className={['sm-seg-btn', value === o.value && 'on'].filter(Boolean).join(' ')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface Crumb { label: ReactNode; onClick?: () => void }
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <div className="sm-crumb">
      {items.map((c, i) => (
        <span key={i} className="sm-crumb">
          {i > 0 && <span className="sm-crumb-sep"><Icon name="chevRight" size={13} /></span>}
          {i === items.length - 1 || !c.onClick
            ? <span className="sm-crumb-cur">{c.label}</span>
            : <button className="sm-crumb-link" onClick={c.onClick}>{c.label}</button>}
        </span>
      ))}
    </div>
  )
}

/* Popover — click trigger to toggle a floating panel, closes on outside click */
export function Popover({ trigger, children, align = 'right' }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <div className="sm-pop-wrap" ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && <div className={`sm-pop sm-pop-${align}`} onClick={() => setOpen(false)}>{children}</div>}
    </div>
  )
}

export function MenuItem({ icon, children, onClick, danger }: { icon?: string; children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button className={['sm-menu-item', danger && 'danger'].filter(Boolean).join(' ')} onClick={onClick}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  )
}
export function MenuSep() { return <div className="sm-menu-sep" /> }
export function MenuLabel({ children }: { children: ReactNode }) { return <div className="sm-menu-label">{children}</div> }
