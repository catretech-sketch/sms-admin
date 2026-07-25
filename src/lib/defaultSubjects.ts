/** Default academic subjects used across CRM dropdowns when seeded. */
export const DEFAULT_SUBJECTS = [
  'English', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Computer',
  'Physics', 'Chemistry', 'Biology', 'Sanskrit', 'Physical Education', 'Arts', 'Music', 'EVS',
] as const

export function defaultSubjectNames(): string[] {
  return [...DEFAULT_SUBJECTS]
}

type SubjectLike = string | { name?: string }

/** Defaults + live API subjects + any extra selected names (deduped, sorted). */
export function mergeSubjectNames(
  live: SubjectLike[] | null | undefined,
  selected?: string[],
): string[] {
  const names = new Set(defaultSubjectNames())
  for (const s of live ?? []) {
    const n = (typeof s === 'string' ? s : (s.name ?? '')).trim()
    if (n) names.add(n)
  }
  for (const s of selected ?? []) {
    const n = s.trim()
    if (n) names.add(n)
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
