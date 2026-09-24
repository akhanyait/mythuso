# Admin Portal Scope — one office that controls every role's access to everything

> **A scope for the founder's decision, written 23 September 2026.** Asked for as: "scope me the full
> admin portal scope I want admin to fully control all roles access everything and make it dynamic."
> Nothing in this document is built by the writing of it. It is a scope: what the portal must do,
> what it must never do, what it reads rather than restates, and what must be decided before each
> part of it may exist. Every number, role name and refusal sentence in it is read from the
> contracts — where this document states one, it names the file it comes from.

## 1. What is being asked for, in one paragraph

One admin office that controls, at runtime, what every role in the system may reach — which
capabilities a role holds, which checks stand behind each capability, which API routes each caller
may call, which consent grants each recipient may receive, and which workspace each role opens —
without a deploy, without editing a contract by hand, and without ever letting the console be the
place the rules themselves are written. The rules stay in the contracts; the console becomes the
place they are applied, recorded and audited.

## 2. What exists today, and what the scope builds on

These are facts read from the tree, not proposals:

| What exists | Where | What it means for this scope |
|---|---|---|
| **15 vetted roles**, 23 capabilities, 7 gates, every refusal sentence | `packages/catalog/vetting.json` | The role/capability matrix already exists as data. The portal administers it; it does not invent it. |
| **6 web door roles** — patient, nurse, doctor, partner, Control Tower, back office | `apps/web/src/lib/roles.ts` | The door is one address with a role you pick. There is no authentication: `/app/?role=` opens any role, by design, in this preview. |
| **13 engine API files, 350 frozen route versions, callers per route** | `packages/catalog/apis/*.json`, frozen in `apis.lock`, `apis.callers.lock`, `apis.refusals.lock` | Who may call what is already written per route and frozen. Changing a route's callers is a versioned act, never a quiet edit. |
| **Consent grant recipients and gateways** | `packages/catalog/consent.json` | Consent is granted to roles, not to people. Operations, support and engineering are named as never grant recipients. |
| **The vetting console, the gate, the evidence vault, the audit chain** | `apps/web/src/features/Vetting.tsx`, `apps/api/src/vetting/`, `apps/api/src/protection/audit.ts` | An actor's standing is resolved from stored evidence on every read. Every vetting decision — enrolment, submission, verification, second reviewer, decline, suspension — is already an entry in a tamper-evident hash chain. |
| **The admin console with ten tabs** — Overview, Vetting, Operations, Clinical, Catalogue, Growth, Finance, Compliance, Governance, Configuration | `apps/web/src/features/Admin.tsx` | The surface exists. Its Vetting tab decides who may work; its Configuration tab reads runtime settings. What does not exist is a roles-and-access tab. |
| **Runtime settings that already change without a deploy** | `packages/engines/src/settings/` (read by the Configuration tab) | The precedent for "dynamic" exists: settings are data with a shape, not code. |
| **The identity service** — built, installed by every deploy, disabled | `apps/api/src/identity.ts`, `capabilities.json` `accounts: false` | There is no SMS provider, so nobody signs in. This is the single largest dependency of the portal; see §7. |

**What does not exist today:** any authentication of an admin session; any database of live
patients; any write path from the web console into a contract; any mechanism by which an admin
grant reaches an API route's frozen callers; any representation of an individual user (a person with
a name) behind a role — the register holds parties, not accounts.

## 3. The core principle this scope refuses to break

**The console applies rules; the contracts state them.**

Every sentence, number, role name, capability and refusal in this product lives in one place — a
contract under `packages/catalog/` — and everything else reads it. The boundary check fails the
build when two platforms drift or when a generated file goes stale. The admin portal is the biggest
temptation yet to break that: a console that edits a contract at runtime is a console that
invalidates generated Swift and Kotlin the moment it saves, and a console that shadows the contracts
with its own tables is a second source of truth that will disagree with the first.

So the scope is this: the portal edits **runtime state** — grants standing, suspension, expiry,
route enablement — and every piece of runtime state it edits records **which contract sentence
authorised the edit**. A capability granted through the portal cites the vetting contract's grant
entry. A route switched on cites the API contract's route version. Nothing is dynamic that has no
contract behind it.

## 4. The six things the portal controls

### 4.1 Role standing — who may work, per role, per person

The matrix already exists in `vetting.json`: 15 roles, each with its checks and the capabilities its
grants name, each grant with its own refusal sentence. The portal becomes the live surface of that
matrix:

- **Per party (not per role): standing.** Cleared, held at a gate, suspended, declined — the same
  `summarise()` the vetting console already computes, resolved from stored evidence on every read.
  The gate rules already written in the contract hold: a lapsed check holds the file at its gate;
  a suspension keeps every passed gate passed and offers nothing; a decline stays until a reviewer
  decides again.
- **Per grant: withdraw or restore, with a reason.** The contract's refusal sentences are what the
  portal says when it refuses. Withdrawing a nurse's `take-visit` is an audited act with a written
  reason, never a toggle with no memory.
- **The second-reviewer rule does not move.** Every high-risk check is decided by two reviewers,
  and the same name is refused both decisions. The portal cannot grant an exception, because the
  rule is the contract's, not a setting.

### 4.2 Capability grants — what each role may do

23 capabilities exist, each held by named roles, each behind checks. The portal shows the whole
matrix — roles down, capabilities across — and each cell says: granted by contract, standing of the
party behind it, or refused with the contract's own refusal sentence. The portal can **suppress** a
grant for a party (a suspension already does this) and can **re-instate** one whose gate has
cleared. It cannot create a capability that does not exist in the contract, and it cannot grant one
to a role the contract does not name — those are contract changes, which are versioned decisions
with dates and reasons, never runtime ones.

### 4.3 API route access — who may call what

350 route versions across 13 engine files, each with a `callers` array, frozen in
`apis.callers.lock`. The lock is append-only and compared against git history: a changed route is a
new version, and narrowing is recorded with `--record-narrowing`. The portal therefore **cannot**
edit callers at runtime without breaking the freeze — and it must not be able to.

What it can do, and what this scope asks for:

- **Show the whole matrix**: every route, its version, its status (built / proposed / gated), its
  callers, and its refusals — read from the contracts, never restated.
- **Enable or disable a route per deployment** — the runtime switch, distinct from the frozen
  contract. A route's callers say *who may ever call it*; the deployment state says *whether it is
  answering here*. The five gated clinical routes are the precedent: gated on a contract (a
  protocol register, an impact assessment) rather than on a flag, and dark until the contract's
  own conditions are met.
- **Never narrow or widen callers from the console.** That is a versioned contract change with a
  lock line, seeded through the documented workflow (`npm run apis -- --seed-new`), and it is a
  deliberate act by a named person, recorded in the contract's decision block.

### 4.4 Consent grant recipients — whose eyes a record may reach

`consent.json` grants records to roles, with gateways and lawful bases, and names Operations,
support and engineering as **never** grant recipients. The portal shows, per purpose, which roles
may receive which records, and — when a real grant system exists — administers per-party grant
standing the same way it administers vetting standing: from stored evidence, with the audit chain
recording every grant, withdrawal and expiry. What it refuses to do is invent a recipient the
contract does not name, or grant Operations a view of a record the contract bars them from forever.

### 4.5 Workspace and door configuration — what each role opens

The door's six web roles and their opening lines, the clinical workspaces, the bar's three pinned
roles — all read from contracts (`framing.json` for opening lines, `roles.ts` for the table). The
portal can configure **runtime presentation** — which roles appear in the bar, which tab a workspace
opens on — as settings with a shape, the way the Configuration tab already does. It cannot add a
role to the door that the vetting register does not carry.

### 4.6 The emergency pathway — what it never touches

`10177`, `112`, `10111`, the red flags, the escalation ladder, the emergency precedence in the
matcher, and since 23 September 2026 the spoken forms of the numbers: all contract data held to the
digits by the boundary check. The admin portal has **no control surface here at all**. An emergency
number is not a setting. This section exists in the scope to say that explicitly, because "control
everything" must never reach as far as a number somebody in danger dials.

## 5. What "dynamic" means, precisely

The founder asked for dynamic control. In this codebase, with its locks and contracts, dynamic has a
precise shape — four tiers, and the portal's reach ends at tier 3:

| Tier | What changes | Example | Who changes it | Recorded where |
|---|---|---|---|---|
| 1. **Contract** | A sentence, number, role, capability or refusal itself | A new capability; a new role; a changed refusal | A versioned decision with `decidedBy`, `on`, `why` — the founder or a delegated authority | The contract + its lock; git history |
| 2. **Generated state** | What the contracts compile into | `AssistantData.swift`, `VettingData.kt` | The generators (`npm run vetting`, `npm run apis`, …); nobody by hand | Generated files; the boundary check fails on drift |
| 3. **Runtime state** | Standing, enablement, suppression — applying the rules to a party or a deployment | Suspend a nurse; enable a route on staging; withdraw a grant with a reason | **The admin portal**, acting as a named, vetted, audited party | The append-only audit chain |
| 4. **Ephemeral state** | What a session is looking at | Sort order, filters, which tab is open | Anybody | Nowhere, and that is correct |

Everything the portal does is tier 3. It is dynamic in the sense that matters: a lapsed clearance
withdraws a capability **with nobody having to notice first**, because the gate resolves standing on
every read. It is not dynamic in the sense that would be dangerous: no runtime edit can change what
the contracts say, because the contracts are what every platform compiles from and what the locks
freeze.

## 6. The audit rule — the portal's own accountability

An office that controls every role's access is the highest-value target in the system and the
highest-risk surface. The scope's rule: **every portal act is an entry in the existing hash chain**,
with the actor, the act, the party or route affected, the reason, and the contract sentence that
authorised it. The chain already exists (`apps/api/src/protection/audit.ts`), already carries
vetting decisions and consent seals, already takes an allowlist of fields and throws on anything
outside it, and already names the first break if an entry is edited, deleted, re-ordered or forged.

Concretely: a grant withdrawn through the portal is `vetting.grant.withdrawn` with the refusing
sentence attached. A route enabled is `access.route.enabled` with the route's version. A reviewer
seeding act is the existing signed single-use authorisation, unchanged. And **the portal cannot
write to the chain it does not hold keys to** — the console is a client of the gate, never the gate
itself.

Two rules that come with the office:

- **Nobody administers their own access.** The admin role's own grants (`review-vetting`,
  `run-programme`, `view-billing`) are behind its own checks in the contract, with their refusal
  sentences. An admin who suspends themselves or lifts their own suspension is refused by the
  existing rule: nobody decides another party's vetting until their own is complete.
- **Break-glass is audited or it does not exist.** The gate's break-glass route is built and refuses
  to write anything. If the portal ever grows an emergency-access button, it is that route's
  audited shape or it is not built.

## 7. The dependency that decides the sequence: identity

There is no authentication today. The identity service is built and installed by every deploy and
disabled, because there is no SMS provider, and `capabilities.json` says so verbatim: `accounts` —
an SMS provider for one-time codes — not connected. Role switching authenticates nobody.

**An admin portal that controls real access cannot ship before authentication does.** A console
that decides who may see clinical records, reachable from a door that opens any role on a URL
parameter, is not an admin portal — it is the vulnerability. The scope's sequence is therefore:

1. **Authentication first** — the identity service, an SMS provider, real sessions. That is the
   existing identity contract's work, not new scope, and it needs the founder's provider decision.
2. **Then the access surface** — the roles-and-access tab on the existing admin console, reading
   the matrices, administering standing, writing to the audit chain.
3. **Then deployment-level enablement** — route switches per environment, on the gated-route
   pattern.

Until 1 exists, the portal scope can be **built against the preview's own honesty**: the same
in-memory fictional mode every console tab already uses, with the same sentence on its face that
approving a nurse approves nobody.

## 8. What is deliberately out of scope

- **Editing contracts from the console.** Never. Contracts are versioned decisions with dates,
  reasons and locks; a runtime editor is the one design that would let a rule change with no record
  of who changed it or why.
- **Touching the emergency pathway.** §4.6.
- **Creating roles or capabilities at runtime.** The 15 roles and 23 capabilities are the register's;
  adding one is a contract decision with the founder's (or a delegated authority's) name on it.
- **Patient-facing access.** A patient's own access to their own record is the consent contract's,
  not the admin office's. The portal administers workforce access and system access; it never
  administers a patient's own front door.
- **POPIA decisions made by the console.** The Information Officer's appointments, the DPIA's
  sign-offs, the data-residency and key-custody decisions — those are the governance packs' work,
  in `docs/governance/`, signed by the named people. The portal *shows* their state; it does not
  take them.

## 9. What the founder is being asked to decide

1. **The sequence in §7** — authentication before the access surface. The alternative is a portal
   that controls fictional access, which is what every console tab already is, and there is nothing
   wrong with shipping it that way first.
2. **Who the admin office is.** The register's `admin` role is "Internal admin staff" behind
   `review-vetting`, `run-programme` and `view-billing`. Whether the head of operations
   (`hold-operations-authority`) sits above the portal's decisions, or beside it, is an
   organisational decision the contract cannot make.
3. **Whether route enablement per deployment (§4.3) is wanted at all**, or whether the existing
   gated-route pattern — a contract condition, not a switch — is the only enablement this product
   should ever have. The pattern is more conservative than a switch, and the five gated clinical
   routes were built that way on purpose.
4. **The scope of the first build**, if the sequence is accepted: a read-only roles-and-access
   matrix on the admin console — every role, every capability, every route's callers, every grant
   recipient, all read from the contracts — so the office can see the whole rulebook in one place
   before it is given the pen.

---

*Verification for this document: every count in it was read from the tree on 23 September 2026 —
15 roles, 23 capabilities, 7 gates, 13 engine files, 350 route versions, 6 web door roles — and the
role, capability and caller names come from `vetting.json`, `roles.ts` and `apis.json` respectively.
It states no number the contracts do not carry.*
