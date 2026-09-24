# Device trust model — what it answers, and what it does not

Companion to `docs/security/THREAT-MODEL.md` and `docs/security/ADVERSARY-REGISTER.md`. Those two
files are the register; this one reads `packages/catalog/devices/trust-model.json` (and the two
files it sits beside, `packages/catalog/devices/pairing-paths.json` and
`packages/catalog/devices/health-indicators.json`) against the register's "compromised device" and
"spoofed device" rows and says plainly how far the design closes each gap and how far it does not.

**Nothing described here is built.** `trust-model.json`'s own `builtToday` field says so first, in
the adversary register's own words: no device holds a credential, no route checks one, no deny-list
or quarantine exists anywhere in the tree. This document explains a design, not a control.

## What the register says is missing

The register's closing paragraph names the single thing both rows terminate on:

> The single row most worth a human decision before any device work starts is **compromised device**
> and **spoofed device** together: both terminate on the same missing primitive, a per-device
> credential (`docs/governance/DPIA-DRAFT.md` §9, "Device binding"), and nothing else in this register
> — not the gate, not the audit chain, not the allowlist as currently specified — can answer either
> adversary until that credential exists.

Everything below is read against that sentence.

## Compromised device

**Register's today-answer:** "No route accepts a device-originated write carrying its own
credential. The only path a reading takes into the system is through a *capturer* — a vetted nurse
or patient — using their own standing, via `POST /v1/devices/readings@2`; the device itself proves
nothing and holds no key."

**What `trust-model.json` adds:** a design for the missing credential (`credentialDesign`), issued
only after `pairing-paths.json`'s possession-proof step completes for that device's transport, with
two candidate forms — a per-device X.509 certificate or a per-device symmetric key — named but not
chosen between. It also names the refusal a future route would need
(`device-credential-mismatch`) without adding it to `packages/catalog/apis/devices.json`, because
writing that refusal into the real routes contract is separate, sequenced work this pass does not
do.

**What it does not close:** the register's status column for this row stays exactly where it was —
`not-yet-started`. A design document is not a credential. Nothing in `trust-model.json` changes what
a route accepts today, and the file says so in its own `builtToday` field rather than leaving that
to be inferred.

## Spoofed device

**Register's today-answer:** "A device is registered by an operator typing a serial number and a
class... into `POST /v1/devices/registry@2`. Nothing about that registration is cryptographically
tied to a real instrument... So today, 'spoofing' a certified device costs nothing more than an
operator... typing the wrong class into a form."

**What `trust-model.json` adds:** the same credential design as above answers this row too, since
both adversaries terminate on the identical missing primitive — a cryptographic identity checked on
every reading, rather than a label trusted from the registry row. `pairing-paths.json`'s possession-
proof requirement is the other half: a credential issued without first proving somebody held the
physical device would only move the spoofing problem from "typing a class into a form" to "typing a
class into a form and then also completing a pairing flow with no proof behind it," which is not a
meaningfully harder forgery. The two files are designed to be read as one sequence for exactly this
reason.

**What it does not close:** same as above — `not-yet-started` remains the honest status. The
allowlist concept already exists in `packages/catalog/devices.json` (`deviceClasses`); the
cryptographic verification that would make it resist spoofing still does not exist anywhere,
including in this design, which only says what that verification would need to check, not how to
build it.

## What this design does answer today, honestly, without needing to be built

One thing in `trust-model.json` is not a proposal: the `hardRule` section
(`consumer-tier-never-auto-creates-an-incident`) documents a control that is **already true**,
structurally, in the codebase as it stands — `packages/catalog/devices.json`'s `clinicalWeight`
already ensures a consumer-tier reading never carries clinical weight and is never published on
`reading.ingested@1`, whose subscribers (`packages/catalog/events.json`: `safety`, `clinical`,
`core`) are exactly the engines a dispatch mechanism would be built from. A reading that never
reaches the bus never reaches them. This is not one of the two adversary rows above — it is a
separate, already-closed question the design had to be careful not to accidentally reopen while
proposing a credential and a deny-list, and the file states explicitly that nothing it proposes may
create a second path around it.

## What remains open

- **Which credential form** (certificate or symmetric key) is not decided, and `trust-model.json`
  names no owner for that decision.
- **The revocation-latency SLO** for a future deny-list is left with no number at all — not even a
  proposed one with a `decidedBy: null`, unlike `packages/catalog/devices.json`'s three existing
  settings — because no gateway exists yet for a latency figure to describe the enforcement of.
- **The lost-kit-to-decommission linkage** the adversary register's "Lost field device" row already
  names as the cheapest gap to close is specified in `trust-model.json`'s `unpairAndDecommission`
  section, but specifying it is not wiring it up; `POST /v1/devices/kits/{kitRef}/loss@2` still does
  nothing to any device's registration today.
- **Replayed reading** is only partly touched by this design. A credential answers "is this really
  device X," not "is this the reading device X took a moment ago or one it took yesterday, replayed."
  That needs a nonce or sequence check this design does not add, and the register's own row already
  says as much.
- **Firmware and OTA trust** stay out of scope here exactly as `docs/security/THREAT-MODEL.md`
  already scopes them out of Module 10 entirely — a compromised firmware image is a different
  problem from a compromised credential, and this document does not blur the two.

## A note on the source plan

The founder's tracked plan document, `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`, does not contain
the granular device-pairing detail (transport layers, physical-possession proof, a numbered device
lifecycle section, or the phrase "Modules 12–15") that this workstream's brief described. Its only
device-fleet section, §3 ("IoT control in the Control Tower"), is four short paragraphs naming
telemetry thresholds, an MQTT/device-gateway, admin-scoped device classes, and the consumer-device
advisory disclosure `trust-model.json`'s `consumerDisclosure` section quotes directly. The
`pairing-paths.json`, `health-indicators.json` and `trust-model.json` contracts this document reads
are therefore original design work built to be consistent with §3's intent and with the adversary
register's own findings, not a transcription of a plan section that exists in this tree. Anyone
picking this work up should raise that gap with the founder rather than assume a later, more detailed
version of the plan was simply not found.
