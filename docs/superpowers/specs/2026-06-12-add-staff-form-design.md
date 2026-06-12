# Add Staff — full-page onboarding form

**Date:** 2026-06-12
**Screen:** Staff & support — `src/screens/school/people.tsx` (`StaffScreen`)
**Status:** Approved design

## Summary

Add an "Add staff" onboarding form for non-teaching staff, parallel to
the existing Add Teacher / Add Student forms. Frontend-only, mock data.
The new staff member is added to an in-session roster and appears
immediately in the Staff list.

## 1. Lift staff into app state (`AppProvider.tsx`)

`StaffScreen` currently reads `staff` directly from `@/data/mockDb`, so
a newly added staff member would not appear. Mirror the teacher pattern:

- Import `staff as seedStaff` and the `Staff` type.
- `const [staff, setStaff] = useState<Staff[]>(seedStaff)`.
- `const addStaff = (s: Staff) => setStaff((list) => [s, ...list])`.
- Add `staff: Staff[]` and `addStaff: (s: Staff) => void` to the
  `AppState` interface and the provided `value`.

## 2. Extend the `Staff` type (`types/index.ts`)

Keep existing required fields (id, name, gender, role, cat, dept, phone,
shift, route, attendance, status, avatarHue). Add optional onboarding
fields (all `?`), adapted from the Teacher type for non-teaching staff:

```
dob, bloodGroup, maritalStatus, altPhone, email, fatherName, motherName,
aadhaar, pan, nationality, religion, languages, permanentAddress,
currentAddress, photoName, designation, employeeType, contractType,
workLocation, dateOfJoining, dateOfLeaving, basicSalary, epf, uan,
username, notes, remarks, signatureName
```

Reused sub-records: `bank?: BankInfo`, `emergency?: EmergencyInfo`,
`transport?: TransportInfo`, `social?: SocialInfo`. New:

```ts
export interface StaffDocs {
  resume?: string; joiningLetter?: string; aadhaar?: string; pan?: string
  experienceCert?: string; educationCert?: string; other?: string
}
```

and `documents?: StaffDocs` on `Staff`.

## 3. StaffScreen changes (`people.tsx`)

- Read roster from `app.staff` instead of mockDb `staff` for both the
  `rows` filter and the category `counts` memo (update memo deps to
  `[app.staff]` / `[q, cat, app.staff]`).
- Add `const editable = can(app.role, 'sis', 'E')`.
- Add a PageHead `actions` prop (PageHead currently has none on this
  screen): when `editable`, an **Add staff** primary button →
  `app.go('school.staff.add')`; otherwise a `View only` neutral badge —
  matching `TeachersScreen`.

## 4. AddStaffScreen (new `src/screens/school/staffAdd.tsx`)

Full-page multi-section form mirroring `teacherAdd.tsx`, using
`useFormKit(f, setForm, files, setFiles, errors)` and the validators in
`@/lib/validation`. Exports
`export const staffAddScreens: Record<string, ComponentType> = { 'school.staff.add': AddStaffScreen }`.

**Category options** (drives `cat`): transport, security, academic,
admin, support (matching the `CATS` list in `people.tsx`).

**Sections:**

1. **Personal** — staffId, firstName*, lastName*, gender, dob,
   bloodGroup, maritalStatus, phone*, altPhone, email, fatherName,
   motherName, aadhaar, pan, nationality (default "Indian"), religion,
   languages, permanentAddress, currentAddress, staffPhoto (upload).
2. **Employment** — role*, category* (select), department* (select),
   employeeType, contractType, shift, workLocation, dateOfJoining,
   dateOfLeaving, status, basicSalary, epf, uan.
3. **Bank details** — accHolder, accNumber, bankName, ifsc, branch.
4. **Emergency contact** — emPerson, emRelationship, emPhone.
5. **Transport** — route, vehicle, pickup.
6. **Social links** — facebook, instagram, linkedin, youtube, twitter.
7. **Documents** — resume, joiningLetter, aadhaarDoc, panDoc,
   experienceCert, educationCert, otherDoc, signature (uploads).
8. **Login** — username, password, confirmPassword.
9. **Additional** — notes, remarks.

**Required fields (block save):** `firstName, lastName, phone, role,
category, department`.

**Validation reused:** `validatePhone` (phone, altPhone, emPhone),
`validateEmail`, `validateAadhaar`, `validatePAN`, `validateIFSC`,
`validateURL` (social), `passwordsMatch`, `validateFile` (all uploads).

**Save:** build a `Staff` and call `app.addStaff`, then
`toast.success('Staff added', …)` and `app.go('school.staff')`. Field
mapping:

- `id`: `f.staffId.trim() || 'STF' + Date.now().toString(36).toUpperCase()`
- `name`: `` `${firstName} ${lastName}`.trim() ``
- `gender`: `f.gender === 'F' ? 'F' : 'M'`
- `role`: `f.role`, `cat`: `f.category`, `dept`: `f.department`
- `shift`: `f.shift || 'Day'`
- `route`: `orU(f.route) ?? null`
- `attendance`: `0`
- `status`: `'active'` unless status field is `inactive`
- `avatarHue`: `(name.length * 47) % 360`
- optional fields via `orU` (empty → undefined); sub-records `bank`,
  `emergency`, `transport`, `social`, `documents` built like the Teacher
  form; uploads stored as `file?.name`.

A back button (`app.go('school.staff')`) and `PageHead title="Add staff"`
top the page, matching Add Teacher.

## 5. Registry (`registry.tsx`)

Import `staffAddScreens` and spread it into `screenRegistry`.

## 6. Testing (`src/screens/school/staffAdd.test.tsx`)

Mirror `teacherAdd.test.tsx` (render `AddStaffScreen` inside
`AppProvider` + `ToastProvider`, with a `Probe` exposing
`app.staff.length` and `app.view`):

- Blocks save and shows "This field is required" when required fields
  are empty; roster length unchanged; still not on `school.staff`.
- Rejects a malformed Aadhaar number (fill required + bad aadhaar →
  blocked).
- Adds the staff member and navigates back to `school.staff` when valid;
  roster length increases by 1.

## Out of scope (YAGNI)

- Teaching-specific sections (subjects, qualification, teaching load,
  rating/result, hostel, leave balances).
- Any backend / persistence beyond the in-session roster.
- Changes to the Staff list columns.
