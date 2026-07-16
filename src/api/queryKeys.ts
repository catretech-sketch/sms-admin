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
    detail: (id: string) => ['teachers', 'detail', id] as const,
  },
  staff: {
    all: ['staff'] as const,
    list: (opts: ListStaffOpts = {}) => ['staff', 'list', opts] as const,
    detail: (id: string) => ['staff', 'detail', id] as const,
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
    forClass: (classId: string, date = '') => ['attendance', classId, date] as const,
    principal: (date = '') => ['attendance', 'principal', date] as const,
  },
  exams: {
    all: ['exams'] as const,
    papers: (examId: string) => ['exams', 'papers', examId] as const,
    grades: (paperId: string) => ['exams', 'grades', paperId] as const,
  },
  complaints: {
    all: ['complaints'] as const,
  },
  threads: {
    all: ['threads'] as const,
  },
  announcements: {
    all: ['announcements'] as const,
  },
  feePayments: {
    all: ['feePayments'] as const,
  },
  feeHeads: { all: ['feeHeads'] as const },
  feeStructure: { all: ['feeStructure'] as const },
  feeInvoices: {
    all: ['feeInvoices'] as const,
    list: (opts: Record<string, string> = {}) => ['feeInvoices', 'list', opts] as const,
  },
  feeReports: {
    summary: ['feeReports', 'summary'] as const,
  },
  school: {
    integrations: ['school', 'integrations'] as const,
  },
  owner: {
    dashboard: ['owner', 'dashboard'] as const,
    clients: (params: { status?: string; q?: string } = {}) => ['owner', 'clients', params] as const,
    mySchools: ['owner', 'mySchools'] as const,
    feeSummary: (params: { from?: string; to?: string } = {}) => ['owner', 'feeSummary', params] as const,
    plans: (isPlatform: boolean) => ['owner', 'plans', isPlatform] as const,
    upgradeRequests: ['owner', 'upgradeRequests'] as const,
  },
}
