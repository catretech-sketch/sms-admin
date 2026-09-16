export type TaskDatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'all'
  | 'custom'

export const TASK_DATE_PRESET_LABELS: Record<TaskDatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  all: 'All Time',
  custom: 'Custom',
}

export const TASK_DATE_PRESETS: TaskDatePreset[] = [
  'today', 'yesterday', 'this_week', 'this_month', 'last_month', 'all', 'custom',
]

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/** Monday 00:00 of the week containing `d` (ISO weekday, Monday=0). */
function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset))
}

function endOfWeek(d: Date): Date {
  const start = startOfWeek(d)
  return endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6))
}

export function taskDateRange(
  preset: TaskDatePreset,
  now: Date = new Date(),
  custom?: { from?: string; to?: string },
): { from?: string; to?: string } {
  if (preset === 'all') return {}
  if (preset === 'custom') {
    return {
      ...(custom?.from ? { from: custom.from } : {}),
      ...(custom?.to ? { to: custom.to } : {}),
    }
  }
  if (preset === 'today') {
    return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
  }
  if (preset === 'yesterday') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() }
  }
  if (preset === 'this_week') {
    return { from: startOfWeek(now).toISOString(), to: endOfWeek(now).toISOString() }
  }
  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    return { from: from.toISOString(), to: to.toISOString() }
  }
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
  const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
  return { from: from.toISOString(), to: to.toISOString() }
}

export function completionRate(completed: number, total: number): number {
  if (total <= 0) return 0
  return completed / total
}
