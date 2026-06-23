# Owner Console — real-API rebind, URL routing & platform identity

**Date:** 2026-06-23
**Status:** Approved design (pre-plan)
**Repo:** `sms-admin` (frontend); consumes existing `sms-backend` platform API. No backend changes.
**Design reference:** Claude Design project "Admin school" (`SchoolMate Admin.html`, `app/screens_owner*.jsx`, screenshots `owner_dark.png`, `owner_users.png`, `billing.png`).

## Context

The SchoolMate **Owner Console** is a platform-operator surface: it manages all schools
(tenants), billing, and team across the SaaS. Its navigation already exists and matches the
target design — Overview, Schools, Cross-school reports, Subscriptions & billing, Users & roles,
Owner settings, plus Create school. Today every Owner screen renders **mock data** from
`@/data/mockDb`; nothing is wired to the backend, and the console is reached via an
`email.endsWith('@schoolmate.io')` heuristic unrelated to real authorization.

The backend already exposes the full operator API under a single `/v1` group guarded by
`RequireAuthorization("platform")`, and the **catre admin** app (`sms-catreadmin`) already wraps
every one of these endpoints with typed API modules + react-query hooks. Most of this work is
therefore *port-and-adapt*, not build-from-scratch.

## Goals

- Reach the Owner Console by the backend **`is_platform`** claim, not an email domain.
- Replace the in-memory `app.view` router with **real URLs** via `react-router-dom`.
- Wire all 7 Owner sections to the **real platform API**, replacing mock data.
- Support **Add new school** (onboarding) + **give access** (create-password/OTP for the new owner).
- Match the Claude design visually by adapting the existing `sm-*` design system.

## Non-goals

- No backend changes. (All needed endpoints exist and are already platform-authorized.)
- No server-persisted Owner settings (no endpoint exists — client-side only; see Gaps).
- No changes to the School Console beyond the shared routing/identity refactor.
- Support tickets/audit endpoints exist but are out of the Owner nav → out of scope.

## Architecture

### 1. Identity & console routing

`AppProvider.applySession` currently sets the console kind from `email.endsWith('@schoolmate.io')`.
Replace with the **`is_platform`** flag returned by `/auth/me`:

- `finishLogin` already calls `fetchMe()`. Thread `is_platform` (and keep roles) into `applySession`.
- `is_platform === true` → Owner Console; otherwise → School Console.
- Outcome: existing platform accounts (e.g. `vaibhavdubey417@gmail.com`) land in the Owner Console;
  tenant users land in the School Console. This matches the `/v1/clients` `platform` policy.
- `AppProvider` test updated to assert routing keys off `is_platform`, not email.

### 2. URL routing (react-router-dom)

Adopt `react-router-dom` (already a dependency, currently unused) for the app shell.

- Wrap the shell in a `BrowserRouter`; the logged-out state renders the login route.
- Owner routes: `/owner` (Overview), `/owner/schools`, `/owner/schools/new`,
  `/owner/schools/:id`, `/owner/reports`, `/owner/billing`, `/owner/users`, `/owner/settings`.
- School routes get an equivalent `/school/*` tree (mechanical move of existing views).
- The current `app.view` / `go()` state and `router.tsx` view-map are replaced by `<Routes>` +
  `useNavigate`; Sidebar/Topbar links become `<NavLink>`s. Page titles/subtitles move to per-route
  metadata.
- This is the largest structural change and is done **first**, before any API wiring, with screens
  still on mock data so the migration is independently verifiable.

### 3. API layer

Port catre admin's operator API modules into `sms-admin/src/api`, adapted to sms-admin's existing
`client.ts` / `tokenStore` / `ApiError` (envelopes and `snake_case` already match this backend):

- `clients.ts`, `dashboard.ts`, `plans.ts`, `invoices.ts`, `subscriptions.ts`, `reports.ts`,
  `team.ts`, `onboarding.ts`, plus their `types` and react-query hooks.
- Each module gets a vitest unit test mirroring catre's.

## Sections → endpoints

| Section | Route | Endpoints | Replaces |
|---|---|---|---|
| Overview | `/owner` | `GET /dashboard/overview`, `GET /reports/revenue` | `portfolio.tsx` mock |
| Schools (list+detail) | `/owner/schools`, `/owner/schools/:id` | `GET /clients`, `GET /clients/{id}`, `POST /clients/{id}/status`, `POST /clients/{id}/change-plan` | mock list |
| Add school + access | `/owner/schools/new` | `POST /clients` + create-password/OTP for the new owner | — (new) |
| Cross-school reports | `/owner/reports` | `GET /reports/revenue`, `GET /reports/clients.csv` | mock |
| Subscriptions & billing | `/owner/billing` | `GET /plans`, `GET /invoices` (+ mark-paid/refund), `GET /subscriptions` | `billing.tsx` mock |
| Users & roles | `/owner/users` | `GET/POST/PATCH /team` | `workspace.tsx` mock |
| Owner settings | `/owner/settings` | none (client-side only) | mock |

**Add school + give access:** the onboarding wizard posts `POST /clients` (creates tenant + owner
user, storing `ContactEmail`). On success, surface the owner email and a "send setup code" action
that calls the existing `passwordForgot`, so the new owner can set a password via the
create-password flow already built. This reuses the `LoginScreen` reset flow end-to-end.

## Gaps, visuals, testing

- **Owner settings (client-side only):** no backend endpoint exists. Build the UI with local-only
  preferences (company name, branding, theme); server persistence is explicitly out of scope until
  a `/v1/owner/settings` endpoint is added. The screen must not imply data is saved server-side.
- **Visual fidelity:** adapt the existing `sm-*` components and refine to match the design
  screenshots; do not rebuild from the raw design JSX. Pull specific design files via the
  `claude_design` connector when a screen needs exact reference.
- **Testing:** vitest unit test per api module; render/interaction test per screen with mocked
  `fetch`; `AppProvider` test for `is_platform` routing. Matches existing sms-admin conventions.
- **Data safety:** read-only screens land first; mutations (status change, refund, team invite)
  sit behind confirm dialogs.

## Phasing (informs the implementation plan)

1. **Router + identity** — migrate shell to `react-router-dom`; switch console routing to
   `is_platform`. Screens stay on mock data. Independently verifiable (URLs work, platform account
   lands in Owner Console).
2. **API layer** — port operator api modules + hooks + their unit tests.
3. **Sections** — wire each section to its endpoints (Overview → Schools → Add school/access →
   Billing → Reports → Users), each with a screen test.
4. **Owner settings** — client-side-only screen.

## Risks / open questions

- **react-router migration blast radius:** touches shell, sidebar, topbar, and every route. Phase 1
  isolates it. Login/logged-out routing must be preserved.
- **Owner-settings persistence** deferred; revisit when a backend endpoint exists.
- **Real data is sparse** (2 onboarded schools today, design shows 7) — screens must render correct
  empty/low-count states, not assume mock volume.
