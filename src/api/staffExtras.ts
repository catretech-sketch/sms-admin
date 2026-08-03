/* Staff onboarding fields not yet on the staffing API — persist per-tenant in
   localStorage (same key as peopleExtras files) so edit forms round-trip. */
import { tokenStore } from './auth/tokenStore'
import { fileToStoredDoc, type StoredDoc } from './studentExtras'
import type {
  Staff,
  StaffDocs,
  BankInfo,
  EmergencyInfo,
  TransportInfo,
  SocialInfo,
} from '@/types'

export interface StaffExtras {
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
  files?: StoredDoc[]
}

const PREFIX = 'sms_staff_extras:'

function storageKey(staffId: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `${PREFIX}${tenant}:${staffId}`
}

export function loadStaffExtras(staffId: string): StaffExtras | null {
  try {
    const raw = localStorage.getItem(storageKey(staffId))
    if (!raw) return null
    return JSON.parse(raw) as StaffExtras
  } catch {
    return null
  }
}

export function saveStaffExtras(staffId: string, extras: StaffExtras): void {
  try {
    localStorage.setItem(storageKey(staffId), JSON.stringify(extras))
  } catch {
    const slim: StaffExtras = {
      ...extras,
      files: (extras.files || []).map(({ dataUrl: _d, ...meta }) => meta),
    }
    try {
      localStorage.setItem(storageKey(staffId), JSON.stringify(slim))
    } catch {
      /* ignore quota */
    }
  }
}

export function listStaffDocs(staffId: string): StoredDoc[] {
  return loadStaffExtras(staffId)?.files ?? []
}

export function mergeStaffExtras(s: Staff): Staff {
  const ex = loadStaffExtras(s.id)
  if (!ex) return s
  return {
    ...s,
    dob: ex.dob ?? s.dob,
    bloodGroup: ex.bloodGroup ?? s.bloodGroup,
    maritalStatus: ex.maritalStatus ?? s.maritalStatus,
    altPhone: ex.altPhone ?? s.altPhone,
    // Email now comes from the Staff API (backend field, synced to the linked
    // Users/login row) — prefer it over the legacy localStorage-only extra.
    email: s.email ?? ex.email,
    fatherName: ex.fatherName ?? s.fatherName,
    motherName: ex.motherName ?? s.motherName,
    aadhaar: ex.aadhaar ?? s.aadhaar,
    pan: ex.pan ?? s.pan,
    nationality: ex.nationality ?? s.nationality,
    religion: ex.religion ?? s.religion,
    languages: ex.languages ?? s.languages,
    permanentAddress: ex.permanentAddress ?? s.permanentAddress,
    currentAddress: ex.currentAddress ?? s.currentAddress,
    photoName: ex.photoName ?? s.photoName,
    designation: ex.designation ?? s.designation,
    employeeType: ex.employeeType ?? s.employeeType,
    contractType: ex.contractType ?? s.contractType,
    workLocation: ex.workLocation ?? s.workLocation,
    dateOfJoining: ex.dateOfJoining ?? s.dateOfJoining,
    dateOfLeaving: ex.dateOfLeaving ?? s.dateOfLeaving,
    basicSalary: ex.basicSalary ?? s.basicSalary,
    epf: ex.epf ?? s.epf,
    uan: ex.uan ?? s.uan,
    username: ex.username ?? s.username,
    notes: ex.notes ?? s.notes,
    remarks: ex.remarks ?? s.remarks,
    signatureName: ex.signatureName ?? s.signatureName,
    bank: ex.bank ?? s.bank,
    emergency: ex.emergency ?? s.emergency,
    transport: ex.transport ?? s.transport,
    social: ex.social ?? s.social,
    documents: ex.documents ?? s.documents,
  }
}

export function extrasFromStaff(s: Staff, files: StoredDoc[] = []): StaffExtras {
  return {
    dob: s.dob,
    bloodGroup: s.bloodGroup,
    maritalStatus: s.maritalStatus,
    altPhone: s.altPhone,
    email: s.email,
    fatherName: s.fatherName,
    motherName: s.motherName,
    aadhaar: s.aadhaar,
    pan: s.pan,
    nationality: s.nationality,
    religion: s.religion,
    languages: s.languages,
    permanentAddress: s.permanentAddress,
    currentAddress: s.currentAddress,
    photoName: s.photoName,
    designation: s.designation,
    employeeType: s.employeeType,
    contractType: s.contractType,
    workLocation: s.workLocation,
    dateOfJoining: s.dateOfJoining,
    dateOfLeaving: s.dateOfLeaving,
    basicSalary: s.basicSalary,
    epf: s.epf,
    uan: s.uan,
    username: s.username,
    notes: s.notes,
    remarks: s.remarks,
    signatureName: s.signatureName,
    bank: s.bank,
    emergency: s.emergency,
    transport: s.transport,
    social: s.social,
    documents: s.documents,
    files,
  }
}

/** Persist field extras and uploaded files for a staff id (merge with prior uploads). */
export async function persistStaffExtras(
  staffId: string,
  staff: Staff,
  picks: Array<{ key: string; label: string; file: File | null }>,
): Promise<void> {
  const prev = loadStaffExtras(staffId)
  const byKey = new Map((prev?.files ?? []).map((d) => [d.key, d]))
  for (const p of picks) {
    const stored = await fileToStoredDoc(p.key, p.file, p.label)
    if (stored) byKey.set(p.key, stored)
  }
  saveStaffExtras(staffId, extrasFromStaff(staff, Array.from(byKey.values())))
}
