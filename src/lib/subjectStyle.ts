/** Deterministic colour per subject name (shared by Academics + Attendance). */
export function subjStyle(s: string): { bg: string; fg: string; bd: string } {
  const key = (s || '—').trim() || '—'
  const hue = ([...key].reduce((a, c) => a + c.charCodeAt(0), 0) * 7) % 360
  return { bg: `hsl(${hue} 65% 94%)`, fg: `hsl(${hue} 55% 32%)`, bd: `hsl(${hue} 50% 80%)` }
}
