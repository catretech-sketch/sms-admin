import { describe, it, expect } from 'vitest'
import {
  cellKey, clashingClass, clashingClasses, teacherBusyElsewhere, pickTeacher, conflictsFor,
  teacherLoads, clashingTeachers, teacherSchedule, subjectSchedule, type Grids,
} from './timetable'

const grids: Grids = {
  'IX-A': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 't1' }, [cellKey(0, 1)]: { subject: 'Sci', teacherId: 't2' } },
  'IX-B': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 't1' }, [cellKey(1, 0)]: { subject: 'Eng', teacherId: 't3' } },
}

describe('timetable clash detection', () => {
  it('detects a teacher booked in two classes at the same slot', () => {
    expect(clashingClass(grids, 't1', 0, 0, 'IX-A')).toBe('IX-B')
    expect(teacherBusyElsewhere(grids, 't1', 0, 0, 'IX-A')).toBe(true)
  })
  it('same teacher in a different slot is not a clash', () => {
    expect(teacherBusyElsewhere(grids, 't3', 0, 0, 'IX-A')).toBe(false)
  })
  it('empty teacher never clashes', () => {
    expect(teacherBusyElsewhere(grids, '', 0, 0, 'IX-A')).toBe(false)
  })
  it('conflictsFor returns the double-booked cells of a class', () => {
    expect(conflictsFor(grids, 'IX-A')).toEqual(new Set([cellKey(0, 0)]))
    expect(conflictsFor(grids, 'IX-B')).toEqual(new Set([cellKey(0, 0)]))
  })
  it('pickTeacher prefers a free teacher', () => {
    expect(pickTeacher(grids, ['t1', 't4'], 0, 0, 'IX-C', 0)).toBe('t4')
  })
  it('pickTeacher falls back to the rotated teacher when all are busy', () => {
    expect(pickTeacher(grids, ['t1'], 0, 0, 'IX-C', 0)).toBe('t1')
  })
  it('pickTeacher returns empty string for an empty roster', () => {
    expect(pickTeacher(grids, [], 0, 0, 'IX-C', 0)).toBe('')
  })
  it('teacherLoads counts periods per teacher across classes', () => {
    expect(teacherLoads(grids)).toEqual({ t1: 2, t2: 1, t3: 1 })
  })
  it('clashingTeachers returns teachers double-booked somewhere', () => {
    expect(clashingTeachers(grids)).toEqual(new Set(['t1']))
  })
  it('clashingClasses lists every other class booking the teacher at that slot', () => {
    expect(clashingClasses(grids, 't1', 0, 0, 'IX-A')).toEqual(['IX-B'])
    expect(clashingClasses(grids, 't1', 0, 0, 'IX-C')).toEqual(['IX-A', 'IX-B'])
    expect(clashingClasses(grids, 't3', 0, 0, 'IX-A')).toEqual([])
  })
})

describe('teacher/subject schedule derivation', () => {
  const g: Grids = {
    'X-A': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 'T1' }, [cellKey(0, 1)]: { subject: 'Sci', teacherId: 'T2' } },
    'X-B': { [cellKey(0, 0)]: { subject: 'Eng', teacherId: 'T1' }, [cellKey(1, 0)]: null },
  }

  it('teacherSchedule groups a teacher’s placements by slot across classes', () => {
    const s = teacherSchedule(g, 'T1')
    expect(s[cellKey(0, 0)]).toEqual([
      { cls: 'X-A', subject: 'Math' },
      { cls: 'X-B', subject: 'Eng' },
    ])
    expect(s[cellKey(0, 1)]).toBeUndefined()
  })

  it('teacherSchedule returns {} for an empty teacherId', () => {
    expect(teacherSchedule(g, '')).toEqual({})
  })

  it('subjectSchedule groups a subject’s placements by slot', () => {
    const s = subjectSchedule(g, 'Math')
    expect(s[cellKey(0, 0)]).toEqual([{ cls: 'X-A', teacherId: 'T1' }])
    expect(Object.keys(s)).toHaveLength(1)
  })

  it('returns {} when nothing matches', () => {
    expect(teacherSchedule({}, 'T1')).toEqual({})
    expect(subjectSchedule(g, 'Nonexistent')).toEqual({})
  })
})
