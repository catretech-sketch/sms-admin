import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queryKeys'

/** Refresh owner portfolio / Catre-style headcounts after SIS people changes. */
export async function invalidatePortfolioHeadcounts(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.owner.mySchools }),
    qc.invalidateQueries({ queryKey: ['owner', 'clients'] }),
    qc.invalidateQueries({ queryKey: queryKeys.owner.feeSummary({}) }),
  ])
}
