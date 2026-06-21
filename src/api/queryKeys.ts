import type { ListStudentsOpts, ListTeachersOpts, ListStaffOpts } from '@/types'

export const queryKeys = {
  students: {
    all: ['students'] as const,
    list: (opts: ListStudentsOpts = {}) => ['students', 'list', opts] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
  },
  teachers: {
    all: ['teachers'] as const,
    list: (opts: ListTeachersOpts = {}) => ['teachers', 'list', opts] as const,
  },
  staff: {
    all: ['staff'] as const,
    list: (opts: ListStaffOpts = {}) => ['staff', 'list', opts] as const,
  },
  notifications: {
    all: ['notifications'] as const,
  },
  approvals: {
    all: ['approvals'] as const,
  },
  users: {
    all: ['users'] as const,
  },
  classes: {
    all: ['classes'] as const,
  },
  subjects: {
    all: ['subjects'] as const,
  },
  attendance: {
    forClass: (classId: string) => ['attendance', classId] as const,
  },
  exams: {
    all: ['exams'] as const,
  },
}
