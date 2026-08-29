/** Live student attendance for the school dashboard (principal period SoT). */

export function studentLiveAttendance(input: {
  loaded: boolean
  presentTotal?: number | null
  studentTotal?: number | null
  overallPct?: number | null
  enrollment?: number
}): {
  pct: number | null
  meter: number
  present: number
  marked: number
  footnote: string
} {
  if (!input.loaded) {
    return { pct: null, meter: 0, present: 0, marked: 0, footnote: 'Loading…' }
  }

  const markedRaw = Number(input.studentTotal)
  const presentRaw = Number(input.presentTotal)
  const marked = Number.isFinite(markedRaw) && markedRaw > 0 ? markedRaw : 0
  const present = Number.isFinite(presentRaw) ? presentRaw : 0
  const apiPct = Number(input.overallPct)
  const hasOfficialPct = Number.isFinite(apiPct) && apiPct > 0

  if (marked > 0) {
    const pct = Number.isFinite(apiPct) ? Math.round(apiPct) : Math.round((present / marked) * 100)
    return {
      pct,
      meter: pct,
      present,
      marked,
      footnote: `${present} present/late · period marks`,
    }
  }

  if (hasOfficialPct) {
    const pct = Math.round(apiPct)
    return {
      pct,
      meter: pct,
      present,
      marked: 0,
      footnote: `Today ${pct}%`,
    }
  }

  return {
    pct: null,
    meter: 0,
    present: 0,
    marked: 0,
    footnote: 'No period marks today',
  }
}
