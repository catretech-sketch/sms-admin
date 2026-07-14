/* Enrolment extras (father/mother/documents) are not yet on the SIS API.
   Persist per-tenant in localStorage so Parents / Student 360 can show and
   download what was captured at add/edit. */
import { tokenStore } from './auth/tokenStore'
import type { ParentInfo, Student, StudentDocs } from '@/types'

export interface StoredDoc {
  key: keyof StudentDocs | 'photo' | 'fatherPhoto' | 'motherPhoto'
  label: string
  fileName: string
  mime: string
  /** data URL for download/view when size allows */
  dataUrl?: string
  size: number
}

export interface StudentExtras {
  father?: ParentInfo
  mother?: ParentInfo
  documents?: StudentDocs
  photoName?: string
  bloodGroup?: string
  religion?: string
  category?: string
  caste?: string
  motherTongue?: string
  languages?: string
  lastSchool?: string
  aadhaar?: string
  academicYear?: string
  admissionDate?: string
  files?: StoredDoc[]
}

const PREFIX = 'sms_student_extras:'

function storageKey(studentId: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `${PREFIX}${tenant}:${studentId}`
}

export function loadStudentExtras(studentId: string): StudentExtras | null {
  try {
    const raw = localStorage.getItem(storageKey(studentId))
    if (!raw) return null
    return JSON.parse(raw) as StudentExtras
  } catch {
    return null
  }
}

export function saveStudentExtras(studentId: string, extras: StudentExtras): void {
  try {
    localStorage.setItem(storageKey(studentId), JSON.stringify(extras))
  } catch {
    /* quota — keep metadata only */
    const slim: StudentExtras = { ...extras, files: (extras.files || []).map(({ dataUrl: _d, ...meta }) => meta) }
    try {
      localStorage.setItem(storageKey(studentId), JSON.stringify(slim))
    } catch {
      /* ignore */
    }
  }
}

export function mergeStudentExtras(s: Student): Student {
  const ex = loadStudentExtras(s.id)
  if (!ex) return s
  return {
    ...s,
    father: ex.father ?? s.father,
    mother: ex.mother ?? s.mother,
    documents: ex.documents ?? s.documents,
    photoName: ex.photoName ?? s.photoName,
    bloodGroup: ex.bloodGroup ?? s.bloodGroup,
    religion: ex.religion ?? s.religion,
    category: ex.category ?? s.category,
    caste: ex.caste ?? s.caste,
    motherTongue: ex.motherTongue ?? s.motherTongue,
    languages: ex.languages ?? s.languages,
    lastSchool: ex.lastSchool ?? s.lastSchool,
    aadhaar: ex.aadhaar ?? s.aadhaar,
    academicYear: ex.academicYear ?? s.academicYear,
    admissionDate: ex.admissionDate ?? s.admissionDate,
    guardian: (s.guardian || '').trim() || (ex.father?.name || '').trim() || (ex.mother?.name || '').trim() || s.guardian,
    phone: (s.phone || '').trim() || (ex.father?.phone || '').trim() || (ex.mother?.phone || '').trim() || s.phone,
  }
}

const DOC_LABELS: Record<string, string> = {
  birthCert: 'Birth certificate',
  transferCert: 'Transfer certificate',
  studentAadhaar: 'Student Aadhaar',
  fatherAadhaar: 'Father Aadhaar',
  photo: 'Student photo',
  fatherPhoto: 'Father photo',
  motherPhoto: 'Mother photo',
}

export function extrasFromStudent(s: Student, files: StoredDoc[] = []): StudentExtras {
  return {
    father: s.father,
    mother: s.mother,
    documents: s.documents,
    photoName: s.photoName,
    bloodGroup: s.bloodGroup,
    religion: s.religion,
    category: s.category,
    caste: s.caste,
    motherTongue: s.motherTongue,
    languages: s.languages,
    lastSchool: s.lastSchool,
    aadhaar: s.aadhaar,
    academicYear: s.academicYear,
    admissionDate: s.admissionDate,
    files,
  }
}

export async function fileToStoredDoc(
  key: StoredDoc['key'],
  file: File | null | undefined,
): Promise<StoredDoc | null> {
  if (!file) return null
  const label = DOC_LABELS[key] || file.name
  const meta: StoredDoc = {
    key,
    label,
    fileName: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
  }
  /* Cap payload so localStorage stays usable (~700KB each). */
  if (file.size > 700_000) return meta
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return { ...meta, dataUrl }
}

export function listStoredDocs(studentId: string, s?: Student): StoredDoc[] {
  const ex = loadStudentExtras(studentId)
  if (ex?.files?.length) return ex.files
  const docs: StoredDoc[] = []
  const d = s?.documents ?? ex?.documents
  if (d?.birthCert) docs.push({ key: 'birthCert', label: DOC_LABELS.birthCert, fileName: d.birthCert, mime: '', size: 0 })
  if (d?.transferCert) docs.push({ key: 'transferCert', label: DOC_LABELS.transferCert, fileName: d.transferCert, mime: '', size: 0 })
  if (d?.studentAadhaar) docs.push({ key: 'studentAadhaar', label: DOC_LABELS.studentAadhaar, fileName: d.studentAadhaar, mime: '', size: 0 })
  if (d?.fatherAadhaar) docs.push({ key: 'fatherAadhaar', label: DOC_LABELS.fatherAadhaar, fileName: d.fatherAadhaar, mime: '', size: 0 })
  const photo = s?.photoName ?? ex?.photoName
  if (photo) docs.push({ key: 'photo', label: DOC_LABELS.photo, fileName: photo, mime: '', size: 0 })
  return docs
}

export function downloadStoredDoc(doc: StoredDoc): boolean {
  if (!doc.dataUrl) return false
  const a = document.createElement('a')
  a.href = doc.dataUrl
  a.download = doc.fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  return true
}

export function openStoredDoc(doc: StoredDoc): boolean {
  if (!doc.dataUrl) return false
  window.open(doc.dataUrl, '_blank', 'noopener,noreferrer')
  return true
}
