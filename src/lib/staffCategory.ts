/** Staff category keys used on Staff & support tiles and API filters. */
export type StaffCategory = 'transport' | 'security' | 'academic' | 'admin' | 'support'

export const STAFF_CATEGORY_LABELS: Record<StaffCategory, string> = {
  transport: 'Transport',
  security: 'Security',
  academic: 'Academic',
  admin: 'Admin',
  support: 'Support',
}

const DEPT_HINTS: [StaffCategory, RegExp][] = [
  ['transport', /transport|driver|conductor|bus/i],
  ['security', /security|guard|gate/i],
  ['academic', /academic|lab|library|librarian/i],
  ['admin', /admin|office|account|clerk|principal|vice/i],
  ['support', /support|housekeep|nurse|cook|gardener|peon|clean/i],
]

/** Infer category slug from department / role text when API category is missing. */
export function inferStaffCategory(dept?: string | null, role?: string | null): StaffCategory | '' {
  const hay = `${dept ?? ''} ${role ?? ''}`.trim()
  if (!hay) return ''
  for (const [cat, re] of DEPT_HINTS) {
    if (re.test(hay)) return cat
  }
  return ''
}

/** Normalize API / form values to a category slug for counts & filters. */
export function normalizeStaffCategory(
  cat?: string | null,
  dept?: string | null,
  role?: string | null,
): StaffCategory | '' {
  const raw = (cat ?? '').trim().toLowerCase()
  if (raw === 'transport' || raw === 'security' || raw === 'academic' || raw === 'admin' || raw === 'support') {
    return raw
  }
  /* legacy / label values */
  if (raw.includes('transport')) return 'transport'
  if (raw.includes('security')) return 'security'
  if (raw.includes('academic')) return 'academic'
  if (raw.includes('admin')) return 'admin'
  if (raw.includes('support')) return 'support'
  return inferStaffCategory(dept, role)
}

export function staffCategoryLabel(cat?: string | null, dept?: string | null, role?: string | null): string {
  const key = normalizeStaffCategory(cat, dept, role)
  return key ? STAFF_CATEGORY_LABELS[key] : '—'
}
