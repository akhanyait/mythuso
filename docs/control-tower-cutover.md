# Control Tower cutover — parallel run, deep links, rollback and training

**Status: proposed. Written 24 September 2026, Phase 2 of `docs/PROMPT-CONTROL-TOWER-UI.md` (§5.1, §10).**
Nothing here has happened. The merged portal is not built — that is Phase 3 — and this document is the
plan the build is held to, so that the day it lands is a day somebody planned rather than a day
somebody discovers. It is one of the three documents gate G15 lists; the other two,
`docs/control-tower-tab-inventory.md` and `docs/control-tower-session-model.md`, are already written.
G15 stays open until whoever runs the cutover accepts this plan in writing (see _Sign-off_ below).

**Updated 24 September 2026, Phase 3: the portal is built, and the plan below is what it was built to.**
What that means, section by section, so the person who signs this can check each promise against the
tree rather than against this paragraph:

- **The addresses.** `?role=control-tower` opens the portal on Dispatch & Incidents and `?role=back-office`
  on Overview, each with the one-line notice, whose sentence is `packages/catalog/control-tower-portal.json`
  `#notice`. An old tab named the old way — `?role=back-office&category=operations` — lands where the tab
  inventory says (`#legacyAddresses`). `/staff` and `/admin` are unchanged. Held by
  `tests/control-tower-portal.spec.ts` on both viewports, every address in the table below.
- **The parallel run.** `&legacy=1` opens either old surface, read-only, with this plan's own refusal
  sentence and a link to the same place in the portal; every control inside a section is disabled and
  the ones a screen draws for itself are stopped (`apps/web/src/components/ReadOnly.tsx`). The role
  picker's two entries both open the portal, so the picker offers only the portal. The same fixtures give
  the same figures in the old place and the new, and the journey fails if they do not.
- **Rollback.** One change, not two: point `control-tower` and `back-office`'s `surface` in
  `apps/web/src/lib/roles.ts` at `'clinical'` and `'back-office'` again and deploy. `Doorway.tsx` does not
  change for it — the portal's door (`apps/web/src/shells/PortalShell.tsx`) opens the old shells whenever
  the role's surface is not the portal's, and opens them acting as they did rather than read-only.
- **The blocker this plan named.** Where the Operations tab's link to the field-safety settings lands is
  decided, for acceptance at sign-off: under the Incidents tab (`control-tower-portal.json#decisions`).
- **Training.** The Overview's _What moved where_ tab is the in-portal half of the note — every old tab,
  its new place and whether it moved or merged, read from the same table the portal resolves old
  addresses by. The one-page note itself has not been sent to anybody, and nobody has been walked
  through the portal. Those are the two steps of _Training and communication_ still undone.

G15 is still open: the sign-off below is blank.

Status words are the plan's: **built** (in the tree, held by tests), **proposed** (declared, not built),
**dark** (built, unreachable by default), **gated** (built, blocked on a named gate), **named-but-absent**
(named, no artefact).

## What is being cut over, and what is not

Today there are two surfaces, both **built** and held by tests:

| Surface | Address today | What it draws |
| --- | --- | --- |
| Control Tower workspace | `/app/?role=control-tower` | Dispatch, Incidents, Vetting queue, Quality, Audit exports, and four "More tools" modals |
| Back office | `/app/?role=back-office` | Overview, Vetting, Operations, Clinical, Catalogue, Growth, Finance, Compliance, Governance, Configuration |

The merged portal replaces the two with one surface. Its categories and every tab's disposition are
fixed by `docs/control-tower-tab-inventory.md`: 17 moved as-is, 2 merged, 26 retired from this
consolidation (the Nurse, Doctor and Partner workspaces, which stay exactly where they are). Nothing is
retired without the reason that document gives, and this plan does not reopen a single verdict.

**What does not change on cutover.** The role switcher remains a preview picker: it grants no server
permission and stores no identity in the browser (`apps/web/src/Doorway.tsx`). The cutover is a change
of navigation, not of access. Anybody who could open a screen the day before can open it the day
after, and nobody gains a permission they did not have — because nobody has any. Real enforcement of
the fifteen admin layers is a separate phase (G16). The patient's first load does not change either:
both surfaces are behind dynamic imports today, the merged portal is behind one tomorrow, and
`tests/states.spec.ts` carries the ratchet.

## The addresses that must keep working

A bookmarked staff URL that silently lands somewhere else on cutover is a support-ticket wave. Every
address that reaches either surface today is listed here, with what it does after cutover. The list
is short because the product keeps almost nothing in the address bar — the role and, for the patient,
`?open=` (`apps/web/src/lib/roles.ts`); neither admin surface puts its tab in the URL today.

| Address today | Reaches today | After cutover, for one release cycle | After that |
| --- | --- | --- | --- |
| `/app/?role=control-tower` | The Control Tower workspace, Dispatch first | The merged portal, opened on Dispatch & Incidents, with a one-line notice that the two surfaces are now one | The merged portal, no notice |
| `/app/?role=back-office` | The back office, Overview first | The merged portal, opened on Overview, with the same notice | The merged portal, no notice |
| `/staff`, `/staff/` | 301 to `/app/` (nginx, since 12 September) | Unchanged | Unchanged |
| `/admin`, `/admin/` | 301 to `/app/` (nginx, since 12 September) | Unchanged | Unchanged |
| `/app/?role=control-tower&…` with anything else in the query | The workspace; the rest is ignored | The portal; the rest is ignored, as today | Same |

**Why the two roles are kept rather than redirected.** Both are read by `roleFromSearch` and nothing
else, so keeping them costs one line each in the role table. A 301 in nginx is not available for a
query string without a rewrite in a file this repository shares with five other sites, and the rule
there is to change nothing that is not ours (`CLAUDE.md`, _Deployment_). The redirect is done in the
application, as the role parameter already is.

**Why one release cycle.** Long enough for every bookmark to be opened at least once and for the
notice to be read; short enough that two names for one surface do not become permanent. A release
cycle here means the interval between two deploys that carry the portal, not a calendar period —
nobody has fixed a release cadence, and a date written here would be a guess.

**What the portal's own addresses add.** §5.2 asks for persistent context — site, tenant, period — in
the URL, bookmarkable. Those are new parameters; they do not collide with `role` or `open`. A tenant
parameter is refused until a tenant exists (`packages/catalog/control-tower-overview.json`, the
no-invented-tenant refusal).

**Held by tests, when the portal is built.** A Playwright journey on both viewports opens each address
in the table above and asserts where it lands and that the notice is (or, after the cycle, is not)
shown. Until the portal exists there is nothing to hold; the current journeys already hold both roles'
addresses as they are.

## The parallel run

For one release cycle both surfaces are live. The legacy one is **read-only**.

- **The legacy surfaces stay reachable** by an explicit address — the proposal is
  `/app/?role=control-tower&legacy=1` and `/app/?role=back-office&legacy=1` — and nowhere else. The
  role picker offers only the portal.
- **Read-only means every action is refused, with a sentence.** A button that would act in the legacy
  surface is shown disabled beside: "This screen is kept for comparison while the Control Tower
  changes over. Do this in the Control Tower." with a link to the same place in the portal. Nothing
  here acts on anything real today — no visit is booked, no nurse is dispatched — so "read-only" is a
  rule about which screen is the one of record, not a safety interlock; it is still enforced, because
  a surface that half-works during a changeover is the surface people keep using.
- **Why a parallel run at all, when nothing is real.** Because the people who use these screens
  (whoever runs the preview for the founder, demonstrations to hospitals, and later a real operations
  desk) learn where things are by using them. A day on which they can check the old place against the
  new one is cheaper than a day on which they cannot find the vetting queue.
- **What is compared.** For each moved and merged tab: the same fixture data renders the same counts
  in both places. `tests/workspace-counts.spec.ts` already asserts the Control Tower's counts; the
  parallel run adds the same assertions against the portal and fails if the two disagree.
- **What ends it.** The next release after the portal ships removes the `legacy` parameter and the
  old shells' routes. The shells' components are not deleted in the same change: the Nurse, Doctor
  and Partner workspaces share `StaffShell.tsx`, and removing its Control Tower branch is its own
  reviewed change.

## Rollback

If a critical workflow breaks on cutover, the portal is rolled back, not patched forward.

**What counts as critical.** Any of: the Dispatch board does not load or does not assign; Incidents
does not show an open incident, a panic, an SOS or a safeguarding report that fixtures contain; the
Vetting queue does not open a party's decision panel; Audit exports refuses a range it accepted
before; any screen shows a number that disagrees with the legacy surface for the same fixtures; the
patient's first load rises above the last recorded figure.

**How.** The portal ships behind the role table: `control-tower` and `back-office` point at the portal
shell. Rolling back is pointing them at the two old shells again — one change to
`apps/web/src/lib/roles.ts` and `apps/web/src/Doorway.tsx`, then a deploy. The old shells are still in
the bundle during the parallel run precisely so that this is a revert of a small diff rather than a
rebuild. `./deploy/deploy.sh` publishes static files atomically; the assistant service and the identity
service are not touched by it and are not part of this rollback.

**Who decides, and how fast.** Whoever is running the cutover decides, without waiting for anybody
else, and records the decision — the time, what broke and who decided — in the feature map's entry for
the cutover. Nothing here is a real service, so there is no patient harm clock; the reason to roll
back fast is that a broken administration screen during a hospital demonstration is the end of the
demonstration.

**What a rollback does not do.** It does not touch production data (there is none behind these
screens), the assistant service (a separate process, restarted only by hand), or any other site on the
server. `nginx -t` before any reload, as always, and no reload is needed for this — the 301s do not
change.

**When the rollback window closes.** At the end of the parallel run, when the old shells' routes are
removed. After that a failure is fixed forward, like any other.

## Training and communication

This is part of the cutover, not an afterthought, and the cutover does not start without it.

1. **Before.** A one-page note, written from `docs/control-tower-tab-inventory.md`, for everybody who
   opens either surface: which tab moved where, the two that merged and why (Admin's Vetting is the
   Control Tower's Vetting queue; Admin's Operations is split across Dispatch and Incidents), and the
   one thing the inventory left undecided that affects them — where the Configuration link that hung
   off Operations now lives. Sent a release before the portal ships.
2. **On the day.** The notice on each old address (above), in one sentence, with a link to the note.
3. **During the parallel run.** A short walk-through for whoever demonstrates the product, run on the
   portal with the legacy surface open beside it.
4. **After.** The note is kept in `docs/` and linked from the portal's own help, and the feature map
   records the cutover as delivered only when the journeys hold every address in the table.

**Who is told.** Today: the founder and whoever runs demonstrations. There is no operations desk and no
hospital user. When there is, this list grows before the cutover, not after.

## What this plan does not decide

- **The release cadence**, so "one release cycle" is measured in deploys.
- **Where Admin's Operations → Configuration link lands** — `docs/control-tower-tab-inventory.md`,
  _Not yet decided_. The portal cannot ship until somebody decides; this plan only makes it a blocker.
- **Whether the two development-only Control Tower tools (HL7 quarantine, Device Lab) belong in a
  production portal** — same section of the inventory.
- **Anything about permissions.** The fifteen layers are G16.

## Sign-off

| Field | Entry |
| --- | --- |
| Accepted by (name and role of whoever runs the cutover) | |
| Date | |
| Changes to this plan agreed at acceptance | |

G15 closes when this table is filled in and the portal's address journeys exist. Until then
`packages/catalog/control-tower-overview.json` lists G15 as open.
