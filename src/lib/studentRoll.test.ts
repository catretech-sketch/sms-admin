import { describe, it, expect } from 'vitest'
import { classmatesInClass, formatStudentRoll, predictStudentRoll } from './studentRoll'

describe('formatStudentRoll', () => {
  it('hides missing or zero rolls', () => {
    expect(formatStudentRoll(0)).toBe('—')
    expect(formatStudentRoll(undefined)).toBe('—')
    expect(formatStudentRoll(7)).toBe('7')
  })
})

describe('predictStudentRoll', () => {
  const cls = { grade: 'IV', section: 'B', cls: 'IV-B' }
  const roster = [
    { id: 'a', name: 'Asha Kumar', adm: '1', grade: 'IV', section: 'B', cls: 'IV-B', status: 'active' },
    { id: 'z', name: 'Zoya Khan', adm: '2', grade: 'IV', section: 'B', cls: 'IV-B', status: 'active' },
    { id: 'other', name: 'Other Class', adm: '3', grade: 'IV', section: 'A', cls: 'IV-A', status: 'active' },
  ]

  it('is null until a class is chosen', () => {
    expect(predictStudentRoll({
      name: 'Meera', selfId: '__new__', classInfo: { grade: '', section: '', cls: '' }, roster,
    })).toBeNull()
  })

  it('assigns A–Z by name among classmates', () => {
    expect(predictStudentRoll({
      name: 'Meera Rao', adm: '9', selfId: '__new__', classInfo: cls, roster,
    })).toBe(2)
  })

  it('shows a number as soon as class is picked even before the name', () => {
    expect(predictStudentRoll({
      name: '', selfId: '__new__', classInfo: cls, roster,
    })).toBe(3)
  })

  it('matches class label when grade/section are missing on the class', () => {
    expect(predictStudentRoll({
      name: 'Bina',
      selfId: '__new__',
      classInfo: { grade: 'Nursery', section: '', cls: 'Nursery' },
      roster: [
        { id: 'x', name: 'Asha', cls: 'Nursery', status: 'active' },
      ],
    })).toBe(2)
  })
})

describe('classmatesInClass', () => {
  it('excludes self and other sections', () => {
    const rows = classmatesInClass(
      [
        { id: 'self', name: 'Me', grade: 'X', section: 'A' },
        { id: 'peer', name: 'Peer', grade: 'X', section: 'A', status: 'active' },
        { id: 'b', name: 'Other', grade: 'X', section: 'B', status: 'active' },
      ],
      { grade: 'X', section: 'A', cls: 'X-A' },
      'self',
    )
    expect(rows.map((r) => r.id)).toEqual(['peer'])
  })
})
