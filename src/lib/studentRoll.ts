/** Class roll is A–Z by name within grade+section (same rules as SQL Student_RenumberClass). */

export type RollClassmate = {
  id: string
  name: string
  adm?: string
  status?: string
  grade?: string
  section?: string
  cls?: string
}

export type RollClassInfo = {
  grade: string
  section: string
  cls: string
}

export function formatStudentRoll(roll: number | null | undefined): string {
  return roll != null && Number(roll) > 0 ? String(roll) : '—'
}

export function classmatesInClass(
  roster: RollClassmate[],
  cls: RollClassInfo,
  selfId: string,
): RollClassmate[] {
  return roster.filter((s) => {
    if (s.id === selfId) return false
    if (s.status && s.status !== 'active') return false
    if (cls.grade && cls.section && s.grade && s.section) {
      return s.grade === cls.grade && s.section === cls.section
    }
    if (cls.cls && s.cls) return s.cls === cls.cls
    return false
  })
}

function sortKey(a: { name: string; adm: string; id: string }, b: { name: string; adm: string; id: string }): number {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  if (byName !== 0) return byName
  const byAdm = a.adm.localeCompare(b.adm, undefined, { sensitivity: 'base' })
  if (byAdm !== 0) return byAdm
  return a.id.localeCompare(b.id)
}

/** Predicted 1-based roll for the student being added/edited. Null until a class is chosen. */
export function predictStudentRoll(args: {
  name: string
  adm?: string
  selfId: string
  classInfo: RollClassInfo
  roster: RollClassmate[]
}): number | null {
  const { name, adm, selfId, classInfo, roster } = args
  if (!classInfo.cls && !classInfo.grade) return null

  const rows = classmatesInClass(roster, classInfo, selfId).map((s) => ({
    id: s.id,
    name: (s.name || '').trim(),
    adm: s.adm ?? '',
  }))
  rows.push({
    id: selfId,
    name: name.trim() || '\uffff',
    adm: (adm ?? '').trim() || '\uffff',
  })
  rows.sort(sortKey)
  const idx = rows.findIndex((r) => r.id === selfId)
  return idx >= 0 ? idx + 1 : null
}
