/* ============================================================
   SchoolMate — UI primitives: Btn, IconBtn, Badge, TierPill,
   Avatar, Progress, Skeleton, Spinner
   ============================================================ */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode, Ref } from 'react'
import type { Tier } from '@/types'
import { TIER_META } from '@/data/mockDb'
import { Icon } from './Icon'

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'gold' | 'platinum'
type BtnSize = 'sm' | 'md' | 'lg'

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: BtnSize
  icon?: string
  iconRight?: string
  ref?: Ref<HTMLButtonElement>
}

export function Btn({ variant = 'secondary', size = 'md', icon, iconRight, className, children, ref, ...rest }: BtnProps) {
  const cls = ['sm-btn', `sm-btn-${size}`, `sm-btn-${variant}`, className].filter(Boolean).join(' ')
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 14 : 16
  return (
    <button ref={ref} className={cls} {...rest}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  )
}

export interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string
  size?: number
  active?: boolean
  ref?: Ref<HTMLButtonElement>
}
export function IconBtn({ icon, size = 18, active, className, ref, ...rest }: IconBtnProps) {
  return (
    <button ref={ref} className={['sm-iconbtn', active && 'is-active', className].filter(Boolean).join(' ')} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  )
}

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
export function Badge({ tone = 'neutral', soft = true, solid = false, dot = false, icon, children, style }: {
  tone?: BadgeTone; soft?: boolean; solid?: boolean; dot?: boolean; icon?: string; children?: ReactNode; style?: CSSProperties
}) {
  const variant = solid ? 'solid' : soft ? 'soft' : 'soft'
  return (
    <span className={`sm-badge ${variant} sm-badge-${tone}`} style={style}>
      {dot && <span className="sm-badge-dot" />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}

export function TierPill({ plan, size = 'sm' }: { plan: Tier; size?: 'sm' | 'md' }) {
  const m = TIER_META[plan]
  const pad = size === 'md' ? '4px 12px' : '2px 9px'
  const fs = size === 'md' ? 12.5 : 11
  return (
    <span className="sm-tier" style={{ background: m.bg, color: m.color, padding: pad, fontSize: fs }}>
      <span className="sm-tier-dot" style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

export function Avatar({ name, hue, size = 36, src, style }: { name?: string; hue?: number; size?: number; src?: string; style?: CSSProperties }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const bg = hue != null ? `hsl(${hue} 62% 48%)` : 'var(--brand-600)'
  return (
    <span className="sm-avatar" style={{ width: size, height: size, background: src ? undefined : bg, fontSize: size * 0.38, borderRadius: size * 0.28, ...style }}>
      {src ? <img src={src} alt={name} /> : initials}
    </span>
  )
}

export function Progress({ value, color = 'var(--brand-600)', height = 7 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="sm-progress" style={{ height }}>
      <div className="sm-progress-bar" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  )
}

export function Skeleton({ width, height = 14, radius = 6, style }: { width?: number | string; height?: number; radius?: number; style?: CSSProperties }) {
  return <span className="sm-skeleton" style={{ width: width ?? '100%', height, borderRadius: radius, ...style }} />
}

export function Spinner({ size = 16, style }: { size?: number; style?: CSSProperties }) {
  return <span className="sm-spin" style={{ width: size, height: size, ...style }} />
}
