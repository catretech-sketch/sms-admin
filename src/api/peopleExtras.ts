/* Teacher / staff onboarding files — backed by person extras API. */
import {
  fetchTeacherExtras, loadTeacherExtras, saveTeacherExtras,
} from './teacherExtras'
import {
  fetchStaffExtras, loadStaffExtras, saveStaffExtras,
} from './staffExtras'
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

export function listPeopleDocs(kind: PeopleKind, personId: string): StoredDoc[] {
  return kind === 'teacher'
    ? (loadTeacherExtras(personId)?.files ?? [])
    : (loadStaffExtras(personId)?.files ?? [])
}

export function peoplePhotoUrl(kind: PeopleKind, personId: string): string | undefined {
  return listPeopleDocs(kind, personId).find((d) => d.key === 'photo' && d.dataUrl)?.dataUrl
}

/** Prefer API photo (Users.PhotoUrl, synced across schools); fall back to extras upload. */
export function resolvePeoplePhoto(
  kind: PeopleKind,
  personId: string,
  apiPhotoUrl?: string | null,
): string | undefined {
  if (apiPhotoUrl) return apiPhotoUrl
  return peoplePhotoUrl(kind, personId)
}

/** Persist uploaded files for a teacher/staff id (merge with prior uploads and field extras). */
export async function persistPeopleFiles(
  kind: PeopleKind,
  personId: string,
  picks: Array<{ key: string; label: string; file: File | null }>,
): Promise<void> {
  const prev = kind === 'teacher'
    ? (await fetchTeacherExtras(personId).catch(() => loadTeacherExtras(personId)))
    : (await fetchStaffExtras(personId).catch(() => loadStaffExtras(personId)))
  const byKey = new Map((prev?.files ?? listPeopleDocs(kind, personId)).map((d) => [d.key, d]))
  for (const p of picks) {
    const stored = await fileToStoredDoc(p.key, p.file, p.label)
    if (stored) byKey.set(p.key, stored)
  }
  const files = Array.from(byKey.values())
  if (kind === 'teacher') {
    await saveTeacherExtras(personId, { ...(prev ?? {}), files })
  } else {
    await saveStaffExtras(personId, { ...(prev ?? {}), files })
  }
}
