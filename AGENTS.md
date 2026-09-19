# AGENTS.md

This file exists so that an agent opening this repository cold, in any tool, finds the rules before
it finds the code. It is a pointer, not a brief.

**Read `CLAUDE.md` first and in full.** It is the whole brief: what the product is, the three native
apps and the two services, and the sections that matter most —

- `## The rules that are not negotiable` (`CLAUDE.md:54`) — nothing here is a real service; a number
  lives in one place; contracts are authored in `packages/catalog/*.json` and everything else derives.
- `## Working here` (`CLAUDE.md:87`) — how to build, check and test.
- `## Adding a feature — the shape it takes` (`CLAUDE.md:111`) — eight steps, ending at
  `docs/FEATURE-MAP.md`. A feature that skips a step is not finished.
- `## Deployment` (`CLAUDE.md:159`) — static files only, one manual script, a shared box.

The patient entry budget is measured in `CLAUDE.md:28` and is **282.16 kB**. Compare a new figure
only against one taken the same way. If your change raises it, the convenience has been paid for by
the people this is built for, and that is a decision to bring to the founder rather than to make.

## What is decided and where the decision is written down

`docs/ROADMAP.md` carries the founder's decisions with their dates. The live one for the assistant is
`## Founder-requested — one GilbertOne, decided 19 September 2026` — five phases, the safety invariant
that **affect may never soften a refusal or an emergency**, and the fact that a truthful signed-in role
is blocked on the identity service, which is deliberately switched off. Read that section before
touching `apps/web/src/lib/gilbertone.ts`, `apps/web/src/features/GilbertAvatar.tsx` or anything
that renders an assistant.

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
verification has been done: the five entries over https, the six security headers, the `subjectAltName`
covering both the apex and `www`, and the co-tenant diff against the baseline.

**Do not widen scope during a deploy.** The identity service is off because there is no SMS provider,
its nginx `/api/` block stays commented out, and nobody can sign in. That is the intended state, not a
bug to fix. HSTS stays at `max-age=300`; raising it is a separate, deliberately deferred, irreversible
decision.

**Do not start a large build near the weekly credit cap.** Write the plan into `docs/ROADMAP.md`
instead, so the next session can pick it up cold.
