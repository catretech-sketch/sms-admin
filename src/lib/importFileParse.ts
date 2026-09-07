import Papa from 'papaparse'
import ExcelJS from 'exceljs'

export interface ParsedFile {
  headers: string[]
  rows: string[][]
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => !cell || !cell.trim())
}

/** Parses CSV text into a header row + trimmed string rows. Blank trailing rows are dropped. */
export function parseCsvText(text: string): ParsedFile {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true })
  const raw = result.data as string[][]
  const [headerRow, ...dataRows] = raw
  const headers = (headerRow ?? []).map((h) => h.trim())
  const rows = dataRows
    .map((row) => row.map((cell) => (cell ?? '').trim()))
    .filter((row) => !isBlankRow(row))
  return { headers, rows }
}

/** Parses the first worksheet of an uploaded .xlsx file's array buffer. */
export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }

  const headers: string[] = []
  const rows: string[][] = []
  sheet.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v).trim()))
    if (rowNumber === 1) {
      headers.push(...values)
    } else if (!isBlankRow(values)) {
      rows.push(values)
    }
  })
  return { headers, rows }
}
