import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { printReportCard, reportCardPrintHtml, reportCardPdfTitle } from './reportCardPrint'
import type { Report } from '@/types'

const report: Report = {
  rows: [
    { subject: 'Mathematics', max: 100, marks: 95, grade: 'A1', gpa: 10, pass: true },
    { subject: 'Science', max: 100, marks: 80, grade: 'B1', gpa: 8, pass: true },
  ],
  total: 175,
  maxTotal: 200,
  pct: 87.5,
  grade: 'A2',
  gpa: 9,
  result: 'PASS',
}

const baseOpts = {
  schoolName: 'Demo School',
  schoolLogoUrl: 'https://cdn.example/logo.png',
  schoolBrandColor: '#1e40af',
  examName: 'Term 1',
  student: {
    name: 'Rahul',
    adm: 'A1',
    cls: 'IV-B',
    roll: 1,
    guardian: 'Parent',
    attendance: 90,
  },
  report,
  rank: 1,
  classSize: 30,
  autoPrint: false as const,
}

describe('reportCardPdfTitle', () => {
  it('includes student, admission, class, exam for Save-as-PDF', () => {
    expect(reportCardPdfTitle({
      student: { name: 'rahul shrma', adm: 'sccrdtb/STU/26/0001', cls: 'IV-B', roll: 1, guardian: '', attendance: 0 },
      examName: 'half',
    })).toBe('Rahul Shrma · sccrdtb-STU-26-0001 · IV-B · Half')
  })
})

describe('reportCardPrintHtml', () => {
  it('centers logo via full-sheet flex layer and includes signature lines', () => {
    const html = reportCardPrintHtml(baseOpts)
    expect(html).toContain('rc-wm-layer')
    expect(html).toContain('Subject teacher')
    expect(html).toContain('<title>Rahul · A1 · IV-B · Term 1</title>')
  })
})

describe('printReportCard', () => {
  let written = ''
  let popupTitle = ''

  beforeEach(() => {
    written = ''
    popupTitle = ''
    document.title = 'SchoolMate — Admin Console'
    vi.spyOn(window, 'open').mockImplementation(() => {
      const doc = {
        open: vi.fn(),
        write: (html: string) => { written = html },
        close: vi.fn(),
        images: [] as HTMLImageElement[],
        get title() { return popupTitle },
        set title(v: string) { popupTitle = v },
      }
      return {
        document: doc,
        focus: vi.fn(),
        print: vi.fn(),
        close: vi.fn(),
      } as unknown as Window
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens a titled popup so PDF is not Admin Console.pdf', () => {
    const ok = printReportCard(baseOpts)
    expect(ok).toBe(true)
    expect(window.open).toHaveBeenCalled()
    expect(popupTitle).toBe('Rahul · A1 · IV-B · Term 1')
    expect(written).toContain('<title>Rahul · A1 · IV-B · Term 1</title>')
    expect(document.title).toBe('SchoolMate — Admin Console')
  })

  it('falls back to iframe and temporarily sets parent title when popups blocked', () => {
    vi.mocked(window.open).mockReturnValue(null)
    const ok = printReportCard(baseOpts)
    expect(ok).toBe(true)
    const iframe = [...document.querySelectorAll('iframe')].find((el) =>
      (el.getAttribute('title') || '').includes('Rahul'),
    )
    expect(iframe).toBeTruthy()
    /* Parent title swapped for Chrome Save-as-PDF naming */
    expect(document.title).toBe('Rahul · A1 · IV-B · Term 1')
  })
})
