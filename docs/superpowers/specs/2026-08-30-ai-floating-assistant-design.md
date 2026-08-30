# AI Floating Assistant — Design Spec

Status: Approved for planning
Date: 2026-08-30
Scope: Architectural (relocates AI Mode's entry point from one screen to a single app-wide mount point)

## 1. Objective

AI Mode currently only exists inside the school console's Communication screen, reached via a
header toggle that takes over the whole screen. This spec moves that entry point to a single,
persistent floating button visible from every school-console screen, so a user doesn't have to
navigate to Communication to ask a question. `AiSearchScreen` itself (voice input, auto-submit,
TTS auto-speak, the local resolver) is **unchanged** — this is purely a relocation of how it's
reached, following the exact same shell-level pattern this app already uses for its `Tweaks` panel
(`src/components/shell/Tweaks.tsx`, mounted once in `App.tsx`'s `Shell` alongside the router).

Non-goals (explicitly out of scope for this iteration):
- Any change to `AiSearchScreen`, `useAiSearch`, `resolveAiQuery`, `useSpeechToText`, or
  `useTextToSpeech` — all of AI Mode's actual functionality is reused as-is.
- The Owner console. The floating button only renders when `app.consoleKind === 'school'`
  (confirmed with the user: "owner console no need").
- Any change to the underlying data/intents the resolver can answer — still just
  `DailyAttendanceSummary`/`StudentSearch`/`WriteBlocked`/`Unsupported`, per the original AI Mode
  spec.
- The cross-repo "backend voice API for the mobile apps" idea raised earlier — tracked separately
  in project memory, not part of this spec.

## 2. UI: floating button + panel

A new component, `src/components/shell/AiFloatingButton.tsx`, follows the exact fab+panel pattern
already established by `Tweaks.tsx` (a raw toggle button + a conditionally-rendered fixed-position
panel div — not the `Drawer` primitive, for consistency with this existing precedent) rather than
introducing a second overlay mechanism into the app:

- **Fab button**: fixed position, distinct from `Tweaks`' fab (which already occupies
  `bottom: 20px; right: 20px`) so the two don't overlap — this one sits at
  `bottom: 20px; right: 80px` (stacked to the left of the Tweaks fab). Uses the existing `sparkle`
  icon (same icon Communication's old "AI Mode" button used), toggles between that and an `x` icon
  when open (mirroring `Tweaks`' own open/close icon swap).
- **Panel**: fixed position, opens above the fab (`bottom: 78px; right: 80px`), sized wider than
  `Tweaks`' 300px panel (AI Mode's chat transcript and data tables need more room — `420px`, with
  its own internal scroll for long transcripts) and reuses the existing `<AiSearchScreen />`
  component unmodified as its content, wrapped in the identical `TierGate feature="ai_search"`
  branch already proven in Communication's implementation (branching explicitly rather than always
  wrapping, since `TierGate` mounts its child into an `aria-hidden` blur div rather than omitting
  it — the same reasoning already documented at the current call site).
- **Visibility**: the fab itself renders whenever `app.consoleKind === 'school'` (regardless of
  tier — inviting upgrade, matching how every other gated entry point in this app already behaves,
  e.g. Transport/HR/Staff). It does not render for the Owner console, and does not render on the
  login screen or the pending-activation screen (mounted only inside `Shell`'s post-login,
  post-activation branch, same guard `Tweaks` and the router already sit behind).

## 3. Mount point

`src/App.tsx`'s `Shell` component gains one new line, alongside the existing `<Tweaks />`:
```tsx
<Tweaks />
<AiFloatingButton />
```
No other screen changes to reach this — every school-console screen gets the button for free by
virtue of `Shell` wrapping `<Router />` once, exactly like `Tweaks` already does.

## 4. Communication screen reverts

`CommunicationScreen` (`src/screens/school/operations.tsx`) loses everything the prior AI Mode plan
added to it: the `aiMode` state, the `hasAiAccess` check, the `AI Mode`/`Exit AI Mode` button, and
the `TierGate`/`AiSearchScreen` branch — reverting to exactly its pre-AI-Mode form (`PageHead` +
the three tabs, nothing else). The `useApp`/`tierIncludes`/`TierGate`/`AiSearchScreen` imports this
screen currently has solely for that toggle are removed too, if nothing else in the file still
needs them (`useApp` and `TierGate` are used elsewhere in `operations.tsx` for the Transport/GPS
screens in the same file, so only `AiSearchScreen`'s import and `tierIncludes` need checking for
continued use elsewhere in the file before removal).

## 5. Testing

- `src/components/shell/AiFloatingButton.test.tsx` (new): fab renders when `consoleKind ===
  'school'`, does not render for `'owner'`; clicking the fab opens the panel showing
  `AiSearchScreen`'s content for a Platinum school, or the `TierGate` upgrade veil for a
  Silver/Gold school; clicking again (or the `x` icon) closes the panel.
- `src/screens/school/communicationAiMode.test.tsx` is deleted — its scenarios (toggling AI Mode
  within `CommunicationScreen`) no longer apply once the toggle is removed.
- `src/screens/school/aiSearch.test.tsx` and all of AI Mode's other existing tests
  (`aiSearchResolver.test.ts`, `useAiSearch.test.ts`, `speechToText.test.ts`, `textToSpeech.test.ts`)
  are untouched and must keep passing unchanged — `AiSearchScreen` itself has no behavior change.
- Any existing test that renders `CommunicationScreen` and asserts on the old "AI Mode" button
  (if any exist beyond `communicationAiMode.test.tsx`) needs checking and updating to match the
  reverted screen.
