# AGENTS.md

This file exists so that an agent opening this repository cold, in any tool, finds the rules before
it finds the code. It is a pointer, not a brief.

**Read `CLAUDE.md` first and in full.** It is the whole brief: what the product is, the three native
apps and the three services, and the sections that matter most —

<!-- These four line numbers are corrected on 6 October 2026. They were already stale before this
pass — they named lines 69, 102, 126 and 174, which pointed into the middle of other sections on the
tree this was written against — and adding the shop to `CLAUDE.md`'s entries paragraph moved the real
headings again. A pointer that lands in the wrong section is worse than no pointer, because this is
the file that sends an agent opening the repository cold to the brief, and it will be believed. Line
numbers are not a number in the sense the one-place rule means, so they are re-derived here; if you
edit `CLAUDE.md`'s length, re-derive them again rather than leaving them to rot. -->
- `## The rules that are not negotiable` (`CLAUDE.md:88`) — nothing here is a real service; a number
  lives in one place; contracts are authored in `packages/catalog/*.json` and everything else derives.
- `## Working here` (`CLAUDE.md:152`) — how to build, check and test.
- `## Adding a feature — the shape it takes` (`CLAUDE.md:176`) — eight steps, ending at
  `docs/FEATURE-MAP.md`. A feature that skips a step is not finished.
- `## Deployment` (`CLAUDE.md:224`) — static files only, one manual script, a shared box.

The patient entry has a **ceiling of 282.16 kB**, and it is a ceiling somebody chose, not a
measurement of what the entry weighs today. `scripts/check-bundle-budget.mjs` holds it as
`CEILING_KB = 282.16` and fails a build that goes over it, after `npm run build -w @mythuso/web`:
every script, module preload and stylesheet `apps/web/dist/index.html` references, each gzipped at
level 9, summed in binary kB (`bytes / 1024`). The figure came from a real measurement — 16
September 2026 at `8bf3e48`, recorded in `CLAUDE.md:28` — and was then fixed as the number to hold
the line at. The measurement moves; the ceiling does not move unless the founder moves it.

`docs/FEATURE-MAP.md` records what the entry has actually weighed since, and the recent figures sit
well under it: on 2 October 2026 a sweep built every commit from `a2cb669b` to `8b0d7d95` and
measured **255.80 kB to 256.70 kB** across the run (255.81 at the first, 256.70 at the heaviest),
against **283.83–284.13 kB** in the days before it — so the entry is some 26 kB inside the ceiling
on the tree that sweep measured. Compare a figure only against one taken the same way: the script
prints the same bytes divided by 1,000 beside its own, and the two differ by about six at this size,
which is how a "~6 kB" growth that was never there got into an earlier record. If your change takes
the entry over the ceiling, the convenience has been paid for by the people this is built for, and
raising the ceiling is a decision to bring to the founder rather than to make — that weight is the
whole point of the number and does not change because today's build happens to sit under it.

> **Open item, 6 October 2026 — the measured entry and the entry a patient is sent to are not the
> same file.** `check-bundle-budget.mjs` measures
> `apps/web/dist/index.html`, which nginx serves at `/app/` and which loads `/src/main.tsx`. But the
> public page's own call to action sends a patient to `/?role=patient`
> (`apps/web/src/features/Landing.tsx:85`), and `/` serves `landing.html`, which loads
> `/src/landing.tsx`. That entry's `MainEntry` renders `<Workspace/>` on a lazy import **when a
> `role` parameter is present** and `<Landing/>` when it is not — so the address the CTA sends a
> patient to draws the Workspace chunk, and the address the budget measures draws a different entry
> point entirely. Neither `landing.html` nor the Workspace chunk is what the ceiling holds. Two
> independent reviews read the heavier path as the one nothing measures.
>
> **Measured, 6 October 2026, and the premise of that worry did not survive the measurement.** One
> build of the tree, both entries measured the way the script measures — same reference regex over
> `src=`/`href=` for `.js|.mjs|.css`, each gzipped at level 9, summed in binary kB, against the same
> 282.16 ceiling:
>
> - `index.html` (the entry the ceiling holds, served at `/app/`): **241.88 kB** across 15 files.
> - `landing.html` (served at `/`, what a patient actually arrives at): **121.41 kB** across 16 files
>   — **120 kB lighter**, not heavier. It contains zero references to a Workspace chunk; `index.html`
>   contains two.
> - The worst path, `/?role=patient` with the lazily fetched Workspace chunk added to the entry that
>   loads it: 121.41 + 86.47 = **207.89 kB**, leaving 74.27 kB of headroom.
>
> So the unmeasured path is the cheaper one, and the mechanism is the one `landing.tsx:11-13` states:
> `const Workspace = lazy(() => import('./Workspace'))`, so reading the public site never downloads a
> clinical screen and a `role` parameter pays for one chunk on demand rather than statically. The
> note's claim that "two independent reviews read the heavier path as the one nothing measures" was
> reading source and inferring weight; the built tree says otherwise. This build did not set
> `VITE_MYTHUSO_STAFF_PREVIEW`, which is why `index.html` reads 241.88 rather than the deployed
> 254.06 — compare figures only against builds of the same flag, and `deploy/deploy.sh` and
> `apps/web/src/Doorway.tsx` both carry the +12.18 kB the flag costs.
>
> **Still a founder question, and this measurement does not settle it.** Which entry the ceiling
> should hold is not answered by pointing the script at a different file. It now rests on a real
> figure rather than a guess: holding `index.html` at 282.16 governs the heavier of the two by
> 120 kB and leaves the patient's own address ungoverned, while governing `landing.html` would hold a
> file that currently has 160 kB of room. Both entries are worth a ceiling, and neither figure here is
> a recommendation.


## What is decided and where the decision is written down

`docs/ROADMAP.md` carries the founder's decisions with their dates. The live one for the assistant is
`## Founder-requested — one GilbertOne, decided 19 September 2026` — five phases, the safety invariant
that **affect may never soften a refusal or an emergency**, and the fact that a truthful signed-in role
is blocked on the identity service, which is deliberately switched off. `### The foundation under one
GilbertOne — 22 September 2026` and `## GilbertOne, one engine and three clients` in the same file
record the direction the founder fixed, and it is the one to hold to: **GilbertOne is a separate API
engine — `apps/assistant-api`, its contract in `packages/catalog/apis/assistant.json` — and the web,
iOS and Android applications are its clients rather than its carriers.** Read those sections before
touching `apps/assistant-api/src`, `packages/gilbertone/src`, `apps/web/src/lib/gilbertone.ts`,
`apps/web/src/features/GilbertAvatar.tsx` or anything that renders an assistant. Two things about it
are settled and are not yours to reopen: the **look and feel is fixed**, and the deterministic half in
`packages/gilbertone` stays on every device — no dependency, no network, no environment variable —
which is what answers while the engine is dark. The two phones carry a generated typed client they do
not call, because `capabilities.json`'s `unifiedApi` flag is `enabled: false`; switching it on is a
founder decision, not a tidy-up.

`docs/FEATURE-MAP.md` is the map of what exists and what does not. `docs/PRIVACY-AND-SECURITY.md` is
honest about which controls exist. `/status` on the live site is the page that says, capability by
capability, what is connected.

## Standing rules from the founder

These are not style preferences. Each one exists because of something that can go wrong here.

**No deployment without explicit go-ahead.** Do not run `./deploy/deploy.sh`, and do not run anything
that touches `liqzar-server`, unless the founder has approved that specific run. This holds *even when
he says "deploy please" in the same breath as other asks* — confirm the deploy as its own step. That
box also serves agcafrica.com, artisanza.co.za, bidza.co.za, liqzar.co.za and skillsonwheels.co.za,
which belong to other people. `deploy/RUNBOOK.md` is the order of steps; its step 0 and step 8 are the
same co-tenant check run before and after, and running the steps by hand is how it gets skipped.

**Never restart nginx on that box.** A reload leaves the five co-tenants serving; a restart with a
broken configuration will not start at all. And leave `/etc/letsencrypt` alone — deleting a certificate
you may reinstall in an hour is how you meet the rate limit.

**Do not half-migrate a live patient-facing surface.** If a change to something patients see cannot be
finished in the same pass, stop, explain the blast radius, and hand the decision back. This is a real
health product; a screen that is half-way between two truths is worse than either.

**Never `git add -A`.** This checkout is shared by several agent sessions and carries stray untracked
files under `Documentation/`. Stage by name, and run `git status` after staging to see what you
actually included.

**Verify before claiming.** Run the real command and read its output. Do not trust a summary from
another session, and never report a result you did not obtain. A deploy is not done until the external
verification has been done: the entries over https — four pages answering 200 (`/`, `/app/`, `/shop/`,
`/status/`) and three paths answering 301 (`/staff/`, `/admin/`, `/status`), as
`deploy/nginx/mythuso.conf` maps them — the six security headers, the `subjectAltName`
covering both the apex and `www`, and the co-tenant diff against the baseline. <!-- This said "five
entries" until 6 October 2026, which was true before `shop.html` became an entry. `deploy/RUNBOOK.md`
§3 still heads itself "all five entries" while its own loop walks seven paths; that file is outside
this pass's scope and its heading is the stale one, not its commands. -->

**Do not widen scope during a deploy.** The identity service is off because there is no SMS provider,
its nginx `/api/` block stays commented out, and nobody can sign in. That is the intended state, not a
bug to fix. HSTS stays at `max-age=300`; raising it is a separate, deliberately deferred, irreversible
decision.

**Do not start a large build near the weekly credit cap.** Write the plan into `docs/ROADMAP.md`
instead, so the next session can pick it up cold.

## Cursor Cloud specific instructions

Added 10 October 2026, from setting a Cloud Agent environment up on a Linux image whose `node`
was 22.14.

`npm run dev` is what comes up on boot, on port 5173: `/` the public page, `/app/` the product,
`/status/` what is connected, `/shop/` the shop. The identity service stays down. It refuses to
start until `MYTHUSO_ENV` is set, and with `MYTHUSO_ENV=development` the preview asks for a
one-time code (`npm run api`, health at `http://127.0.0.1:8787/health`).

A Cloud Agent shell can resolve `node` to `/exec-daemon/node`. On the image this was written
against, that binary was 22.14. That satisfies `engines` (`>=22.12.0`) and still cannot import a
`.ts` file: type stripping is on by default only from 22.18. `scripts/check-boundaries.mjs` and
the services import TypeScript with plain `node`, so `npm run check` fails on 22.14 with
`ERR_UNKNOWN_FILE_EXTENSION`. The environment install pins Node 22.23.3 under `/usr/local` and
links `node`, `npm` and `npx` into `/usr/local/cargo/bin`, which this image searches before
`/exec-daemon`. `node -v` should say v22.23.3.

Playwright owns its dev server. `reuseExistingServer` is false, and a suite that finds 5173 taken
fails rather than testing whatever is already there. The boot server is that occupant. Run
`MYTHUSO_PORT=<free port> npm test` while it is up. `MYTHUSO_PORT` is also the identity service's
listen port when that service is started, so set it only for the test command.

iOS needs macOS and Xcode. The Android SDK and JDK 17 are outside this environment; CI builds
them on `ubuntu-latest` with `compileSdk` 35.
