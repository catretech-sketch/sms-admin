import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { workspaceScreens, ALL_SCHOOLS, isAllSchools, scopeLabel, toggleScope } from './workspace'

const OwnerUsers = workspaceScreens['owner.users']

afterEach(cleanup)

function renderScreen() {
  return render(
    <AppProvider>
      <ToastProvider>
        <OwnerUsers />
      </ToastProvider>
    </AppProvider>,
  )
}

describe('owner Users & roles — edit user', () => {
  it('opens an editor, sets role + All-schools scope, and the row reflects it', () => {
    const { container } = renderScreen()

    const editBtn = within(container).getAllByText('Edit')[0]
    const userName = (editBtn.closest('tr') as HTMLElement).querySelector('.fw6')!.textContent!

    fireEvent.click(editBtn)
    const dialog = within(container).getByRole('dialog')

    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'principal' } })
    fireEvent.click(within(dialog).getByLabelText('All schools'))

    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    expect(within(container).queryByRole('dialog')).toBeNull()
    expect(within(container).getByText(/access updated/i)).toBeInTheDocument()

    const savedRow = within(container).getByText(userName).closest('tr') as HTMLElement
    expect(within(savedRow).getByText('Principal')).toBeInTheDocument()
    expect(within(savedRow).getByText('All schools')).toBeInTheDocument()
  })

  it('does not persist changes when the editor is cancelled', () => {
    const { container } = renderScreen()

    const editBtn = within(container).getAllByText('Edit')[0]
    const row = editBtn.closest('tr') as HTMLElement
    const roleBefore = within(row).getByText(/admin|principal|vice-principal|teacher/i).textContent

    fireEvent.click(editBtn)
    const dialog = within(container).getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'teacher' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(within(container).queryByRole('dialog')).toBeNull()
    expect(within(row).getByText(roleBefore as string)).toBeInTheDocument()
  })
})

describe('scope helpers', () => {
  it('isAllSchools detects the All sentinel', () => {
    expect(isAllSchools([ALL_SCHOOLS])).toBe(true)
    expect(isAllSchools(['Greenwood Valley School'])).toBe(false)
  })
  it('scopeLabel summarises the scope', () => {
    expect(scopeLabel([ALL_SCHOOLS])).toBe('All schools')
    expect(scopeLabel(['Greenwood Valley School'])).toBe('Greenwood Valley School')
    expect(scopeLabel(['Greenwood Valley School', 'Delhi Public Academy'])).toBe('2 schools')
  })
  it('toggleScope: picking a specific school replaces All', () => {
    expect(toggleScope([ALL_SCHOOLS], 'Greenwood Valley School')).toEqual(['Greenwood Valley School'])
  })
  it('toggleScope: picking All replaces specifics', () => {
    expect(toggleScope(['Greenwood Valley School', 'Delhi Public Academy'], ALL_SCHOOLS)).toEqual([ALL_SCHOOLS])
  })
  it('toggleScope: adds and removes specific schools', () => {
    expect(toggleScope(['Greenwood Valley School'], 'Delhi Public Academy'))
      .toEqual(['Greenwood Valley School', 'Delhi Public Academy'])
    expect(toggleScope(['Greenwood Valley School', 'Delhi Public Academy'], 'Delhi Public Academy'))
      .toEqual(['Greenwood Valley School'])
  })
  it('toggleScope: removing the last specific falls back to All (never empty)', () => {
    expect(toggleScope(['Greenwood Valley School'], 'Greenwood Valley School')).toEqual([ALL_SCHOOLS])
  })
})
