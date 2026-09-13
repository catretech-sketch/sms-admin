import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseCsvText, parseXlsxBuffer } from './importFileParse'

describe('parseCsvText', () => {
  it('parses headers and rows, trimming values, tagging each with its original file line', () => {
    const csv = 'First Name,Last Name,Phone\nAarav, Sharma ,9876543210\nAditi,Verma,9876543211\n'
    const result = parseCsvText(csv)
    expect(result.headers).toEqual(['First Name', 'Last Name', 'Phone'])
    expect(result.rows).toEqual([
      { lineNumber: 2, cells: ['Aarav', 'Sharma', '9876543210'] },
      { lineNumber: 3, cells: ['Aditi', 'Verma', '9876543211'] },
    ])
  })

  it('ignores fully blank trailing rows', () => {
    const csv = 'A,B\n1,2\n\n'
    const result = parseCsvText(csv)
    expect(result.rows).toEqual([{ lineNumber: 2, cells: ['1', '2'] }])
  })

  it('keeps the ORIGINAL file line number of rows that follow a blank line', () => {
    // Regression test for the rowNumber bug (spec §9): the row after a blank line used to
    // be renumbered as if the blank line never existed, so the error report named the
    // wrong line in the admin's own spreadsheet.
    const csv = 'A,B\n1,2\n\n3,4\n'
    const result = parseCsvText(csv)
    expect(result.rows).toEqual([
      { lineNumber: 2, cells: ['1', '2'] },
      { lineNumber: 4, cells: ['3', '4'] },
    ])
  })

  it('counts the physical lines a quoted multi-line cell consumes', () => {
    const csv = 'A,B\n1,"line one\nline two"\n5,6\n'
    const result = parseCsvText(csv)
    expect(result.rows[0].lineNumber).toBe(2)
    // The quoted field spans lines 2-3, so the next record really starts on line 4.
    expect(result.rows[1].lineNumber).toBe(4)
  })

  it('reports no headers for a file whose first line is blank', () => {
    expect(parseCsvText('\nA,B\n1,2\n').headers).toEqual([])
  })
})

describe('parseXlsxBuffer', () => {
  it('parses the first worksheet\'s header row and data rows with their sheet row numbers', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Students')
    ws.addRow(['First Name', 'Last Name', 'Phone'])
    ws.addRow(['Aarav', 'Sharma', '9876543210'])
    const buffer = await wb.xlsx.writeBuffer()
    const result = await parseXlsxBuffer(buffer as ArrayBuffer)
    expect(result.headers).toEqual(['First Name', 'Last Name', 'Phone'])
    expect(result.rows).toEqual([{ lineNumber: 2, cells: ['Aarav', 'Sharma', '9876543210'] }])
  })
})
