# The demonstration override

> **A founder's decision to show a capability before the people who approve it exist. Not an approval, not
> a signature, and not a substitute for either once MyThuso goes live.** The record is
> `packages/catalog/demonstration-override.json`; this page explains it, and where the two differ the
> contract is right.

## The decision

On 2 October 2026 the founder wrote, verbatim:

> yes we can put as many knowledge sources but they will be attached to the information officer, founder for
> approval for demonstration purposes switch them on to show capability. But make a note that indicates this.
> In fact everywhere where you have switched off because of officer switch on and put a disclaimer. So that
> when we fully go live we then put those strict rules in place.

## How it works

One file, one switch, one list. `demonstration-override.json` carries `inForce: true`, the founder's words,
the disclaimer, the go-live rule, and the gates it opens. A gate it opens is never deleted: the code for each
asks for **its own signatures or the override** — `signed || overrideOpens(gate)` — so the strict rule is
still the code, and the override only waits beside it.

Every place the override opens shows this sentence, word for word, read from the contract:

> Switched on for demonstration by the founder on 2 October 2026. Not yet approved by an Information Officer
> or a clinical reviewer. Do not enter real personal or health information.

What it stands in for, and what it cannot:

| Stands in for | On | Never on |
| --- | --- | --- |
| **Information Officer** | That a licence's conditions are met, that the POPIA s72 position for where a source is hosted is recorded, that no patient identifier rides a lookup | A decision only the officer can author: a retention period (D-8), the breach procedure (D-4), who may consent for somebody else (D-10), whether a face is biometric (D-3) |
| **Clinical reviewer** | That a source is a named authority fit for its recorded use, reading true in South Africa | A ratified clinical protocol, a Medical Director's decision, the clinical governance board's |

## What it opens

| Gate | Stands in for | State | Does it answer? |
| --- | --- | --- | --- |
| openFDA (drug labels) | clinical reviewer, Information Officer | on | Yes — keyless; searched by generic or brand name; never a dose (the dosage section is not carried) |
| Europe PMC | clinical reviewer, Information Officer | on | Yes — keyless; an abstract's opening only for CC BY or CC0 articles, otherwise title and identifier |
| MedlinePlus | clinical reviewer, Information Officer | on | Yes — new keyless adapter; health topics only, never A.D.A.M. or ASHP text; "Source: MedlinePlus, National Library of Medicine" |
| CDC Content Services | clinical reviewer, Information Officer | on | Yes — new keyless adapter; CDC's own items on cdc.gov only, carried unchanged, with CDC's non-endorsement line |
| Wikidata | clinical reviewer, Information Officer | on | Yes — new keyless adapter; isiZulu, isiXhosa, Afrikaans and Sesotho labels and cross-references, marked unreviewed |
| WHO ICD-11 | clinical reviewer, Information Officer | waiting for credentials | Not yet — the adapter exists and needs a free WHO ICD API client (`ICD11_CLIENT_ID`, `ICD11_CLIENT_SECRET` on the box) |
| SNOMED CT (SA national licence) | clinical reviewer, Information Officer | waiting for credentials | Not yet — needs registration with the SA National Release Centre and a release held locally; no adapter until then |
| LOINC | clinical reviewer, Information Officer | waiting for credentials | Not yet — needs a free LOINC account; no adapter until then |
| Photo reading (`skin-check.json#photoReading`) | the four things it waits on | opened | Yes, on the web only, since 2 October 2026 — once deployed and the assistant service restarted. `GET` and `POST /assistant/v1/photo-reading` ask `signed \|\| overrideOpens('photo-reading')` and the model tier; when she asks, one smaller still (a photo, or one frame of a clip — never the clip or its sound) goes to Azure OpenAI in South Africa North, which may only suggest the skin check's own option ids; she confirms them, and the skin check's rules decide. The disclaimer and the processor are shown above the button; nothing is stored or logged. The phones are not opened |

The sources answer through one road: the `reference_sources` tool the orchestrator's model tier may call, the
only importer of the federation. Only topic words leave the box, through the same `redactPHI` as every model
call. An answer that drew on it ends with the disclaimer, appended by the code rather than asked of the model.

Where it is shown: Governance · Knowledge sources (the override's own record, then every source), GilbertOne ·
Knowledge, the API Registry's *External knowledge sources* card (status `demonstration`), and the assistant's
answer itself. The web assistant's consent gate says external sources are switched on for demonstration.

## What it does not open, and why

| Not opened | Why |
| --- | --- |
| The Health Passport (`apps/passport`, G14) | Keeps health information; CLAUDE.md's founder amendment keeps its gating unchanged; nothing in `deploy/` may name it |
| The identity service in production | Stands up a store of real people's accounts; also waits on DNS, TLS and an SMS provider |
| Clinical records | Health information kept |
| Speech providers with no South African region (G33) | Would send a patient's voice offshore from production; the founder's speech amendment of 21 September keeps conversation audio on the device, with Azure Speech (SA region) as the only server-side fallback |
| Face match at shift start (D-3) | The officer's decision, not a signature; no provider contracted |
| A guardian agreeing for somebody else (D-10) | The officer's decision; would accept consent on another's behalf with nothing to prove the right |
| The hospital compliance pack | The pack *is* the officer's decisions; a pack without them would carry invented answers |
| An offboarding marked complete | A "purged" a regulator relies on, waiting on a retention schedule and a DPA |
| A crime-statistics layer | Waits on a source agreement, an owned station-to-zone mapping and a DPIA besides the officer; no supplier exists |
| Triage | Waits on a Medical Director and the clinical governance board, not the officer |
| Gilbert's emergency terms | Changed only by a versioned edit under CLAUDE.md's rule |
| NDoH STGs/EML, SAHPRA, Western Cape, IFRC, SA Red Cross, St John | Their licences need the owner's written permission. **The licence, not the officer, keeps them off** |
| Every publisher assessed and turned away | Non-commercial, all rights reserved or out of scope. The licence keeps them off |
| A pasted link | Not assessed until its licence is read and recorded; not assessed never opens |
| Consent expiries, the suppression floor, record settings | Nothing is switched off: they run on proposed defaults that say they await the officer |

## Going live

1. Set `"inForce": false` in `packages/catalog/demonstration-override.json`, in one reviewed commit.
2. Every gate above closes at once: each source reads dark again and the disclaimer disappears with it. The
   build then asks for one more line in the same commit — the API Registry's *External knowledge sources*
   card back to `"statusToday": "dark"` — because the card says what the sources do; and its own proof, that
   with `inForce` false nothing answers, keeps holding.
3. Each gate then opens only the signed way: both signatures recorded by appointed people in
   `federation.json`, the permission on file where the verdict asks for it, and the source's own `active`
   flag moved in a reviewed commit.

## Making the assistant-side change live

`apps/assistant-api` is live in production, and a deploy does not restart it. The override reaches the
assistant only when the founder runs `./deploy/deploy.sh` from a clean worktree, restarts the assistant service
by hand (`deploy/RUNBOOK.md`), and reads `/assistant/health`. For ICD-11 to answer as well, register a WHO ICD
API client and set its id and secret in the service's environment file before the restart.

## Where it is checked

`scripts/demonstration-override.mjs` holds the rules, shared by `scripts/check-boundaries.mjs` and
`scripts/knowledge-federation.test.ts`: the override opens only what it lists, only under a licence that
permits a commercial service's use without written permission, never a publisher turned away and never
anything it records as not opened; it never moves a source's flag or a signature; with `inForce` false nothing
answers. The boundary check also holds that every file the contract names as rendering the override shows its
disclaimer, that every gate asked for by name in code is listed, that the Passport, the identity service, the
mock and `deploy/` never name it, that each adapter asks `isSourceActive(config, deps.override)` and
`outgoingTerm()` before it fetches, and that the orchestrator closes an answer that used the reference tool
with the disclaimer.
