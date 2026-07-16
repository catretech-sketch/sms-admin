/* Day-wise exam timetable helpers + print-ready HTML. */
import { endTime } from './examData'

export interface ExamTimetablePaper {
  id: string
  classId?: string | null
  className?: string
  subject: string
  date: string
  start: string
  duration: number
  room: string
  inv1: string
  inv2: string
  maxMarks?: number
}

export interface ExamTimetableDay {
  date: string
  papers: ExamTimetablePaper[]
}

function toMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

/* ---------- Auto-generate ---------- */

/** One time-period session in an exam day (e.g. Morning 09:30). */
export interface ExamSession {
  label?: string
  start: string   // HH:MM
}

export interface ExamAutoConfig {
  subjects: string[]
  startDate: string           // yyyy-mm-dd
  sessions: ExamSession[]     // one or more time slots per exam day
  duration: number            // minutes per paper
  gapDays?: number            // extra calendar days between exam days (0 = daily)
  skipSunday?: boolean
  skipSaturday?: boolean
  room?: string
  classId?: string | null
  className?: string
}

export interface ExamAutoSlot {
  subject: string
  date: string
  start: string
  duration: number
  room: string
  classId?: string | null
  className?: string
  session?: string
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSkipped(iso: string, cfg: ExamAutoConfig): boolean {
  const day = new Date(iso + 'T00:00:00').getDay() // 0 Sun ... 6 Sat
  if (cfg.skipSunday && day === 0) return true
  if (cfg.skipSaturday && day === 6) return true
  return false
}

/**
 * Spread subjects across exam days using the given time-period sessions.
 * Fills each exam day's sessions in order, then advances by 1 + gapDays,
 * skipping weekends as configured. Pure + deterministic.
 */
export function autoBuildExamSlots(cfg: ExamAutoConfig): ExamAutoSlot[] {
  const subjects = cfg.subjects.map((s) => s.trim()).filter(Boolean)
  const sessions = cfg.sessions.filter((s) => /^\d{1,2}:\d{2}$/.test(s.start.trim()))
  if (!subjects.length || !sessions.length || !cfg.startDate) return []

  const gap = Math.max(0, Math.floor(cfg.gapDays ?? 0))
  const duration = Math.max(1, Math.round(cfg.duration || 180))
  const room = cfg.room ?? ''
  const out: ExamAutoSlot[] = []

  let date = cfg.startDate
  let guard = 0 // avoid infinite loop on all-skipped configs
  let si = 0
  while (si < subjects.length && guard < 366) {
    guard += 1
    if (isSkipped(date, cfg)) { date = addDays(date, 1); continue }

    for (const session of sessions) {
      if (si >= subjects.length) break
      out.push({
        subject: subjects[si],
        date,
        start: session.start.trim(),
        duration,
        room,
        classId: cfg.classId ?? null,
        className: cfg.className,
        session: session.label,
      })
      si += 1
    }
    date = addDays(date, 1 + gap)
  }
  return out
}

/** Group papers by date, sorted by date then start time. */
export function groupExamTimetable(papers: ExamTimetablePaper[]): ExamTimetableDay[] {
  const byDate = new Map<string, ExamTimetablePaper[]>()
  for (const p of papers) {
    if (!p.date) continue
    const list = byDate.get(p.date) ?? []
    list.push(p)
    byDate.set(p.date, list)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      papers: [...list].sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.subject.localeCompare(b.subject)),
    }))
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtLong(iso: string): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
  })
}

export interface ExamTimetablePrintOpts {
  schoolName: string
  examName: string
  grades: string
  from: string
  to: string
  days: ExamTimetableDay[]
  autoPrint?: boolean
}

/** Open a print-ready exam timetable window. */
export function printExamTimetable(opts: ExamTimetablePrintOpts): boolean {
  const rows = opts.days.flatMap((day) =>
    day.papers.map((p, i) => {
      const inv = [p.inv1, p.inv2].filter(Boolean).join(' · ') || '—'
      return `<tr>
        ${i === 0 ? `<td rowspan="${day.papers.length}" class="day">${esc(fmtLong(day.date))}</td>` : ''}
        <td>${esc(p.className || 'All classes')}</td>
        <td class="subj">${esc(p.subject)}</td>
        <td>${esc(p.start)} – ${esc(endTime(p.start, p.duration))}</td>
        <td>${p.duration} min</td>
        <td>${esc(p.room || '—')}</td>
        <td>${esc(inv)}</td>
        <td>${p.maxMarks ?? 100}</td>
      </tr>`
    }),
  ).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${esc(opts.examName)} — Exam timetable</title>
<style>
  body{font-family:Segoe UI,system-ui,sans-serif;margin:24px;color:#0f172a}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#64748b;font-size:13px;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-weight:600}
  .day{font-weight:600;background:#f8fafc;white-space:nowrap}
  .subj{font-weight:600}
  @media print{body{margin:12px} button{display:none}}
</style></head><body>
  <h1>${esc(opts.schoolName)}</h1>
  <div class="sub">${esc(opts.examName)} · Grades ${esc(opts.grades)} · ${esc(opts.from)} – ${esc(opts.to)}</div>
  <table>
    <thead><tr>
      <th>Date</th><th>Class</th><th>Subject</th><th>Time</th><th>Duration</th><th>Room</th><th>Invigilators</th><th>Max</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="8">No papers scheduled</td></tr>'}</tbody>
  </table>
  ${opts.autoPrint !== false ? '<script>window.onload=()=>window.print()</script>' : ''}
</body></html>`

  const w = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
