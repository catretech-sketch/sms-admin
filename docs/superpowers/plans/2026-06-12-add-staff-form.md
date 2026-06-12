# Add Staff Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-page "Add staff" onboarding form for non-teaching staff, parallel to Add Teacher, that enrols a new staff member into an in-session roster shown on the Staff list.

**Architecture:** Lift the staff roster into `AppProvider` (seeded from mock data, with `addStaff`). Extend the `Staff` type with optional onboarding fields. `StaffScreen` reads `app.staff` and gains a gated "Add staff" button. A new `staffAdd.tsx` screen reuses `useFormKit` + the shared validators, builds a `Staff`, and navigates back.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library. Existing `useFormKit` form helpers, `@/lib/validation`, mock data.

---

## File Structure

- **Modify** `src/types/index.ts` — extend `Staff` with optional fields; add `StaffDocs`.
- **Modify** `src/context/AppProvider.tsx` — add `staff` state + `addStaff`.
- **Modify** `src/screens/school/people.tsx` — `StaffScreen` uses `app.staff`; add gated "Add staff" button.
- **Create** `src/screens/school/staffAdd.tsx` — the form screen + `staffAddScreens` export.
- **Modify** `src/screens/registry.tsx` — register `staffAddScreens`.
- **Create** `src/screens/school/staffAdd.test.tsx` — form behavior tests.

---

### Task 1: Extend the `Staff` type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `StaffDocs` and optional fields to `Staff`**

In `src/types/index.ts`, replace the existing `Staff` interface (currently lines ~164-177) with:

```ts
export interface StaffDocs {
  resume?: string; joiningLetter?: string; aadhaar?: string; pan?: string
  experienceCert?: string; educationCert?: string; other?: string
}

export interface Staff {
  id: string
  name: string
  gender: 'M' | 'F'
  role: string
  cat: string
  dept: string
  phone: string
  shift: string
  route: string | null
  attendance: number
  status: ActiveStatus
  avatarHue: number
  /* ---- optional onboarding detail (added via the Add Staff form) ---- */
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
}
```

> `BankInfo`, `EmergencyInfo`, `TransportInfo`, `SocialInfo` already exist later in this file (lines ~93-97). They are referenced before declaration, which is fine for TypeScript `interface` types (hoisted). The existing `Teacher` interface already references them the same way.

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: extend Staff type with optional onboarding fields"
```

---

### Task 2: Lift staff into AppProvider

**Files:**
- Modify: `src/context/AppProvider.tsx`

- [ ] **Step 1: Import the staff seed and type**

Change the imports on lines 6-7 from:

```ts
import type { ConsoleKind, Role, School, Student, Teacher, Tier } from '@/types'
import { schools, students as seedStudents, teachers as seedTeachers } from '@/data/mockDb'
```

to:

```ts
import type { ConsoleKind, Role, School, Staff, Student, Teacher, Tier } from '@/types'
import { schools, students as seedStudents, teachers as seedTeachers, staff as seedStaff } from '@/data/mockDb'
```

- [ ] **Step 2: Add `staff` + `addStaff` to the `AppState` interface**

In the `AppState` interface, directly after these lines:

```ts
  /* teacher roster (seeded, with in-session additions) */
  teachers: Teacher[]
  addTeacher: (teacher: Teacher) => void
```

add:

```ts
  /* non-teaching staff roster (seeded, with in-session additions) */
  staff: Staff[]
  addStaff: (staff: Staff) => void
```

- [ ] **Step 3: Add the state and action in the provider body**

Directly after this line (~86):

```ts
  const [teachers, setTeachers] = useState<Teacher[]>(seedTeachers)
  const addTeacher = (teacher: Teacher) => setTeachers((list) => [teacher, ...list])
```

add:

```ts
  const [staff, setStaff] = useState<Staff[]>(seedStaff)
  const addStaff = (s: Staff) => setStaff((list) => [s, ...list])
```

- [ ] **Step 4: Expose them on the context value**

In the `value` object, change:

```ts
    teachers, addTeacher,
```

to:

```ts
    teachers, addTeacher,
    staff, addStaff,
```

- [ ] **Step 5: Verify typecheck and existing tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test -- AppProvider`
Expected: PASS (existing provider tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/context/AppProvider.tsx
git commit -m "feat: lift staff roster into AppProvider with addStaff"
```

---

### Task 3: StaffScreen reads app.staff + Add staff button

**Files:**
- Modify: `src/screens/school/people.tsx`

- [ ] **Step 1: Read the roster from app state**

In `StaffScreen` (starts ~line 255), directly after `const toast = useToast()` add a roster reference and an editable flag. Change:

```ts
function StaffScreen() {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')

  const message = (s: Staff) => toast.success('Message sent', `Notified ${s.name}.`)

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    staff.forEach((s) => { m[s.cat] = (m[s.cat] || 0) + 1 })
    return m
  }, [])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return staff.filter((s) => {
      if (needle && !(s.name.toLowerCase().includes(needle) || s.role.toLowerCase().includes(needle) || s.id.toLowerCase().includes(needle))) return false
      if (cat !== 'all' && s.cat !== cat) return false
      return true
    })
  }, [q, cat])
```

to:

```ts
function StaffScreen() {
  const app = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')

  const editable = can(app.role, 'sis', 'E')
  const roster = app.staff

  const message = (s: Staff) => toast.success('Message sent', `Notified ${s.name}.`)

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    roster.forEach((s) => { m[s.cat] = (m[s.cat] || 0) + 1 })
    return m
  }, [roster])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return roster.filter((s) => {
      if (needle && !(s.name.toLowerCase().includes(needle) || s.role.toLowerCase().includes(needle) || s.id.toLowerCase().includes(needle))) return false
      if (cat !== 'all' && s.cat !== cat) return false
      return true
    })
  }, [q, cat, roster])
```

> `can` is already imported at the top of `people.tsx` (line 9). `useApp` is already imported.

- [ ] **Step 2: Add the Add staff button and use the live count in the header**

Change the `PageHead` line (~331) from:

```tsx
      <PageHead title="Staff & support" sub={`${staff.length} non-teaching staff · ${app.school.name}`} />
```

to:

```tsx
      <PageHead
        title="Staff & support"
        sub={`${roster.length} non-teaching staff · ${app.school.name}`}
        actions={editable
          ? <Btn variant="primary" icon="plus" onClick={() => app.go('school.staff.add')}>Add staff</Btn>
          : <Badge tone="neutral" icon="eye">View only</Badge>}
      />
```

> `Btn` and `Badge` are already imported in `people.tsx` (line 11).

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors. (The module-level `staff` import in `people.tsx` is still used elsewhere? It is not after this change — but it remains imported. If `tsc` flags `staff` as unused it will NOT error by default in this project; `npm run typecheck` already passed with similar patterns. If an unused-import error appears, remove `staff` from the `import { staff, students, depts }` line in `people.tsx`, keeping `students` and `depts`.)

Run: `npm run test -- registry`
Expected: PASS (screen still renders).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/people.tsx
git commit -m "feat: StaffScreen reads app.staff and gains an Add staff button"
```

---

### Task 4: AddStaffScreen form + registry

**Files:**
- Create: `src/screens/school/staffAdd.tsx`
- Modify: `src/screens/registry.tsx`

- [ ] **Step 1: Create the form screen**

Create `src/screens/school/staffAdd.tsx` with the full content:

```tsx
/* ============================================================
   SchoolMate — Add Staff (full-page onboarding form).
   Non-teaching staff onboarding, parallel to Add Teacher.
   Frontend-only: validates + previews uploads and adds the new
   staff member to the in-session roster.
   Password is validated but never stored (mock).
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { PageHead, Card, CardHead, Btn, Badge, useFormKit } from '@/components/ui'
import { depts } from '@/data/mockDb'
import {
  required, validateAadhaar, validatePAN, validateIFSC, validateURL,
  validateEmail, validatePhone, validateFile, passwordsMatch,
} from '@/lib/validation'
import type { Staff } from '@/types'

/* ---------- option lists ---------- */
const SEL = (...vals: string[]) => ['', ...vals]
const GENDERS = [{ value: '', label: 'Select…' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]
const BLOOD_GROUPS = SEL('A+', 'A−', 'B+', 'B−', 'O+', 'O−', 'AB+', 'AB−')
const MARITAL = SEL('Single', 'Married', 'Divorced', 'Widowed')
const RELIGIONS = SEL('Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other')
const CATEGORIES = [
  { value: '', label: 'Select…' },
  { value: 'transport', label: 'Transport' },
  { value: 'security', label: 'Security' },
  { value: 'academic', label: 'Academic' },
  { value: 'admin', label: 'Admin' },
  { value: 'support', label: 'Support' },
]
const EMP_TYPES = SEL('Full-time', 'Part-time', 'Contract', 'Visiting', 'Intern')
const CONTRACT_TYPES = SEL('Permanent', 'Temporary', 'Probation', 'Fixed-term')
const SHIFTS = SEL('Morning', 'Day', 'Evening', 'Night', 'Rotational')
const STATUS_OPTS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]

const REQUIRED_FIELDS = ['firstName', 'lastName', 'phone', 'role', 'category', 'department'] as const

type Form = Record<string, string>
type Files = Record<string, File | null>

const INITIAL_FORM: Form = {
  // personal
  staffId: '', firstName: '', lastName: '', gender: '', dob: '', bloodGroup: '', maritalStatus: '',
  phone: '', altPhone: '', email: '', fatherName: '', motherName: '', aadhaar: '', pan: '',
  nationality: 'Indian', religion: '', languages: '', permanentAddress: '', currentAddress: '',
  // employment
  role: '', category: '', department: '', employeeType: '', contractType: '', shift: '', workLocation: '',
  dateOfJoining: '', dateOfLeaving: '', status: 'active', basicSalary: '', epf: '', uan: '',
  // bank
  accHolder: '', accNumber: '', bankName: '', ifsc: '', branch: '',
  // emergency
  emPerson: '', emRelationship: '', emPhone: '',
  // transport
  route: '', vehicle: '', pickup: '',
  // social
  facebook: '', instagram: '', linkedin: '', youtube: '', twitter: '',
  // login
  username: '', password: '', confirmPassword: '',
  // additional
  notes: '', remarks: '',
}

const INITIAL_FILES: Files = {
  staffPhoto: null, resume: null, joiningLetter: null, aadhaarDoc: null, panDoc: null,
  experienceCert: null, educationCert: null, otherDoc: null, signature: null,
}

function AddStaffScreen() {
  const app = useApp()
  const toast = useToast()
  const [f, setForm] = useState<Form>(INITIAL_FORM)
  const [files, setFiles] = useState<Files>(INITIAL_FILES)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { txt, sel, area, upload, fieldGrid } = useFormKit(f, setForm, files, setFiles, errors)

  const deptOptions = useMemo(
    () => [
      { value: '', label: 'Select…' },
      { value: 'Transport', label: 'Transport' },
      { value: 'Security', label: 'Security' },
      { value: 'Administration', label: 'Administration' },
      { value: 'Academic Support', label: 'Academic Support' },
      { value: 'General Support', label: 'General Support' },
      ...depts.map((d) => ({ value: d, label: d })),
    ],
    [],
  )

  /* ---------- validation ---------- */
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    for (const key of REQUIRED_FIELDS) {
      const msg = required(f[key])
      if (msg) e[key] = msg
    }
    const checks: [string, string | null][] = [
      ['phone', e.phone ? null : validatePhone(f.phone)],
      ['altPhone', validatePhone(f.altPhone)],
      ['email', validateEmail(f.email)],
      ['aadhaar', validateAadhaar(f.aadhaar)],
      ['pan', validatePAN(f.pan)],
      ['ifsc', validateIFSC(f.ifsc)],
      ['emPhone', validatePhone(f.emPhone)],
      ['facebook', validateURL(f.facebook)],
      ['instagram', validateURL(f.instagram)],
      ['linkedin', validateURL(f.linkedin)],
      ['youtube', validateURL(f.youtube)],
      ['twitter', validateURL(f.twitter)],
      ['confirmPassword', passwordsMatch(f.password, f.confirmPassword)],
    ]
    for (const [key, msg] of checks) if (msg) e[key] = msg
    for (const key of Object.keys(files)) {
      const msg = validateFile(files[key])
      if (msg) e[key] = msg
    }
    return e
  }

  const orU = (v: string): string | undefined => v.trim() || undefined

  const save = () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      toast.danger('Check the form', 'Some fields need your attention before saving.')
      return
    }

    const name = `${f.firstName.trim()} ${f.lastName.trim()}`.trim()
    const inactive = f.status === 'inactive'
    const staffMember: Staff = {
      id: f.staffId.trim() || 'STF' + Date.now().toString(36).toUpperCase(),
      name,
      gender: f.gender === 'F' ? 'F' : 'M',
      role: f.role.trim(),
      cat: f.category,
      dept: f.department,
      phone: f.phone.trim(),
      shift: f.shift || 'Day',
      route: orU(f.route) ?? null,
      attendance: 0,
      status: inactive ? 'inactive' : 'active',
      avatarHue: (name.length * 47) % 360,
      dob: orU(f.dob), bloodGroup: orU(f.bloodGroup), maritalStatus: orU(f.maritalStatus),
      altPhone: orU(f.altPhone), email: orU(f.email), fatherName: orU(f.fatherName), motherName: orU(f.motherName),
      aadhaar: orU(f.aadhaar), pan: orU(f.pan), nationality: orU(f.nationality), religion: orU(f.religion),
      languages: orU(f.languages), permanentAddress: orU(f.permanentAddress), currentAddress: orU(f.currentAddress),
      photoName: files.staffPhoto?.name,
      designation: orU(f.role), employeeType: orU(f.employeeType), contractType: orU(f.contractType),
      workLocation: orU(f.workLocation), dateOfJoining: orU(f.dateOfJoining), dateOfLeaving: orU(f.dateOfLeaving),
      basicSalary: orU(f.basicSalary), epf: orU(f.epf), uan: orU(f.uan),
      username: orU(f.username), notes: orU(f.notes), remarks: orU(f.remarks),
      signatureName: files.signature?.name,
      bank: { holder: orU(f.accHolder), account: orU(f.accNumber), bank: orU(f.bankName), ifsc: orU(f.ifsc), branch: orU(f.branch) },
      emergency: { person: orU(f.emPerson), relationship: orU(f.emRelationship), phone: orU(f.emPhone) },
      transport: { route: orU(f.route), vehicle: orU(f.vehicle), pickup: orU(f.pickup) },
      social: { facebook: orU(f.facebook), instagram: orU(f.instagram), linkedin: orU(f.linkedin), youtube: orU(f.youtube), twitter: orU(f.twitter) },
      documents: {
        resume: files.resume?.name, joiningLetter: files.joiningLetter?.name,
        aadhaar: files.aadhaarDoc?.name, pan: files.panDoc?.name,
        experienceCert: files.experienceCert?.name, educationCert: files.educationCert?.name,
        other: files.otherDoc?.name,
      },
    }

    app.addStaff(staffMember)
    toast.success('Staff added', `${name} added to ${f.department}.`)
    app.go('school.staff')
  }

  return (
    <div>
      <div className="row ai-center gap12" style={{ marginBottom: 16 }}>
        <Btn variant="ghost" icon="arrowLeft" onClick={() => app.go('school.staff')}>Staff</Btn>
      </div>

      <PageHead title="Add staff" sub={`New non-teaching staff record · ${app.school.name}`} />

      <div className="col gap16">
        {/* ---- Personal ---- */}
        <Card>
          <CardHead title="Personal information" icon="user" />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {txt('staffId', 'Staff ID', { ph: 'STF3066' })}
            {txt('firstName', 'First name', { required: true, icon: 'user', ph: 'Suresh' })}
            {txt('lastName', 'Last name', { required: true, ph: 'Naidu' })}
            {sel('gender', 'Gender', GENDERS)}
            {txt('dob', 'Date of birth', { type: 'date' })}
            {sel('bloodGroup', 'Blood group', BLOOD_GROUPS)}
            {sel('maritalStatus', 'Marital status', MARITAL)}
            {txt('phone', 'Primary contact number', { required: true, icon: 'phone', ph: '+91 9XXXXXXXXX' })}
            {txt('altPhone', 'Alternate contact number', { icon: 'phone' })}
            {txt('email', 'Email address', { ph: 'staff@school.edu' })}
            {txt('fatherName', "Father's name")}
            {txt('motherName', "Mother's name")}
            {txt('aadhaar', 'Aadhaar number', { ph: '12 digits' })}
            {txt('pan', 'PAN number', { ph: 'ABCDE1234F' })}
            {txt('nationality', 'Nationality')}
            {sel('religion', 'Religion', RELIGIONS)}
            {txt('languages', 'Languages known', { ph: 'e.g. Hindi, English' })}
            {area('permanentAddress', 'Permanent address')}
            {area('currentAddress', 'Current address')}
            {upload('staffPhoto', 'Staff photo')}
          </>)}</div>
        </Card>

        {/* ---- Employment ---- */}
        <Card>
          <CardHead title="Employment information" icon="briefcase" />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {txt('role', 'Role', { required: true, ph: 'e.g. Bus Driver' })}
            {sel('category', 'Category', CATEGORIES, true)}
            {sel('department', 'Department', deptOptions, true)}
            {sel('employeeType', 'Employee type', EMP_TYPES)}
            {sel('contractType', 'Contract type', CONTRACT_TYPES)}
            {sel('shift', 'Shift', SHIFTS)}
            {txt('workLocation', 'Work location')}
            {txt('dateOfJoining', 'Date of joining', { type: 'date' })}
            {txt('dateOfLeaving', 'Date of leaving', { type: 'date' })}
            {sel('status', 'Status', STATUS_OPTS)}
            {txt('basicSalary', 'Basic salary', { type: 'number', icon: 'rupee' })}
            {txt('epf', 'EPF number')}
            {txt('uan', 'UAN number')}
          </>)}</div>
        </Card>

        <div className="sm-grid-2 gap16">
          {/* ---- Bank ---- */}
          <Card>
            <CardHead title="Bank details" icon="wallet" />
            <div style={{ marginTop: 12 }}>{fieldGrid(<>
              {txt('accHolder', 'Account holder name')}
              {txt('accNumber', 'Account number')}
              {txt('bankName', 'Bank name')}
              {txt('ifsc', 'IFSC code', { ph: 'SBIN0001234' })}
              {txt('branch', 'Branch name')}
            </>)}</div>
          </Card>

          {/* ---- Emergency ---- */}
          <Card>
            <CardHead title="Emergency contact" icon="alert" />
            <div style={{ marginTop: 12 }}>{fieldGrid(<>
              {txt('emPerson', 'Contact person', { icon: 'user' })}
              {txt('emRelationship', 'Relationship')}
              {txt('emPhone', 'Contact number', { icon: 'phone' })}
            </>)}</div>
          </Card>
        </div>

        {/* ---- Transport ---- */}
        <Card>
          <CardHead title="Transport information" icon="bus" />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {txt('route', 'Route')}
            {txt('vehicle', 'Vehicle number')}
            {txt('pickup', 'Pickup point')}
          </>)}</div>
        </Card>

        {/* ---- Social ---- */}
        <Card>
          <CardHead title="Social media" icon="globe" />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {txt('facebook', 'Facebook URL', { ph: 'https://…' })}
            {txt('instagram', 'Instagram URL', { ph: 'https://…' })}
            {txt('linkedin', 'LinkedIn URL', { ph: 'https://…' })}
            {txt('youtube', 'YouTube URL', { ph: 'https://…' })}
            {txt('twitter', 'Twitter / X URL', { ph: 'https://…' })}
          </>)}</div>
        </Card>

        {/* ---- Documents ---- */}
        <Card>
          <CardHead title="Documents" icon="doc" action={<Badge tone="neutral" icon="alert">PDF / JPG / PNG · max 4 MB</Badge>} />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {upload('resume', 'Resume')}
            {upload('joiningLetter', 'Joining letter')}
            {upload('aadhaarDoc', 'Aadhaar card')}
            {upload('panDoc', 'PAN card')}
            {upload('experienceCert', 'Experience certificate')}
            {upload('educationCert', 'Education certificate')}
            {upload('otherDoc', 'Other documents')}
          </>)}</div>
        </Card>

        {/* ---- Login ---- */}
        <Card>
          <CardHead title="Login information" icon="key" action={<Badge tone="neutral" icon="lock">Password is not stored (demo)</Badge>} />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {txt('username', 'Username', { icon: 'user' })}
            {txt('password', 'Password', { type: 'password', icon: 'lock' })}
            {txt('confirmPassword', 'Confirm password', { type: 'password', icon: 'lock' })}
          </>)}</div>
        </Card>

        {/* ---- Additional ---- */}
        <Card>
          <CardHead title="Additional information" icon="list" />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {area('notes', 'Notes')}
            {area('remarks', 'Remarks')}
            {upload('signature', 'Digital signature')}
          </>)}</div>
        </Card>
      </div>

      {/* ---- sticky action bar ---- */}
      <div
        className="row ai-center jc-end gap8"
        style={{
          position: 'sticky', bottom: 0, marginTop: 16, padding: '12px 0',
          background: 'var(--bg)', borderTop: '1px solid var(--border)',
        }}
      >
        <Btn variant="ghost" onClick={() => app.go('school.staff')}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={save}>Save staff</Btn>
      </div>
    </div>
  )
}

export const staffAddScreens: Record<string, ComponentType> = {
  'school.staff.add': AddStaffScreen,
}
```

- [ ] **Step 2: Register the screen**

In `src/screens/registry.tsx`, add the import after the `teacherAddScreens` import (line 14):

```ts
import { staffAddScreens } from './school/staffAdd'
```

and add to the `screenRegistry` spread, after `...teacherAddScreens,`:

```ts
  ...staffAddScreens,
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/staffAdd.tsx src/screens/registry.tsx
git commit -m "feat: Add Staff onboarding form (full-page) + registry"
```

---

### Task 5: Form behavior tests

**Files:**
- Create: `src/screens/school/staffAdd.test.tsx`

- [ ] **Step 1: Write the tests**

Create `src/screens/school/staffAdd.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AppProvider, useApp } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { staffAddScreens } from './staffAdd'

const AddStaffScreen = staffAddScreens['school.staff.add']

function Probe() {
  const app = useApp()
  return <div data-testid="probe">{app.staff.length}|{app.view}</div>
}

function renderForm() {
  return render(
    <AppProvider>
      <ToastProvider>
        <Probe />
        <AddStaffScreen />
      </ToastProvider>
    </AppProvider>,
  )
}

const probe = () => screen.getByTestId('probe').textContent ?? ''
const count = () => Number(probe().split('|')[0])
const view = () => probe().split('|')[1]

const fieldOf = (label: string) => screen.getByText(label).closest('.sm-field') as HTMLElement
const setText = (label: string, value: string) =>
  fireEvent.change(within(fieldOf(label)).getByRole('textbox'), { target: { value } })
const setSelect = (label: string, value: string) =>
  fireEvent.change(within(fieldOf(label)).getByRole('combobox'), { target: { value } })

function fillRequired() {
  setText('First name', 'Suresh')
  setText('Last name', 'Naidu')
  setText('Primary contact number', '9876543210')
  setText('Role', 'Bus Driver')
  setSelect('Category', 'transport')
  setSelect('Department', 'Transport')
}

describe('Add Staff form', () => {
  it('blocks save and shows errors when required fields are empty', () => {
    renderForm()
    const start = count()
    fireEvent.click(screen.getByText('Save staff'))
    expect(count()).toBe(start)
    expect(view()).not.toBe('school.staff')
    expect(screen.getAllByText('This field is required').length).toBeGreaterThan(0)
  })

  it('rejects a malformed Aadhaar number', () => {
    renderForm()
    fillRequired()
    setText('Aadhaar number', '12345')
    fireEvent.click(screen.getByText('Save staff'))
    expect(screen.getByText('Aadhaar must be exactly 12 digits')).toBeInTheDocument()
    expect(view()).not.toBe('school.staff')
  })

  it('adds the staff member and navigates back when valid', () => {
    renderForm()
    const start = count()
    fillRequired()
    fireEvent.click(screen.getByText('Save staff'))
    expect(count()).toBe(start + 1)
    expect(view()).toBe('school.staff')
  })
})
```

- [ ] **Step 2: Run the new tests**

Run: `npm run test -- staffAdd`
Expected: PASS (3 tests). The form was built in Task 4; these pin its behavior.

> If "blocks save" fails because no required error appears, confirm Task 4's `REQUIRED_FIELDS` and that `firstName/lastName/phone/role` are text inputs and `category/department` are selects. If "adds the staff member" fails, confirm `app.addStaff` is wired (Task 2) and `save()` calls `app.go('school.staff')`.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 4: Commit**

```bash
git add src/screens/school/staffAdd.test.tsx
git commit -m "test: cover Add Staff form validation and enrolment"
```

---

## Self-Review Notes

- **Spec coverage:** Lift staff into app state (Task 2) ✓; extend Staff type + StaffDocs (Task 1) ✓; StaffScreen reads `app.staff` + gated Add button (Task 3) ✓; AddStaffScreen with all 9 sections, required fields, reused validators, save mapping (Task 4) ✓; registry (Task 4 Step 2) ✓; tests mirroring teacherAdd — empty-required, bad Aadhaar, valid add (Task 5) ✓.
- **Type consistency:** `addStaff: (staff: Staff) => void` declared (Task 2 Step 2) and called as `app.addStaff(staffMember)` (Task 4). `StaffDocs` fields (`resume/joiningLetter/aadhaar/pan/experienceCert/educationCert/other`) match the `documents` object built in `save()`. `staffAddScreens` exported (Task 4) and imported in registry + test under the same name. Required field keys (`firstName/lastName/phone/role/category/department`) match `INITIAL_FORM` keys and the test's `fillRequired`.
- **Placeholder scan:** none — every code step is complete.
- **Note on `route`:** `transport.route` and the top-level `route` both derive from `f.route`; intentional (the list column reads top-level `route`, the sub-record mirrors Teacher's shape).
