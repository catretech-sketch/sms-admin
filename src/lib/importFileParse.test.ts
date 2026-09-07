import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseCsvText, parseXlsxBuffer } from './importFileParse'

describe('parseCsvText', () => {
  it('parses headers and rows, trimming values', () => {
    const csv = 'First Name,Last Name,Phone\nAarav, Sharma ,9876543210\nAditi,Verma,9876543211\n'
    const result = parseCsvText(csv)
    expect(result.headers).toEqual(['First Name', 'Last Name', 'Phone'])
    expect(result.rows).toEqual([
      ['Aarav', 'Sharma', '9876543210'],
      ['Aditi', 'Verma', '9876543211'],
    ])
  })

  it('ignores fully blank trailing rows', () => {
    const csv = 'A,B\n1,2\n\n'
    const result = parseCsvText(csv)
    expect(result.rows).toEqual([['1', '2']])
  })
})

describe('parseXlsxBuffer', () => {
  it('parses the first worksheet\'s header row and data rows', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Students')
    ws.addRow(['First Name', 'Last Name', 'Phone'])
    ws.addRow(['Aarav', 'Sharma', '9876543210'])
    const buffer = await wb.xlsx.writeBuffer()
    const result = await parseXlsxBuffer(buffer as ArrayBuffer)
    expect(result.headers).toEqual(['First Name', 'Last Name', 'Phone'])
    expect(result.rows).toEqual([['Aarav', 'Sharma', '9876543210']])
  })
})
