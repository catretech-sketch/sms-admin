# Add Student — Full-Page Enrollment Form

**Date:** 2026-06-09
**Status:** Approved (design)
**Area:** Students (SIS) · `src/screens/school/`

## Summary

Replace the minimal 4-field "Add student" side-drawer in `sis.tsx` with a
comprehensive **full-page enrollment form** capturing ~40 fields across four
sections — Student, Father, Mother, Documents — including Aadhaar numbers,
Aadhaar/photo/certificate uploads with client-side validation. On a valid
submit the new student is added to the in-session student list and appears at
the top of the SIS table.

This is a **frontend-only mock app** (React 19 + TS + Vite, no backend). Uploads
are validated and previewed client-side only; nothing is sent to a server.
Added students live in memory and reset on page reload.

## Goals

- Full-page form (own route) with four section cards in a responsive 2-column grid.
- All listed fields captured, with sensible required/optional split.
- Real client-side file uploads: type + size validation, preview, remove/replace.
- Aadhaar 12-digit validation; basic email/phone validation.
- New student appears immediately in the SIS list (in-session).

## Non-Goals (YAGNI)

- No backend, persistence, or real file storage.
- No edit/update flow (add only).
- No bulk-import changes (existing `ImportDrawer` untouched).
- No academic/fee/attendance data entry for the new student (derived defaults only).

## Architecture

### Routing & screen

- New view key **`school.sis.add`** in a **new file `src/screens/school/studentAdd.tsx`**,
  exported through a `screens` map and merged into `sisScreens` (or the registry).
  Keeps the already-large `sis.tsx` focused.
- Navigation uses the existing pattern: `app.go('school.sis.add')`.
- Page layout:
  - Header: back button ("← Students") + title "Add student".
  - Body: four section cards (`Card`) in the existing `sm-grid-2` responsive grid —
    **Student Details**, **Father Details**, **Mother Details**, **Documents**.
  - Sticky bottom action bar: `Cancel` (→ `school.sis`) and `Save student`.
- The SIS list's existing **"Add student"** button changes from opening the drawer
  to `app.go('school.sis.add')`. The old `AddStudentDrawer` component is **removed**.
- Access is limited to editable roles (`canEdit`), matching the existing button gating.

### Sub-components

Within `studentAdd.tsx`, each section is a small focused component:
`StudentSection`, `FatherSection`, `MotherSection`, `DocumentsSection`. They receive
the form state slice + a `setField` updater + `errors`, so each is independently
readable and the parent stays a thin orchestrator.

## Fields

### Student Details (required marked ★)
Academic Year, Admission Number★, Admission Date, Roll Number, Status,
First Name★, Last Name★, Class★, Section★, Gender★, Date of Birth★, Blood Group,
House, Religion, Category, Primary Contact Number★, Email Address, Caste,
Mother Tongue, Language Known, **Aadhaar Number**, **Aadhaar Card Upload**,
**Student Photo Upload**.

### Father Details
Father Name, Father Email, Father Phone Number, Father Occupation,
**Father Aadhaar Number**, **Father Aadhaar Card Upload**, Father Photo Upload.

### Mother Details
Mother Name, Mother Email, Mother Phone Number, Mother Occupation,
Mother Photo Upload.

### Documents
Birth Certificate Upload, Transfer Certificate Upload.
(Student Aadhaar and Father Aadhaar uploads are captured in their respective
sections above and are **not duplicated** here.)

**Required (blocks save):** First Name, Last Name, Class, Section, Admission
Number, Date of Birth, Gender, Primary Contact Number. All other fields optional.

## File Uploads — new `FileUpload` UI primitive

Added to `src/components/ui/forms.tsx` and exported from `components/ui/index.ts`.

- Real `<input type="file">`, `accept=".pdf,.jpg,.jpeg,.png"`.
- Validates **type** (PDF/JPG/JPEG/PNG) and **size ≤ 4 MB**; renders an inline
  error on failure and rejects the file.
- Preview: image files show a thumbnail via `URL.createObjectURL`; PDFs show a
  doc icon + filename. Remove/replace control clears the selection.
- Object URLs are revoked on unmount / replace to avoid leaks.
- Holds the selected `File` (or `null`) in caller state; no server upload.

Props (shape): `{ label?, accept?, value: File|null, onChange(file|null), error? }`.

## Validation — new pure module `src/lib/validation.ts`

Pure, independently unit-tested functions:

- `validateAadhaar(value): string | null` — exactly 12 digits after stripping
  spaces; returns error message or `null`. Empty is valid (optional field).
- `validateFile(file, { maxMb=4, types=[pdf,jpg,jpeg,png] }): string | null`.
- `validateEmail(value): string | null` — basic pattern; empty valid.
- `validatePhone(value): string | null` — basic digit/length check; empty valid.
- `required(value): string | null`.

Errors render inline under each `Field` via its existing `error` prop.

## Data Model & Save

### Types (`src/types/index.ts`)

Extend `Student` with **optional** rich fields so existing seeded records still
type-check, plus nested optional objects:

```ts
interface ParentInfo { name?: string; email?: string; phone?: string;
  occupation?: string; aadhaar?: string }
interface StudentDocs { /* filenames only, mock */ birthCert?: string;
  transferCert?: string; studentAadhaar?: string; fatherAadhaar?: string }
// Student gains optional: academicYear, admissionDate, roll already exists,
// dob, bloodGroup, religion, category, caste, motherTongue, languages,
// email, aadhaar, photoName, father?: ParentInfo, mother?: ParentInfo,
// documents?: StudentDocs
```

(Files themselves are not stored on the typed record — only filenames, since this
is mock data. The live `File`/preview lives in form component state.)

### Students store (`src/context/AppProvider.tsx`)

Lift the students list into `AppProvider` as state seeded from `mockDb.students`,
exposing `addStudent(student: Student)`. Chosen over a separate provider because
SIS screens already consume `useApp`, giving the smallest new surface area.

- `app.students` replaces the direct `mockDb` import in the SIS list and `Student360`.
- `addStudent` prepends the new record so it appears at the top.

### Save flow

1. Validate all fields (required + format).
2. On error: show a danger toast + inline field errors; keep the form open.
3. On success: build a `Student` record, deriving lean list fields —
   `guardian` = Father Name (fallback Mother Name), `phone` = Primary Contact,
   `attendance` = 0, `feeStatus` = 'due', `feeDue` = 0, `avatarHue` from a hue
   helper, `cls` = `Class-Section`. Call `addStudent`, show success toast,
   `app.go('school.sis')`.

## Testing

- **`src/lib/validation.test.ts`** (core): aadhaar (valid 12-digit, with spaces,
  wrong length, non-digits, empty), file (good type/size, oversize, bad type),
  email + phone edge cases.
- **One component test** for the form: missing required fields blocks save (no
  `addStudent` call, error shown); a valid fill calls `addStudent` once with the
  expected derived record.

## Files Touched

| File | Change |
|------|--------|
| `src/screens/school/studentAdd.tsx` | **new** — full-page form + section components |
| `src/lib/validation.ts` | **new** — pure validators |
| `src/lib/validation.test.ts` | **new** — validator unit tests |
| `src/components/ui/forms.tsx` | add `FileUpload` primitive |
| `src/components/ui/index.ts` | export `FileUpload` |
| `src/types/index.ts` | extend `Student` + `ParentInfo`/`StudentDocs` |
| `src/context/AppProvider.tsx` | students store + `addStudent` |
| `src/screens/school/sis.tsx` | button → navigate; read `app.students`; remove `AddStudentDrawer` |
| `src/screens/registry.tsx` | (only if new screen isn't merged via `sisScreens`) |
