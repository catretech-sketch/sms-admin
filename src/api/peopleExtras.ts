/* Teacher / staff onboarding files — stored alongside field extras in localStorage
   until a documents API exists. */
import { tokenStore } from './auth/tokenStore'
import { listTeacherDocs, loadTeacherExtras, saveTeacherExtras } from './teacherExtras'
import { listStaffDocs, loadStaffExtras, saveStaffExtras } from './staffExtras'
import {
  fileToStoredDoc,
  openStoredDoc,
  downloadStoredDoc,
  isStoredImage,
  type StoredDoc,
} from './studentExtras'

export type PeopleKind = 'teacher' | 'staff'
export type { StoredDoc }
export { openStoredDoc, downloadStoredDoc, isStoredImage }

export interface PeopleExtras {
  files?: StoredDoc[]
}

function storageKey(kind: PeopleKind, personId: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_${kind}_extras:${tenant}:${personId}`
}

export function loadPeopleExtras(kind: PeopleKind, personId: string): PeopleExtras | null {
  try {
    const raw = localStorage.getItem(storageKey(kind, personId))
    if (!raw) return null
    return JSON.parse(raw) as PeopleExtras
  } catch {
    return null
  }
}

export function savePeopleExtras(kind: PeopleKind, personId: string, extras: PeopleExtras): void {
  try {
    localStorage.setItem(storageKey(kind, personId), JSON.stringify(extras))
  } catch {
    const slim: PeopleExtras = {
      files: (extras.files || []).map(({ dataUrl: _d, ...meta }) => meta),
    }
    try {
      localStorage.setItem(storageKey(kind, personId), JSON.stringify(slim))
    } catch {
      /* ignore quota */
    }
  }
}

export function listPeopleDocs(kind: PeopleKind, personId: string): StoredDoc[] {
  const fromExtras = kind === 'teacher' ? listTeacherDocs(personId) : listStaffDocs(personId)
  if (fromExtras.length) return fromExtras
  return loadPeopleExtras(kind, personId)?.files ?? []
}

export function peoplePhotoUrl(kind: PeopleKind, personId: string): string | undefined {
  return listPeopleDocs(kind, personId).find((d) => d.key === 'photo' && d.dataUrl)?.dataUrl
}

/** Persist uploaded files for a teacher/staff id (merge with prior uploads and field extras). */
export async function persistPeopleFiles(
  kind: PeopleKind,
  personId: string,
  picks: Array<{ key: string; label: string; file: File | null }>,
): Promise<void> {
  const prev = kind === 'teacher' ? loadTeacherExtras(personId) : loadStaffExtras(personId)
  const byKey = new Map((prev?.files ?? listPeopleDocs(kind, personId)).map((d) => [d.key, d]))
  for (const p of picks) {
    const stored = await fileToStoredDoc(p.key, p.file, p.label)
    if (stored) byKey.set(p.key, stored)
  }
  const files = Array.from(byKey.values())
  if (prev) {
    const save = kind === 'teacher' ? saveTeacherExtras : saveStaffExtras
    save(personId, { ...prev, files })
  } else {
    savePeopleExtras(kind, personId, { files })
  }
}
