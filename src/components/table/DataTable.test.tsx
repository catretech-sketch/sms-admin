import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DataTable, type Column } from './DataTable'

interface Row { name: string; age: number }
const rows: Row[] = [
  { name: 'Cara', age: 30 },
  { name: 'Ana', age: 20 },
  { name: 'Bob', age: 25 },
]
const columns: Column<Row>[] = [
  { key: 'name', label: 'Name', sortValue: (r) => r.name },
  { key: 'age', label: 'Age', sortValue: (r) => r.age, align: 'right' },
]

describe('DataTable', () => {
  it('renders all rows', () => {
    render(<DataTable columns={columns} rows={rows} />)
    expect(screen.getByText('Cara')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('sorts when a sortable header is clicked', () => {
    render(<DataTable columns={columns} rows={rows} />)
    fireEvent.click(screen.getByText('Name'))
    const body = document.querySelector('tbody')!
    const firstCell = within(body).getAllByRole('cell')[0]
    expect(firstCell.textContent).toBe('Ana') // ascending by name
  })

  it('paginates with pageSize', () => {
    render(<DataTable columns={columns} rows={rows} pageSize={2} />)
    // page 1 shows 2 rows; pager present
    expect(screen.getByText(/page 1 of 2/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByText(/page 2 of 2/)).toBeInTheDocument()
  })
})
