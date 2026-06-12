# Timetable — Print option

**Date:** 2026-06-12
**Screen:** Academics → Timetable — `src/screens/school/academics.tsx` (`TimetableTab`)
**Status:** Approved design

## Summary

Add a Print button to the Timetable that opens the browser print dialog
via `window.print()`, matching the existing Report Card "Print" behavior.

## Change

In `TimetableTab`, the toolbar `Card` currently holds only the
view-toggle `Segmented`:

```tsx
      <Card>
        <Segmented value={view} onChange={...} options={[...]} />
      </Card>
```

Change it to a row with the toggle and a right-aligned Print button:

```tsx
      <Card>
        <div className="row ai-center jc-between gap12 wrap">
          <Segmented value={view} onChange={...} options={[...]} />
          <Btn variant="secondary" size="sm" icon="download" onClick={() => window.print()}>Print</Btn>
        </div>
      </Card>
```

`Btn` is already imported. `window.print()` opens the print dialog for
the current page (whichever timetable view is showing) — identical to the
Report Card modal's Print action (`onClick={() => window.print()}`).

## Testing (`src/screens/school/timetableViews.test.tsx`, add one case)

- On the Timetable tab, a **Print** button renders; clicking it calls
  `window.print` (stub `window.print` with a vitest mock and assert it
  was called).

## Out of scope (YAGNI)

- A print-optimized stylesheet that hides the app nav/sidebar.
- Per-view PDF export or server-side rendering.
- Printing a specific class/teacher when the on-screen view differs.
