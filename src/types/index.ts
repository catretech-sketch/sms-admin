/* ============================================================
   SchoolMate — Domain types
   Derived from the prototype data model (data.jsx).
   ============================================================ */

export type Tier = 'silver' | 'gold' | 'platinum'
export type Role = 'admin' | 'principal' | 'vice_principal' | 'teacher'
export type Cap = 'V' | 'E' | 'A'
export type ConsoleKind = 'owner' | 'school'

export type SchoolStatus = 'active' | 'trial' | 'past_due'
export type FeeStatus = 'paid' | 'partial' | 'due'
export type ActiveStatus = 'active' | 'inactive'
export type BusStatus = 'on_route' | 'at_stop' | 'delayed' | 'idle' | 'maintenance'

export interface TierMeta { label: string; color: string; bg: string }
export interface RoleMeta { label: string; short: string; desc: string }

export interface School {
  id: string
  name: string
  city: string
  plan: Tier
  students: number
  staff: number
  status: SchoolStatus
  mrr: number
  attendance: number
  fees: number
  payroll: number
  currency: string
  tz: string
  logo: string
  color: string
}

/* Parent (father / mother) sub-record captured at enrolment. */
export interface ParentInfo {
  name?: string
  email?: string
  phone?: string
  occupation?: string
  aadhaar?: string
  photoName?: string
}

/* Uploaded document filenames (mock — files are not persisted). */
export interface StudentDocs {
  birthCert?: string
  transferCert?: string
  studentAadhaar?: string
  fatherAadhaar?: string
}

export interface Student {
  id: string
  adm: string
  name: string
  gender: 'M' | 'F'
  grade: string
  section: string
  cls: string
  roll: number
  guardian: string
  phone: string
  attendance: number
  feeStatus: FeeStatus
  feeDue: number
  status: ActiveStatus
  house: string
  avatarHue: number
  /* ---- optional enrolment detail (added via the Add Student form) ---- */
  academicYear?: string
  admissionDate?: string
  dob?: string
  bloodGroup?: string
  religion?: string
  category?: string
  caste?: string
  motherTongue?: string
  languages?: string
  lastSchool?: string
  address?: string
  email?: string
  aadhaar?: string
  photoName?: string
  father?: ParentInfo
  mother?: ParentInfo
  documents?: StudentDocs
}

/* ---- Teacher enrolment sub-records (optional, mock) ---- */
export interface BankInfo { holder?: string; account?: string; bank?: string; ifsc?: string; branch?: string }
export interface EmergencyInfo { person?: string; relationship?: string; phone?: string }
export interface TransportInfo { route?: string; vehicle?: string; pickup?: string }
export interface HostelInfo { hostel?: string; room?: string }
export interface SocialInfo { facebook?: string; instagram?: string; linkedin?: string; youtube?: string; twitter?: string }
export interface LeaveInfo { medical?: number; casual?: number; sick?: number; maternity?: number }
export interface TeacherDocs {
  resume?: string; joiningLetter?: string; aadhaar?: string; pan?: string
  experienceCert?: string; educationCert?: string; other?: string
}

export interface Teacher {
  id: string
  name: string
  gender: 'M' | 'F'
  dept: string
  desig: string
  subjects: string[]
  classTeacher: string | null
  phone: string
  email: string
  exp: number
  rating: number
  attendance: number
  result: number
  load: number
  status: ActiveStatus
  avatarHue: number
  top: boolean
  /* ---- optional onboarding detail (added via the Add Teacher form) ---- */
  dob?: string
  bloodGroup?: string
  maritalStatus?: string
  altPhone?: string
  fatherName?: string
  motherName?: string
  aadhaar?: string
  pan?: string
  nationality?: string
  religion?: string
  languages?: string
  permanentAddress?: string
  currentAddress?: string
  photoName?: string
  qualification?: string
  specialization?: string
  prevSchool?: string
  prevSchoolAddress?: string
  prevSchoolPhone?: string
  dateOfJoining?: string
  dateOfLeaving?: string
  employeeType?: string
  contractType?: string
  workShift?: string
  workLocation?: string
  basicSalary?: string
  epf?: string
  uan?: string
  username?: string
  notes?: string
  remarks?: string
  signatureName?: string
  bank?: BankInfo
  emergency?: EmergencyInfo
  transport?: TransportInfo
  hostel?: HostelInfo
  social?: SocialInfo
  leaves?: LeaveInfo
  documents?: TeacherDocs
}

export interface StaffDocs {
  resume?: string; joiningLetter?: string; aadhaar?: string; pan?: string
  experienceCert?: string; educationCert?: string; other?: string
}

export interface Staff {
  id: string
  name: string
  gender: 'M' | 'F'
  role: string
  cat: string
  dept: string
  phone: string
  shift: string
  route: string | null
  attendance: number
  status: ActiveStatus
  avatarHue: number
  /* ---- optional onboarding detail (added via the Add Staff form) ---- */
  dob?: string
  bloodGroup?: string
  maritalStatus?: string
  altPhone?: string
  email?: string
  fatherName?: string
  motherName?: string
  aadhaar?: string
  pan?: string
  nationality?: string
  religion?: string
  languages?: string
  permanentAddress?: string
  currentAddress?: string
  photoName?: string
  designation?: string
  employeeType?: string
  contractType?: string
  workLocation?: string
  dateOfJoining?: string
  dateOfLeaving?: string
  basicSalary?: string
  epf?: string
  uan?: string
  username?: string
  notes?: string
  remarks?: string
  signatureName?: string
  bank?: BankInfo
  emergency?: EmergencyInfo
  transport?: TransportInfo
  social?: SocialInfo
  documents?: StaffDocs
}

export interface Bus {
  id: string
  no: string
  label: string
  driver: string
  conductor: string
  route: string
  capacity: number
  students: number
  stops: number
  status: BusStatus
  speed: number
  eta: string
  fuel: number
  color: string
}

export type ExamStatus = 'scheduled' | 'completed' | 'marks_entry' | 'draft'
export interface Exam {
  id: string
  name: string
  type: string
  grades: string
  from: string
  to: string
  subjects: number
  status: ExamStatus
  marksEntered: number
  published: boolean
}

export interface Approval {
  id: string
  type: string
  module: string
  cap: Cap
  title: string
  detail: string
  requester: string
  role: string
  amount: number | null
  age: string
  priority: 'high' | 'medium' | 'low'
  forRoles: Role[]
}

export interface AppNotification {
  id: number
  icon: string
  tone: string
  title: string
  body: string
  time: string
  unread: boolean
}

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved'
export interface Complaint {
  id: string
  subject: string
  from: string
  cat: string
  priority: 'high' | 'medium' | 'low'
  status: ComplaintStatus
  age: string
  assignee: string
  body: string
}

export interface ThreadMsg { me: boolean; t: string; at: string }
export interface Thread {
  id: number
  parent: string
  student: string
  teacher: string
  unread: number
  last: string
  time: string
  hue: number
  msgs: ThreadMsg[]
}

/* ---- Academic computation ---- */
export interface ReportRow { subject: string; max: number; marks: number; grade: string; gpa: number; pass: boolean }
export interface Report {
  rows: ReportRow[]
  total: number
  maxTotal: number
  pct: number
  grade: string
  gpa: number
  result: 'PASS' | 'COMPARTMENT'
}
export interface RankInfo { rank: number; classSize: number }
export interface MonthValue { label: string; value: number }

/* ---- Query option shapes ---- */
export interface ListStudentsOpts { q?: string; grade?: string; status?: string; fee?: string }
export interface ListTeachersOpts { q?: string; dept?: string; status?: string }
export interface ListStaffOpts { q?: string; cat?: string }
