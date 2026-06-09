/* ============================================================
   SchoolMate — useFormKit: shared field builders for the large
   enrolment / onboarding forms (Add Student, Add Teacher).
   Given the form's state slices, returns helpers that render a
   labelled Field wired to the right control + inline error.
   ============================================================ */
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Field, Input, Textarea, Select, FileUpload } from './forms'
import type { SelectOption } from './forms'

export type FormState = Record<string, string>
export type FileState = Record<string, File | null>

/** A responsive grid for laying out fields inside a section card. */
export function fieldGrid(children: ReactNode) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
      {children}
    </div>
  )
}

export interface TxtOpts { required?: boolean; icon?: string; ph?: string; type?: string }

export function useFormKit(
  f: FormState,
  setForm: Dispatch<SetStateAction<FormState>>,
  files: FileState,
  setFiles: Dispatch<SetStateAction<FileState>>,
  errors: Record<string, string>,
) {
  const set = (key: string, value: string) => setForm((s) => ({ ...s, [key]: value }))
  const setFile = (key: string) => (file: File | null) => setFiles((s) => ({ ...s, [key]: file }))

  const txt = (key: string, label: ReactNode, opts: TxtOpts = {}) => (
    <Field label={label} required={opts.required} error={errors[key]}>
      <Input
        icon={opts.icon} type={opts.type} value={f[key]} placeholder={opts.ph}
        error={!!errors[key]} onChange={(ev) => set(key, ev.target.value)}
      />
    </Field>
  )

  const sel = (key: string, label: ReactNode, options: SelectOption[], req?: boolean) => (
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

  return { set, setFile, txt, sel, area, upload, fieldGrid }
}
