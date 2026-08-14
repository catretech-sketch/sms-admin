import { describe, it, expect } from 'vitest'
import {
  cellKey, clashingClass, clashingClasses, teacherBusyElsewhere, pickTeacher, conflictsFor,
  teacherLoads, clashingTeachers, teacherSchedule, subjectSchedule, planTimetableSync,
  gridsFromRemoteSlots, generateAutoTimetableGrid,
  type Grids, type RemoteTimetableSlot,
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

describe('planTimetableSync', () => {
  const days = ['Mon', 'Tue', 'Wed']
  const classIds: Record<string, string> = { 'IX-A': 'class-a', 'IX-B': 'class-b' }
  const classIdFor = (className: string) => classIds[className] ?? null

  it('emits a create target for every filled cell, 1-based period', () => {
    const localGrids: Grids = {
      'IX-A': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 't1' }, [cellKey(1, 2)]: { subject: 'Sci', teacherId: 't2' } },
    }
    const plan = planTimetableSync(localGrids, days, classIdFor, [])
    expect(plan.toCreate).toHaveLength(2)
    expect(plan.toCreate).toContainEqual({
      day: 'Mon', period: 1, subject: 'Math', classId: 'class-a', className: 'IX-A', teacherId: 't1',
      startTime: null, endTime: null,
    })
    expect(plan.toCreate).toContainEqual({
      day: 'Tue', period: 3, subject: 'Sci', classId: 'class-a', className: 'IX-A', teacherId: 't2',
      startTime: null, endTime: null,
    })
  })

  it('attaches bell start/end from the period map', () => {
    const localGrids: Grids = {
      'IX-A': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 't1' } },
    }
    const plan = planTimetableSync(localGrids, days, classIdFor, [], {
      1: { start: '08:15', end: '09:00' },
    })
    expect(plan.toCreate[0]).toMatchObject({ startTime: '08:15', endTime: '09:00' })
  })

  it('hydrates grids from remote slots', () => {
    const g = gridsFromRemoteSlots(
      [
        { day: 'Mon', period: 1, subject: 'Math', className: 'IX-A', teacherId: 't1' },
        { day: 'Tue', period: 2, subject: 'Sci', className: 'IX-A', teacherName: 'Ada' },
      ],
      days,
      (name) => (name === 'Ada' ? 't-ada' : null),
    )
    expect(g['IX-A'][cellKey(0, 0)]).toEqual({ subject: 'Math', teacherId: 't1' })
    expect(g['IX-A'][cellKey(1, 1)]).toEqual({ subject: 'Sci', teacherId: 't-ada' })
  })

  it('carries a null teacherId when a cell has no teacher assigned', () => {
    const localGrids: Grids = {
      'IX-A': { [cellKey(0, 0)]: { subject: 'Math', teacherId: '' } },
    }
    const plan = planTimetableSync(localGrids, days, classIdFor, [])
    expect(plan.toCreate[0].teacherId).toBeNull()
  })

  it('does not own empty / all-null grids (avoids wiping published timetable on publish)', () => {
    const localGrids: Grids = {
      'IX-A': { [cellKey(0, 0)]: null },
      Unmapped: { [cellKey(0, 0)]: { subject: 'Math', teacherId: 't1' } },
    }
    const plan = planTimetableSync(localGrids, days, classIdFor, [])
    expect(plan.toCreate).toEqual([])
    expect(plan.ownedClassIds).toEqual([])
  })

  it('marks every remote slot belonging to an owned class as stale (delete+recreate)', () => {
    const localGrids: Grids = {
      'IX-A': { [cellKey(0, 0)]: { subject: 'Math', teacherId: 't1' } },
    }
    const remote: RemoteTimetableSlot[] = [
      { id: 'r1', day: 'Mon', period: 1, classId: 'class-a' },
      { id: 'r2', day: 'Tue', period: 1, classId: 'class-b' },
      { id: 'r3', day: 'Mon', period: 1, classId: null },
    ]
    const plan = planTimetableSync(localGrids, days, classIdFor, remote)
    expect(plan.toDeleteIds).toEqual(['r1'])
  })

  it('ignores keys for a day index the school does not use', () => {
    const localGrids: Grids = {
      'IX-A': { [cellKey(5, 0)]: { subject: 'Math', teacherId: 't1' } },
    }
    const plan = planTimetableSync(localGrids, days, classIdFor, [])
    expect(plan.toCreate).toEqual([])
  })
})

describe('generateAutoTimetableGrid', () => {
  const subjects = ['Computer', 'Hindi', 'Mathematics', 'Music', 'Physical Education', 'Science']
  const days = 6
  const periods = 8
  const ppw = Object.fromEntries(subjects.map((s) => [s, 8])) // 48 slots

  it('does not repeat the same Mon–Sat subject row every period', () => {
    const grid = generateAutoTimetableGrid(days, periods, subjects, ppw)
    const row = (p: number) => Array.from({ length: days }, (_, d) => grid[cellKey(d, p)]?.subject)
    expect(row(0)).not.toEqual(row(1))
    expect(row(0)).not.toEqual(row(2))
    // Same weekday must change subject across consecutive periods
    expect(grid[cellKey(0, 0)]?.subject).not.toBe(grid[cellKey(0, 1)]?.subject)
  })

  it('respects periods-per-week quotas', () => {
    const grid = generateAutoTimetableGrid(days, periods, subjects, ppw)
    const counts: Record<string, number> = {}
    for (const cell of Object.values(grid)) {
      if (!cell) continue
      counts[cell.subject] = (counts[cell.subject] ?? 0) + 1
    }
    for (const s of subjects) expect(counts[s]).toBe(8)
  })

  it('leaves teacherId empty for the placer to fill', () => {
    const grid = generateAutoTimetableGrid(2, 2, ['Math', 'Sci'], { Math: 2, Sci: 2 })
    expect(Object.values(grid).every((c) => c && c.teacherId === '')).toBe(true)
  })
})
