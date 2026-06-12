# Add Staff Role Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Add Staff "Role" field a fixed dropdown (Driver, Conductor, Clerk, Cleaner, Gardener, Security Guard, Peon) instead of free text.

**Architecture:** Swap the `txt('role', …)` field for a required `sel('role', …)` backed by a new `STAFF_ROLES` option list; update the form test to select the role instead of typing it.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library.

---

## File Structure

- **Modify** `src/screens/school/staffAdd.tsx` — add `STAFF_ROLES`; change the Role field to a Select.
- **Modify** `src/screens/school/staffAdd.test.tsx` — set Role via the dropdown in `fillRequired`.

---

### Task 1: Role becomes a required dropdown

**Files:**
- Modify: `src/screens/school/staffAdd.tsx`
- Modify: `src/screens/school/staffAdd.test.tsx`

- [ ] **Step 1: Update the test to select the role**

In `src/screens/school/staffAdd.test.tsx`, in `fillRequired`, change:

```tsx
  setText('Role', 'Bus Driver')
```

to:

```tsx
  setSelect('Role', 'Driver')
```

(`setSelect` already exists in this test file and targets the field's `combobox`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- staffAdd`
Expected: FAIL — `setSelect('Role', …)` can't find a `combobox` in the Role field while it's still a text input (the "adds the staff member" test fails because Role stays blank → required error → save blocked).

- [ ] **Step 3: Add the `STAFF_ROLES` option list**

In `src/screens/school/staffAdd.tsx`, add this constant next to the other option lists (right after the `CATEGORIES` constant):

```ts
const STAFF_ROLES = SEL('Driver', 'Conductor', 'Clerk', 'Cleaner', 'Gardener', 'Security Guard', 'Peon')
```

- [ ] **Step 4: Change the Role field to a Select**

In the Employment section, change:

```tsx
            {txt('role', 'Role', { required: true, ph: 'e.g. Bus Driver' })}
```

to:

```tsx
            {sel('role', 'Role', STAFF_ROLES, true)}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- staffAdd`
Expected: PASS (3 tests) — `fillRequired` now selects "Driver"; empty-required and bad-Aadhaar cases still behave (an unselected Role still fails `required`).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/school/staffAdd.tsx src/screens/school/staffAdd.test.tsx
git commit -m "feat: Add Staff Role is a fixed dropdown (driver, conductor, clerk, cleaner, gardener, security guard, peon)"
```

---

## Self-Review Notes

- **Spec coverage:** `STAFF_ROLES` list incl. Peon (Step 3) ✓; Role field → required Select (Step 4) ✓; test updated to select (Step 1) ✓; required behavior preserved (Step 5) ✓.
- **Type consistency:** `SEL` and `sel` already exist and are used elsewhere in `staffAdd.tsx` with the same `(name, label, options, required?)` signature. `setSelect`/`setText` already exist in the test.
- **Placeholder scan:** none.
