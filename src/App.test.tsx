import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from './App'

describe('App (smoke)', () => {
  beforeEach(() => localStorage.clear())

  it('shows the login screen first', () => {
    render(<App />)
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
  })

  it('owner demo account lands in the owner console', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Anil Mehta'))
    expect(await screen.findByText('Portfolio overview')).toBeInTheDocument()
    const sidebar = document.querySelector('.sm-sidebar') as HTMLElement
    expect(within(sidebar).getByText('Schools')).toBeInTheDocument()
  })

  it('school admin lands in the school console with dashboard nav', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Ravi Menon'))
    const sidebar = (await screen.findByRole('complementary')) as HTMLElement
    expect(within(sidebar).getByText('Dashboard')).toBeInTheDocument()
    expect(within(sidebar).getByText('Students (SIS)')).toBeInTheDocument()
  })

  it('theme toggle flips data-theme', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Ravi Menon'))
    const toggle = await screen.findByLabelText('Toggle theme')
    const before = document.documentElement.getAttribute('data-theme')
    fireEvent.click(toggle)
    const after = document.documentElement.getAttribute('data-theme')
    expect(after).not.toBe(before)
  })
})
