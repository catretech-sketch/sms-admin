/** Normalize API / localStorage dates for `<input type="date">` (YYYY-MM-DD). */
export function toDateInputValue(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]

  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  return ''
}

/**
 * Parse API instants for display. Naive timestamps from .NET (no Z) are UTC.
 */
export function parseApiInstant(iso: string): Date {
  const s = iso.trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(`${s}Z`)
  }
  return new Date(s)
}

export function formatMarkedAt(value?: string | null): string {
  if (!value) return '—'
  const date = parseApiInstant(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
