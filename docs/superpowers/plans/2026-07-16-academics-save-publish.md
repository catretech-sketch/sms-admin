# Academics Save & Publish Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Draft/publish for Periods, Timetable, Tests; live edit for Classes/Subjects/Houses; page Save draft / Save & publish.

**Architecture:** `lib/academicsPublish.ts` school-scoped localStorage; Academics shell registers tab handlers; catalog tabs keep API/local immediate saves.

**Tech Stack:** React, localStorage, existing toast/Btn patterns, Subject PATCH API.

## Tasks

- [x] Spec written
- [x] `academicsPublish.ts` + subject `updateSubject` / `useUpdateSubject`
- [x] Subjects edit UI; remove users badge; Houses rename
- [x] Periods / Timetable / Tests draft+publish + header actions
