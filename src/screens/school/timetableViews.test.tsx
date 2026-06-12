import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, within, cleanup } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { academicsScreens } from './academics'

const AcademicsScreen = academicsScreens['school.academics']

afterEach(cleanup)

function renderScreen() {
  const u = render(
    <AppProvider>
      <ToastProvider>
        <AcademicsScreen />
      </ToastProvider>
    </AppProvider>,
  )
  const tabBar = within(u.container.querySelector('.sm-tabs') as HTMLElement)
  const clickTab = (label: string) => fireEvent.click(tabBar.getByText(label))
  const seg = () => within(u.container.querySelector('.sm-seg') as HTMLElement)
  return { ...u, clickTab, seg }
}

describe('Timetable teacher/subject views', () => {
  it('offers Class / Teacher / Subject and shows the empty state before any class is built', () => {
    const { container, clickTab, seg } = renderScreen()
    clickTab('Timetable')
    expect(seg().getByText('Class')).toBeInTheDocument()
    expect(seg().getByText('Teacher')).toBeInTheDocument()
    expect(seg().getByText('Subject')).toBeInTheDocument()
    fireEvent.click(seg().getByText('Teacher'))
    expect(within(container).getByText(/Build class timetables in the Class view first/i)).toBeInTheDocument()
  })

  it('subject view also shows the empty state with nothing built', () => {
    const { container, clickTab, seg } = renderScreen()
    clickTab('Timetable')
    fireEvent.click(seg().getByText('Subject'))
    expect(within(container).getByText(/view them by subject/i)).toBeInTheDocument()
  })

  it('All classes overview shows the empty state with nothing built', () => {
    const { container, clickTab, seg } = renderScreen()
    clickTab('Timetable')
    fireEvent.click(seg().getByText('All classes'))
    expect(within(container).getByText(/class-wise overview/i)).toBeInTheDocument()
  })

  it('prints the timetable via window.print', () => {
    const printSpy = vi.fn()
    const original = window.print
    window.print = printSpy
    try {
      const { container, clickTab } = renderScreen()
      clickTab('Timetable')
      fireEvent.click(within(container).getByText('Print'))
      expect(printSpy).toHaveBeenCalledTimes(1)
    } finally {
      window.print = original
    }
  })
})
