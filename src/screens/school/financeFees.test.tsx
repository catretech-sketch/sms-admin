import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { financeScreens } from './finance'

const FeesScreen = financeScreens['school.fees']

afterEach(cleanup)

function renderScreen() {
  const u = render(
    <AppProvider>
      <ToastProvider>
        <FeesScreen />
      </ToastProvider>
    </AppProvider>,
  )
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  return { ...u, clickTab }
}

describe('Fee collection history', () => {
  it('records a payment with a fee type and lists it in History', () => {
    const { container, clickTab } = renderScreen()
    fireEvent.click(within(container).getAllByText('Record')[0])
    const dialog = within(container).getByRole('dialog')
    // first combobox in the modal is the Fee type select
    const typeSelect = within(dialog).getAllByRole('combobox')[0]
    fireEvent.change(typeSelect, { target: { value: 'transport' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
    clickTab('History')
    expect(within(container).getAllByText('Transport (Bus)').length).toBeGreaterThan(0)
  })
})
