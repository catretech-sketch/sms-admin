/* ============================================================
   SchoolMate — Add Student (full-page enrolment form).
   Four sections: Student, Father, Mother, Documents.
   Frontend-only: validates + previews uploads client-side and
   adds the new student to the in-session roster.
   ============================================================ */
import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import {
  PageHead, Card, CardHead, Btn, Badge, Field, Input, Textarea, Select, FileUpload, Icon,
} from '@/components/ui'
import { grades, sections } from '@/data/mockDb'
import { required, validateAadhaar, validateEmail, validatePhone, validateFile } from '@/lib/validation'
import type { Student } from '@/types'

/* ---------- option lists ---------- */
const ACADEMIC_YEARS = ['2026–27', '2025–26', '2027–28']
const BLOOD_GROUPS = ['', 'A+', 'A−', 'B+', 'B−', 'O+', 'O−', 'AB+', 'AB−']
const HOUSES = ['', 'Ruby', 'Emerald', 'Sapphire', 'Topaz']
const RELIGIONS = ['', 'Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other']
const CATEGORIES = ['', 'General', 'OBC', 'SC', 'ST', 'EWS']
const GENDERS = [{ value: '', label: 'Select…' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]
const STATUSES = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]

/* text fields that must be filled before save */
const REQUIRED_FIELDS = ['firstName', 'lastName', 'cls', 'section', 'adm', 'dob', 'gender', 'phone'] as const

type Form = Record<string, string>
type Files = Record<string, File | null>

const INITIAL_FORM: Form = {
  academicYear: ACADEMIC_YEARS[0], adm: '', admissionDate: '', roll: '', status: 'active',
  firstName: '', lastName: '', cls: '', section: '', gender: '', dob: '',
  bloodGroup: '', house: '', religion: '', category: '', phone: '', email: '',
  caste: '', motherTongue: '', languages: '', lastSchool: '', address: '', aadhaar: '',
  fatherName: '', fatherEmail: '', fatherPhone: '', fatherOccupation: '', fatherAadhaar: '',
  motherName: '', motherEmail: '', motherPhone: '', motherOccupation: '',
}

const INITIAL_FILES: Files = {
  studentPhoto: null, studentAadhaarDoc: null,
  fatherPhoto: null, fatherAadhaarDoc: null, motherPhoto: null,
  birthCert: null, transferCert: null,
}

function fieldGrid(children: ReactNode) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>{children}</div>
}

function AddStudentScreen() {
  const app = useApp()
  const toast = useToast()
  const [f, setForm] = useState<Form>(INITIAL_FORM)
  const [files, setFiles] = useState<Files>(INITIAL_FILES)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (key: string, value: string) => setForm((s) => ({ ...s, [key]: value }))
  const setFile = (key: string) => (file: File | null) => setFiles((s) => ({ ...s, [key]: file }))

  const clsOptions = useMemo(
    () => [{ value: '', label: 'Select…' }, ...grades.slice(4).map((g) => ({ value: g, label: g }))],
    [],
  )
  const sectionOptions = useMemo(
    () => [{ value: '', label: 'Select…' }, ...sections.map((s) => ({ value: s, label: s }))],
    [],
  )

  /* ---------- validation + save ---------- */
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    for (const key of REQUIRED_FIELDS) {
      const msg = required(f[key])
      if (msg) e[key] = msg
    }
    const checks: [string, string | null][] = [
      ['aadhaar', validateAadhaar(f.aadhaar)],
      ['fatherAadhaar', validateAadhaar(f.fatherAadhaar)],
      ['email', validateEmail(f.email)],
      ['fatherEmail', validateEmail(f.fatherEmail)],
      ['motherEmail', validateEmail(f.motherEmail)],
      ['phone', e.phone ? null : validatePhone(f.phone)],
      ['fatherPhone', validatePhone(f.fatherPhone)],
      ['motherPhone', validatePhone(f.motherPhone)],
    ]
    for (const [key, msg] of checks) if (msg) e[key] = msg
    /* defence-in-depth: files are already validated on pick */
    for (const key of Object.keys(files)) {
      const msg = validateFile(files[key])
      if (msg) e[key] = msg
    }
    return e
  }

  const save = () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      toast.danger('Check the form', 'Some fields need your attention before saving.')
      return
    }

    const name = `${f.firstName.trim()} ${f.lastName.trim()}`.trim()
    const cls = `${f.cls}-${f.section}`
    const student: Student = {
      id: 'S' + Date.now().toString(36).toUpperCase(),
      adm: f.adm.trim(),
      name,
      gender: f.gender === 'F' ? 'F' : 'M',
      grade: f.cls,
      section: f.section,
      cls,
      roll: Number(f.roll) || 0,
      guardian: (f.fatherName || f.motherName || '—').trim(),
      phone: f.phone.trim(),
      attendance: 0,
      feeStatus: 'due',
      feeDue: 0,
      status: f.status === 'inactive' ? 'inactive' : 'active',
      house: f.house || 'Ruby',
      avatarHue: (name.length * 47) % 360,
      academicYear: f.academicYear,
      admissionDate: f.admissionDate || undefined,
      dob: f.dob,
      bloodGroup: f.bloodGroup || undefined,
      religion: f.religion || undefined,
      category: f.category || undefined,
      caste: f.caste || undefined,
      motherTongue: f.motherTongue || undefined,
      languages: f.languages || undefined,
      lastSchool: f.lastSchool || undefined,
      address: f.address || undefined,
      email: f.email || undefined,
      aadhaar: f.aadhaar || undefined,
      photoName: files.studentPhoto?.name,
      father: {
        name: f.fatherName || undefined, email: f.fatherEmail || undefined,
        phone: f.fatherPhone || undefined, occupation: f.fatherOccupation || undefined,
        aadhaar: f.fatherAadhaar || undefined, photoName: files.fatherPhoto?.name,
      },
      mother: {
        name: f.motherName || undefined, email: f.motherEmail || undefined,
        phone: f.motherPhone || undefined, occupation: f.motherOccupation || undefined,
        photoName: files.motherPhoto?.name,
      },
      documents: {
        birthCert: files.birthCert?.name, transferCert: files.transferCert?.name,
        studentAadhaar: files.studentAadhaarDoc?.name, fatherAadhaar: files.fatherAadhaarDoc?.name,
      },
    }

    app.addStudent(student)
    toast.success('Student added', `${name} enrolled in ${cls}.`)
    app.go('school.sis')
  }

  /* ---------- field helpers ---------- */
  const txt = (key: string, label: ReactNode, opts: { required?: boolean; icon?: string; ph?: string; type?: string } = {}) => (
    <Field label={label} required={opts.required} error={errors[key]}>
      <Input
        icon={opts.icon} type={opts.type} value={f[key]} placeholder={opts.ph}
        error={!!errors[key]} onChange={(ev) => set(key, ev.target.value)}
      />
    </Field>
  )
  const sel = (key: string, label: ReactNode, options: Parameters<typeof Select>[0]['options'], req?: boolean) => (
    <Field label={label} required={req} error={errors[key]}>
      <Select options={options} value={f[key]} onChange={(ev) => set(key, ev.target.value)} />
    </Field>
  )
  const area = (key: string, label: ReactNode, opts: { ph?: string } = {}) => (
    <div style={{ gridColumn: '1 / -1' }}>
      <Field label={label} error={errors[key]}>
        <Textarea value={f[key]} placeholder={opts.ph} onChange={(ev) => set(key, ev.target.value)} />
      </Field>
    </div>
  )
  const upload = (key: string, label: ReactNode) => (
    <Field label={label} error={errors[key]}>
      <FileUpload value={files[key]} onChange={setFile(key)} ariaLabel={typeof label === 'string' ? label : key} />
    </Field>
  )

  return (
    <div>
      <div className="row ai-center gap12" style={{ marginBottom: 16 }}>
        <Btn variant="ghost" icon="arrowLeft" onClick={() => app.go('school.sis')}>Students</Btn>
      </div>

      <PageHead title="Add student" sub={`New enrolment record · ${app.school.name}`} />

      <div className="col gap16">
        {/* ---- Student Details ---- */}
        <Card>
          <CardHead title="Student details" icon="user" />
          <div style={{ marginTop: 12 }}>
            {fieldGrid(<>
              {sel('academicYear', 'Academic year', ACADEMIC_YEARS)}
              {txt('adm', 'Admission number', { required: true, ph: 'ADM2026000' })}
              {txt('admissionDate', 'Admission date', { type: 'date' })}
              {txt('roll', 'Roll number', { ph: 'e.g. 24' })}
              {sel('status', 'Status', STATUSES)}
              {txt('firstName', 'First name', { required: true, icon: 'user', ph: 'Aarav' })}
              {txt('lastName', 'Last name', { required: true, ph: 'Sharma' })}
              {sel('cls', 'Class', clsOptions, true)}
              {sel('section', 'Section', sectionOptions, true)}
              {sel('gender', 'Gender', GENDERS, true)}
              {txt('dob', 'Date of birth', { required: true, type: 'date' })}
              {sel('bloodGroup', 'Blood group', BLOOD_GROUPS)}
              {sel('house', 'House', HOUSES)}
              {sel('religion', 'Religion', RELIGIONS)}
              {sel('category', 'Category', CATEGORIES)}
              {txt('phone', 'Primary contact number', { required: true, icon: 'phone', ph: '+91 9XXXXXXXXX' })}
              {txt('email', 'Email address', { ph: 'student@example.com' })}
              {txt('caste', 'Caste')}
              {txt('motherTongue', 'Mother tongue', { ph: 'e.g. Hindi' })}
              {txt('languages', 'Languages known', { ph: 'e.g. Hindi, English' })}
              {txt('lastSchool', 'Last school name', { icon: 'building', ph: 'Previous school attended' })}
              {area('address', 'Address', { ph: 'Residential address' })}
              {txt('aadhaar', 'Aadhaar number', { ph: '12 digits' })}
              {upload('studentAadhaarDoc', 'Aadhaar card upload')}
              {upload('studentPhoto', 'Student photo')}
            </>)}
          </div>
        </Card>

        <div className="sm-grid-2 gap16">
          {/* ---- Father Details ---- */}
          <Card>
            <CardHead title="Father details" icon="user" />
            <div style={{ marginTop: 12 }}>
              {fieldGrid(<>
                {txt('fatherName', 'Father name', { icon: 'user', ph: 'Full name' })}
                {txt('fatherEmail', 'Father email', { ph: 'father@example.com' })}
                {txt('fatherPhone', 'Father phone number', { icon: 'phone', ph: '+91 9XXXXXXXXX' })}
                {txt('fatherOccupation', 'Father occupation')}
                {txt('fatherAadhaar', 'Father Aadhaar number', { ph: '12 digits' })}
                {upload('fatherAadhaarDoc', 'Father Aadhaar card upload')}
                {upload('fatherPhoto', 'Father photo')}
              </>)}
            </div>
          </Card>

          {/* ---- Mother Details ---- */}
          <Card>
            <CardHead title="Mother details" icon="user" />
            <div style={{ marginTop: 12 }}>
              {fieldGrid(<>
                {txt('motherName', 'Mother name', { icon: 'user', ph: 'Full name' })}
                {txt('motherEmail', 'Mother email', { ph: 'mother@example.com' })}
                {txt('motherPhone', 'Mother phone number', { icon: 'phone', ph: '+91 9XXXXXXXXX' })}
                {txt('motherOccupation', 'Mother occupation')}
                {upload('motherPhoto', 'Mother photo')}
              </>)}
            </div>
          </Card>
        </div>

        {/* ---- Documents ---- */}
        <Card>
          <CardHead title="Documents" icon="doc" action={<Badge tone="neutral" icon="alert">PDF / JPG / PNG · max 4 MB</Badge>} />
          <div style={{ marginTop: 12 }}>
            {fieldGrid(<>
              {upload('birthCert', 'Birth certificate')}
              {upload('transferCert', 'Transfer certificate')}
            </>)}
            <div className="row ai-center gap8 t-xs muted" style={{ marginTop: 12 }}>
              <Icon name="check" size={13} />
              Student &amp; Father Aadhaar cards are captured in their sections above.
            </div>
          </div>
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
        <Btn variant="ghost" onClick={() => app.go('school.sis')}>Cancel</Btn>
        <Btn variant="primary" icon="check" onClick={save}>Save student</Btn>
      </div>
    </div>
  )
}

export const studentAddScreens: Record<string, ComponentType> = {
  'school.sis.add': AddStudentScreen,
}
