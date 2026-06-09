# Add Teacher — Full-Page Staff Onboarding Form

**Date:** 2026-06-09
**Status:** Approved (design)
**Area:** People · `src/screens/school/`

## Summary

Replace the minimal 4-field "Add teacher" side-drawer in `people.tsx` with a
**full-page onboarding form** capturing ~90 fields across 13 sections. Mirrors
the already-shipped Add Student feature (`studentAdd.tsx`): full-page layout,
reusable `FileUpload`, pure validation module, in-session roster via
`AppProvider`. On a valid submit the new teacher is added to the in-session
teacher list and appears in the Teachers table.

Frontend-only mock app (React 19 + TS + Vite, no backend). Uploads are validated
and previewed client-side only. Added teachers live in memory and reset on reload.

## Decisions (from brainstorming)

- **Login section:** capture & store **Username only**. Password + Confirm are
  shown with match validation but the password value is **not stored** (mock).
- **Required fields:** First Name, Last Name, Primary Contact Number,
  Department, Designation. Everything else optional.

## Goals

- Full-page form (own route) with 13 section cards.
- All listed fields captured, with the minimal required split above.
- Reuse `FileUpload` for all document/photo/signature uploads.
- Add PAN / IFSC / URL / password-match validators alongside existing ones.
- New teacher appears immediately in the Teachers list (in-session).
- Extract the student form's field helpers into a shared `useFormKit` hook so
  both forms share one implementation.

## Non-Goals (YAGNI)

- No backend, persistence, real file storage, or real authentication.
- No edit/update flow (add only).
- No password storage; no Staff/Parents form changes.

## Architecture

### Routing & screen

- New view key **`school.teachers.add`** in **new file
  `src/screens/school/teacherAdd.tsx`**, exported as a `screens` map and merged
  in `registry.tsx`.
- Layout matches `studentAdd.tsx`: back button ("← Teachers"), `PageHead`,
  section `Card`s in `fieldGrid`, sticky bottom bar with `Cancel`
  (→ `school.teachers`) and `Save teacher`.
- The "Add teacher" button in `people.tsx` switches from `setAddOpen(true)` to
  `app.go('school.teachers.add')`. `AddTeacherDrawer` is **removed**.
- Access gated by `can(app.role, 'sis', 'E')` (unchanged).

### Shared form helpers — new `src/components/ui/formKit.tsx`

Extract the private `txt / sel / area / upload / fieldGrid` helpers currently
inside `studentAdd.tsx` into a `useFormKit(form, setForm, files, setFiles, errors)`
hook returning those builders. Used by **both** the teacher form and (refactored)
student form. `studentAdd.test.tsx` guards the refactor.

## Sections & Fields (13)

1. **Personal:** Teacher ID, First Name★, Last Name★, Gender, DOB, Blood Group,
   Marital Status, Primary Contact★, Alternate Contact, Email, Father's Name,
   Mother's Name, Aadhaar Number, PAN Number, Nationality, Religion, Languages
   Known, Permanent Address, Current Address, Teacher Photo.
2. **Academic:** Class, Subject, Qualification, Specialization, Work Experience
   (years), Previous School Name, Previous School Address, Previous School Phone,
   Date of Joining, Date of Leaving, Status.
3. **Employment:** Employee Type, Department★, Designation★, Contract Type,
   Work Shift, Work Location, Basic Salary, EPF Number, UAN Number.
4. **Leave:** Medical, Casual, Sick, Maternity (number inputs).
5. **Bank:** Account Holder Name, Account Number, Bank Name, IFSC Code, Branch.
6. **Emergency:** Contact Person, Relationship, Contact Number.
7. **Transport:** Route, Vehicle Number, Pickup Point.
8. **Hostel:** Hostel Name, Room Number.
9. **Social Media:** Facebook, Instagram, LinkedIn, YouTube, Twitter/X URLs.
10. **Documents:** Resume, Joining Letter, Aadhaar Card, PAN Card, Experience
    Certificate, Education Certificate, Police Verification, Other.
11. **Login:** Username, Password, Confirm Password (password UI-only).
12. **Additional:** Notes, Remarks, Digital Signature upload, Profile Status.

★ = required (blocks save).

## Validation — extend `src/lib/validation.ts`

Reuse `required`, `validateAadhaar`, `validateEmail`, `validatePhone`,
`validateFile`. Add (all empty-friendly):

- `validatePAN` — `/^[A-Z]{5}[0-9]{4}[A-Z]$/`.
- `validateIFSC` — `/^[A-Z]{4}0[A-Z0-9]{6}$/`.
- `validateURL` — basic `http(s)://…` shape (social links).
- `passwordsMatch(password, confirm)` — error if confirm set and differs, or
  password set without matching confirm.

Errors render inline under each `Field`.

## Data Model & Save

### Types (`src/types/index.ts`)

Extend `Teacher` with **optional** rich fields + nested optional objects so
existing seeded records still type-check:

```ts
interface BankInfo { holder?: string; account?: string; bank?: string; ifsc?: string; branch?: string }
interface EmergencyInfo { person?: string; relationship?: string; phone?: string }
interface TransportInfo { route?: string; vehicle?: string; pickup?: string }
interface HostelInfo { hostel?: string; room?: string }
interface SocialInfo { facebook?: string; instagram?: string; linkedin?: string; youtube?: string; twitter?: string }
interface LeaveInfo { medical?: number; casual?: number; sick?: number; maternity?: number }
interface TeacherDocs { resume?: string; joiningLetter?: string; aadhaar?: string; pan?: string;
  experienceCert?: string; educationCert?: string; policeVerification?: string; other?: string }
// Teacher gains optional: dob, bloodGroup, maritalStatus, altPhone, fatherName,
// motherName, aadhaar, pan, nationality, religion, languages, permanentAddress,
// currentAddress, photoName, qualification, specialization, prevSchool,
// prevSchoolAddress, prevSchoolPhone, dateOfJoining, dateOfLeaving, employeeType,
// contractType, workShift, workLocation, basicSalary, epf, uan, notes, remarks,
// signatureName, username, class (maps to classTeacher),
// bank?, emergency?, transport?, hostel?, social?, leaves?, documents?
```

Files/passwords are not stored on the record (mock) — only filenames and username.

### Teachers store (`src/context/AppProvider.tsx`)

Lift teachers into `AppProvider` as state seeded from `mockDb.teachers`, exposing
`addTeacher(teacher: Teacher)` (prepends). `people.tsx` (`TeachersScreen` rows,
`topPerformers`, `TeacherProfile`) reads `app.teachers`. Same pattern as
`students`/`addStudent`.

### Save flow

1. Validate required + format (incl. password match).
2. On error: danger toast + inline errors; keep form open.
3. On success: build a `Teacher`, deriving lean list fields — `id` = Teacher ID
   (or generated if blank), `name` = First + Last, `dept`/`desig` from form,
   `subjects` = Subject split on commas, `classTeacher` = Class (or null),
   `exp` = Work Experience, `phone`, `email`, `status`; defaults
   `rating`/`result`/`load`/`attendance` = 0, `top` = false, `avatarHue` derived.
   Attach nested objects + `username`. Call `addTeacher`, success toast,
   `app.go('school.teachers')`.

## Testing

- **`validation.test.ts`** — add PAN (valid/invalid), IFSC (valid/invalid),
  URL, and password-match (match / mismatch / empty) cases.
- **`teacherAdd.test.tsx`** — missing required blocks save (no `addTeacher`);
  password mismatch blocks save; valid fill calls `addTeacher` once and
  navigates to `school.teachers`.

## Files Touched

| File | Change |
|------|--------|
| `src/screens/school/teacherAdd.tsx` | **new** — full-page form |
| `src/components/ui/formKit.tsx` | **new** — `useFormKit` shared field builders |
| `src/screens/school/teacherAdd.test.tsx` | **new** — component test |
| `src/lib/validation.ts` | add PAN / IFSC / URL / password-match validators |
| `src/lib/validation.test.ts` | add cases for the new validators |
| `src/types/index.ts` | extend `Teacher` + nested interfaces |
| `src/context/AppProvider.tsx` | teachers store + `addTeacher` |
| `src/screens/school/people.tsx` | button → navigate; read `app.teachers`; remove `AddTeacherDrawer` |
| `src/screens/registry.tsx` | register `teacherAddScreens` |
| `src/components/ui/index.ts` | export `useFormKit` |
| `src/screens/school/studentAdd.tsx` | refactor to use `useFormKit` |
