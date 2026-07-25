/** Next auto IDs: {schoolSlug}/STU|TCH|STF/{yy}/{####} e.g. scc/STU/26/0001 */
export type PersonCodeKind = 'STU' | 'TCH' | 'STF'

export function schoolCodeSlug(slug?: string | null, fallback = 'sch'): string {
  const s = (slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return s || fallback
}

/** Last 2 digits of year, e.g. 2026 -> 26 */
export function personCodeYear(year: number = new Date().getFullYear()): string {
  return String(year % 100).padStart(2, '0')
}

export function personCodePrefix(
  slug: string | null | undefined,
  kind: PersonCodeKind,
  year: number = new Date().getFullYear(),
): string {
  return `${schoolCodeSlug(slug)}/${kind}/${personCodeYear(year)}/`
}

export function nextPersonCode(prefix: string, existing: Array<string | null | undefined>): string {
  const p = prefix.toLowerCase()
  let max = 0
  for (const raw of existing) {
    const id = (raw ?? '').trim().toLowerCase()
    if (!id.startsWith(p)) continue
    const n = Number.parseInt(id.slice(p.length), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}