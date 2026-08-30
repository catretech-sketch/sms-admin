import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import {
  resolveAiQuery,
  type AiSearchResponse, type AiSearchStudent, type AiSearchAttendanceHero,
} from '@/lib/aiSearchResolver'

export interface AiSearchInput {
  query: string
  students: AiSearchStudent[]
  attendanceHero: AiSearchAttendanceHero
}

/** No network call yet — resolveAiQuery is local (see aiSearchResolver.ts). Wrapping it in a
 *  mutation now means the eventual swap to a real POST /v1/ai/search call only touches this
 *  file's mutationFn; every consumer already codes against loading/success/error states. */
export function useAiSearch(): UseMutationResult<AiSearchResponse, Error, AiSearchInput> {
  return useMutation({
    mutationFn: (input: AiSearchInput) =>
      Promise.resolve(resolveAiQuery(input.query, { students: input.students, attendanceHero: input.attendanceHero })),
  })
}
