/* ============================================================
   SchoolMate — App state: auth, console/role, current school,
   plan, language, view navigation.
   ============================================================ */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, setOnAuthFailure } from '@/api/client'
import { login as passwordLogin, me as fetchMe, logout as apiLogout } from '@/api/auth'
import { tokenStore } from '@/api/auth/tokenStore'
import type { ConsoleKind, Exam, FeePayment, PaperSlot, Role, School, Staff, Student, Teacher, Tier } from '@/types'
import { schools, students as seedStudents, teachers as seedTeachers, staff as seedStaff, exams as seedExams } from '@/data/mockDb'

export interface DemoAccount {
  email: string
  phone: string
  name: string
  role: Role
  console: ConsoleKind
  hue: number
}

/* Five role-locked demo accounts (per the design). Owner email domain
   routes to the Owner console; school accounts lock to their role. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'anil@schoolmate.io', phone: '+91 98100 10001', name: 'Anil Mehta', role: 'admin', console: 'owner', hue: 250 },
  { email: 'admin@greenwood.edu', phone: '+91 98100 10002', name: 'Ravi Menon', role: 'admin', console: 'school', hue: 200 },
  { email: 'principal@greenwood.edu', phone: '+91 98100 10003', name: 'Sunita Rao', role: 'principal', console: 'school', hue: 330 },
  { email: 'vp@greenwood.edu', phone: '+91 98100 10004', name: 'Arjun Banerjee', role: 'vice_principal', console: 'school', hue: 150 },
  { email: 'teacher@greenwood.edu', phone: '+91 98100 10005', name: 'Meera Krishnan', role: 'teacher', console: 'school', hue: 20 },
]

export interface AppUser { name: string; email: string; role: Role; hue: number }

interface AppState {
  loggedIn: boolean
  user: AppUser | null
  consoleKind: ConsoleKind
  role: Role
  schoolId: string
  ownerViewingSchool: boolean
  lang: string
  dir: 'ltr' | 'rtl'
  view: string
  mobileNav: boolean
  /* cross-screen navigation payload */
  focus: string | null
  intent: string | null
  /* derived */
  school: School
  plan: Tier
  /* student roster (seeded, with in-session additions) */
  students: Student[]
  addStudent: (student: Student) => void
  /* teacher roster (seeded, with in-session additions) */
  teachers: Teacher[]
  addTeacher: (teacher: Teacher) => void
  /* non-teaching staff roster (seeded, with in-session additions) */
  staff: Staff[]
  addStaff: (staff: Staff) => void
  /* exams + per-exam marks & attendance (in-session) */
  exams: Exam[]
  addExam: (exam: Exam) => void
  updateExam: (id: string, patch: Partial<Exam>) => void
  examMarks: Record<string, number>
  saveExamMarks: (entries: Record<string, number>) => void
  examAttendance: Record<string, 'present' | 'absent'>
  saveExamAttendance: (entries: Record<string, 'present' | 'absent'>) => void
  /* per-exam datesheets (in-session) */
  datesheets: Record<string, PaperSlot[]>
  saveDatesheet: (examId: string, slots: PaperSlot[]) => void
  /* fee payment history (in-session) */
  feePayments: FeePayment[]
  addFeePayment: (p: FeePayment) => void
  /* configurable fee heads + per-grade fee structure (in-session) */
  feeHeads: string[]
  feeStructure: Record<string, Record<string, number>>
  saveFeeStructure: (heads: string[], structure: Record<string, Record<string, number>>) => void
  /* actions */
  authBusy: boolean
  authError: string | null
  clearAuthError: () => void
  loginWithPassword: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  go: (view: string, opts?: { focus?: string; intent?: string }) => void
  clearIntent: () => void
  setSchoolId: (id: string) => void
  enterSchool: (id: string) => void
  exitToOwner: () => void
  upgrade: (tier: Tier) => void
  setLang: (lang: string) => void
  setMobileNav: (open: boolean) => void
}

const RTL_LANGS = ['ar', 'ur']
const AppCtx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false)
  const [user, setUser] = useState<AppUser | null>(null)
  const [consoleKind, setConsoleKind] = useState<ConsoleKind>('school')
  const [role, setRole] = useState<Role>('admin')
  const [schoolId, setSchoolId] = useState<string>('grv')
  const [ownerViewingSchool, setOwnerViewing] = useState(false)
  const [lang, setLangState] = useState('en')
  const [view, setView] = useState('school.dashboard')
  const [focus, setFocus] = useState<string | null>(null)
  const [intent, setIntent] = useState<string | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  /* plan overrides allow live "upgrade" without mutating the dataset */
  const [planOverride, setPlanOverride] = useState<Record<string, Tier>>({})
  /* roster: seeded data plus students enrolled this session (newest first) */
  const [students, setStudents] = useState<Student[]>(seedStudents)
  const addStudent = (student: Student) => setStudents((list) => [student, ...list])
  const [teachers, setTeachers] = useState<Teacher[]>(seedTeachers)
  const addTeacher = (teacher: Teacher) => setTeachers((list) => [teacher, ...list])
  const [staff, setStaff] = useState<Staff[]>(seedStaff)
  const addStaff = (s: Staff) => setStaff((list) => [s, ...list])
  const [exams, setExams] = useState<Exam[]>(seedExams)
  const addExam = (exam: Exam) => setExams((list) => [exam, ...list])
  const updateExam = (id: string, patch: Partial<Exam>) =>
    setExams((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const [examMarks, setExamMarks] = useState<Record<string, number>>({})
  const saveExamMarks = (entries: Record<string, number>) =>
    setExamMarks((m) => ({ ...m, ...entries }))
  const [examAttendance, setExamAttendance] = useState<Record<string, 'present' | 'absent'>>({})
  const saveExamAttendance = (entries: Record<string, 'present' | 'absent'>) =>
    setExamAttendance((m) => ({ ...m, ...entries }))
  const [datesheets, setDatesheets] = useState<Record<string, PaperSlot[]>>({})
  const saveDatesheet = (examId: string, slots: PaperSlot[]) =>
    setDatesheets((m) => ({ ...m, [examId]: slots }))
  const [feePayments, setFeePayments] = useState<FeePayment[]>([])
  const addFeePayment = (p: FeePayment) => setFeePayments((list) => [p, ...list])
  const [feeHeads, setFeeHeads] = useState<string[]>(['Academic', 'Transport', 'Other'])
  const [feeStructure, setFeeStructureState] = useState<Record<string, Record<string, number>>>({})
  const saveFeeStructure = (heads: string[], structure: Record<string, Record<string, number>>) => {
    setFeeHeads(heads)
    setFeeStructureState(structure)
  }
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const clearAuthError = () => setAuthError(null)

  const school = useMemo(() => schools.find((s) => s.id === schoolId) ?? schools[0], [schoolId])
  const plan: Tier = planOverride[schoolId] ?? school.plan
  const dir: 'ltr' | 'rtl' = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr'

  /** Apply the identity from /auth/me to console/role/view state. */
  const applySession = (email: string, role: Role, isPlatform: boolean) => {
    setUser({ name: email.split('@')[0], email, role, hue: isPlatform ? 250 : 210 })
    setConsoleKind(isPlatform ? 'owner' : 'school')
    setRole(role)
    setOwnerViewing(false)
    setView(isPlatform ? 'owner.dashboard' : 'school.dashboard')
    setLoggedIn(true)
  }

  const finishLogin = async (email: string) => {
    const profile = await fetchMe()
    // The backend may return roles outside the UI union (e.g. "school_admin");
    // map anything unknown to a safe default so ROLE_META lookups never crash.
    const known: Role[] = ['admin', 'principal', 'vice_principal', 'teacher']
    const raw = profile.roles[0]
    applySession(email, known.includes(raw as Role) ? (raw as Role) : 'admin', profile.is_platform === true)
  }

  /** Shared busy/error wrapper for the auth flows. */
  const runAuth = async (fn: () => Promise<void>, fallback: string) => {
    setAuthBusy(true); setAuthError(null)
    try {
      await fn()
    } catch (e) {
      setAuthError(e instanceof ApiError ? e.message : fallback)
    } finally {
      setAuthBusy(false)
    }
  }

  const loginWithPassword = (email: string, password: string) =>
    runAuth(async () => {
      await passwordLogin(email, password)
      await finishLogin(email)
    }, 'Sign-in failed. Please try again.')

  const logout = async () => {
    try { await apiLogout() } finally {
      setLoggedIn(false)
      setUser(null)
      setOwnerViewing(false)
      setView('school.dashboard')
      setMobileNav(false)
    }
  }

  const go = (v: string, opts?: { focus?: string; intent?: string }) => {
    setView(v)
    setFocus(opts?.focus ?? null)
    setIntent(opts?.intent ?? null)
    setMobileNav(false)
  }
  const clearIntent = () => setIntent(null)

  const enterSchool = (id: string) => {
    setSchoolId(id)
    setConsoleKind('school')
    setOwnerViewing(true)
    setView('school.dashboard')
  }
  const exitToOwner = () => {
    setConsoleKind('owner')
    setOwnerViewing(false)
    setView('owner.schools')
  }
  const upgrade = (tier: Tier) => setPlanOverride((p) => ({ ...p, [schoolId]: tier }))
  const setLang = (l: string) => {
    setLangState(l)
    document.documentElement.setAttribute('dir', RTL_LANGS.includes(l) ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', l)
  }

  useEffect(() => { setOnAuthFailure(() => { tokenStore.clear(); logout() }) }, [])

  const value: AppState = {
    loggedIn, user, consoleKind, role, schoolId, ownerViewingSchool, lang, dir, view, mobileNav,
    focus, intent,
    school, plan,
    students, addStudent,
    teachers, addTeacher,
    staff, addStaff,
    exams, addExam, updateExam, examMarks, saveExamMarks, examAttendance, saveExamAttendance,
    datesheets, saveDatesheet,
    feePayments, addFeePayment,
    feeHeads, feeStructure, saveFeeStructure,
    authBusy, authError, clearAuthError, loginWithPassword,
    logout, go, clearIntent, setSchoolId, enterSchool, exitToOwner, upgrade, setLang, setMobileNav,
  }

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
