import { fmtMoney } from '@/lib/format'
import { properName } from '@/lib/properCase'
import type { PayrollLine, PayrollRun } from '@/api/payroll'

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Payroll run → CSV (one row per person + a totals row). */
export function payrollRunToCsv(run: PayrollRun): string {
  const header = [
    'Name', 'Type', 'Role', 'Department',
    'Basic', 'HRA', 'Allowances', 'Gross',
    'EPF', 'Professional tax', 'Other deductions', 'Deductions', 'Net pay',
  ]
  const rows = run.lines.map((l) => [
    l.name, l.personType, l.role ?? '', l.dept ?? '',
    l.basic, l.hra, l.allowances, l.gross,
    l.epf, l.profTax, l.otherDeductions, l.deductions, l.net,
  ])
  const totals = ['TOTAL', '', '', '', '', '', '', run.gross, '', '', '', run.deductions, run.net]
  return [header, ...rows, totals].map((r) => r.map(csvCell).join(',')).join('\n')
}

export function payrollCsvFileName(run: PayrollRun): string {
  return `Payroll-${run.period || 'run'}.csv`
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface PayslipMeta {
  schoolName: string
  schoolCity?: string
  periodLabel: string
  currency?: string
  status?: string
  /** School logo image URL; when absent the initials badge is used. */
  logoUrl?: string | null
  /** Initials fallback for the logo badge (e.g. "GW"). */
  logoInitials?: string
  /** Brand colour for the letterhead accent. */
  brandColor?: string
  /** When true, the document prints itself on load (used for print-to-PDF). */
  autoPrint?: boolean
}

function personKind(line: PayrollLine): string {
  return line.personType === 'teacher' ? 'Teacher'
    : line.personType === 'leadership' ? 'Leadership'
      : 'Staff'
}

function logoMarkup(meta: PayslipMeta, brand: string): string {
  if (meta.logoUrl) {
    return `<div class="logo-shell"><img class="logo" src="${esc(meta.logoUrl)}" alt="${esc(meta.schoolName)} logo" decoding="sync" /></div>`
  }
  const initials = esc((meta.logoInitials || meta.schoolName || '?').slice(0, 3).toUpperCase())
  return `<div class="logo-shell badge" style="background:${brand}"><span class="logo-initials">${initials}</span></div>`
}

/** Printable, PDF-ready payslip for a single person from a payroll run line. */
export function buildPayslipHtml(line: PayrollLine, meta: PayslipMeta): string {
  const cur = meta.currency
  const name = properName(line.name)
  const school = properName(meta.schoolName)
  const brand = meta.brandColor && /^#?[0-9a-fA-F]{3,8}$/.test(meta.brandColor)
    ? (meta.brandColor.startsWith('#') ? meta.brandColor : `#${meta.brandColor}`)
    : '#4f46e5'
  const earnRow = (label: string, amt: number) =>
    amt > 0 ? `<div class="row"><span>${esc(label)}</span><strong>${esc(fmtMoney(amt, cur))}</strong></div>` : ''
  const dedRow = (label: string, amt: number) =>
    amt > 0 ? `<div class="row"><span>${esc(label)}</span><strong>− ${esc(fmtMoney(amt, cur))}</strong></div>` : ''
  const autoPrint = meta.autoPrint
    ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},250);});</script>'
    : ''
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Payslip — ${esc(name)} — ${esc(meta.periodLabel)}</title>
<style>
  *{box-sizing:border-box}
  @page{size:A4;margin:14mm}
  html,body{background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font:13px/1.5 system-ui,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0;padding:24px}
  .sheet{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.06)}
  .head{display:flex;align-items:center;gap:16px;padding:22px 24px;border-bottom:3px solid ${brand}}
  .logo-shell{flex:0 0 auto;width:64px;height:64px;border-radius:14px;background:#fff;border:1px solid #e8ecf4;box-shadow:0 2px 10px rgba(15,23,42,.08);padding:8px;display:flex;align-items:center;justify-content:center}
  .logo-shell.badge{border:none;padding:0}
  .logo{width:100%;height:100%;object-fit:contain;object-position:center;display:block}
  .logo-initials{color:#fff;font-weight:800;font-size:22px;letter-spacing:.04em;line-height:1}
  .head .info{flex:1;min-width:0}
  h1{font-size:20px;margin:0 0 2px;line-height:1.2}
  .muted{color:#64748b;font-size:12px}
  .head .doc{text-align:right}
  .doc .ttl{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${brand}}
  .pill{display:inline-block;margin-top:6px;font-size:10px;font-weight:800;color:#fff;background:${brand};border-radius:999px;padding:3px 10px;letter-spacing:.05em}
  .body{padding:20px 24px}
  .emp{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;background:#f8fafc;border:1px solid #eef2f7;border-radius:10px;padding:12px 16px;margin-bottom:16px}
  .emp .row{border:none;padding:3px 0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .box{border:1px solid #e2e8f0;border-radius:12px;padding:14px}
  .box h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 8px}
  .row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #f1f5f9}
  .row:last-child{border-bottom:none}
  .sub{display:flex;justify-content:space-between;font-weight:700;margin-top:8px;padding-top:8px;border-top:2px solid #e2e8f0}
  .net{margin-top:16px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:12px;padding:16px 18px;display:flex;justify-content:space-between;align-items:center}
  .net .amt{font-size:26px;font-weight:800;color:#166534}
  .sign{display:flex;justify-content:space-between;margin-top:36px;gap:24px}
  .sign div{flex:1;border-top:1px solid #cbd5e1;padding-top:6px;text-align:center;color:#64748b;font-size:11px}
  .foot{padding:14px 24px;border-top:1px solid #eef2f7;color:#94a3b8;font-size:11px}
  .toolbar{max-width:720px;margin:0 auto 14px;text-align:right}
  .toolbar button{padding:9px 18px;border-radius:8px;border:1px solid ${brand};background:${brand};color:#fff;cursor:pointer;font-weight:700;font-size:13px}
  @media print{ html,body{background:#fff} body{padding:0} .sheet{border:none;border-radius:0;max-width:none;box-shadow:none} .toolbar{display:none} }
</style></head><body>
  <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="sheet">
    <div class="head">
      ${logoMarkup(meta, brand)}
      <div class="info">
        <h1>${esc(school)}</h1>
        ${meta.schoolCity ? `<div class="muted">${esc(meta.schoolCity)}</div>` : ''}
      </div>
      <div class="doc">
        <div class="ttl">Salary Slip</div>
        <div class="muted">${esc(meta.periodLabel)}</div>
        <span class="pill">${esc(meta.status && meta.status.length ? meta.status.toUpperCase() : 'PAYSLIP')}</span>
      </div>
    </div>

    <div class="body">
      <div class="emp">
        <div class="row"><span class="muted">Employee</span><strong>${esc(name)}</strong></div>
        <div class="row"><span class="muted">Type</span><strong>${esc(personKind(line))}</strong></div>
        ${line.role ? `<div class="row"><span class="muted">Role / designation</span><strong>${esc(line.role)}</strong></div>` : ''}
        ${line.dept ? `<div class="row"><span class="muted">Department</span><strong>${esc(line.dept)}</strong></div>` : ''}
      </div>

      <div class="grid">
        <div class="box">
          <h2>Earnings</h2>
          <div class="row"><span>Basic</span><strong>${esc(fmtMoney(line.basic, cur))}</strong></div>
          ${earnRow('HRA', line.hra)}
          ${earnRow('Allowances', line.allowances)}
          <div class="sub"><span>Gross</span><span>${esc(fmtMoney(line.gross, cur))}</span></div>
        </div>
        <div class="box">
          <h2>Deductions</h2>
          ${dedRow('EPF', line.epf)}
          ${dedRow('Professional tax', line.profTax)}
          ${dedRow('Other deductions', line.otherDeductions)}
          ${line.deductions === 0 ? '<div class="row"><span class="muted">No deductions</span><strong>—</strong></div>' : ''}
          <div class="sub"><span>Total deductions</span><span>− ${esc(fmtMoney(line.deductions, cur))}</span></div>
        </div>
      </div>

      <div class="net">
        <div>
          <div class="muted">Net pay</div>
          <div class="amt">${esc(fmtMoney(line.net, cur))}</div>
        </div>
        <div class="muted" style="text-align:right;max-width:220px">Gross ${esc(fmtMoney(line.gross, cur))} − deductions ${esc(fmtMoney(line.deductions, cur))}</div>
      </div>

      <div class="sign">
        <div>Employee signature</div>
        <div>Authorised signatory</div>
      </div>
    </div>

    <div class="foot">System-generated payslip · ${esc(school)} · ${esc(meta.periodLabel)}. EPF shown is the amount applied in this run. This is a computer-generated document and does not require a physical signature.</div>
  </div>
  ${autoPrint}
</body></html>`
}

export function payslipFileName(line: PayrollLine, period: string): string {
  const name = properName(line.name).replace(/\s+/g, '-') || 'Employee'
  return `Payslip-${name}-${period || 'run'}.html`
}

/**
 * Open the payslip in a new tab and trigger the browser print dialog so the user
 * can Save as PDF. Falls back to an HTML download when pop-ups are blocked.
 */
export function downloadPayslip(line: PayrollLine, meta: PayslipMeta, period: string): void {
  const printWin = window.open('', '_blank')
  if (printWin) {
    printWin.document.write(buildPayslipHtml(line, { ...meta, autoPrint: true }))
    printWin.document.close()
    return
  }
  // Pop-up blocked — download the printable HTML instead.
  const html = buildPayslipHtml(line, meta)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = payslipFileName(line, period)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
