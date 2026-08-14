# Official period-based attendance percentage

## Formula (SoT)

`(Present + Late) / Marked periods × 100`

- Unmarked periods excluded
- Leave / Absent not positive
- Legacy daily `AttendanceRecords` excluded from official %
- `null` when marked = 0 (display “Not marked”, not 0%)

## Shared API

- `GET /v1/students/{id}/attendance/summary?from=&to=`
- `GET /v1/classes/{id}/attendance/summary?from=&to=`
- Student list/get `attendance_pct` live field uses the same period aggregate

Response shape:

```json
{
  "total_marked_periods": 42,
  "present_periods": 35,
  "late_periods": 2,
  "absent_periods": 5,
  "leave_periods": 0,
  "attendance_percentage": 88.10,
  "present_today_badge": true
}
```

`present_today_badge` is UI-only (≥50% of today’s marked periods). Never use as official %.

## Clients

CRM, Teacher, Student, Parent all consume the API result — no independent browser formulas for official %.
