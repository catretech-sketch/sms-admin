/* ============================================================
   SchoolMate — Add Teacher (full-page onboarding form).
   13 sections: Personal, Academic, Employment, Leave, Bank,
   Emergency, Transport, Hostel, Social, Documents, Login,
   Additional. Frontend-only: validates + previews uploads and
   adds the new teacher to the in-session roster.
   Password is validated but never stored (mock).
   ============================================================ */
import { useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { PageHead, Card, CardHead, Btn, Badge, useFormKit } from '@/components/ui'
import { depts, grades, sections } from '@/data/mockDb'
import {
  required, validateAadhaar, validatePAN, validateIFSC, validateURL,
  validateEmail, validatePhone, validateFile, passwordsMatch,
} from '@/lib/validation'
import type { Teacher } from '@/types'

/* ---------- option lists ---------- */
const SEL = (...vals: string[]) => ['', ...vals]
const GENDERS = [{ value: '', label: 'Select…' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]
const BLOOD_GROUPS = SEL('A+', 'A−', 'B+', 'B−', 'O+', 'O−', 'AB+', 'AB−')
const MARITAL = SEL('Single', 'Married', 'Divorced', 'Widowed')
const RELIGIONS = SEL('Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other')
const DESIGNATIONS = SEL('Senior Teacher', 'Teacher', 'HOD', 'PGT', 'TGT', 'Assistant Teacher')
const EMP_TYPES = SEL('Full-time', 'Part-time', 'Contract', 'Visiting', 'Intern')
const CONTRACT_TYPES = SEL('Permanent', 'Temporary', 'Probation', 'Fixed-term')
const SHIFTS = SEL('Morning', 'Day', 'Evening', 'Rotational')
const STATUS_OPTS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]

const REQUIRED_FIELDS = ['firstName', 'lastName', 'phone', 'department', 'designation'] as const

type Form = Record<string, string>
type Files = Record<string, File | null>

const INITIAL_FORM: Form = {
  // personal
  teacherId: '', firstName: '', lastName: '', gender: '', dob: '', bloodGroup: '', maritalStatus: '',
  phone: '', altPhone: '', email: '', fatherName: '', motherName: '', aadhaar: '', pan: '',
  nationality: 'Indian', religion: '', languages: '', permanentAddress: '', currentAddress: '',
  // academic
  class: '', subject: '', qualification: '', specialization: '', experience: '',
  prevSchool: '', prevSchoolAddress: '', prevSchoolPhone: '', dateOfJoining: '', dateOfLeaving: '', status: 'active',
  // employment
  employeeType: '', department: '', designation: '', contractType: '', workShift: '', workLocation: '',
  basicSalary: '', epf: '', uan: '',
  // leave
  medical: '', casual: '', sick: '', maternity: '',
  // bank
  accHolder: '', accNumber: '', bankName: '', ifsc: '', branch: '',
  // emergency
  emPerson: '', emRelationship: '', emPhone: '',
  // transport
  route: '', vehicle: '', pickup: '',
  // hostel
  hostelName: '', roomNumber: '',
  // social
  facebook: '', instagram: '', linkedin: '', youtube: '', twitter: '',
  // login
  username: '', password: '', confirmPassword: '',
  // additional
  notes: '', remarks: '', profileStatus: 'active',
}

const INITIAL_FILES: Files = {
  teacherPhoto: null, resume: null, joiningLetter: null, aadhaarDoc: null, panDoc: null,
  experienceCert: null, educationCert: null, otherDoc: null, signature: null,
}

function AddTeacherScreen() {
  const app = useApp()
  const toast = useToast()
  const [f, setForm] = useState<Form>(INITIAL_FORM)
  const [files, setFiles] = useState<Files>(INITIAL_FILES)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { txt, sel, area, upload, fieldGrid } = useFormKit(f, setForm, files, setFiles, errors)

  const classOptions = useMemo(
    () => [{ value: '', label: 'Select…' }, ...grades.slice(4).flatMap((g) => sections.map((s) => ({ value: `${g}-${s}`, label: `${g}-${s}` })))],
    [],
  )
  const deptOptions = useMemo(() => [{ value: '', label: 'Select…' }, ...depts.map((d) => ({ value: d, label: d }))], [])

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
      ['prevSchoolPhone', validatePhone(f.prevSchoolPhone)],
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

  const num = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v))
  const orU = (v: string): string | undefined => v.trim() || undefined

  const save = () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      toast.danger('Check the form', 'Some fields need your attention before saving.')
      return
    }

    const name = `${f.firstName.trim()} ${f.lastName.trim()}`.trim()
    const inactive = f.profileStatus === 'inactive' || f.status === 'inactive'
    const teacher: Teacher = {
      id: f.teacherId.trim() || 'EMP' + Date.now().toString(36).toUpperCase(),
      name,
      gender: f.gender === 'F' ? 'F' : 'M',
      dept: f.department,
      desig: f.designation,
      subjects: f.subject.split(',').map((s) => s.trim()).filter(Boolean),
      classTeacher: f.class || null,
      phone: f.phone.trim(),
      email: f.email.trim(),
      exp: Number(f.experience) || 0,
      rating: 0, attendance: 0, result: 0, load: 0,
      status: inactive ? 'inactive' : 'active',
      avatarHue: (name.length * 47) % 360,
      top: false,
      dob: orU(f.dob), bloodGroup: orU(f.bloodGroup), maritalStatus: orU(f.maritalStatus),
      altPhone: orU(f.altPhone), fatherName: orU(f.fatherName), motherName: orU(f.motherName),
      aadhaar: orU(f.aadhaar), pan: orU(f.pan), nationality: orU(f.nationality), religion: orU(f.religion),
      languages: orU(f.languages), permanentAddress: orU(f.permanentAddress), currentAddress: orU(f.currentAddress),
      photoName: files.teacherPhoto?.name,
      qualification: orU(f.qualification), specialization: orU(f.specialization),
      prevSchool: orU(f.prevSchool), prevSchoolAddress: orU(f.prevSchoolAddress), prevSchoolPhone: orU(f.prevSchoolPhone),
      dateOfJoining: orU(f.dateOfJoining), dateOfLeaving: orU(f.dateOfLeaving),
      employeeType: orU(f.employeeType), contractType: orU(f.contractType), workShift: orU(f.workShift),
      workLocation: orU(f.workLocation), basicSalary: orU(f.basicSalary), epf: orU(f.epf), uan: orU(f.uan),
      username: orU(f.username), notes: orU(f.notes), remarks: orU(f.remarks),
      signatureName: files.signature?.name,
      bank: { holder: orU(f.accHolder), account: orU(f.accNumber), bank: orU(f.bankName), ifsc: orU(f.ifsc), branch: orU(f.branch) },
      emergency: { person: orU(f.emPerson), relationship: orU(f.emRelationship), phone: orU(f.emPhone) },
      transport: { route: orU(f.route), vehicle: orU(f.vehicle), pickup: orU(f.pickup) },
      hostel: { hostel: orU(f.hostelName), room: orU(f.roomNumber) },
      social: { facebook: orU(f.facebook), instagram: orU(f.instagram), linkedin: orU(f.linkedin), youtube: orU(f.youtube), twitter: orU(f.twitter) },
      leaves: { medical: num(f.medical), casual: num(f.casual), sick: num(f.sick), maternity: num(f.maternity) },
      documents: {
        resume: files.resume?.name, joiningLetter: files.joiningLetter?.name,
        aadhaar: files.aadhaarDoc?.name, pan: files.panDoc?.name,
        experienceCert: files.experienceCert?.name, educationCert: files.educationCert?.name,
        other: files.otherDoc?.name,
      },
    }

    app.addTeacher(teacher)
    toast.success('Teacher added', `${name} added to ${f.department}.`)
    app.go('school.teachers')
  }

  return (
    <div>
      <div className="row ai-center gap12" style={{ marginBottom: 16 }}>
        <Btn variant="ghost" icon="arrowLeft" onClick={() => app.go('school.teachers')}>Teachers</Btn>
      </div>

      <PageHead title="Add teacher" sub={`New teaching staff record · ${app.school.name}`} />

      <div className="col gap16">
        {/* ---- Personal ---- */}
        <Card>
          <CardHead title="Personal information" icon="user" />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {txt('teacherId', 'Teacher ID', { ph: 'EMP2026' })}
            {txt('firstName', 'First name', { required: true, icon: 'user', ph: 'Rajesh' })}
            {txt('lastName', 'Last name', { required: true, ph: 'Kumar' })}
            {sel('gender', 'Gender', GENDERS)}
            {txt('dob', 'Date of birth', { type: 'date' })}
            {sel('bloodGroup', 'Blood group', BLOOD_GROUPS)}
            {sel('maritalStatus', 'Marital status', MARITAL)}
            {txt('phone', 'Primary contact number', { required: true, icon: 'phone', ph: '+91 9XXXXXXXXX' })}
            {txt('altPhone', 'Alternate contact number', { icon: 'phone' })}
            {txt('email', 'Email address', { ph: 'teacher@school.edu' })}
            {txt('fatherName', "Father's name")}
            {txt('motherName', "Mother's name")}
            {txt('aadhaar', 'Aadhaar number', { ph: '12 digits' })}
            {txt('pan', 'PAN number', { ph: 'ABCDE1234F' })}
            {txt('nationality', 'Nationality')}
            {sel('religion', 'Religion', RELIGIONS)}
            {txt('languages', 'Languages known', { ph: 'e.g. Hindi, English' })}
            {area('permanentAddress', 'Permanent address')}
            {area('currentAddress', 'Current address')}
            {upload('teacherPhoto', 'Teacher photo')}
          </>)}</div>
        </Card>

        {/* ---- Academic ---- */}
        <Card>
          <CardHead title="Academic information" icon="cap" />
          <div style={{ marginTop: 12 }}>{fieldGrid(<>
            {sel('class', 'Class', classOptions)}
            {txt('subject', 'Subject', { icon: 'book', ph: 'Comma-separated' })}
            {txt('qualification', 'Qualification', { ph: 'e.g. M.Sc, B.Ed' })}
            {txt('specialization', 'Specialization')}
            {txt('experience', 'Work experience (years)', { type: 'number', ph: '0' })}
            {txt('prevSchool', 'Previous school name')}
            {area('prevSchoolAddress', 'Previous school address')}
            {txt('prevSchoolPhone', 'Previous school phone number', { icon: 'phone' })}
            {txt('dateOfJoining', 'Date of joining', { type: 'date' })}
            {txt('dateOfLeaving', 'Date of leaving', { type: 'date' })}
            {sel('status', 'Status', STATUS_OPTS)}
          </>)}</div>
        </Card>

        <div className="sm-grid-2 gap16">
          {/* ---- Employment ---- */}
          <Card>
            <CardHead title="Employment information" icon="briefcase" />
            <div style={{ marginTop: 12 }}>{fieldGrid(<>
              {sel('employeeType', 'Employee type', EMP_TYPES)}
              {sel('department', 'Department', deptOptions, true)}
              {sel('designation', 'Designation', DESIGNATIONS, true)}
              {sel('contractType', 'Contract type', CONTRACT_TYPES)}
              {sel('workShift', 'Work shift', SHIFTS)}
              {txt('workLocation', 'Work location')}
              {txt('basicSalary', 'Basic salary', { type: 'number', icon: 'rupee' })}
              {txt('epf', 'EPF number')}
              {txt('uan', 'UAN number')}
            </>)}</div>
          </Card>

          {/* ---- Leave ---- */}
          <Card>
            <CardHead title="Leave information" icon="calendar" />
            <div style={{ marginTop: 12 }}>{fieldGrid(<>
              {txt('medical', 'Medical leaves', { type: 'number', ph: '0' })}
              {txt('casual', 'Casual leaves', { type: 'number', ph: '0' })}
              {txt('sick', 'Sick leaves', { type: 'number', ph: '0' })}
              {txt('maternity', 'Maternity leaves', { type: 'number', ph: '0' })}
            </>)}</div>
          </Card>
        </div>

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

        <div className="sm-grid-2 gap16">
          {/* ---- Transport ---- */}
          <Card>
            <CardHead title="Transport information" icon="bus" />
            <div style={{ marginTop: 12 }}>{fieldGrid(<>
              {txt('route', 'Route')}
              {txt('vehicle', 'Vehicle number')}
              {txt('pickup', 'Pickup point')}
            </>)}</div>
          </Card>

          {/* ---- Hostel ---- */}
          <Card>
            <CardHead title="Hostel information" icon="building" />
            <div style={{ marginTop: 12 }}>{fieldGrid(<>
              {txt('hostelName', 'Hostel name')}
              {txt('roomNumber', 'Room number')}
            </>)}</div>
          </Card>
        </div>

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
            {sel('profileStatus', 'Profile status', STATUS_OPTS)}
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
        <Btn variant="ghost" onClick={() => app.go('school.teachers')}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={save}>Save teacher</Btn>
      </div>
    </div>
  )
}

export const teacherAddScreens: Record<string, ComponentType> = {
  'school.teachers.add': AddTeacherScreen,
}
