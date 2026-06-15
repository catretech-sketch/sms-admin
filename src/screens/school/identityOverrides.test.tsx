import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { adminScreens } from './admin'

const IdentityScreen = adminScreens['school.identity']

afterEach(cleanup)

function renderScreen() {
  return render(
    <AppProvider>
      <ToastProvider>
        <IdentityScreen />
      </ToastProvider>
    </AppProvider>,
  )
}

/** Locate the editor table row for a given module label. */
function moduleRow(container: HTMLElement, label: string): HTMLElement {
  const cell = within(container).getByText(label)
  return cell.closest('tr') as HTMLElement
}

describe('per-user access editor', () => {
  it('opens from a user row, cycles a capability, saves, and shows the override badge on that user', () => {
    const { container } = renderScreen()

    // Open the editor for the first user, capturing their name so we can find
    // their row again after saving. (Several users are unseeded, so picking the
    // first row gives a deterministic subject thanks to the seeded mock data.)
    const editBtn = within(container).getAllByText('Edit')[0]
    const userName = (editBtn.closest('tr') as HTMLElement).querySelector('.fw6')!.textContent!
    fireEvent.click(editBtn)
    expect(within(container).getByText('Per-user access')).toBeInTheDocument()

    // The "Fees & finance" module row exists with three V/E/A chips.
    const row = moduleRow(container, 'Fees & finance')
    const vChip = within(row).getByTitle(/^View —/)

    // inherit -> grant
    fireEvent.click(vChip)
    expect(within(row).getByTitle('View — grant')).toBeInTheDocument()

    // Save commits and returns to the table with a success toast.
    fireEvent.click(within(container).getByText('Save changes'))
    expect(within(container).getByText(/Permissions saved/i)).toBeInTheDocument()

    // The edited user's own row now shows a "custom" override badge.
    const savedRow = within(container).getByText(userName).closest('tr') as HTMLElement
    expect(within(savedRow).getByText(/\d+ custom/i)).toBeInTheDocument()
  })

  it('cycles a cell through grant, revoke, and back to inherit', () => {
    const { container } = renderScreen()
    fireEvent.click(within(container).getAllByText('Edit')[0])

    const row = moduleRow(container, 'Fees & finance')
    const eChip = within(row).getByTitle(/^Edit —/)

    fireEvent.click(eChip) // inherit -> grant
    expect(within(row).getByTitle('Edit — grant')).toBeInTheDocument()
    fireEvent.click(within(row).getByTitle('Edit — grant')) // grant -> revoke
    expect(within(row).getByTitle('Edit — revoke')).toBeInTheDocument()
    fireEvent.click(within(row).getByTitle('Edit — revoke')) // revoke -> inherit
    expect(within(row).getByTitle('Edit — inherit')).toBeInTheDocument()
  })
})
