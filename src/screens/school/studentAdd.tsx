/* ============================================================
   SchoolMate — Add / Edit Student enrolment form.
   Student + father/mother + documents. Core SIS fields go to
   the API; parent/docs extras stay in local device storage until
   a documents API exists.
   ============================================================ */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useApp, useToast } from '@/lib/hooks'
import { useCreateStudent, useUpdateStudent } from '@/api/hooks/useStudentMutations'
import { useStudent } from '@/api/hooks/useStudents'
import {
  extrasFromStudent, fileToStoredDoc, loadStudentExtras, saveStudentExtras,
  type StoredDoc,
} from '@/api/studentExtras'
import { PageHead, Card, CardHead, Btn, Badge, Icon, useFormKit, Spinner, Empty } from '@/components/ui'
import { grades, sections } from '@/data/mockDb'
import { required, validateAadhaar, validateEmail, validatePhone, validateFile } from '@/lib/validation'
import type { Student } from '@/types'

const ACADEMIC_YEARS = ['2026–27', '2025–26', '2027–28']
const BLOOD_GROUPS = ['', 'A+', 'A−', 'B+', 'B−', 'O+', 'O−', 'AB+', 'AB−']
const HOUSES = ['', 'Ruby', 'Emerald', 'Sapphire', 'Topaz']
const RELIGIONS = ['', 'Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other']
const CATEGORIES = ['', 'General', 'OBC', 'SC', 'ST', 'EWS']
const GENDERS = [{ value: '', label: 'Select…' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }]
const STATUSES = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]

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

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first: parts[0] || '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function studentToForm(s: Student): Form {
  const { first, last } = splitName(s.name)
  const grade = s.grade || (s.cls.includes('-') ? s.cls.split('-')[0] : s.cls)
  const section = s.section || (s.cls.includes('-') ? s.cls.split('-').slice(1).join('-') : '')
  return {
    ...INITIAL_FORM,
    academicYear: s.academicYear || ACADEMIC_YEARS[0],
    adm: s.adm || '',
    admissionDate: s.admissionDate || '',
    roll: s.roll ? String(s.roll) : '',
    status: s.status === 'inactive' ? 'inactive' : 'active',
    firstName: first,
    lastName: last,
    cls: grade,
    section,
    gender: s.gender || '',
    dob: s.dob ? String(s.dob).slice(0, 10) : '',
    bloodGroup: s.bloodGroup || '',
    house: s.house || '',
    religion: s.religion || '',
    category: s.category || '',
    phone: s.phone || '',
    email: s.email || '',
    caste: s.caste || '',
    motherTongue: s.motherTongue || '',
    languages: s.languages || '',
    lastSchool: s.lastSchool || '',
    address: s.address || '',
    aadhaar: s.aadhaar || '',
    fatherName: s.father?.name || s.guardian || '',
    fatherEmail: s.father?.email || '',
    fatherPhone: s.father?.phone || '',
    fatherOccupation: s.father?.occupation || '',
    fatherAadhaar: s.father?.aadhaar || '',
    motherName: s.mother?.name || '',
    motherEmail: s.mother?.email || '',
    motherPhone: s.mother?.phone || '',
    motherOccupation: s.mother?.occupation || '',
  }
}

function buildStudent(f: Form, files: Files, base?: Student): Student {
  const name = `${f.firstName.trim()} ${f.lastName.trim()}`.trim()
  const cls = `${f.cls}-${f.section}`
  const guardian = (f.fatherName || f.motherName || '').trim()
  return {
    id: base?.id || 'S' + Date.now().toString(36).toUpperCase(),
    adm: f.adm.trim(),
    name,
    gender: f.gender === 'F' ? 'F' : 'M',
    grade: f.cls,
    section: f.section,
    cls,
    roll: Number(f.roll) || 0,
    guardian,
    phone: f.phone.trim(),
    attendance: base?.attendance ?? 0,
    feeStatus: base?.feeStatus ?? 'due',
    feeDue: base?.feeDue ?? 0,
    status: f.status === 'inactive' ? 'inactive' : 'active',
    house: f.house || 'Ruby',
    avatarHue: base?.avatarHue ?? ((name.length * 47) % 360),
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
    photoName: files.studentPhoto?.name || base?.photoName,
    father: {
      name: f.fatherName || undefined, email: f.fatherEmail || undefined,
      phone: f.fatherPhone || undefined, occupation: f.fatherOccupation || undefined,
      aadhaar: f.fatherAadhaar || undefined,
      photoName: files.fatherPhoto?.name || base?.father?.photoName,
    },
    mother: {
      name: f.motherName || undefined, email: f.motherEmail || undefined,
      phone: f.motherPhone || undefined, occupation: f.motherOccupation || undefined,
      photoName: files.motherPhoto?.name || base?.mother?.photoName,
    },
    documents: {
      birthCert: files.birthCert?.name || base?.documents?.birthCert,
      transferCert: files.transferCert?.name || base?.documents?.transferCert,
      studentAadhaar: files.studentAadhaarDoc?.name || base?.documents?.studentAadhaar,
      fatherAadhaar: files.fatherAadhaarDoc?.name || base?.documents?.fatherAadhaar,
    },
  }
}

async function persistExtras(studentId: string, student: Student, files: Files): Promise<void> {
  const prev = loadStudentExtras(studentId)?.files || []
  const byKey = new Map(prev.map((d) => [d.key, d]))
  const picks: Array<[StoredDoc['key'], File | null]> = [
    ['photo', files.studentPhoto],
    ['studentAadhaar', files.studentAadhaarDoc],
    ['fatherPhoto', files.fatherPhoto],
    ['fatherAadhaar', files.fatherAadhaarDoc],
    ['motherPhoto', files.motherPhoto],
    ['birthCert', files.birthCert],
    ['transferCert', files.transferCert],
  ]
  for (const [key, file] of picks) {
    const stored = await fileToStoredDoc(key, file)
    if (stored) byKey.set(key, stored)
  }
  saveStudentExtras(studentId, extrasFromStudent(student, Array.from(byKey.values())))
}

function StudentFormScreen({ mode }: { mode: 'add' | 'edit' }) {
  const app = useApp()
  const toast = useToast()
  const [f, setForm] = useState<Form>(INITIAL_FORM)
  const [files, setFiles] = useState<Files>(INITIAL_FILES)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hydrated, setHydrated] = useState(mode === 'add')
  const [saving, setSaving] = useState(false)

  const { txt, sel, area, upload, fieldGrid } = useFormKit(f, setForm, files, setFiles, errors)
  const createStudent = useCreateStudent()
  const updateStudent = useUpdateStudent()
  const existingQ = useStudent(mode === 'edit' ? app.focus : null)
  const existing = existingQ.data

  useEffect(() => {
    if (mode !== 'edit' || !existing) return
    setForm(studentToForm(existing))
    setHydrated(true)
  }, [mode, existing])

  const clsOptions = useMemo(
    () => [{ value: '', label: 'Select…' }, ...grades.slice(4).map((g) => ({ value: g, label: g }))],
    [],
  )
  const sectionOptions = useMemo(
    () => [{ value: '', label: 'Select…' }, ...sections.map((s) => ({ value: s, label: s }))],
    [],
  )

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    for (const key of REQUIRED_FIELDS) {
      const msg = required(f[key])
      if (msg) e[key] = msg
    }
    if (!f.fatherName.trim() && !f.motherName.trim()) {
      e.fatherName = 'Enter father or mother name'
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
    for (const key of Object.keys(files)) {
      const msg = validateFile(files[key])
      if (msg) e[key] = msg
    }
    return e
  }

  const save = async () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      toast.danger('Check the form', 'Some fields need your attention before saving.')
      return
    }

    const student = buildStudent(f, files, existing)
    setSaving(true)

    const afterOk = async (saved: Student) => {
      await persistExtras(saved.id, { ...student, id: saved.id }, files)
      toast.success(mode === 'edit' ? 'Student updated' : 'Student added', `${saved.name} · ${saved.cls}.`)
      app.go('school.student', { focus: saved.id })
    }

    if (mode === 'edit' && existing) {
      updateStudent.mutate({ id: existing.id, student }, {
        onSuccess: (saved) => { void afterOk(saved).finally(() => setSaving(false)) },
        onError: (err) => {
          setSaving(false)
          toast.danger('Could not save', err instanceof Error ? err.message : 'Please try again.')
        },
      })
      return
    }

    createStudent.mutate(student, {
      onSuccess: (saved) => { void afterOk(saved).finally(() => setSaving(false)) },
      onError: (err) => {
        setSaving(false)
        toast.danger('Could not save', err instanceof Error ? err.message : 'Please try again.')
      },
    })
  }

  if (mode === 'edit' && existingQ.isLoading) {
    return <div className="col ai-center jc-center gap12" style={{ minHeight: 240 }}><Spinner size={28} /><div className="t-sm muted">Loading student…</div></div>
  }
  if (mode === 'edit' && (existingQ.isError || !existing)) {
    return (
      <div>
        <Btn variant="ghost" icon="arrowLeft" onClick={() => app.go('school.sis')}>Students</Btn>
        <Empty icon="user" title="Student not found" body="Open a student from the list, then choose Edit." />
      </div>
    )
  }
  if (!hydrated) return null

  const back = () => (mode === 'edit' && existing ? app.go('school.student', { focus: existing.id }) : app.go('school.sis'))

  return (
    <div>
      <div className="row ai-center gap12" style={{ marginBottom: 16 }}>
        <Btn variant="ghost" icon="arrowLeft" onClick={back}>{mode === 'edit' ? 'Profile' : 'Students'}</Btn>
      </div>

      <PageHead
        title={mode === 'edit' ? 'Edit student' : 'Add student'}
        sub={`${mode === 'edit' ? 'Update enrolment' : 'New enrolment'} · ${app.school.name}`}
      />

      <div className="col gap16">
        <Card>
          <CardHead title="Student details" icon="user" />
          <div style={{ marginTop: 12 }}>
            {fieldGrid(<>
              {sel('academicYear', 'Academic year', ACADEMIC_YEARS)}
              {txt('adm', 'Admission number', { required: true, ph: 'ADM2026000' })}
              {mode === 'edit' ? (
                <div className="t-xs muted" style={{ gridColumn: '1 / -1', marginTop: -8 }}>
                  Admission number is fixed after create; other SIS fields and parents/docs can be updated.
                </div>
              ) : null}
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
          <Card>
            <CardHead title="Father details" icon="user" />
            <div style={{ marginTop: 12 }}>
              {fieldGrid(<>
                {txt('fatherName', 'Father name', { icon: 'user', ph: 'Full name', required: true })}
                {txt('fatherEmail', 'Father email', { ph: 'father@example.com' })}
                {txt('fatherPhone', 'Father phone number', { icon: 'phone', ph: '+91 9XXXXXXXXX' })}
                {txt('fatherOccupation', 'Father occupation')}
                {txt('fatherAadhaar', 'Father Aadhaar number', { ph: '12 digits' })}
                {upload('fatherAadhaarDoc', 'Father Aadhaar card upload')}
                {upload('fatherPhoto', 'Father photo')}
              </>)}
            </div>
          </Card>

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

        <Card>
          <CardHead title="Documents" icon="doc" action={<Badge tone="neutral" icon="alert">PDF / JPG / PNG · max 4 MB</Badge>} />
          <div style={{ marginTop: 12 }}>
            {fieldGrid(<>
              {upload('birthCert', 'Birth certificate')}
              {upload('transferCert', 'Transfer certificate')}
            </>)}
            <div className="row ai-center gap8 t-xs muted" style={{ marginTop: 12 }}>
              <Icon name="check" size={13} />
              Files are kept on this device for View / Download on the student profile.
            </div>
          </div>
        </Card>
      </div>

      <div
        className="row ai-center jc-end gap8"
        style={{
          position: 'sticky', bottom: 0, marginTop: 16, padding: '12px 0',
          background: 'var(--bg)', borderTop: '1px solid var(--border)',
        }}
      >
        <Btn variant="ghost" onClick={back}>Cancel</Btn>
        <Btn variant="primary" icon="check" disabled={saving} onClick={() => { void save() }}>
          {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save student'}
        </Btn>
      </div>
    </div>
  )
}

function AddStudentScreen() {
  return <StudentFormScreen mode="add" />
}

function EditStudentScreen() {
  return <StudentFormScreen mode="edit" />
}

export const studentAddScreens: Record<string, ComponentType> = {
  'school.sis.add': AddStudentScreen,
  'school.sis.edit': EditStudentScreen,
}
