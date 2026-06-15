import { describe, it, expect } from 'vitest'
import { normalizePhone, findAccountByIdentifier } from './LoginScreen'
import { render, fireEvent } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { useApp } from '@/lib/hooks'
import { LoginScreen } from './LoginScreen'

describe('LoginScreen helpers', () => {
  it('normalizePhone strips non-digits', () => {
    expect(normalizePhone('+91 98100 10002')).toBe('919810010002')
    expect(normalizePhone('98100-10002')).toBe('9810010002')
  })

  it('findAccountByIdentifier matches by email, any case', () => {
    expect(findAccountByIdentifier('admin@greenwood.edu')?.name).toBe('Ravi Menon')
    expect(findAccountByIdentifier('  ADMIN@greenwood.edu ')?.name).toBe('Ravi Menon')
  })

  it('findAccountByIdentifier matches by phone, formatted or raw', () => {
    expect(findAccountByIdentifier('+91 98100 10003')?.name).toBe('Sunita Rao')
    expect(findAccountByIdentifier('9810010003')?.name).toBe('Sunita Rao')
  })

  it('findAccountByIdentifier honours the 10-digit guard and tail-matches', () => {
    expect(findAccountByIdentifier('nobody@nowhere.com')).toBeNull()
    expect(findAccountByIdentifier('0000000000')).toBeNull()
    expect(findAccountByIdentifier('')).toBeNull()
    expect(findAccountByIdentifier('981001000')).toBeNull()            // 9 digits — below the 10-digit guard
    expect(findAccountByIdentifier('00919810010002')?.name).toBe('Ravi Menon') // 14 digits, last-10 tail matches admin
  })
})

/* Mirrors App.tsx: show the login screen until logged in, then a marker we can assert. */
function Harness() {
  const app = useApp()
  if (app.loggedIn) return <div>LOGGED_IN:{app.user?.email}</div>
  return <LoginScreen />
}
const renderLogin = () => render(<AppProvider><Harness /></AppProvider>)

describe('LoginScreen — OTP sign-in', () => {
  it('email → send code → read shown code → verify → logged in', () => {
    const { container, getByText } = renderLogin()

    fireEvent.change(getByLabelText(container, 'Email or mobile number'), {
      target: { value: 'principal@greenwood.edu' },
    })
    fireEvent.click(getByText('Send one-time code'))

    const hint = getByText(/Demo code:/i).textContent || ''
    const code = (hint.match(/\d{6}/) || [''])[0]
    expect(code).toHaveLength(6)

    fireEvent.change(getByLabelText(container, 'Enter the 6-digit code'), {
      target: { value: code },
    })
    fireEvent.click(getByText(/Verify & sign in/i))

    expect(getByText('LOGGED_IN:principal@greenwood.edu')).toBeInTheDocument()
  })

  it('an unknown identifier shows an error and no verify step', () => {
    const { container, getByText, queryByText } = renderLogin()

    fireEvent.change(getByLabelText(container, 'Email or mobile number'), {
      target: { value: 'ghost@nowhere.com' },
    })
    fireEvent.click(getByText('Send one-time code'))

    expect(getByText(/No account found/i)).toBeInTheDocument()
    expect(queryByText(/Demo code:/i)).toBeNull()
  })

  it('the password sign-in still logs in', async () => {
    const { getByText, findByText } = renderLogin()
    fireEvent.click(getByText(/^Sign in$/))
    expect(await findByText('LOGGED_IN:admin@greenwood.edu')).toBeInTheDocument()
  })

  it('resolves a mobile number with country code (14 digits) and signs in', () => {
    const { container, getByText } = renderLogin()
    fireEvent.change(getByLabelText(container, 'Email or mobile number'), {
      target: { value: '00919810010002' }, // 00 + 91 + admin's 10-digit number
    })
    fireEvent.click(getByText('Send one-time code'))
    const code = ((getByText(/Demo code:/i).textContent || '').match(/\d{6}/) || [''])[0]
    fireEvent.change(getByLabelText(container, 'Enter the 6-digit code'), { target: { value: code } })
    fireEvent.click(getByText(/Verify & sign in/i))
    expect(getByText('LOGGED_IN:admin@greenwood.edu')).toBeInTheDocument()
  })

  it('a malformed email (missing @) shows a clear identifier error, not a phone error', () => {
    const { container, getByText, queryByText } = renderLogin()
    fireEvent.change(getByLabelText(container, 'Email or mobile number'), {
      target: { value: 'ravikumar.menon' },
    })
    fireEvent.click(getByText('Send one-time code'))
    expect(getByText(/Enter a valid email or mobile number/i)).toBeInTheDocument()
    expect(queryByText(/Demo code:/i)).toBeNull()
  })
})

/* Helper: resolve a Field's <input> by its visible label text. */
function getByLabelText(container: HTMLElement, label: string): HTMLInputElement {
  const labels = Array.from(container.querySelectorAll('label'))
  const match = labels.find((l) => l.textContent?.trim().startsWith(label))
  const field = match?.closest('.sm-field') ?? match?.parentElement
  const input = field?.querySelector('input')
  if (!input) throw new Error(`No input for label: ${label}`)
  return input as HTMLInputElement
}
