/* Printable timetable — opens a print-ready document (Save as PDF in browser). */
import { cellKey, conflictsFor, subjectSchedule, teacherSchedule, type Grid, type Grids } from './timetable'

export const PRINT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const PRINT_PERIODS = 8
export const PRINT_LUNCH_AFTER = 4

export type TimetablePrintView = 'class' | 'teacher' | 'subject' | 'overview'

export interface TimetablePrintOpts {
  schoolName: string
  /** School initials when no logo image (e.g. "GV"). */
  schoolLogoInitials?: string
  /** Logo image URL or data URL from school profile. */
  schoolLogoUrl?: string | null
  /** Campus / cover image for subtle PDF watermark. */
  schoolImageUrl?: string | null
  /** Brand hex color from school profile. */
  schoolBrandColor?: string
  schoolCity?: string
  view: TimetablePrintView
  grids: Grids
  teacherNameOf: (id: string) => string
  publishedAt?: string | null
  className?: string
  teacherId?: string
  teacherLabel?: string
  subjectName?: string
  /** When false, omit auto-print script (for saved files). Default true. */
  autoPrint?: boolean
}

export type TimetableExportResult = 'saved' | 'printed' | 'cancelled' | 'blocked'

type RowDesc = { type: 'period'; p: number } | { type: 'lunch' }

function periodRows(): RowDesc[] {
  const rows: RowDesc[] = []
  for (let p = 0; p < PRINT_PERIODS; p++) {
    rows.push({ type: 'period', p })
    if (p === PRINT_LUNCH_AFTER - 1) rows.push({ type: 'lunch' })
  }
  return rows
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function subjHue(name: string): number {
  return ([...name].reduce((a, c) => a + c.charCodeAt(0), 0) * 7) % 360
}

function cellStyle(subject: string): string {
  const h = subjHue(subject)
  return `background:hsl(${h} 58% 92%);color:hsl(${h} 62% 22%);`
}

function cssUrl(url: string): string {
  return url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function brandColor(opts: TimetablePrintOpts): string {
  const c = opts.schoolBrandColor?.trim()
  if (c && /^#[0-9a-fA-F]{3,8}$/.test(c)) return c
  return '#1e40af'
}

function buildLogoBlock(opts: TimetablePrintOpts): string {
  const color = brandColor(opts)
  const url = opts.schoolLogoUrl?.trim()
  if (url) {
    return `<img class="tt-logo" src="${esc(url)}" alt="${esc(opts.schoolName)}" />`
  }
  const initials = esc((opts.schoolLogoInitials || opts.schoolName.slice(0, 2)).toUpperCase())
  return `<div class="tt-logo-fallback" style="background:${esc(color)}">${initials}</div>`
}

function watermarkStyle(opts: TimetablePrintOpts): string {
  const url = opts.schoolImageUrl?.trim() || opts.schoolLogoUrl?.trim()
  if (!url) return ''
  return `body::before{content:'';position:fixed;inset:0;background-image:url('${cssUrl(url)}');background-size:38% auto;background-position:center;background-repeat:no-repeat;opacity:0.045;pointer-events:none;z-index:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}`
}

function formatPublished(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return null
  }
}

function emptyCell(): string {
  return '<td class="tt-empty">—</td>'
}

function classCell(cell: { subject: string; teacherId: string } | null | undefined, teacherNameOf: (id: string) => string, clash: boolean): string {
  if (!cell) return emptyCell()
  const clashCls = clash ? ' tt-clash' : ''
  return `<td class="tt-cell${clashCls}" style="${cellStyle(cell.subject)}">
    <div class="tt-subj">${esc(cell.subject)}</div>
    <div class="tt-teacher">${esc(teacherNameOf(cell.teacherId))}</div>
  </td>`
}

function buildClassTable(
  title: string,
  grid: Grid,
  grids: Grids,
  cls: string,
  teacherNameOf: (id: string) => string,
): string {
  const conflicts = conflictsFor(grids, cls)
  const head = `<tr><th class="tt-period">Period</th>${PRINT_DAYS.map((d) => `<th>${esc(d)}</th>`).join('')}</tr>`
  const body = periodRows().map((rd) => {
    if (rd.type === 'lunch') {
      return `<tr class="tt-lunch"><td>☕</td><td colspan="${PRINT_DAYS.length}">Lunch break</td></tr>`
    }
    const periodCells = PRINT_DAYS.map((_d, di) => {
      const key = cellKey(di, rd.p)
      return classCell(grid[key], teacherNameOf, conflicts.has(key))
    }).join('')
    return `<tr><td class="tt-period">P${rd.p + 1}</td>${periodCells}</tr>`
  }).join('')
  return `<section class="tt-section"><h2 class="tt-section-title">${esc(title)}</h2><table class="tt-table"><thead>${head}</thead><tbody>${body}</tbody></table></section>`
}

function buildTeacherTable(
  grids: Grids,
  teacherId: string,
  teacherLabel: string,
): string {
  const sched = teacherSchedule(grids, teacherId)
  const head = `<tr><th class="tt-period">Period</th>${PRINT_DAYS.map((d) => `<th>${esc(d)}</th>`).join('')}</tr>`
  const body = periodRows().map((rd) => {
    if (rd.type === 'lunch') {
      return `<tr class="tt-lunch"><td>☕</td><td colspan="${PRINT_DAYS.length}">Lunch break</td></tr>`
    }
    const periodCells = PRINT_DAYS.map((_d, di) => {
      const entries = sched[cellKey(di, rd.p)] ?? []
      if (!entries.length) return emptyCell()
      const clash = entries.length > 1
      const lines = entries.map((e) =>
        `<div class="tt-line${clash ? ' tt-clash-text' : ''}"><span class="tt-subj">${esc(e.cls)}</span> · ${esc(e.subject)}</div>`,
      ).join('')
      const style = cellStyle(entries[0].subject)
      return `<td class="tt-cell${clash ? ' tt-clash' : ''}" style="${style}">${lines}</td>`
    }).join('')
    return `<tr><td class="tt-period">P${rd.p + 1}</td>${periodCells}</tr>`
  }).join('')
  return `<section class="tt-section"><h2 class="tt-section-title">${esc(teacherLabel)}</h2><table class="tt-table"><thead>${head}</thead><tbody>${body}</tbody></table></section>`
}

function buildSubjectTable(
  grids: Grids,
  subject: string,
  teacherNameOf: (id: string) => string,
): string {
  const sched = subjectSchedule(grids, subject)
  const head = `<tr><th class="tt-period">Period</th>${PRINT_DAYS.map((d) => `<th>${esc(d)}</th>`).join('')}</tr>`
  const body = periodRows().map((rd) => {
    if (rd.type === 'lunch') {
      return `<tr class="tt-lunch"><td>☕</td><td colspan="${PRINT_DAYS.length}">Lunch break</td></tr>`
    }
    const periodCells = PRINT_DAYS.map((_d, di) => {
      const entries = sched[cellKey(di, rd.p)] ?? []
      if (!entries.length) return emptyCell()
      const clash = entries.length > 1
      const lines = entries.map((e) =>
        `<div class="tt-line${clash ? ' tt-clash-text' : ''}"><span class="tt-subj">${esc(e.cls)}</span> · ${esc(teacherNameOf(e.teacherId))}</div>`,
      ).join('')
      const style = cellStyle(subject)
      return `<td class="tt-cell${clash ? ' tt-clash' : ''}" style="${style}">${lines}</td>`
    }).join('')
    return `<tr><td class="tt-period">P${rd.p + 1}</td>${periodCells}</tr>`
  }).join('')
  return `<section class="tt-section"><h2 class="tt-section-title">${esc(subject)}</h2><table class="tt-table"><thead>${head}</thead><tbody>${body}</tbody></table></section>`
}

function builtClasses(grids: Grids): string[] {
  return Object.keys(grids)
    .filter((cls) => Object.values(grids[cls] ?? {}).some(Boolean))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export function buildTimetablePrintHtml(opts: TimetablePrintOpts): string {
  const printed = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const published = formatPublished(opts.publishedAt)
  let subtitle = ''
  let sections = ''

  switch (opts.view) {
    case 'class': {
      const cls = opts.className ?? ''
      subtitle = `Class ${cls}`
      sections = buildClassTable(`Class ${cls}`, opts.grids[cls] ?? {}, opts.grids, cls, opts.teacherNameOf)
      break
    }
    case 'teacher': {
      const label = opts.teacherLabel || opts.teacherNameOf(opts.teacherId ?? '') || 'Teacher'
      subtitle = label
      sections = buildTeacherTable(opts.grids, opts.teacherId ?? '', label)
      break
    }
    case 'subject': {
      const subj = opts.subjectName ?? ''
      subtitle = subj
      sections = buildSubjectTable(opts.grids, subj, opts.teacherNameOf)
      break
    }
    case 'overview': {
      subtitle = 'All classes'
      const classes = builtClasses(opts.grids)
      sections = classes.map((cls) => buildClassTable(cls, opts.grids[cls] ?? {}, opts.grids, cls, opts.teacherNameOf)).join('')
      break
    }
  }

  const meta = [
    printed ? `Printed ${printed}` : '',
    published ? `Published ${published}` : '',
  ].filter(Boolean).join(' · ')
  const brand = brandColor(opts)
  const cityLine = opts.schoolCity?.trim() ? `<p class="tt-city">${esc(opts.schoolCity.trim())}</p>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.schoolName)} — Timetable ${esc(subtitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm 9mm; }
    * { box-sizing: border-box; }
    html {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: geometricPrecision;
    }
    body {
      margin: 0; padding: 12px 14px; position: relative;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      font-size: 13px; color: #0f172a; line-height: 1.35;
      background: linear-gradient(180deg, ${brand}10 0%, #ffffff 140px);
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    ${watermarkStyle(opts)}
    .tt-content { position: relative; z-index: 1; }
    .tt-header {
      display: flex; align-items: center; gap: 18px; margin-bottom: 16px;
      padding: 14px 16px; border-radius: 12px;
      background: linear-gradient(135deg, ${brand}1a, ${brand}08);
      border: 1.5px solid ${brand}40; border-left: 5px solid ${brand};
    }
    .tt-logo-wrap { flex: 0 0 auto; }
    .tt-logo {
      width: 72px; height: 72px; object-fit: contain; border-radius: 12px;
      border: 2px solid ${brand}55; background: #fff; display: block;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
    .tt-logo-fallback {
      width: 72px; height: 72px; border-radius: 12px; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 800; letter-spacing: 0.03em;
    }
    .tt-header-text { min-width: 0; flex: 1; }
    .tt-school { font-size: 26px; font-weight: 800; margin: 0 0 3px; color: #0f172a; letter-spacing: -0.01em; }
    .tt-city { font-size: 13px; color: #475569; margin: 0 0 5px; font-weight: 500; }
    .tt-heading { font-size: 16px; font-weight: 700; margin: 0 0 4px; color: ${brand}; }
    .tt-meta { font-size: 12px; color: #64748b; margin: 0; font-weight: 500; }
    .tt-section { margin-bottom: 18px; page-break-inside: avoid; }
    .tt-section + .tt-section { page-break-before: always; }
    .tt-section-title { font-size: 16px; font-weight: 800; margin: 0 0 10px; color: ${brand}; }
    .tt-table {
      width: 100%; border-collapse: collapse; table-layout: fixed;
      background: #fff; border: 1.5px solid #94a3b8;
    }
    .tt-table th, .tt-table td {
      border: 1.25px solid #94a3b8; padding: 10px 9px; vertical-align: middle;
    }
    .tt-table th {
      background: ${brand}18; font-weight: 800; text-align: center;
      font-size: 13px; color: #0f172a; letter-spacing: 0.02em; padding: 11px 8px;
    }
    .tt-period {
      width: 56px; text-align: center; font-weight: 800;
      background: #f1f5f9; font-size: 13px; color: #0f172a;
    }
    .tt-cell { min-height: 58px; height: 58px; }
    .tt-subj { font-weight: 800; font-size: 13px; line-height: 1.3; color: inherit; }
    .tt-teacher { font-size: 12px; color: #1e293b; margin-top: 4px; line-height: 1.25; font-weight: 600; }
    .tt-line { font-size: 12px; line-height: 1.35; font-weight: 600; }
    .tt-empty { text-align: center; color: #94a3b8; background: #f8fafc; font-size: 14px; font-weight: 600; }
    .tt-lunch td {
      background: #fef3c7; text-align: center; font-weight: 800;
      color: #92400e; font-size: 13px; padding: 10px 8px;
    }
    .tt-clash { outline: 2.5px solid #dc2626; outline-offset: -2px; }
    .tt-clash-text { color: #b91c1c; font-weight: 700; }
    .tt-print-bar { margin-top: 18px; display: flex; gap: 12px; align-items: center; }
    .tt-print-btn {
      font: inherit; font-size: 14px; font-weight: 700; padding: 10px 18px; border-radius: 8px;
      border: 1px solid ${brand}; background: ${brand}; color: #fff; cursor: pointer;
    }
    .tt-print-hint { font-size: 13px; color: #64748b; margin: 0; }
    @media print {
      body { padding: 0; background: #fff !important; }
      .no-print { display: none !important; }
      .tt-section + .tt-section { page-break-before: always; }
      .tt-table { background: #fff; }
      .tt-logo {
        image-rendering: auto;
        -ms-interpolation-mode: bicubic;
      }
      .tt-header, .tt-table th, .tt-lunch td, .tt-cell {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
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
      <p class="tt-heading">Weekly timetable · ${esc(subtitle)}</p>
      ${meta ? `<p class="tt-meta">${esc(meta)}</p>` : ''}
    </div>
  </header>
  ${sections || '<p class="tt-print-hint">No timetable periods assigned yet.</p>'}
  <div class="tt-print-bar no-print">
    <button type="button" class="tt-print-btn" onclick="window.print()">Print / Save as PDF</button>
    <p class="tt-print-hint">In the print dialog choose &ldquo;Save as PDF&rdquo; and pick your folder.</p>
  </div>
  </div>
  ${opts.autoPrint === false ? '' : `<script>
    function runPrint() {
      window.focus();
      window.print();
    }
    function whenReady() {
      var imgs = Array.prototype.slice.call(document.images || []);
      if (!imgs.length) { setTimeout(runPrint, 350); return; }
      var left = imgs.length;
      var done = function () {
        left -= 1;
        if (left <= 0) setTimeout(runPrint, 250);
      };
      imgs.forEach(function (img) {
        if (img.complete) done();
        else { img.addEventListener('load', done); img.addEventListener('error', done); }
      });
      setTimeout(runPrint, 1800);
    }
    if (document.readyState === 'complete') whenReady();
    else window.addEventListener('load', whenReady);
  </script>`}
</body>
</html>`
}

function safeFilePart(s: string | undefined | null, max = 32): string {
  return String(s || '')
    .trim()
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max)
}

/** Suggested download / save-as filename (without extension). */
export function suggestedTimetableFileName(opts: TimetablePrintOpts): string {
  const focus =
    opts.view === 'class' ? opts.className
      : opts.view === 'teacher' ? (opts.teacherLabel || opts.teacherId)
        : opts.view === 'subject' ? opts.subjectName
          : 'All_Classes'
  const date = new Date().toISOString().slice(0, 10)
  const parts = [safeFilePart(opts.schoolName, 24), safeFilePart(focus, 20), 'Timetable', date].filter(Boolean)
  return parts.join('-') || `Timetable-${date}`
}

function printViaIframe(html: string): boolean {
  const prev = document.getElementById('sm-timetable-print-frame')
  if (prev) prev.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'sm-timetable-print-frame'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    return false
  }

  doc.open()
  doc.write(html)
  doc.close()
  return true
}

function downloadHtmlFile(html: string, fileName: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function saveHtmlWithPathPicker(html: string, fileName: string): Promise<'saved' | 'cancelled' | 'unavailable'> {
  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName?: string
      types?: Array<{ description: string; accept: Record<string, string[]> }>
    }) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>
  }
  if (typeof w.showSaveFilePicker !== 'function') return 'unavailable'
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: fileName.endsWith('.html') ? fileName : `${fileName}.html`,
      types: [{
        description: 'Timetable (open → Print → Save as PDF)',
        accept: { 'text/html': ['.html'] },
      }],
    })
    const writable = await handle.createWritable()
    await writable.write(new Blob([html], { type: 'text/html;charset=utf-8' }))
    await writable.close()
    return 'saved'
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
      return 'cancelled'
    }
    return 'unavailable'
  }
}

/**
 * Every click: ask for a save path (when supported), then open the print dialog
 * so the user can pick “Save as PDF” to that folder again.
 */
export async function exportTimetablePdf(opts: TimetablePrintOpts): Promise<TimetableExportResult> {
  const baseName = suggestedTimetableFileName(opts)
  const saveHtml = buildTimetablePrintHtml({ ...opts, autoPrint: false })
  const printHtml = buildTimetablePrintHtml({ ...opts, autoPrint: true })

  const pick = await saveHtmlWithPathPicker(saveHtml, `${baseName}.html`)
  if (pick === 'cancelled') return 'cancelled'
  if (pick === 'unavailable') downloadHtmlFile(saveHtml, `${baseName}.html`)

  const printed = printViaIframe(printHtml)
  if (!printed && pick !== 'saved') return 'blocked'
  return pick === 'saved' ? 'saved' : 'printed'
}

/** @deprecated Prefer exportTimetablePdf — kept for callers that need sync print. */
export function printTimetable(opts: TimetablePrintOpts): boolean {
  return printViaIframe(buildTimetablePrintHtml({ ...opts, autoPrint: true }))
}

export function hasPrintableTimetable(grids: Grids): boolean {
  return builtClasses(grids).length > 0
}
