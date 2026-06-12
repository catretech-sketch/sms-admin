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
const STAFF_ROLES = SEL('Driver', 'Conductor', 'Clerk', 'Cleaner', 'Gardener', 'Security Guard', 'Peon')
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
            {sel('role', 'Role', STAFF_ROLES, true)}
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
