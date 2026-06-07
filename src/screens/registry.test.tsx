import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ToastProvider } from '@/context/ToastProvider'
import { ThemeProvider } from '@/context/ThemeProvider'
import { AppProvider } from '@/context/AppProvider'
import { screenRegistry } from './registry'

function Wrap({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AppProvider>{children}</AppProvider>
      </ThemeProvider>
    </ToastProvider>
  )
}

describe('screen registry', () => {
  it('registers a component for every roadmap view', () => {
    // 7 owner + ~20 school views
    expect(Object.keys(screenRegistry).length).toBeGreaterThanOrEqual(24)
  })

  it.each(Object.entries(screenRegistry))('renders %s without crashing', (_view, Screen) => {
    const { container } = render(<Wrap><Screen /></Wrap>)
    expect(container.firstChild).toBeTruthy()
  })
})
