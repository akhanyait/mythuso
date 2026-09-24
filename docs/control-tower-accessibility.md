# Control Tower accessibility — the WCAG 2.1 AA floor and the keyboard rules

**Status: proposed. Written 24 September 2026, Phase 2 of `docs/PROMPT-CONTROL-TOWER-UI.md` (§5.2,
§5.5).** This is the floor the merged Control Tower portal and the GilbertOne API Administration screens
are built to, and the rules their tests hold, written before the first screen so that accessibility is a
condition of the build rather than a review after it. Where something below is already true of the
product, it says so and names the test; where it is not, it says that too.

**Updated 24 September 2026, Phase 3.** The merged portal is **built**
(`apps/web/src/shells/PortalShell.tsx`, `apps/web/src/features/portal/`), and the automated half of this
floor is held by `tests/control-tower-portal.spec.ts` on both viewports. The GilbertOne API
Administration sub-screens are still not built (Phase 4). The manual half — a keyboard-only pass by
somebody who did not build it, and a screen-reader pass on a real device — has **not** been done, so no
portal screen is called done here; the table under _How it is tested_ is still empty and says why.

## Why this is not optional

A person who relies on a keyboard, a switch or a screen reader must be able to administer the
platform, not only use it as a patient. The South African Constitution's equality clause (section 9),
the UN Convention on the Rights of Persons with Disabilities (ratified by South Africa in 2007) and the
South African digital accessibility practice built on WCAG 2.1 AA all point the same way, and the plan
(§5.5) makes it a scope item, not a nice-to-have. An administration portal is also where the fewest
people work and the longest hours are spent, which is exactly where an inaccessible control costs one
person the most.

## The floor

Every screen in the merged portal meets **WCAG 2.1 level AA**. Where the product already holds itself
to more — it does on target size — the stricter rule stands and this document does not relax it.

| Area | The rule | Where it is held | True today? |
| --- | --- | --- | --- |
| Contrast | Text at 4.5:1 or better, large text and non-text UI (focus rings, borders of inputs, status dots) at 3:1 | `packages/design-tokens/tokens.json#contrast`, computed from the hexes on every build by `scripts/check-boundaries.mjs` | **built** for every pair listed there; a new pair is a new row before it is used |
| Colour alone | No state is carried by colour alone. Every status in the portal vocabulary (`packages/catalog/control-tower-overview.json#statusVocabulary`) is a word first and a colour second | `tests/control-tower-portal.spec.ts` asserts the word; `scripts/check-boundaries.mjs` fails a portal file that owns a second list of status words | **built** for the portal |
| Target size | 44×44 CSS pixels, the product's own floor, above WCAG 2.2's 24×24; exemptions are rows in `tokens.json#targets.knownUndersized` with a reason | `tests/accessibility.spec.ts`, and the same measurement (moved to `tests/audit.ts`) on every new portal screen in `tests/control-tower-portal.spec.ts` | **built** for today's screens and the portal's new ones |
| Reflow | No horizontal scroll at 320 CSS pixels or at 200% zoom | `tests/accessibility.spec.ts`; `tests/control-tower-portal.spec.ts` at the configured viewports and at 200% | **built** for today's screens and the portal's new ones |
| Text size | Nothing rendered below `tokens.json#typography.minimumRendered` | `tests/accessibility.spec.ts` | **built** |
| Motion | Every animation honours `prefers-reduced-motion`; nothing essential is conveyed by motion | `tokens.json#motion.respectReducedMotion`, `tests/motion.spec.ts`; the portal sweep asserts no running animation with reduced motion asked for | **built** for today's motion; the portal adds none (its loading skeleton stands still) |
| Names | Every interactive element has an accessible name; icon-only buttons carry `aria-label` | Journey tests query by role and name; the portal sweep checks every button, link, field, tab and tree item on each new screen | **built** for the portal's new screens; partly elsewhere |
| Status messages | A panel that fills, a check that finishes, a save that fails is announced through a live region without moving focus | Journey tests | partly: the portal's loading state and the Overview's health check are `role="status"`; announcing the moment a category finishes loading is not tested |
| Loading | Every panel has a skeleton or a spinner with an accessible name, never a blank region (§5.2); the skeleton is `aria-busy` on its region | `tests/control-tower-portal.spec.ts` waits for the named loading state to leave each category | **built** for the portal: every category is a dynamic import behind a named, `aria-busy`, still skeleton |
| Empty states | Every list and panel has a written empty state (§5.2), read as text, not an image | The contracts carry the sentences (`control-tower-overview.json`, `control-tower-portal.json`, `voice.json`, `api-registry.json`); `tests/control-tower-portal.spec.ts` asserts each one on its screen | **built** for the portal's new screens; the GilbertOne sub-screens' do not exist |
| Errors | An error names the field and says what to do, in a sentence, and is tied to its field with `aria-describedby` | Journey tests | proposed |

## Keyboard rules

Everything the portal does, a keyboard does. No action is mouse-only, no content is hover-only, and
nothing traps focus.

**Global.**

- The first focusable element on every page is a **Skip to content** link, visible when focused.
- **Tab** and **Shift+Tab** move between regions and controls in reading order. The order is the DOM
  order; `tabindex` greater than 0 is not used.
- **Escape** closes the topmost dialog, menu or popover and returns focus to the control that opened
  it.
- Focus is never moved by the application except in response to the person's own action (opening a
  dialog, submitting a form, following a link), and never lost to `<body>`.

**Tabs** (the portal's categories, and the sub-screens inside GilbertOne API Administration). The WAI-ARIA
tabs pattern with automatic activation:

- The tab list is one Tab stop. **Left** and **Right** arrows move between tabs and activate them;
  **Home** and **End** go to the first and last. Focus wraps.
- The active tab has `aria-selected="true"` and `tabindex="0"`; the others have `tabindex="-1"`.
- **Tab** from the tab list moves into the active panel.
- Because the portal keeps its context in the URL (§5.2), activating a tab updates the address, and
  the browser's Back returns to the previous tab.

**Lists** (the dispatch board, the incident list, the vetting queue, provider cards, the review queue).
A roving tab index:

- The list is one Tab stop. **Up** and **Down** move between rows; **Home** and **End** go to the first
  and last; **Enter** opens the row.
- Actions inside a row are reached with **Tab** once the row is focused, not by arrowing, so a row's
  buttons are never skipped and never a trap.
- A list's count is announced with it ("12 open incidents").

**Actions.**

- Buttons act on **Enter** and **Space**; links on **Enter**.
- A destructive or production-changing action (disable a provider, the per-tenant kill switch, rotate
  a key) opens a confirmation dialog whose default focus is **Cancel**, never the action.
- A locked setting (push-to-talk, captions, the clinical-delivery voice — `packages/catalog/voice.json`)
  is rendered as text with its reason, not as a disabled control. A disabled control is skipped by
  some screen readers and says nothing about why; a sentence says both.

**Sliders** (the intelligence level). **Left**/**Down** and **Right**/**Up** move one level; **Home** and
**End** go to the ends; the value is announced with its name ("Level 2, Standard"), and a level above
the ceiling is not reachable rather than reachable and refused.

**Dialogs.** `role="dialog"` with `aria-modal="true"` and a label; focus moves to the first field (or
Cancel, as above) on open, is held inside while open, and returns to the opener on close.

## Visible focus

Every focusable element shows a focus ring when focused from the keyboard (`:focus-visible`), drawn
from the token palette the product already uses: two rings, `color.focus` inside and `color.focusEdge`
outside, because no single colour clears 3:1 against both a white card and a dark panel. The pairs are
rows in `tokens.json#contrast` (SC 1.4.11) and are computed on every build; a portal surface with a new
background adds its focus pair there before it ships. No component sets `outline: none` without drawing
this ring in its place. No hex literal outside `packages/design-tokens/tokens.json` is used for it
(§1, Appendix C).

## Screen readers

- Landmarks: one `banner`, one `navigation` for the category list, one `main`; each panel a `region`
  with a heading.
- Headings are nested in order; every screen starts with one `h1`.
- Tables of data (the gate register, the provider list) are real tables with header cells, not grids
  of `div`s.
- GilbertOne's own voice and the screen reader are separate: GilbertOne never changes how VoiceOver,
  TalkBack or a browser screen reader speaks (`packages/catalog/user-preferences.json#platformScreenReader`,
  held by the build). Whether GilbertOne should stay quiet while a screen reader is on is an open
  question for people who use one; it is recorded there, not decided here.

## How it is tested

**Automated, on every build, both viewports.**

1. `tests/accessibility.spec.ts` gains every portal screen: reflow at 320 and at 200% zoom, target size
   and text size, exactly as it measures today's screens.
2. A new sweep on each portal screen: every `button`, `a[href]`, `input`, `select`, `textarea` and
   `[role=tab]`, `[role=option]`, `[role=slider]` has a non-empty accessible name; no `outline: none`
   without a `:focus-visible` rule; no element with a positive `tabindex`.
3. A keyboard journey per screen: from the address, reach every tab and every action with the keyboard
   alone, in order, and assert the focused element's name at each step. A step that needs the mouse
   fails the test.
4. Reduced motion: each screen loaded with `prefers-reduced-motion: reduce` has no running animation.

An automated accessibility engine (axe-core or similar) is **named-but-absent**: none is a dependency of
this repository today, and adding one is a dependency decision recorded in
`packages/catalog/open-source.json` first, like any other. The checks above do not depend on it.

**Manual, before a screen is called done.**

- A keyboard-only pass of every screen, by somebody who did not build it.
- A screen-reader pass on at least one real device — VoiceOver on an iPhone or a Mac, or TalkBack on an
  Android phone, or NVDA on Windows — covering: finding each category, reading a list's count and a
  row, operating one action and its confirmation, hearing a loading state finish and an error.
- Each manual pass is recorded in the table below with the date, the device and assistive technology,
  who did it and what they found. A screen with no row here is not called done, whatever its automated
  tests say.

| Date | Screen | Device and assistive technology | Tester | Found | Fixed in |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

No row exists yet. The portal is built (Phase 3) and nobody has made a manual pass of it.

### What the portal's journeys hold, 24 September 2026

`tests/control-tower-portal.spec.ts`, on the desktop (1440×1100) and mobile (390×844) projects:

- **Keyboard, categories.** The first Tab reaches the skip link. From the selected category the arrows
  walk all fourteen categories in the plan's order, each activating as it is reached and each updating
  the address; focus wraps; Home and End go to the ends; only the selected category is a Tab stop.
- **Keyboard, tabs inside a category.** The arrows move and activate; the address follows; Back returns.
- **Keyboard, lists.** A list is one Tab stop; Up and Down, Home and End move between rows.
- **Keyboard, the Configuration tree.** Up and Down move and select; every node shows its own written
  empty state.
- **The measurements** `tests/accessibility.spec.ts` takes — sideways overflow, target size, text size —
  on every new screen, at the configured viewport and at 200%, from the shared `tests/audit.ts`.
- **The sweep** on every new screen: no nameless control, no positive tabindex, no running animation
  with reduced motion asked for.

The screens moved in unchanged (Dispatch, Incidents, the vetting queue, Quality, Audit exports and the
back office's panels) keep the journeys they already had; `tests/journeys.spec.ts` now walks every
category and tab of the portal as one application.

## What is outstanding

- The GilbertOne API Administration sub-screens: Phase 4.
- The manual passes: a keyboard-only pass by somebody who did not build the portal, and a screen-reader
  pass on a real device. Neither has been done, and no portal screen is called done until both are rows
  in the table above.
- Dialogs: the portal opens the old surfaces' dialogs unchanged (`components/UI.tsx`'s `Modal` on a
  native `<dialog>`). Focus returning to the opener is the native dialog's; default focus on Cancel for a
  destructive action does not arise, because no portal screen offers one.
- An automated accessibility engine remains named-but-absent, as above.
- Manual screen-reader testing on a real device: not done for the portal (nothing to test) and, for
  today's product, partly done and partly not — `docs/ACCESSIBILITY.md` records what is measured on iOS
  and Android and what is still not.
- How GilbertOne's own voice and a platform screen reader coexist: an open question
  (`packages/catalog/user-preferences.json`, G35).
