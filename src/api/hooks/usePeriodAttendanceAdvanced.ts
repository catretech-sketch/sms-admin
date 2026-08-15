import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  listPeriodAttendanceAdvanced,
  getPeriodAttendanceClassDaySummary,
  listPeriodAttendanceSubjectSummaries,
  listPeriodAttendanceTeacherSummaries,
  getPeriodAttendanceRangeSummary,
  type PeriodAttendanceAdvancedFilters,
  type PeriodAttendanceAdvancedPage,
  type AdvClassDaySummary,
  type AdvSubjectSummaryRow,
  type AdvTeacherSummaryRow,
  type AdvRangeRollup,
  type PeriodAttendanceRangeFilters,
} from '../periodAttendanceAdvanced'
import { queryKeys } from '../queryKeys'

/** Server-filtered period attendance list for the Advanced CRM tab. */
export function usePeriodAttendanceAdvanced(
  filters: PeriodAttendanceAdvancedFilters = {},
  enabled = true,
): UseQueryResult<PeriodAttendanceAdvancedPage> {
  return useQuery({
    queryKey: queryKeys.attendance.advanced(filters),
    queryFn: () => listPeriodAttendanceAdvanced(filters),
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}

/** Class + single-day KPI summary for the Advanced tab's Class subview. */
export function usePeriodAttendanceClassDaySummary(
  classId: string,
  date: string,
  enabled = true,
): UseQueryResult<AdvClassDaySummary> {
  return useQuery({
    queryKey: queryKeys.attendance.classDaySummary(classId, date),
    queryFn: () => getPeriodAttendanceClassDaySummary(classId, date),
    enabled: enabled && Boolean(classId) && Boolean(date),
    staleTime: 15_000,
  })
}

/** Per-subject rollup for a class across a date range/preset. */
export function usePeriodAttendanceSubjectSummaries(
  classId: string,
  filters: { preset?: string; from?: string; to?: string } = {},
  enabled = true,
): UseQueryResult<AdvSubjectSummaryRow[]> {
  return useQuery({
    queryKey: queryKeys.attendance.subjectSummaries(classId, filters),
    queryFn: () => listPeriodAttendanceSubjectSummaries(classId, filters),
    enabled: enabled && Boolean(classId),
    staleTime: 15_000,
  })
}

/** Per-teacher rollup across a date range/preset. */
export function usePeriodAttendanceTeacherSummaries(
  filters: { preset?: string; from?: string; to?: string } = {},
  enabled = true,
): UseQueryResult<AdvTeacherSummaryRow[]> {
  return useQuery({
    queryKey: queryKeys.attendance.teacherSummaries(filters),
    queryFn: () => listPeriodAttendanceTeacherSummaries(filters),
    enabled,
    staleTime: 15_000,
  })
}

/** Range rollup (week/month/30/60/90 or custom) for the Advanced tab's Ranges subview. */
export function usePeriodAttendanceRangeSummary(
  filters: PeriodAttendanceRangeFilters = {},
  enabled = true,
): UseQueryResult<AdvRangeRollup> {
  return useQuery({
    queryKey: queryKeys.attendance.rangeSummary(filters),
    queryFn: () => getPeriodAttendanceRangeSummary(filters),
    enabled,
    staleTime: 15_000,
  })
}
