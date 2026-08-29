import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queryKeys'
import { bumpThreadsLiveQueries } from './useThreadsLive'

describe('bumpThreadsLiveQueries', () => {
  it('invalidates the thread list and every open thread\'s messages', () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    bumpThreadsLiveQueries(qc)

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.threads.all })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['threads', 'messages'] })
  })
})
