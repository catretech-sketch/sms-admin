export type ErrorReportRow = Record<string, string>

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Original row columns + a trailing Error Reason column, as CSV text. Empty input returns
 *  an empty string (nothing to download). */
export function errorRowsToCsv(rows: ErrorReportRow[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','))
  }
  return lines.join('\n')
}
