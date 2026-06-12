# Timetable Print Option Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Print button to the Timetable toolbar that opens the browser print dialog via `window.print()`.

**Architecture:** A `Btn` next to the view toggle calling `window.print()`, matching the Report Card modal's existing print action.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library.

---

## File Structure

- **Modify** `src/screens/school/academics.tsx` — add the Print button to the Timetable toolbar.
- **Modify** `src/screens/school/timetableViews.test.tsx` — assert Print renders + calls `window.print`.

---

### Task 1: Print button

**Files:**
- Modify: `src/screens/school/academics.tsx`
- Modify: `src/screens/school/timetableViews.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/screens/school/timetableViews.test.tsx`, add inside the existing `describe('Timetable teacher/subject views', ...)` block (after the overview test):

```tsx
  it('prints the timetable via window.print', () => {
    const printSpy = vi.fn()
    const original = window.print
    window.print = printSpy
    try {
      const { container, clickTab } = renderScreen()
      clickTab('Timetable')
      fireEvent.click(within(container).getByText('Print'))
      expect(printSpy).toHaveBeenCalledTimes(1)
    } finally {
      window.print = original
    }
  })
```

Add `vi` to the vitest import at the top of the file:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- timetableViews`
Expected: FAIL — no "Print" button exists yet (`getByText('Print')` throws).

- [ ] **Step 3: Add the Print button**

In `TimetableTab` (`src/screens/school/academics.tsx`), change the toolbar card:

```tsx
      <Card>
        <Segmented value={view} onChange={(v) => setView(v as 'class' | 'teacher' | 'subject' | 'overview')}
          options={[{ value: 'class', label: 'Class' }, { value: 'teacher', label: 'Teacher' }, { value: 'subject', label: 'Subject' }, { value: 'overview', label: 'All classes' }]} />
      </Card>
```

to:

```tsx
      <Card>
        <div className="row ai-center jc-between gap12 wrap">
          <Segmented value={view} onChange={(v) => setView(v as 'class' | 'teacher' | 'subject' | 'overview')}
            options={[{ value: 'class', label: 'Class' }, { value: 'teacher', label: 'Teacher' }, { value: 'subject', label: 'Subject' }, { value: 'overview', label: 'All classes' }]} />
          <Btn variant="secondary" size="sm" icon="download" onClick={() => window.print()}>Print</Btn>
        </div>
      </Card>
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- timetableViews`
Expected: PASS (4 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test`
Expected: PASS (all suites green).

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/academics.tsx src/screens/school/timetableViews.test.tsx
git commit -m "feat: Print button on the Timetable (window.print)"
```

---

## Self-Review Notes

- **Spec coverage:** Print button in the toolbar calling `window.print()` (Step 3) ✓; render + click test with mocked `window.print` (Step 1) ✓.
- **Type consistency:** the `Segmented` onChange cast / options are copied verbatim from the existing toolbar (unchanged); only the wrapping row + `Btn` are added. `Btn` already imported.
- **Placeholder scan:** none.
