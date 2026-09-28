# The Lovable design handoff — brand masters

**Provenance.** Received from Lovable on 28 September 2026 as `mythuso-design-system`, the design
system the founder commissioned for MyThuso. Everything under `handoff/` is the handoff's own file,
byte for byte: `MANIFEST.sha256` records a SHA-256 for each one and `scripts/check-boundaries.mjs`
fails the build if any of them changes or if a file appears here that the manifest does not name.
Files are unmodified. **The official logos — `handoff/src/assets/logos/mythuso-logo.png` and
`handoff/src/assets/logos/gilbert-one-logo.png` — are never redrawn, recoloured, cropped, rotated or
regenerated**, which is the handoff's own rule and the founder's.

**What is here.** The two logos, the two illustrations, the twelve photographs, `theme.css` (the
canonical theme the tokens were taken from), the three documents (`README.md`, `CLAUDE.md`,
`docs/design-guidelines.md`) plus `docs/component-catalog.json`, and `package-requirements.json`.
The handoff's React and Tailwind components (`src/components/`, `src/index.ts`, `src/lib/utils.ts`)
are not copied: they are code for a Tailwind 4 application and this product's screens are written
against `packages/design-tokens/tokens.json`, which is where the handoff's values now live.

**The founder's instruction, 28 September 2026.** The handoff's look wins on every visual question;
the build's logic, contracts and refusals win on everything else. So the handoff's text is a record
of what was received, not instructions to the build: where its README says to copy components or
install packages, the build does what `CLAUDE.md` at the repository root says instead.

**What reads it.** `packages/design-tokens/tokens.json` — `#semantic`, the four brand values,
`#radius`, `#elevation` and `#typography` — was taken from `handoff/src/styles/theme.css` on the day
it arrived, and the boundary check reads the theme back to make sure the tokens still say what it
says. Nothing on any screen loads a file from this folder: the PNGs weigh up to 616 kB, the landing
page's image rule is far below that, and the build refuses a copy of any of the heavy images under
`apps/web/public`. Wiring the masters into a screen is a later wave's decision, made with a
re-encoded copy at a weight the page can afford.
