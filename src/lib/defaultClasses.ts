/** Default Indian-school structure used across CRM dropdowns when seeded. */
export const DEFAULT_GRADES = [
  'Nursery', 'LKG', 'UKG',
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
] as const

export const DEFAULT_SECTIONS = ['A', 'B', 'C'] as const

export interface DefaultClassSpec {
  name: string
  grade: string
  section: string
  teacherId: string
  students: number
  room: string
}

export function defaultClassSpecs(): DefaultClassSpec[] {
  return DEFAULT_GRADES.flatMap((grade) =>
    DEFAULT_SECTIONS.map((section) => ({
      name: `${grade}-${section}`,
      grade,
      section,
      teacherId: '',
      students: 0,
      room: '—',
    })),
  )
}

/** Nursery–XII · A/B/C names for dropdowns. */
export function defaultClassNames(): string[] {
  return defaultClassSpecs().map((c) => c.name)
}

type ClassLike = string | { name?: string; grade?: string; section?: string }

/** Defaults + any live/custom classes (deduped, sorted). Always includes Nursery–XII · A/B/C. */
export function mergeClassNames(live: ClassLike[] | null | undefined): string[] {
  const names = new Set(defaultClassNames())
  for (const c of live ?? []) {
    const n = (typeof c === 'string' ? c : (c.name || `${c.grade ?? ''}-${c.section ?? ''}`)).trim()
    if (n && n !== '-') names.add(n)
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

const ROMAN_TO_NUM: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
}

/** Grade rank Nursery→XII (12) for ascending class lists. */
export function gradeRank(grade: string | undefined | null): number {
  const g = String(grade ?? '').trim()
  if (!g) return 999
  const lower = g.toLowerCase()
  if (lower === 'nursery') return -3
  if (lower === 'lkg') return -2
  if (lower === 'ukg') return -1
  if (ROMAN_TO_NUM[g.toUpperCase()] != null) return ROMAN_TO_NUM[g.toUpperCase()]
  const n = Number(g.replace(/[^0-9]/g, ''))
  if (Number.isFinite(n) && n > 0) return n
  const idx = DEFAULT_GRADES.findIndex((x) => x.toLowerCase() === lower)
  return idx >= 0 ? idx : 500 + g.charCodeAt(0)
}

/** Ascending: Nursery → XII, then section A→C, then name. */
export function compareClassesAscending(
  a: { name?: string; grade?: string; section?: string },
  b: { name?: string; grade?: string; section?: string },
): number {
  const byGrade = gradeRank(a.grade) - gradeRank(b.grade)
  if (byGrade !== 0) return byGrade
  const sa = String(a.section ?? '').trim()
  const sb = String(b.section ?? '').trim()
  if (sa !== sb) return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' })
  const na = String(a.name || `${a.grade ?? ''}-${a.section ?? ''}`).trim()
  const nb = String(b.name || `${b.grade ?? ''}-${b.section ?? ''}`).trim()
  return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' })
}
