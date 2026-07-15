import { useState, type CSSProperties } from 'react'
import type { School } from '@/types'

/** School logo image when set; falls back to initials mark used across modules. */
export function SchoolMark({
  school,
  size = 34,
  round = false,
  style,
}: {
  school: Pick<School, 'name' | 'logo' | 'color'> & { logoUrl?: string | null }
  size?: number
  /** Perfect circle (for dashboard / profile hero). */
  round?: boolean
  style?: CSSProperties
}) {
  const [broken, setBroken] = useState(false)
  const radius = round ? '50%' : size >= 48 ? 14 : size >= 30 ? 9 : 6
  const url = school.logoUrl?.trim()

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={school.name}
        className="sm-school-mark-img"
        onError={() => setBroken(true)}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: radius,
          background: school.color,
          flexShrink: 0,
          display: 'block',
          ...style,
        }}
      />
    )
  }

  return (
    <span
      className="sm-school-logo"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        background: school.color,
        borderRadius: radius,
        flexShrink: 0,
        ...style,
      }}
    >
      {school.logo}
    </span>
  )
}

/** Round school photo (campus image preferred, else logo) — left-aligned heroes. */
export function SchoolPhoto({
  school,
  size = 88,
  style,
}: {
  school: Pick<School, 'name' | 'logo' | 'color' | 'imageUrl' | 'logoUrl'>
  size?: number
  style?: CSSProperties
}) {
  const [broken, setBroken] = useState(false)
  const src = school.imageUrl?.trim() || school.logoUrl?.trim() || ''
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={school.name}
        className="sm-school-photo"
        onError={() => setBroken(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
          border: '3px solid var(--border)',
          background: school.color || 'var(--surface-2)',
          boxShadow: 'var(--sh-sm)',
          ...style,
        }}
      />
    )
  }
  return <SchoolMark school={school} size={size} round style={style} />
}

/** Wide campus strip for profile modals (not dashboard). */
export function SchoolCover({
  school,
  height = 168,
}: {
  school: Pick<School, 'name' | 'imageUrl' | 'logoUrl' | 'color'>
  height?: number
}) {
  const src = school.imageUrl?.trim() || school.logoUrl?.trim() || ''
  const [broken, setBroken] = useState(false)
  if (!src || broken) return null
  return (
    <div
      className="sm-school-cover"
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        height,
        background: school.color || 'var(--surface-2)',
      }}
    >
      <img
        src={src}
        alt={school.name}
        onError={() => setBroken(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  )
}
