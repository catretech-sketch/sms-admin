import type { ListStudentsOpts } from '@/types'

export const queryKeys = {
  students: {
    all: ['students'] as const,
    list: (opts: ListStudentsOpts = {}) => ['students', 'list', opts] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
  },
}
