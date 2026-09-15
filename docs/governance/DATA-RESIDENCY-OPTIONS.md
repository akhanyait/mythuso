# Data residency — options for a decision

> **Draft prepared for review. Not a signed decision and not legal advice. It has no effect until
> the named person signs.**
>
> Prepared on 15 September 2026 by the Governance documentation lead (Wave 3), from the repository
> as it stood at commit `3294e1a`. Nothing here has been decided. Where a question needs a legal
> judgement it is asked, not answered.

## Who decides, and what this paper is for

**Who decides:** the responsible party. MyThuso's own planning documents name MyThuso as the POPIA
responsible party (see the Master Blueprint v4, Part H). In practice that is the founder, advised by
the Information Officer once one is registered and by South African counsel.

**What this paper is for:** it sets out where information would live, what the planning documents
and the contracts already expect, three kinds of hosting arrangement with their trade-offs, and
what has to be true whichever one is chosen. The decision block at the end is blank on purpose.

**Why it comes first:** the DPIA (`DPIA-DRAFT.md`) cannot describe the risks of cross-border
transfer, operator access or backups until this is decided, and the key custody decision
(`KEY-CUSTODY-OPTIONS.md`) depends on which key services exist wherever the data lives.

## 1. Where information lives today

| What | Where it is today | Evidence |
|---|---|---|
| The public page, the app preview and the status page | Static files on the shared VPS `liqzar-server`, served by nginx under `mythuso.co.za` | `deploy/README.md` "What is deployed" |
| Anything a person types into the preview | The browser tab's memory only. It is gone on reload | `CLAUDE.md` (no `localStorage`, `sessionStorage` or `indexedDB`), enforced at the top of `scripts/check-boundaries.mjs` |
| The identity service (`apps/api`): mobile numbers, names, second-factor secrets, consent decisions, vetting evidence | **Nowhere.** The service unit is installed on the VPS and switched off, and its nginx block is commented out | `deploy/README.md` "The identity service is not turned on"; `deploy/RUNBOOK.md` "What this runbook does not do" |
| The Health Passport P0 (`apps/passport`): the only store built to hold health records | **Nowhere.** It runs only on a developer's machine, on the loopback, with synthetic data, and the build fails if anything under `deploy/` names it | `apps/passport/src/config.ts`; `packages/catalog/passport-gateway.json` `_whyDevelopmentOnly`; the HEALTH PASSPORT P0 block of `scripts/check-boundaries.mjs` |
| Health information of any kind | **None on any server.** None is collected | `deploy/RUNBOOK.md` "What the site does, and what it does not, on day one" |
| Backups | Written for the identity database only, which does not exist yet. When enabled they sit on the same disk as the database, unencrypted, readable only by root | `deploy/README.md` "The backups, and what they are not" |

So the residency question is not yet about moving anything. It is about where information will be
allowed to go the first time a real person's details, and later their health record, are held.

## 2. Why the shared VPS is unsuitable for health information

`liqzar-server` also serves five unrelated production sites (agcafrica.com, artisanza.co.za,
bidza.co.za, liqzar.co.za and skillsonwheels.co.za), a PostgreSQL server, two other Node applications
and another project's scheduled jobs (`deploy/README.md`, "The five sites this box also serves" and
"What this host already runs"). The deploy script is careful to protect those sites *from MyThuso*.
Nothing can protect MyThuso's information *from that machine*:

1. **Root is shared with other sites.** Whoever has root on the box administers all six sites. File
   permissions such as `0600 root:root` on `/etc/mythuso/api.env` keep out other ordinary accounts,
   not root. The repository cannot tell how many people hold root there; the decision-maker should
   find out and record it.
2. **Keys and data would be on the same machine.** The identity service's keys are designed to sit
   in `/etc/mythuso/api.env` beside the database they protect (`deploy/README.md`, step 5 of turning
   the service on). Anyone who can read one can read the other.
3. **Split custody cannot be real on one box.** `docs/PRIVACY-AND-SECURITY.md` (the HSM/KMS row and
   "The nine rows that changed") records that splitting a key into shares was considered and
   rejected on a single machine, because one process on one machine run by one administrator would
   read every share.
4. **Nothing logs who read the key file.** `docs/DATA-PROTECTION.md`, "What is not built".
5. **Backups share the disk.** They protect against corruption, not against losing or compromising
   the server (`deploy/README.md`).
6. **Another tenant's compromise becomes MyThuso's.** A vulnerability in any of the other
   applications that yields root, or a mistake by an administrator working on another site, would
   reach MyThuso's files. That risk is acceptable for a public preview holding nothing. It is not
   acceptable for special personal information under POPIA section 26.

**Recommendation for the decision-maker to accept or reject:** no health information, and no
production identity data, is placed on `liqzar-server`. The preview may stay there.

## 3. What the planning documents and contracts already expect

The documents are confidential and are cited by section only.

| Source | What it expects, in summary |
|---|---|
| MyThuso Full Scope v1.0, Engine 7 (Record) | A POPIA programme including South African hosting before launch, and Passport P0 as a separate service with its own keys and a signed DPIA before the first visit |
| MyThuso Full Scope v1.0, §6 (Clinical governance and regulatory workstream) | A POPIA programme and DPIA, with the Information Officer registered, in the first months |
| MyThuso Master Blueprint v4, Part C (Engine 7) and Part F (Data row) | South African hosting, encryption and role-based access as the stated position |
| MyThuso Master Blueprint v4, Part H, gap 6 | Hosting and data residency listed as an open gap with an owner |
| ThusoIQ Master v3.5, §22 (Health Passport security controls) | A data residency position for primary storage, backups and disaster recovery, and no cross-border transfer without a section 72 basis |
| ThusoIQ Master v3.5, §25 (Governance, retention and legal) | Cross-border handling and prior authorisation where required |
| `docs/PRIVACY-AND-SECURITY.md`, "Residence/transfers" | Prefer South African regions as a project choice; assess every operator and cross-border transfer under section 72. It also states that POPIA is not a blanket South-Africa-only hosting rule |
| `packages/catalog/feeds.json`, each feed's `operator.section72` | Eleven suppliers, each of which becomes an operator under section 21 on signature; the section 72 question is recorded as not determined for every one, and a boundary check refuses any of them claiming otherwise |
| `packages/catalog/open-source.json` | Nothing is adopted. No third-party module, model or speech provider processes anything today |

So a South African location is the documents' stated position. Whether it is a legal requirement
for each kind of information is a question for counsel, not something this paper decides.

## 4. The options

No prices are given: none has been quoted, and a figure invented here would be treated as real.
Cost is described only as a class relative to the other options.

### Option A — a South African region of a major cloud provider

Several large cloud providers advertise a South African region. Confirm at decision time which
services are actually offered *in that region*, in particular managed key services and HSMs, managed
databases, backup storage and logging.

| Consideration | Assessment for the decision-maker to test |
|---|---|
| POPIA section 72 | Primary data can stay in South Africa. **Questions remain:** does the provider's support staff access data from outside South Africa? Where do backups, snapshots, logs, telemetry and disaster-recovery copies go by default? Does any managed service (key service, monitoring, email, AI) run from another region? Each of those is a possible transfer needing an assessment |
| Operator agreement (section 21) | The provider's standard data-processing terms. Whether they meet section 21 is for counsel |
| Latency for users in South Africa | Generally low, because the data is in-country. Measure from Johannesburg and from a rural mobile network before relying on it |
| Cost class | Medium to high, and variable with use. Managed HSMs are usually the most expensive line |
| Operational burden | Lower for patching, hardware and backups; higher for learning the provider's identity and access controls, which are where most cloud breaches start |
| Key custody fit | Best fit for a managed key service, if one exists in-region (see `KEY-CUSTODY-OPTIONS.md`) |
| Separation | A dedicated account or tenant for MyThuso, with no other Akhanya project in it |

### Option B — a South African hosting provider (colocation, dedicated or virtual servers)

| Consideration | Assessment for the decision-maker to test |
|---|---|
| POPIA section 72 | Usually the simplest: the provider, its staff and its data centres are in South Africa. **Questions remain:** where its off-site backups go, and whether any management tooling is hosted abroad |
| Operator agreement (section 21) | Often negotiated directly, which can make section 21 terms easier to get right, or harder if the provider has no standard terms |
| Latency | Low within South Africa |
| Cost class | Low to medium, and more predictable |
| Operational burden | Higher. MyThuso would run its own patching, database backups, monitoring and possibly key storage. There is no operator organisation yet (`docs/PRIVACY-AND-SECURITY.md`, "The one decision nobody reviews") |
| Key custody fit | No managed key service is likely. Custody would be an HSM MyThuso owns or rents, or a documented ceremony (see `KEY-CUSTODY-OPTIONS.md`) |
| Separation | A dedicated server or dedicated virtual machine with MyThuso-only root access |

### Option C — a dedicated host for MyThuso alone, in South Africa

This could be a dedicated machine at a South African provider or an on-premises server. It differs
from Option B mainly in that MyThuso controls the whole machine and nobody else's workload is on it.

| Consideration | Assessment for the decision-maker to test |
|---|---|
| POPIA section 72 | Simplest to reason about, if backups also stay in South Africa |
| Operator agreement (section 21) | Needed with the facility or provider; none if fully on-premises, but then physical security is MyThuso's own |
| Latency | Low within South Africa; resilience depends on one site unless a second is paid for |
| Cost class | Medium upfront; low running cost for hardware; high cost in people's time |
| Operational burden | Highest. Hardware failure, power and connectivity are MyThuso's problem. The Blueprint lists power and connectivity resilience as an open gap (Master Blueprint v4, Part H, gap 11) |
| Key custody fit | Can hold an HSM physically. A real split-knowledge ceremony becomes possible when shares are held by different people off the machine |
| Separation | Complete, by construction |

### What none of the options changes

- The Passport and the identity service stay separate, with their own databases and their own keys.
  `apps/passport/src/config.ts` already refuses to start if the Passport's key equals or is obviously
  derived from the identity service's, or if it would share the identity database.
- `scripts/check-boundaries.mjs` still fails the build if anything under `deploy/` names the Passport.
  `docs/PRIVACY-AND-SECURITY.md` ("Health Passport P0, and why it does not deploy") says that check is
  to be changed deliberately, in the same commit that records the signed DPIA.
- The preview can stay on `liqzar-server`, because it holds nothing.

## 5. What must be true whichever option is chosen

These are the conditions this paper proposes. The decision-maker may add to them.

| # | Condition | Why | How it would be checked |
|---|---|---|---|
| R1 | **Separation from co-tenant sites.** No other project's workload, and no root or administrator account shared with any other site | Section 2 above | A named list of everyone with administrator access, kept with the decision |
| R2 | **Encryption at rest** for databases, disks and backups, with keys held as decided in `KEY-CUSTODY-OPTIONS.md` | Health information is special personal information; the application-level sealing already built (`apps/api/src/protection/crypto.ts`, `apps/passport/src/keys.ts`) is a second layer, not a substitute | Provider configuration evidence, plus a restore test |
| R3 | **Backups in-region, encrypted, and off the primary machine**, restored and checked on a schedule | Today's backups are unencrypted and on the same disk (`deploy/README.md`) | A restore log, as the identity backup already keeps |
| R4 | **Access logging** for administrator logins, key use and reads of key material, kept where an application administrator cannot edit it | `docs/DATA-PROTECTION.md` "What is not built" (no logging of reads of the key file) | Sample log entries reviewed by the Information Officer |
| R5 | **A section 21 operator agreement** with every hosting, backup and support provider | POPIA section 21 | Signed agreements on file |
| R6 | **A section 72 assessment** for any copy, log, support access or disaster-recovery arrangement outside South Africa | `packages/catalog/feeds.json` records every such question as undetermined | The assessment, beside the contract it concerns, never as a flag in a catalogue file |
| R7 | **TLS in front of every service, and the services themselves on the loopback** | `apps/api` does not terminate TLS by design (`docs/PRIVACY-AND-SECURITY.md`, "TLS itself") | The deploy verification |
| R8 | **The audit chain head published somewhere the operator does not control** | Without it an operator holding the database and the key can rewrite history undetected (`docs/PRIVACY-AND-SECURITY.md`, "Publishing the chain head") | An agreement with a second organisation, and a witness statement round-trip (`apps/api/src/protection/witness.ts`) |

## 6. Questions only the decision-maker, the Information Officer or counsel can answer

1. Is South African hosting a legal requirement for each category of information MyThuso will hold,
   or a project choice? (Counsel.)
2. For the chosen provider, which copies, logs and support access leave South Africa, and what basis
   under section 72 covers each? (Information Officer and counsel.)
3. Does any intended processing need prior authorisation under POPIA section 57 because of a
   cross-border transfer of special personal information? (Information Officer and counsel; see
   `INFORMATION-OFFICER.md`.)
4. Where does disaster recovery live, and is a second South African location required? (Founder.)
5. Who will hold administrator access, and how many people is that? (Founder.)
6. Does the preview stay on `liqzar-server` once real services run elsewhere? (Founder.)

## 7. Decision

> Leave blank until decided. Filling this in does not change the code. The boundary check that
> keeps the Passport out of `deploy/` changes only in a commit that cites this signed decision and
> the signed DPIA.

| Field | Entry |
|---|---|
| Option chosen (A, B, C or other) | |
| Provider and region or facility | |
| Where backups are held | |
| Where disaster recovery is held | |
| Conditions R1–R8 accepted, amended or added to | |
| Cross-border transfers identified, and the section 72 basis for each | |
| Prior authorisation needed? (yes / no / not determined), and why | |
| People with administrator access (roles, not passwords) | |
| Decided by (name and role for the responsible party) | |
| Information Officer consulted (name) | |
| Counsel consulted (name and firm) | |
| Signature | |
| Date | |
