/* Enrolment extras (father/mother/documents) — GET/PUT /v1/students/{id}/extras.
   Legacy localStorage migrated once; sync load is cache-only after hydrate. */
import {
  fetchPersonExtrasJson, putPersonExtrasJson, loadCachedOrLegacyJson,
} from './personExtrasApi'
import type { ParentInfo, Student, StudentDocs } from '@/types'

export interface StoredDoc {
  /** Student / teacher / staff file key (e.g. photo, aadhaar, resume). */
  key: string
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
  address?: string
  aadhaar?: string
  academicYear?: string
  admissionDate?: string
  files?: StoredDoc[]
}

function parseExtras(raw: string | null): StudentExtras | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as StudentExtras
  } catch {
    return null
  }
}

/** Sync peek of memory/legacy — prefer fetchStudentExtras for authoritative load. */
export function loadStudentExtras(studentId: string): StudentExtras | null {
  return parseExtras(loadCachedOrLegacyJson('student', studentId))
}

export async function fetchStudentExtras(studentId: string): Promise<StudentExtras | null> {
  const json = await fetchPersonExtrasJson('student', studentId)
  return parseExtras(json)
}

export async function saveStudentExtras(studentId: string, extras: StudentExtras): Promise<void> {
  const full = JSON.stringify(extras)
  try {
    await putPersonExtrasJson('student', studentId, full)
  } catch {
    const slim: StudentExtras = {
      ...extras,
      files: (extras.files || []).map(({ dataUrl: _d, ...meta }) => meta),
    }
    await putPersonExtrasJson('student', studentId, JSON.stringify(slim))
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
    address: ex.address ?? s.address,
    aadhaar: ex.aadhaar ?? s.aadhaar,
    academicYear: ex.academicYear ?? s.academicYear,
    admissionDate: ex.admissionDate ?? s.admissionDate,
    guardian: (s.guardian || '').trim() || (ex.father?.name || '').trim() || (ex.mother?.name || '').trim() || s.guardian,
    phone: (s.phone || '').trim() || (ex.father?.phone || '').trim() || (ex.mother?.phone || '').trim() || s.phone,
    guardianEmail: (s.guardianEmail || '').trim() || (ex.father?.email || '').trim() || (ex.mother?.email || '').trim() || s.guardianEmail,
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
    address: s.address,
    aadhaar: s.aadhaar,
    academicYear: s.academicYear,
    admissionDate: s.admissionDate,
    files,
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function isImageUpload(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name)
}

export async function fileToStoredDoc(
  key: string,
  file: File | null | undefined,
  labelOverride?: string,
): Promise<StoredDoc | null> {
  if (!file) return null
  const label = labelOverride || DOC_LABELS[key] || file.name
  let mime = file.type || 'application/octet-stream'
  let size = file.size
  let dataUrl: string | undefined

  /* Images: compress so phone photos still preview (raw files often exceed quota). */
  if (isImageUpload(file)) {
    try {
      const { compressImageFile } = await import('@/lib/compressImage')
      dataUrl = await compressImageFile(file, { maxEdge: 960, quality: 0.78 })
      mime = 'image/jpeg'
      const b64 = dataUrl.split(',')[1] || ''
      size = Math.round(b64.length * 0.75)
    } catch {
      if (file.size <= 900_000) dataUrl = await readAsDataUrl(file)
    }
  } else if (file.size <= 2_500_000) {
    /* PDFs/docs — Chrome won't open raw data: URLs; we store then open via blob. */
    dataUrl = await readAsDataUrl(file)
    if (!mime || mime === 'application/octet-stream') {
      if (/\.pdf$/i.test(file.name)) mime = 'application/pdf'
    }
  }

  return {
    key,
    label,
    fileName: file.name,
    mime,
    size,
    dataUrl,
  }
}

export function isStoredImage(doc: Pick<StoredDoc, 'mime' | 'fileName' | 'dataUrl'>): boolean {
  if (doc.dataUrl?.startsWith('data:image/')) return true
  if (doc.mime?.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(doc.fileName)
}

export function isStoredPdf(doc: Pick<StoredDoc, 'mime' | 'fileName' | 'dataUrl'>): boolean {
  if (doc.mime === 'application/pdf') return true
  if (doc.dataUrl?.startsWith('data:application/pdf')) return true
  return /\.pdf$/i.test(doc.fileName)
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const header = dataUrl.slice(0, comma)
    const b64 = dataUrl.slice(comma + 1)
    const mime = /data:([^;,]+)/i.exec(header)?.[1] || 'application/octet-stream'
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  } catch {
    return null
  }
}

function blobUrlFromDoc(doc: StoredDoc): string | null {
  if (!doc.dataUrl) return null
  const blob = dataUrlToBlob(doc.dataUrl)
  if (!blob) return null
  return URL.createObjectURL(blob)
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

/** Student photo data-URL for list/avatar previews when uploaded at enrolment. */
export function studentPhotoUrl(studentId: string): string | undefined {
  return listStoredDocs(studentId).find((d) => d.key === 'photo' && d.dataUrl)?.dataUrl
}

export function downloadStoredDoc(doc: StoredDoc): boolean {
  if (!doc.dataUrl) return false
  const url = blobUrlFromDoc(doc) || doc.dataUrl
  const a = document.createElement('a')
  a.href = url
  a.download = doc.fileName || 'document'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/** Open PDF/image in a new tab. Uses blob: URLs — Chrome blocks data:application/pdf. */
export function openStoredDoc(doc: StoredDoc): boolean {
  if (!doc.dataUrl) return false
  const url = blobUrlFromDoc(doc)
  if (!url) return downloadStoredDoc(doc)

  const win = window.open(url, '_blank')
  if (!win) {
    /* Popup blocked — fall back to download so the file is still usable. */
    const a = document.createElement('a')
    a.href = url
    a.download = doc.fileName || 'document'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
  return true
}
