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
  it('opens from a user row, cycles a capability, saves, and shows the override badge', () => {
    const { container } = renderScreen()

    // Open the editor for the first user.
    fireEvent.click(within(container).getAllByText('Edit')[0])
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

    // Back on the list, the user shows a "custom" override badge.
    expect(within(container).getAllByText(/custom/i).length).toBeGreaterThan(0)
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
