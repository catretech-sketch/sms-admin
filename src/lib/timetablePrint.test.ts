import { describe, it, expect } from 'vitest'
import { buildTimetablePrintHtml, hasPrintableTimetable, suggestedTimetableFileName } from './timetablePrint'
import { cellKey, type Grids } from './timetable'

const grids: Grids = {
  'IV-B': {
    [cellKey(0, 0)]: { subject: 'Mathematics', teacherId: 't1' },
    [cellKey(1, 0)]: { subject: 'English', teacherId: 't2' },
  },
}

describe('timetablePrint', () => {
  it('builds landscape HTML with class grid and school header', () => {
    const html = buildTimetablePrintHtml({
      schoolName: 'Demo School',
      schoolLogoInitials: 'DS',
      schoolBrandColor: '#16a34a',
      schoolCity: 'Bengaluru',
      view: 'class',
      className: 'IV-B',
      grids,
      teacherNameOf: (id) => (id === 't1' ? 'Meera' : 'Raj'),
      publishedAt: '2026-07-16T10:00:00.000Z',
    })
    expect(html).toContain('Demo School')
    expect(html).toContain('Class IV-B')
    expect(html).toContain('Bengaluru')
    expect(html).toContain('tt-logo-fallback')
    expect(html).toContain('#16a34a')
    expect(html).toContain('Mathematics')
    expect(html).toContain('Meera')
    expect(html).toContain('A4 landscape')
    expect(html).toContain('Lunch break')
    expect(html).toContain('>Sat</th>')
    expect(html).toContain('text-rendering: geometricPrecision')
    expect(html).toContain('font-size: 13px')
  })

  it('uses school logo image when provided', () => {
    const html = buildTimetablePrintHtml({
      schoolName: 'Demo School',
      schoolLogoUrl: 'data:image/png;base64,abc',
      view: 'class',
      className: 'IV-B',
      grids,
      teacherNameOf: () => 'Teacher',
    })
    expect(html).toContain('class="tt-logo"')
    expect(html).toContain('data:image/png;base64,abc')
  })

  it('detects printable grids', () => {
    expect(hasPrintableTimetable({})).toBe(false)
    expect(hasPrintableTimetable(grids)).toBe(true)
  })

  it('overview prints each built class in order', () => {
    const html = buildTimetablePrintHtml({
      schoolName: 'Demo School',
      view: 'overview',
      grids: { ...grids, 'III-A': { [cellKey(0, 1)]: { subject: 'Science', teacherId: 't3' } } },
      teacherNameOf: () => 'Teacher',
    })
    expect(html.indexOf('III-A')).toBeLessThan(html.indexOf('IV-B'))
  })

  it('builds a stable suggested save filename', () => {
    const name = suggestedTimetableFileName({
      schoolName: 'Demo School',
      view: 'class',
      className: 'IV-B',
      grids,
      teacherNameOf: () => 'T',
    })
    expect(name).toMatch(/^Demo_School-IV-B-Timetable-\d{4}-\d{2}-\d{2}$/)
  })
})
