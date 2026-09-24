# Threat model — device fleet and multi-tenant GilbertOne

Phase 0 of Module 10 in the founder-supplied "Control Tower & GilbertOne Commercialization" plan
(`docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`): "Threat Model & Adversary Register. A living
document and a test suite." This file and `docs/security/ADVERSARY-REGISTER.md` are the document
half. The test suite — boundary checks proving each adversary's control fires, one file at a time —
is separate, sequenced work and is not written here.

**This is documentation, not a claim that a control exists.** Where a row below says "not built,"
nothing in `apps/api`, `packages/engines` or the native apps answers that adversary today, and this
document does not change that. Writing the threat down is not writing the control.

## What is in scope

Two pieces of work Module 10 sits ahead of, neither of which is built:

1. **The device fleet** — a Thuso Kit certified instrument, a patient's own consumer device, or a
   ward/bed device under the Control Tower's proposed IoT control (`docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`
   §3), reporting a reading that may or may not carry clinical weight. The contract for this already
   exists — `packages/catalog/devices.json`, `packages/catalog/apis/devices.json`,
   `packages/catalog/devices/simulator-presets.json` — and is read by a development engine runtime
   (`packages/engines/src/devices`). No device is contacted by any of it.
2. **Multi-tenant GilbertOne** — one deployment serving several hospitals, each with its own scoped
   API key and its own isolated read (`docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md` §2, "New engine
   modules for commercialization" items 1 and 5). No tenant-key artifact exists yet; the founder's
   note names `gilbertone-api-keys.json` and `gilbertone-api-versioning.json`, and neither file is in
   the tree on 23 September 2026.

The ten adversaries in `ADVERSARY-REGISTER.md` are drawn against these two pieces of future work,
read against what is actually built today: the identity service's access gate, audit chain and
envelope encryption in `apps/api/src/protection/`, the vetting register in
`packages/catalog/vetting.json`, and the consent gateway in `apps/passport`. That existing
machinery is what any device or tenant control would extend, not something Module 10 invents from
nothing — and the register says, adversary by adversary, how far that extension already reaches and
how far it does not.

### Added 24 September 2026: founder access

Not device or tenant work, but the first thing on the assistant service that authenticates anybody:
a sign-in for the founder and a guarded reveal of the two Azure keys the service holds
(`packages/catalog/founder-access.json`, `docs/governance/FOUNDER-ACCESS.md`). It changes three rows
of the register — the external attacker (a new reachable surface, dark until switched on by hand),
the curious admin (a key path that answers to no portal role) and the compromised tenant key (a
two-name allowlist that refuses any key a tenant might one day hold) — and each row says what is
built. Its controls are proved by `scripts/check-boundaries.mjs` (the Founder access block) and by
`apps/assistant-api/src/founder-access.test.ts`, which is the first piece of this register's
"test suite" half to exist for any row.

## What is out of scope for this pass

**Firmware and over-the-air update integrity are explicitly deferred.** The founder's plan places
firmware/OTA as a separate, future module, not part of Module 10's threat model. No adversary below
concerns a compromised firmware image, a malicious OTA payload, or a device's boot chain. When that
module is scoped, it gets its own threat-model addendum rather than a row bolted onto this one —
firmware trust and telemetry trust are different problems with different controls (code signing and
attestation versus request authentication and replay detection), and folding one into the other's
register would blur both.

Also out of scope here: the self-learning/model-registry threat surface for multi-tenant GilbertOne
(prompt injection into the retrieval layer, a compromised knowledge-federation source) —
`docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md` §2 scopes that work separately, and
`packages/catalog/knowledge/federation.json` ships every source `"active": false` today, so there is
nothing live to model an attacker against yet.

## Reading the register

`docs/security/ADVERSARY-REGISTER.md` has one row per adversary. Three columns matter:

- **What they can do today** — read against what is actually built, not what the device or tenant
  work will eventually be. For most rows this is "nothing," stated plainly, because the thing they
  would attack does not exist yet: no device is contacted, no Bluetooth permission is declared in
  either native app, no tenant key has ever been minted. Where an adjacent, already-built mechanism
  changes the honest answer — the capture module's idempotency and replay detection in
  `apps/api/src/capture/index.ts`, for instance, which exists for a nurse's offline queue and not
  yet for device telemetry — the row says so rather than treating the adjacent control as covering a
  surface it was not built for.
- **The control that answers them** — named against the device-pairing/trust module this plan scopes
  but has not started, or against the specific gap the DPIA already records
  (`docs/governance/DPIA-DRAFT.md` §9, "Security measures not yet built" — device binding is an
  explicit line there, blocked on "a key per device").
- **Status** — `built`, `proposed`, or `not-yet-started`, the same three words
  `docs/PRIVACY-AND-SECURITY.md` uses, and for the same reason: a control that exists only in a
  document is not a control anybody has.

## Living document

This is revisited as each device module actually lands, not written once and left. The specific
triggers:

- **The real-device allowlist moves off zero.** `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md`
  records it at 0 devices today. The day a first certified instrument is registered against a real
  key rather than an operator-typed serial, the "compromised device," "spoofed device" and "replayed
  reading" rows stop being able to say "nothing to attack" and need their control column checked
  against what actually shipped.
- **The devices engine moves off `packages/engines`.** The engine runtime the devices contract runs
  on today is a development simulator (`packages/engines/src/runtime`, a simulated clock, an
  in-process bus) that does not import `apps/api/src/protection` at all. The day device routes are
  served by something that does go through the gate — or through a purpose-built device gateway —
  the "curious admin" and "external attacker" rows need re-reading against the real enforcement
  point, not the dev one.
- **A tenant-key artifact is authored.** The "compromised tenant key" row currently says there is no
  key to compromise. The day `gilbertone-api-keys.json` (or whatever it is actually named) lands,
  that row's "not-yet-started" becomes a real design to check.
- **The Passport's own missing controls close.** Several answers here inherit their residual risk
  from `docs/governance/DPIA-DRAFT.md` §9 — OIDC/mutual TLS in front of the Passport gateway, KMS/HSM
  key custody, anchoring the audit chain head outside MyThuso's own control. None of those is device
  work, but every device or tenant control that will eventually sit in front of the Passport inherits
  whatever is still missing there on the day it ships.
- **The boundary-check test suite lands.** When the sequenced work that proves each row's control
  fires is written, this document is the thing it is written against — a test that passes against a
  row still marked `not-yet-started` is a test proving the wrong thing, and either the row or the test
  is wrong.

Nothing in this document authorises building the device-pairing/trust module, the tenant-key
artifact, or the boundary-check tests. It is the register those, when built, are checked against.
