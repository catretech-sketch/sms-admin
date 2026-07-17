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

/* ---------- Period-style grid (like class timetable) ---------- */

export interface ExamPeriodSession {
  start: string
  label: string
}

export interface ExamPeriodGrid {
  sessions: ExamPeriodSession[]
  dates: string[]
  /** Papers at a date + start (may be multiple classes when viewing “All”). */
  cell: (date: string, start: string) => ExamTimetablePaper[]
}

function sessionLabel(_start: string, index: number, total: number): string {
  if (total === 1) return 'Session'
  if (total === 2) return index === 0 ? 'Morning' : 'Afternoon'
  return `P${index + 1}`
}

/** Build a period × date grid from papers (same mental model as weekly class timetable). */
export function buildExamPeriodGrid(papers: ExamTimetablePaper[]): ExamPeriodGrid {
  const dated = papers.filter((p) => p.date && p.start)
  const dates = [...new Set(dated.map((p) => p.date))].sort((a, b) => a.localeCompare(b))
  const starts = [...new Set(dated.map((p) => p.start))]
    .sort((a, b) => toMinutes(a) - toMinutes(b))
  const sessions = starts.map((start, i) => ({
    start,
    label: sessionLabel(start, i, starts.length),
  }))
  const byKey = new Map<string, ExamTimetablePaper[]>()
  for (const p of dated) {
    const k = `${p.date}|${p.start}`
    const list = byKey.get(k) ?? []
    list.push(p)
    byKey.set(k, list)
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => a.subject.localeCompare(b.subject) || (a.className ?? '').localeCompare(b.className ?? ''))
  }
  return {
    sessions,
    dates,
    cell: (date, start) => byKey.get(`${date}|${start}`) ?? [],
  }
}

export function examSubjectStyle(subject: string): { bg: string; fg: string; bd: string } {
  const hue = ([...subject].reduce((a, c) => a + c.charCodeAt(0), 0) * 7) % 360
  return { bg: `hsl(${hue} 65% 94%)`, fg: `hsl(${hue} 55% 32%)`, bd: `hsl(${hue} 50% 80%)` }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDayHead(iso: string): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short',
  })
}

function cellStyle(subject: string): string {
  const st = examSubjectStyle(subject)
  return `background:${st.bg};color:${st.fg};`
}

function cssUrl(url: string): string {
  return url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export interface ExamTimetablePrintOpts {
  schoolName: string
  examName: string
  grades: string
  from: string
  to: string
  days: ExamTimetableDay[]
  /** Flattened papers — preferred for period grid print. */
  papers?: ExamTimetablePaper[]
  schoolLogoInitials?: string
  schoolLogoUrl?: string | null
  schoolImageUrl?: string | null
  schoolBrandColor?: string
  schoolCity?: string
  autoPrint?: boolean
}

function brandColor(opts: ExamTimetablePrintOpts): string {
  const c = opts.schoolBrandColor?.trim()
  if (c && /^#[0-9a-fA-F]{3,8}$/.test(c)) return c
  return '#1e40af'
}

function buildLogoBlock(opts: ExamTimetablePrintOpts): string {
  const color = brandColor(opts)
  const url = opts.schoolLogoUrl?.trim()
  if (url) {
    return `<img class="tt-logo" src="${esc(url)}" alt="${esc(opts.schoolName)}" />`
  }
  const initials = esc((opts.schoolLogoInitials || opts.schoolName.slice(0, 2)).toUpperCase())
  return `<div class="tt-logo-fallback" style="background:${esc(color)}">${initials}</div>`
}

function watermarkStyle(opts: ExamTimetablePrintOpts): string {
  const url = opts.schoolImageUrl?.trim() || opts.schoolLogoUrl?.trim()
  if (!url) return ''
  return `body::before{content:'';position:fixed;inset:0;background-image:url('${cssUrl(url)}');background-size:38% auto;background-position:center;background-repeat:no-repeat;opacity:0.045;pointer-events:none;z-index:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}`
}

/** Open a print-ready exam timetable — same period-grid look as class timetable. */
export function printExamTimetable(opts: ExamTimetablePrintOpts): boolean {
  const papers = opts.papers?.length
    ? opts.papers
    : opts.days.flatMap((d) => d.papers)
  const grid = buildExamPeriodGrid(papers)
  const brand = brandColor(opts)
  const cityLine = opts.schoolCity?.trim() ? `<p class="tt-city">${esc(opts.schoolCity.trim())}</p>` : ''
  const printed = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  const head = `<tr><th class="tt-period">Period</th>${grid.dates.map((d) =>
    `<th>${esc(fmtDayHead(d))}</th>`,
  ).join('')}</tr>`

  const body = grid.sessions.map((sess) => {
    const cells = grid.dates.map((date) => {
      const list = grid.cell(date, sess.start)
      if (!list.length) return '<td class="tt-empty">—</td>'
      const first = list[0]
      const lines = list.map((p) => {
        const inv = [p.inv1, p.inv2].filter(Boolean).join(' · ')
        const meta = [
          p.className && list.length > 1 ? p.className : '',
          p.room || '',
          inv,
        ].filter(Boolean).join(' · ')
        return `<div class="tt-line"><div class="tt-subj">${esc(p.subject)}</div>${meta ? `<div class="tt-teacher">${esc(meta)}</div>` : ''}</div>`
      }).join('')
      return `<td class="tt-cell" style="${cellStyle(first.subject)}">${lines}</td>`
    }).join('')
    const end = papers.find((p) => p.start === sess.start)
    const timeSub = end
      ? `${sess.start}–${endTime(sess.start, end.duration)}`
      : sess.start
    return `<tr>
      <td class="tt-period"><div>${esc(sess.label)}</div><div class="tt-period-time">${esc(timeSub)}</div></td>
      ${cells}
    </tr>`
  }).join('')

  const table = grid.dates.length
    ? `<section class="tt-section"><h2 class="tt-section-title">${esc(opts.examName)} · ${esc(opts.grades)}</h2>
       <table class="tt-table"><thead>${head}</thead><tbody>${body}</tbody></table></section>`
    : '<p class="tt-print-hint">No papers scheduled.</p>'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.schoolName)} — Exam timetable ${esc(opts.examName)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm 9mm; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0; padding: 12px 14px; position: relative;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      font-size: 13px; color: #0f172a; line-height: 1.35;
      background: linear-gradient(180deg, ${brand}10 0%, #ffffff 140px);
    }
    ${watermarkStyle(opts)}
    .tt-content { position: relative; z-index: 1; }
    .tt-header {
      display: flex; align-items: center; gap: 18px; margin-bottom: 16px;
      padding: 14px 16px; border-radius: 12px;
      background: linear-gradient(135deg, ${brand}1a, ${brand}08);
      border: 1.5px solid ${brand}40; border-left: 5px solid ${brand};
    }
    .tt-logo { width: 72px; height: 72px; object-fit: contain; border-radius: 12px; border: 2px solid ${brand}55; background: #fff; display: block; }
    .tt-logo-fallback {
      width: 72px; height: 72px; border-radius: 12px; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 800;
    }
    .tt-school { font-size: 26px; font-weight: 800; margin: 0 0 3px; }
    .tt-city { font-size: 13px; color: #475569; margin: 0 0 5px; font-weight: 500; }
    .tt-heading { font-size: 16px; font-weight: 700; margin: 0 0 4px; color: ${brand}; }
    .tt-meta { font-size: 12px; color: #64748b; margin: 0; font-weight: 500; }
    .tt-section { margin-bottom: 18px; }
    .tt-section-title { font-size: 16px; font-weight: 800; margin: 0 0 10px; color: ${brand}; }
    .tt-table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; border: 1.5px solid #94a3b8; }
    .tt-table th, .tt-table td { border: 1.25px solid #94a3b8; padding: 10px 9px; vertical-align: middle; }
    .tt-table th { background: ${brand}18; font-weight: 800; text-align: center; font-size: 12px; }
    .tt-period { width: 88px; text-align: center; font-weight: 800; background: #f1f5f9; font-size: 13px; }
    .tt-period-time { font-size: 10px; font-weight: 600; color: #64748b; margin-top: 3px; }
    .tt-cell { min-height: 58px; }
    .tt-subj { font-weight: 800; font-size: 13px; line-height: 1.3; }
    .tt-teacher { font-size: 11px; color: #1e293b; margin-top: 3px; line-height: 1.25; font-weight: 600; }
    .tt-line + .tt-line { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1; }
    .tt-empty { text-align: center; color: #94a3b8; background: #f8fafc; font-size: 14px; font-weight: 600; }
    .tt-print-bar { margin-top: 18px; display: flex; gap: 12px; align-items: center; }
    .tt-print-btn {
      font: inherit; font-size: 14px; font-weight: 700; padding: 10px 18px; border-radius: 8px;
      border: 1px solid ${brand}; background: ${brand}; color: #fff; cursor: pointer;
    }
    .tt-print-hint { font-size: 13px; color: #64748b; margin: 0; }
    @media print {
      body { padding: 0; background: #fff !important; }
      .no-print { display: none !important; }
      .tt-header, .tt-table th, .tt-cell { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="tt-content">
  <header class="tt-header">
    <div class="tt-logo-wrap">${buildLogoBlock(opts)}</div>
    <div class="tt-header-text">
      <h1 class="tt-school">${esc(opts.schoolName)}</h1>
      ${cityLine}
      <p class="tt-heading">Exam timetable · ${esc(opts.examName)}</p>
      <p class="tt-meta">${esc(opts.grades)} · ${esc(opts.from)} – ${esc(opts.to)} · Printed ${esc(printed)}</p>
    </div>
  </header>
  ${table}
  <div class="tt-print-bar no-print">
    <button type="button" class="tt-print-btn" onclick="window.print()">Print / Save as PDF</button>
    <p class="tt-print-hint">In the print dialog choose “Save as PDF”.</p>
  </div>
  </div>
  ${opts.autoPrint === false ? '' : `<script>
    function runPrint(){ window.focus(); window.print(); }
    setTimeout(runPrint, 400);
  </script>`}
</body>
</html>`

  const w = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=720')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}

