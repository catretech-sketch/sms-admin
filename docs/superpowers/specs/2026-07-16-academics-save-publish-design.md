# Academics Save & Publish Design

**Date:** 2026-07-16  
**Status:** Approved (chat)

## Summary

Academics tabs use two persistence modes:

1. **Live catalog** (Classes, Subjects, Houses) — Edit / Add / Remove save immediately. No draft/publish.
2. **Draft → publish** (Periods, Timetable, Tests) — **Save draft** keeps school-private work; **Save & publish** makes it the live version used by attendance / teachers / parents views.

## Header

When Editing enabled and the active tab is Periods, Timetable, or Tests:

- Status badge: `Draft` | `Published` | `Unpublished changes`
- Actions: **Save draft** · **Save & publish**

Catalog tabs show: `Live catalog` (changes save immediately).

## Rules

- Timetable publish blocked when the active class has teacher clashes.
- Periods / Tests: publish writes current draft to published snapshot.
- First cut: school-scoped `localStorage` (same pattern as houses) until APIs exist.
- Subjects: Edit name via API; remove teacher-count (users) badge from cards.
- Houses: Edit (rename) + remove.

## Non-goals

- Real-time sync / multi-admin conflict resolution
- Backend timetable/periods/tests APIs (follow-up)
