import { properName, properPlace } from './properCase'
import { fromStudent } from '@/api/students'
import { extrasFromStudent } from '@/api/studentExtras'
import type { Student } from '@/types'

/** One parsed+mapped row from an uploaded bulk-import file, before it becomes a Student.
 *  Every field is a plain string (as parsed from CSV/XLSX) — never a File, since bulk
 *  import rows never carry per-row document/photo uploads. */
export interface BulkStudentRow {
  rowNumber: number
  admissionNo: string
  firstName: string
  lastName: string
  section: string
  gender: string
  dob: string
  phone: string
  email: string
  fatherName: string
  fatherPhone: string
  fatherEmail: string
  fatherOccupation: string
  motherName: string
  motherPhone: string
  motherEmail: string
  motherOccupation: string
  bloodGroup: string
  house: string
  religion: string
  category: string
  caste: string
  motherTongue: string
  languages: string
  lastSchool: string
  address: string
  academicYear: string
  admissionDate: string
  status: string
  transportOptedIn: string
  transportRouteId: string
  transportStopId: string
  transportFeeHeadId: string
}

/** Normalizes a free-text bulk-import "gender" cell to the app's 'M' | 'F' encoding.
 *  The single-Add form's dropdown only ever supplies the literal 'M'/'F', so its own
 *  `f.gender === 'F' ? 'F' : 'M'` exact-match check is fine there — but a bulk-upload CSV
 *  cell is free text, and an exact-match-only check would silently mis-map any case or
 *  spelling variant other than the single character 'F' (e.g. "Female", "female", "f ")
 *  to Male. Treat any of f/female (case-insensitive, trimmed) as 'F'; everything else
 *  non-blank stays 'M', matching the existing semantics for every other spelling. */
function normalizeBulkGender(value: string): 'M' | 'F' {
  const normalized = value.trim().toLowerCase()
  return normalized === 'f' || normalized === 'female' ? 'F' : 'M'
}

/** Same shape as buildStudent() in studentAdd.tsx, minus file handling (bulk rows carry no
 *  files) — kept as a separate pure function since bulk import has no React form state to
 *  read files/existing-record from. */
export function buildStudentFromRow(
  row: BulkStudentRow,
  classInfo: { grade: string; section: string; cls: string },
): Student {
  const firstName = properName(row.firstName)
  const lastName = properName(row.lastName)
  const name = `${firstName} ${lastName}`.trim()
  const fatherName = properName(row.fatherName) || undefined
  const motherName = properName(row.motherName) || undefined
  const guardian = (fatherName || motherName || '').trim()
  const father = {
    name: fatherName, email: row.fatherEmail.trim() || undefined,
    phone: row.fatherPhone || undefined, occupation: row.fatherOccupation || undefined,
  }
  const mother = {
    name: motherName, email: row.motherEmail.trim() || undefined,
    phone: row.motherPhone || undefined, occupation: row.motherOccupation || undefined,
  }
  return {
    id: `BULK-${row.rowNumber}-${Date.now().toString(36).toUpperCase()}`,
    adm: row.admissionNo.trim(),
    name,
    gender: normalizeBulkGender(row.gender),
    grade: classInfo.grade,
    section: classInfo.section,
    cls: classInfo.cls,
    roll: 0, /* server assigns A-Z by name within class, same as single Add */
    guardian,
    phone: row.phone.trim(),
    guardianEmail: (father.email || mother.email || '').trim() || undefined,
    attendance: 0,
    feeStatus: 'due',
    feeDue: 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    house: row.house.trim(),
    avatarHue: (name.length * 47) % 360,
    academicYear: row.academicYear,
    admissionDate: row.admissionDate || undefined,
    dob: row.dob,
    bloodGroup: row.bloodGroup || undefined,
    religion: row.religion || undefined,
    category: row.category || undefined,
    caste: row.caste || undefined,
    motherTongue: row.motherTongue || undefined,
    languages: row.languages || undefined,
    lastSchool: properName(row.lastSchool) || undefined,
    address: properPlace(row.address) || undefined,
    email: row.email || undefined,
    father,
    mother,
  } as Student
}

export interface BulkTransportInput {
  routeId: string
  stopId: string
  feeHeadId: string
}

export interface BulkImportRowPayload {
  rowNumber?: number
  createStudentRequest: Record<string, unknown>
  extrasJson: string
  transport: { optedIn: true; routeId: string | null; stopId: string | null; feeHeadId: string | null } | null
}

/** Shapes one built Student into the exact wire payload the bulk-import batch endpoint
 *  expects — reusing fromStudent() (the same function POST /students uses) and
 *  extrasFromStudent() (the same function PUT /students/{id}/extras uses), with an empty
 *  files list since bulk rows never carry documents. */
export function toBulkImportRowPayload(student: Student, transport: BulkTransportInput | null): BulkImportRowPayload {
  return {
    createStudentRequest: fromStudent(student),
    extrasJson: JSON.stringify(extrasFromStudent(student, [])),
    transport: transport
      ? { optedIn: true, routeId: transport.routeId || null, stopId: transport.stopId || null, feeHeadId: transport.feeHeadId || null }
      : null,
  }
}
