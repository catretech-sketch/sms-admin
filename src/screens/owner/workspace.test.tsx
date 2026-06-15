import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { workspaceScreens } from './workspace'

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
  it('opens an editor from a Team row, changes role + scope, and the row reflects it', () => {
    const { container } = renderScreen()

    // Capture the first user's row + name so we can re-find it after saving.
    const editBtn = within(container).getAllByText('Edit')[0]
    const userName = (editBtn.closest('tr') as HTMLElement).querySelector('.fw6')!.textContent!

    // Open the editor.
    fireEvent.click(editBtn)
    const dialog = within(container).getByRole('dialog')

    // Role select (first combobox) -> Principal; Scope select (second) -> All schools.
    const selects = within(dialog).getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'principal' } })
    fireEvent.change(selects[1], { target: { value: 'All schools' } })

    // Save.
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    // Dialog closes and a confirmation toast appears.
    expect(within(container).queryByRole('dialog')).toBeNull()
    expect(within(container).getByText(/access updated/i)).toBeInTheDocument()

    // The edited user's own row now shows the new role + scope.
    const savedRow = within(container).getByText(userName).closest('tr') as HTMLElement
    expect(within(savedRow).getByText('Principal')).toBeInTheDocument()
    expect(within(savedRow).getByText('All schools')).toBeInTheDocument()
  })

  it('does not persist changes when the editor is cancelled', () => {
    const { container } = renderScreen()

    const editBtn = within(container).getAllByText('Edit')[0]
    const row = editBtn.closest('tr') as HTMLElement
    const roleBefore = (within(row).getByText(/admin|principal|vice-principal|teacher/i)).textContent

    fireEvent.click(editBtn)
    const dialog = within(container).getByRole('dialog')
    fireEvent.change(within(dialog).getAllByRole('combobox')[0], { target: { value: 'teacher' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(within(container).queryByRole('dialog')).toBeNull()
    // Role badge unchanged because Cancel discards edits.
    expect(within(row).getByText(roleBefore as string)).toBeInTheDocument()
  })
})
