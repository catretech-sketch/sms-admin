import { request, ApiError } from './client'
import { snakeToCamel } from './mapper'

export interface SchoolLocation {
  lat: number
  lng: number
  radiusMeters: number
  name: string | null
}

export interface UpsertSchoolLocationBody {
  lat: number
  lng: number
  radius_meters: number
  name?: string | null
}

/** Campus geo-fence centre + radius (Platinum). Returns null when not configured (404). */
export async function getSchoolLocation(): Promise<SchoolLocation | null> {
  try {
    const wire = await request<Record<string, unknown>>('/me/attendance/school-location')
    return snakeToCamel<SchoolLocation>(wire)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

/** Owner / admin — set campus GPS centre used for teacher & staff app check-in verification. */
export async function upsertSchoolLocation(body: UpsertSchoolLocationBody): Promise<SchoolLocation> {
  const wire = await request<Record<string, unknown>>('/me/attendance/school-location', {
    method: 'PUT',
    body,
  })
  return snakeToCamel<SchoolLocation>(wire)
}

/** Remove saved campus fence (Platinum). Teachers cannot punch until reconfigured. */
export async function deleteSchoolLocation(): Promise<void> {
  await request('/me/attendance/school-location', { method: 'DELETE' })
}
