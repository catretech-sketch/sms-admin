import Papa from 'papaparse'
import ExcelJS from 'exceljs'

/** One surviving data row plus the line it occupied in the ORIGINAL uploaded file.
 *  `lineNumber` is 1-based and counts the header row (so the first student row of a
 *  normal file is line 2) — spec §9 defines the wire `rowNumber` as "1-based position in
 *  the original file", which must survive header/blank-row filtering. Recomputing a
 *  sequential index over the FILTERED rows (the old behaviour) silently renumbered every
 *  row after a blank line, so the error report pointed the admin at the wrong line. */
export interface ParsedRow {
  lineNumber: number
  cells: string[]
}

export interface ParsedFile {
  headers: string[]
  rows: ParsedRow[]
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => !cell || !cell.trim())
}

/** How many PHYSICAL file lines one parsed CSV record consumed: normally 1, but a quoted
 *  field may legally contain literal newlines, which PapaParse preserves verbatim inside
 *  the cell value. Counting them keeps `lineNumber` exact rather than approximate. */
function physicalLineSpan(cells: string[]): number {
  let extra = 0
  for (const cell of cells) extra += ((cell ?? '').match(/\n/g) ?? []).length
  return 1 + extra
}

/** Parses CSV text into a header row + trimmed string rows, each tagged with its original
 *  1-based file line number. Blank rows are dropped (but still consume their line number,
 *  so the rows after them keep their real position). */
export function parseCsvText(text: string): ParsedFile {
  // skipEmptyLines is deliberately OFF: PapaParse would otherwise drop blank lines
  // silently, taking their line positions with them and making an exact original-file
  // line number impossible to recover. We filter blank rows ourselves, after numbering.
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false })
  const raw = (result.data ?? []) as string[][]

  let headers: string[] = []
  const rows: ParsedRow[] = []
  let consumed = 0
  raw.forEach((rawRow, index) => {
    const row = rawRow ?? []
    const startLine = consumed + 1
    consumed += physicalLineSpan(row)
    if (index === 0) {
      // A file whose very first line is blank has no detectable headers — surface that as
      // "no headers" (the caller turns it into an upload error) rather than a [''] header.
      const trimmed = row.map((h) => (h ?? '').trim())
      headers = isBlankRow(trimmed) ? [] : trimmed
      return
    }
    const cells = row.map((cell) => (cell ?? '').trim())
    if (isBlankRow(cells)) return
    rows.push({ lineNumber: startLine, cells })
  })
  return { headers, rows }
}

/** Parses the first worksheet of an uploaded .xlsx file's array buffer. ExcelJS's
 *  `eachRow` callback already receives the true 1-based sheet row number, so that is used
 *  verbatim as the row's original line number. */
export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }

  const headers: string[] = []
  const rows: ParsedRow[] = []
  sheet.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v).trim()))
    if (rowNumber === 1) {
      headers.push(...values)
    } else if (!isBlankRow(values)) {
      rows.push({ lineNumber: rowNumber, cells: values })
    }
  })
  return { headers, rows }
}
