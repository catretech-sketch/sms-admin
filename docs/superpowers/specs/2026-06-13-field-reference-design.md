# Field Reference for Companion Apps — Design Spec

**Date:** 2026-06-13 · **Repo:** `sms-admin` (React 19 · Vite 6 · TypeScript 5.7)
**Branch:** `docs/field-reference`

## Purpose

Produce a single consumer-facing reference doc — `docs/field-reference.md` —
so a **separate companion app** (teacher / student / parent app) can adopt the
**exact same field names, types, and shapes** the admin panel uses. When both
the admin panel and the companion app read/write the **same backend API**, the
data must line up: no renamed keys, no type drift, no nesting mismatches.

The admin panel's `Api` interface (`src/lib/api.ts`) already mirrors a future
`.NET Core 10 /v1` REST surface. The TypeScript domain types in
`src/types/index.ts` are therefore the **canonical contract** the backend will
serve. This doc turns those types into a language-agnostic field reference.

## Why a new doc (vs. the existing one)

`docs/superpowers/specs/2026-06-09-field-domain-reference-design.md` already
inventories every entity, table column, and form field — but it is a
**gap-analysis spec** oriented to "🔴 what's missing for production." This new
doc is **consumer-facing**: its job is to let a second app match the *current*
contract exactly. It focuses on two things the gap doc does not foreground:

1. **The canonical JSON shape** of each entity (what the API serves/accepts).
2. **Form → model transforms** — the renames, flat→nested moves, comma-splits,
   and `Number()`/`undefined` coercions that happen between the admin form
   inputs and the saved model. These are the silent data-mismatch traps.

This doc cross-links to the gap doc for production-roadmap context; it does not
restate the gaps.

## The core principle: model is the contract, the form is one producer

The admin "Add" forms use **flat string keys** (`accHolder`, `bankName`,
`emPhone`, `subject`, `experience`). The saved model uses **nested
sub-objects with different names** (`bank.holder`, `bank.bank`,
`emergency.phone`, `subjects: string[]`, `exp: number`). A companion app must
match the **model**, not the form keys. Representative Teacher transforms:

| Form key | → Model path | Transform |
|---|---|---|
| `accHolder`, `bankName` | `bank.holder`, `bank.bank` | flat → nested + rename |
| `subject` (`"Math, Sci"`) | `subjects: string[]` | split `,`, trim, drop empties |
| `experience` (`"5"`) | `exp: number` | `Number()`, default `0` |
| `emPhone` | `emergency.phone` | flat → nested |
| empty string `""` | omitted / `undefined` | `orU()` drops blanks |

## Source of truth

- **Types / canonical shapes:** `src/types/index.ts`
- **Seed shapes & option lists:** `src/data/mockDb.ts` (`grades`, `sections`,
  `subjects`, `depts`, enums)
- **API surface:** `src/lib/api.ts` (`Api` interface + future `RestApi`)
- **Form → model mapping & validation:** the three "Add" screens —
  `src/screens/school/studentAdd.tsx`, `teacherAdd.tsx`, `staffAdd.tsx`
- **Validation rules:** `src/lib/validation.ts`

## Deliverable structure — `docs/field-reference.md`

A single Markdown file, Approach A (per-entity sections in one file).

### 1. Intro
Purpose, the "model-is-the-contract" principle, where the `/v1` surface lives,
and a pointer to the gap doc for production-roadmap context.

### 2. Conventions
- Type notation (`string`, `number`, `string[]`, `'M' | 'F'`, etc.).
- Required vs. optional (`?` = optional in the model; `*` = required in the form).
- How nested sub-objects serialize in JSON.
- The `orU()` rule: blank form strings become `undefined` (omitted), not `""`.

### 3. Enums
One table: `Tier`, `Role`, `Cap`, `ConsoleKind`, `SchoolStatus`, `FeeStatus`,
`FeeType`, `ActiveStatus`, `BusStatus`, `ExamStatus`, `ComplaintStatus`, plus
the inline unions (`priority`, exam `type`, report `result`).

### 4. Entities

Each entity gets a **model table** with columns: **Field · Type · Req · Notes/Format**.

Entities **with an input form** additionally get:
- a **Form → model mapping table** (form key · model path · transform), and
- a **validation rules** list (required fields + format checks).

**Entities with forms** (model + mapping + validation):
- **Student** — `studentAdd.tsx`, sub-records `father`/`mother` (`ParentInfo`), `documents` (`StudentDocs`)
- **Teacher** — `teacherAdd.tsx`, sub-records `bank`, `emergency`, `transport`, `hostel`, `social`, `leaves`, `documents`
- **Staff** — `staffAdd.tsx`, sub-records `bank`, `emergency`, `transport`, `social`, `documents`

**Model-only entities** (model table only):
- **School**, **Bus**, **Exam**, **PaperSlot**, **FeePayment**, **Approval**,
  **AppNotification**, **Complaint**, **Thread** / **ThreadMsg**,
  **Report** / **ReportRow**, **RankInfo**, **MonthValue**

**Shared sub-records** (documented once, referenced by the entities that use them):
- `ParentInfo`, `BankInfo`, `EmergencyInfo`, `TransportInfo`, `HostelInfo`,
  `SocialInfo`, `LeaveInfo`, `StudentDocs`, `TeacherDocs`, `StaffDocs`

### 5. Query option shapes
`ListStudentsOpts`, `ListTeachersOpts`, `ListStaffOpts` — the query params each
list endpoint accepts.

### 6. API endpoint map
Table mapping each `Api` method → intended `/v1` REST route (from the `RestApi`
sketch in `api.ts`), so the companion app knows where each entity is served.

## Field-completeness rule

Every field of every entity in `src/types/index.ts` must appear in the doc —
including the derived/display fields (`avatarHue`, `rating`, `load`, `top`,
`result`, `attendance`) that the form does **not** collect but the model
**does** carry. The doc must mark these as "server-derived / not in form" so the
companion app knows it reads them but does not send them.

## Out of scope

- No code changes to types, API, or forms — documentation only.
- No production gap analysis (lives in the 2026-06-09 doc).
- No machine-readable schema output (Approach C) — deferred until/unless a
  codegen need appears.

## Testing / verification

Documentation deliverable — verification is a **field-coverage check**: every
interface field in `src/types/index.ts` is accounted for in the doc, and every
form key in the three Add screens maps to a model path (or is explicitly noted
as validate-only, e.g. `confirmPassword`, `password`).
