import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemoBadge } from './DemoBadge'

describe('DemoBadge', () => {
  it('renders the default "Demo data" label', () => {
    render(<DemoBadge />)
    expect(screen.getByText('Demo data')).toBeInTheDocument()
  })
  it('renders a custom label', () => {
    render(<DemoBadge label="Sample data" />)
    expect(screen.getByText('Sample data')).toBeInTheDocument()
  })
})
