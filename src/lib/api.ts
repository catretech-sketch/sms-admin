/* ============================================================
   SchoolMate — Data access layer
   The `Api` interface mirrors a future REST surface. `MockApi`
   reads the in-memory dataset today; a `RestApi` calling the
   .NET Core 10 `/v1` API drops in later behind the same
   interface — switching is a single `export const api` change.
   All methods are async so UI code is written for the network.
   ============================================================ */
import type {
  School, Student, Teacher, Staff, Bus, Exam, Approval, AppNotification,
  Complaint, Thread, Report, RankInfo, Role,
  ListStudentsOpts, ListTeachersOpts, ListStaffOpts,
} from '@/types'
import {
  schools, students, teachers, staff, buses, exams, approvals,
  notifications, complaints, threads,
} from '@/data/mockDb'
import { reportFor, classRank } from './format'

export interface Api {
  listSchools(): Promise<School[]>
  getSchool(id: string): Promise<School | undefined>
  listStudents(opts?: ListStudentsOpts): Promise<Student[]>
  getStudent(id: string): Promise<Student | undefined>
  listTeachers(opts?: ListTeachersOpts): Promise<Teacher[]>
  listStaff(opts?: ListStaffOpts): Promise<Staff[]>
  listBuses(): Promise<Bus[]>
  listExams(): Promise<Exam[]>
  listApprovals(role: Role): Promise<Approval[]>
  notifications(): Promise<AppNotification[]>
  listComplaints(): Promise<Complaint[]>
  listThreads(): Promise<Thread[]>
  reportFor(studentId: string, examId?: string): Promise<Report | undefined>
  classRank(studentId: string, examId?: string): Promise<RankInfo | undefined>
}

const ok = <T>(v: T): Promise<T> => Promise.resolve(v)

export class MockApi implements Api {
  listSchools() { return ok(schools) }
  getSchool(id: string) { return ok(schools.find((s) => s.id === id)) }

  listStudents(opts: ListStudentsOpts = {}) {
    let r = students.slice()
    if (opts.q) { const q = opts.q.toLowerCase(); r = r.filter((s) => s.name.toLowerCase().includes(q) || s.adm.toLowerCase().includes(q) || s.cls.toLowerCase().includes(q)) }
    if (opts.grade && opts.grade !== 'all') r = r.filter((s) => s.grade === opts.grade)
    if (opts.status && opts.status !== 'all') r = r.filter((s) => s.status === opts.status)
    if (opts.fee && opts.fee !== 'all') r = r.filter((s) => s.feeStatus === opts.fee)
    return ok(r)
  }
  getStudent(id: string) { return ok(students.find((s) => s.id === id)) }

  listTeachers(opts: ListTeachersOpts = {}) {
    let r = teachers.slice()
    if (opts.q) { const q = opts.q.toLowerCase(); r = r.filter((t) => t.name.toLowerCase().includes(q) || t.dept.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)) }
    if (opts.dept && opts.dept !== 'all') r = r.filter((t) => t.dept === opts.dept)
    if (opts.status && opts.status !== 'all') r = r.filter((t) => t.status === opts.status)
    return ok(r)
  }
  listStaff(opts: ListStaffOpts = {}) {
    let r = staff.slice()
    if (opts.q) { const q = opts.q.toLowerCase(); r = r.filter((s) => s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q)) }
    if (opts.cat && opts.cat !== 'all') r = r.filter((s) => s.cat === opts.cat)
    return ok(r)
  }
  listBuses() { return ok(buses) }
  listExams() { return ok(exams) }
  listApprovals(role: Role) { return ok(approvals.filter((a) => a.forRoles.includes(role))) }
  notifications() { return ok(notifications) }
  listComplaints() { return ok(complaints) }
  listThreads() { return ok(threads) }

  reportFor(studentId: string, examId?: string) {
    const s = students.find((x) => x.id === studentId)
    return ok(s ? reportFor(s, examId) : undefined)
  }
  classRank(studentId: string, examId?: string) {
    const s = students.find((x) => x.id === studentId)
    return ok(s ? classRank(s, examId) : undefined)
  }
}

/*
  Future backend — swap MockApi for this when the .NET Core 10 API is ready:

  export class RestApi implements Api {
    private base = import.meta.env.VITE_API_BASE ?? '/v1'
    private get<T>(path: string): Promise<T> {
      return fetch(`${this.base}${path}`, { credentials: 'include' }).then((r) => r.json() as Promise<T>)
    }
    listSchools() { return this.get<School[]>('/schools') }
    listStudents(opts: ListStudentsOpts = {}) {
      return this.get<Student[]>(`/students?${new URLSearchParams(opts as Record<string,string>)}`)
    }
    // …one method per endpoint, same signatures as Api
  }
*/

export const api: Api = new MockApi()
