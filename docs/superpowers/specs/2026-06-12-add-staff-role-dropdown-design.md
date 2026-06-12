# Add Staff — Role dropdown

**Date:** 2026-06-12
**Screen:** Add Staff form — `src/screens/school/staffAdd.tsx`
**Status:** Approved design

## Summary

Change the Add Staff **Role** field from a free-text input to a fixed
("static") dropdown of predefined non-teaching roles.

## Change

In `src/screens/school/staffAdd.tsx`:

- Add an option list constant:

  ```ts
  const STAFF_ROLES = SEL('Driver', 'Conductor', 'Clerk', 'Cleaner', 'Gardener', 'Security Guard', 'Peon')
  ```

  (`SEL` already exists in the file and prepends `''` for the blank
  "Select…" entry.)

- Replace the Role field in the Employment section:

  from
  ```tsx
  {txt('role', 'Role', { required: true, ph: 'e.g. Bus Driver' })}
  ```
  to
  ```tsx
  {sel('role', 'Role', STAFF_ROLES, true)}
  ```

`role` stays a required field — the existing `required(f.role)` check
already blocks save when the dropdown is left on the blank option, and
the saved `Staff.role` / `designation` mapping is unchanged.

## Test update

`src/screens/school/staffAdd.test.tsx` — in `fillRequired`, set Role via
the dropdown instead of typing:

- change `setText('Role', 'Bus Driver')` to `setSelect('Role', 'Driver')`.

The other two assertions (blocks-save-on-empty, rejects-bad-Aadhaar) are
unaffected: an unselected Role still fails the required check.

## Out of scope (YAGNI)

- The seed data's existing role strings (Bus Driver, Gatekeeper, etc.)
  stay as-is; this only constrains *new* entries via the form.
- No "Other / free text" escape hatch.
- The Category and Department selects are unchanged.
