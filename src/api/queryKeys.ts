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
  roleTemplate: {
    all: ['roleTemplate'] as const,
  },
  audit: {
    list: (params: import('./audit').AuditParams = {}) => ['audit', 'list', params] as const,
  },
  classes: {
    all: ['classes'] as const,
    subjects: (classId: string) => ['classes', 'subjects', classId] as const,
  },
  subjects: {
    all: ['subjects'] as const,
  },
  attendance: {
    forClass: (classId: string, date = '') => ['attendance', classId, date] as const,
    principal: (date = '') => ['attendance', 'principal', date] as const,
    studentMonths: (studentId: string, classId = '') => ['attendance', 'studentMonths', studentId, classId] as const,
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
    messages: (threadId: string) => ['threads', 'messages', threadId] as const,
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
  payroll: {
    salaryProfiles: ['payroll', 'salaryProfiles'] as const,
    salaryStructures: ['payroll', 'salaryStructures'] as const,
    runAll: ['payroll', 'run'] as const,
    run: (period: string) => ['payroll', 'run', period] as const,
    preview: (period: string) => ['payroll', 'preview', period] as const,
  },
  school: {
    integrations: ['school', 'integrations'] as const,
  },
  operations: {
    librarySummary: ['operations', 'library', 'summary'] as const,
    transportSummary: ['operations', 'transport', 'summary'] as const,
    transportFleet: ['operations', 'transport', 'fleet'] as const,
    transportRoutes: ['operations', 'transport', 'routes'] as const,
    busStudents: (busId: string) => ['operations', 'transport', 'busStudents', busId] as const,
    transportRouteStops: (routeId: string) => ['operations', 'transport', 'routeStops', routeId] as const,
    hostelSummary: ['operations', 'hostel', 'summary'] as const,
    hostelBlocks: ['operations', 'hostel', 'blocks'] as const,
    hostelRooms: ['operations', 'hostel', 'rooms'] as const,
    hostelResidents: ['operations', 'hostel', 'residents'] as const,
    sportsSummary: ['operations', 'sports', 'summary'] as const,
    sportsTeams: ['operations', 'sports', 'teams'] as const,
    sportsEvents: ['operations', 'sports', 'events'] as const,
    sportsMedals: ['operations', 'sports', 'medals'] as const,
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
