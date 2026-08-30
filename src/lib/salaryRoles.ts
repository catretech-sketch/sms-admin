/* ============================================================
   Canonical role / designation lists used both by the add/edit
   person forms and by the salary-structure editor, so a template
   keyed by role/designation always lines up with what people are
   assigned on their profile.
   ============================================================ */

/** Teacher designations (keys for teacher salary-structure templates). */
export const TEACHER_DESIGNATIONS = [
  'Senior Teacher', 'Teacher', 'HOD', 'PGT', 'TGT', 'Assistant Teacher',
] as const

/** Support-staff roles (keys for staff salary-structure templates). */
export const STAFF_ROLES = [
  'Driver', 'Conductor', 'Peon', 'Bus Attendant', 'Watchman', 'Security Guard',
] as const

/** Leadership roles (login users, not People) that can also draw a salary. */
export const LEADERSHIP_ROLES = [
  'Principal', 'Owner',
] as const

export type TeacherDesignation = (typeof TEACHER_DESIGNATIONS)[number]
export type StaffRole = (typeof STAFF_ROLES)[number]
export type LeadershipRole = (typeof LEADERSHIP_ROLES)[number]
