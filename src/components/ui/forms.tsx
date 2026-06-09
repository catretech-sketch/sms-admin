/* ============================================================
   SchoolMate — Form controls: Field, Input, Textarea, Select,
   Toggle, Checkbox, Search
   ============================================================ */
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode, Ref } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { validateFile } from '@/lib/validation'

export function Field({ label, required, hint, error, children }: {
  label?: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode
}) {
  return (
    <div className="sm-field">
      {label && <label className="sm-label">{label}{required && <span className="sm-req">*</span>}</label>}
      {children}
      {error ? <span className="sm-err"><Icon name="alert" size={12} />{error}</span> : hint ? <span className="sm-hint">{hint}</span> : null}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: string
  error?: boolean
  ref?: Ref<HTMLInputElement>
}
export function Input({ icon, error, className, ref, ...rest }: InputProps) {
  return (
    <div className={['sm-input-wrap', icon && 'has-icon', error && 'is-error'].filter(Boolean).join(' ')}>
      {icon && <span className="sm-input-ic"><Icon name={icon} size={16} /></span>}
      <input ref={ref} className={['sm-input', className].filter(Boolean).join(' ')} {...rest} />
    </div>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { ref?: Ref<HTMLTextAreaElement> }
export function Textarea({ className, ref, ...rest }: TextareaProps) {
  return <textarea ref={ref} className={['sm-input', 'sm-textarea', className].filter(Boolean).join(' ')} {...rest} />
}

export type SelectOption = string | { value: string; label: string }
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[]
  ref?: Ref<HTMLSelectElement>
}
export function Select({ options, className, ref, ...rest }: SelectProps) {
  return (
    <div className="sm-select-wrap">
      <select ref={ref} className={['sm-input', 'sm-select', className].filter(Boolean).join(' ')} {...rest}>
        {options.map((o, i) => {
          const value = typeof o === 'object' ? o.value : o
          const label = typeof o === 'object' ? o.label : o
          return <option key={i} value={value}>{label}</option>
        })}
      </select>
      <span className="sm-select-chev"><Icon name="chevDown" size={16} /></span>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange?: () => void; label?: ReactNode }) {
  return (
    <button type="button" className={['sm-toggle', checked && 'on'].filter(Boolean).join(' ')} onClick={onChange} aria-pressed={checked}>
      <span className="sm-toggle-knob" />
      {label && <span className="sm-toggle-label">{label}</span>}
    </button>
  )
}

export function Checkbox({ checked, indeterminate, onChange, label }: {
  checked?: boolean; indeterminate?: boolean; onChange?: (checked: boolean) => void; label?: ReactNode
}) {
  return (
    <label className="sm-check">
      <input type="checkbox" checked={!!checked} ref={(el) => { if (el) el.indeterminate = !!indeterminate }}
        onChange={(e) => onChange?.(e.target.checked)} />
      <span className="sm-check-box"><Icon name="check" size={13} stroke={3} /></span>
      {label && <span>{label}</span>}
    </label>
  )
}

export function Search({ value, onChange, placeholder = 'Search…', style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties
}) {
  return (
    <div className="sm-search" style={style}>
      <Icon name="search" size={16} />
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value && <button className="sm-search-clear" onClick={() => onChange('')} aria-label="Clear"><Icon name="x" size={14} /></button>}
    </div>
  )
}

/* ------------------------------------------------------------
   FileUpload — client-side picker with type/size validation and
   an inline preview (image thumbnail or doc chip). Mock only: the
   selected File lives in caller state; nothing is uploaded.
   ------------------------------------------------------------ */
export function FileUpload({ accept = '.pdf,.jpg,.jpeg,.png', value, onChange, ariaLabel }: {
  accept?: string
  value: File | null
  onChange: (file: File | null) => void
  ariaLabel?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (value && value.type.startsWith('image/')) {
      const url = URL.createObjectURL(value)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreview(null)
    return undefined
  }, [value])

  const pick = (file: File | null) => {
    if (!file) { onChange(null); setErr(null); return }
    const e = validateFile(file)
    if (e) {
      setErr(e)
      onChange(null)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setErr(null)
    onChange(file)
  }

  const clear = () => {
    onChange(null)
    setErr(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="sm-upload">
      <input
        ref={inputRef} type="file" accept={accept} hidden aria-label={ariaLabel}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      {value ? (
        <div className={['sm-upload-file', err && 'is-error'].filter(Boolean).join(' ')}>
          {preview
            ? <img src={preview} alt="" className="sm-upload-thumb" />
            : <span className="sm-upload-ic"><Icon name="doc" size={16} /></span>}
          <div className="sm-upload-meta">
            <div className="fw6 t-sm sm-upload-name">{value.name}</div>
            <div className="t-xs muted">{(value.size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
          <button type="button" className="sm-upload-x" onClick={clear} aria-label="Remove file"><Icon name="x" size={14} /></button>
        </div>
      ) : (
        <button type="button" className="sm-upload-drop" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={16} />
          <span>Choose file</span>
          <span className="t-xs muted">PDF, JPG, PNG · max 4 MB</span>
        </button>
      )}
      {err && <span className="sm-err"><Icon name="alert" size={12} />{err}</span>}
    </div>
  )
}
