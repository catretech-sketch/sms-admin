import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppProvider } from '@/context/AppProvider'
import { ToastProvider } from '@/context/ToastProvider'
import { sisScreens } from './sis'

const StudentsScreen = sisScreens['school.sis']

function renderScreen() {
  return render(
    <AppProvider>
      <ToastProvider>
        <StudentsScreen />
      </ToastProvider>
    </AppProvider>,
  )
}

describe('Students Toppers view', () => {
  it('defaults to the All students list', () => {
    renderScreen()
    expect(screen.getByPlaceholderText(/Search name/i)).toBeInTheDocument()
  })

  it('switches to the Toppers leaderboard and class cards', () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    expect(screen.getByText('Overall toppers')).toBeInTheDocument()
    // at least one class card is rendered
    expect(screen.getAllByText(/^Class /).length).toBeGreaterThan(0)
  })

  it('switches the category to Attendance toppers', () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    fireEvent.click(screen.getByText('Attendance toppers'))
    // header column reflects the attendance metric
    expect(screen.getByText('Attendance %')).toBeInTheDocument()
  })

  it('returns to the list when All students is reselected', () => {
    renderScreen()
    fireEvent.click(screen.getByText('Toppers'))
    fireEvent.click(screen.getByText('All students'))
    expect(screen.getByPlaceholderText(/Search name/i)).toBeInTheDocument()
  })
})
