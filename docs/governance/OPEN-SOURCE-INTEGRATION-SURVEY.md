# Open-source integration survey

**Status:** research, 1 October 2026. Nothing below is adopted, installed, connected or proposed
into production. This document changes no code, no contract, no lock file, no generator, no test and
no deploy file. It is one new markdown file and it proposes nothing.

**Written for:** the founder, in answer to "please check if there are open source platforms out there
that we can integrate to on mythuso, iot apis open source and any other medical open source we can
use."

---

## What this document is, and what it is not

This repository already has an open-source register. `packages/catalog/open-source.json` holds 34
components — 11 open-source modules (`open-wearables`, `fhir-mcp-server`, `healthstack`, `notetaker`,
`fhirboard`, `diagnostipy`, `hapi-fhir`, `openhim`, `nextgen-connect`, `openmrs`, `openemr`),
2 reference catalogues (`awesome-health`, `lab-and-phr-components`), 10 standards, 4 commercial
providers, 4 open-weights speech models and 3 declined vendors — each with a licence
somebody read from the primary source on 14 September 2026, the engine and routes it would plug into,
what blocks it and what it must never do. `docs/OPEN-SOURCE.md` is generated from it, the status page
renders it, and the open-source register block of `scripts/check-boundaries.mjs` holds it to nine
rules. **Nothing in that register is adopted.** No manifest in this repository declares any of it.

So this is not a first survey. It is a second one, written five weeks later, and its job is narrower
and more useful than a catalogue:

- **What has changed since 14 September 2026**, where a licence moved, a project was archived, or a
  fact this repository was blocked on became available. Three findings of that kind are in this
  document and each one is worth the founder's attention on its own.
- **What the register does not cover yet** — the categories the founder named (IoT device APIs, the
  claims and health-information-management platforms, the terminology licensing position in South
  Africa) that §15D of ThusoIQ Master v3.5 did not name and therefore did not get surveyed.
- **What is already decided and must not be re-litigated.** The founder's speech amendment of
  21 September 2026 in `CLAUDE.md` is settled: all audio on-device, Porcupine wake word, Silero VAD,
  faster-whisper STT, Piper TTS, cloud voice APIs prohibited for the on-device conversation mode.
  Section 4 of this document surveys that stack's *licence position*, which is an engineering fact
  that changed, and does not question the architecture.

**What it is not.** It is not a register entry. The register has a shape — a `source` object with
`url`, `repository`, `licence`, `licenceUrl`, `maintenance.lastSeen`, `maintenance.evidenceUrl` and
`verifiedOn`, a `dependencyMarkers` block, `links`, `adoption` with its five null reviews, and
`refusals` — and it is held by a build check. Adding a component to it is a contract change that must
run `npm run open-source` and pass `npm run check`. **This document has done none of that.** It is the
reading that would go into a register entry, kept separate so that a candidate being written down
cannot be mistaken for a candidate being adopted. If the founder approves any recommendation in
Section 5, the correct next step is a change to `packages/catalog/open-source.json` in its own commit,
not an edit here.

**The governance it must satisfy.** Every recommendation below is written against the register's own
rules, quoted by id, and Section 6 states the relationship explicitly. The three that shape most of
this document:

- `open-source-is-not-production-approved` — *Nothing in this register is adopted until its licence,
  security, maintenance, data-flow and clinical-use reviews are each recorded.* Every component in
  the table below has **zero of five** reviews, including the ones the repository already knows.
- `registering-is-not-depending` — *No package manifest in this repository declares a registered
  component.* A dependency added to try something is adoption that skipped the reviews.
- `verify-do-not-invent` — *A licence, a URL or a date of last activity is recorded as it was read
  from the primary source on a stated day, or it is null with the reason it could not be read.*

### How this survey was verified

`WebSearch` and `WebFetch` are **not available to this session** — both were refused with "Interaction
not available to subagent". Verification was done with `curl` against primary sources instead, and it
was partial:

- **GitHub's REST API and `raw.githubusercontent.com` worked.** Licence, archived flag, last push and
  latest release were read from `api.github.com/repos/{owner}/{repo}` and, where the GitHub licence
  detector returned `NOASSERTION`, from the `LICENSE` file's own bytes. This is the same method the
  register used on 14 September. The unauthenticated rate limit is 60 requests per hour; it was
  exhausted during this survey, which is why some candidates are marked unverified for that reason
  alone.
- **Some publisher pages worked:** `snomed.org`, `open.fda.gov`, `eskomsepush.gumroad.com`,
  `sahpra.org.za`, `developer.android.com`, `developer.apple.com`, `openhie.org`, `hl7.org/fhir`,
  `openehr.org`.
- **Some were blocked and could not be read:** `loinc.org/license/` (Cloudflare challenge, HTTP 403),
  `standards.ieee.org` (403), `developer.bluetooth.com` (403), `who.int` (network unreachable, 000),
  `api.sepush.co.za` (000), `instantopenhie.org` (000). NLM's RxNorm and DailyMed pages loaded but
  returned only a navigation shell with no licence text.
- Every row in the table is marked **verified** (a licence or a fact read from the primary source
  today, 1 October 2026, or from the register's own 14 September reading where stated) or
  **unverified** (not read, with the reason). Nothing unverified is presented as a fact. Section 7
  lists what could not be verified and what searching would answer it.

**No number in this document is restated as its own.** Prices, limits, ranges and refusal sentences
are cited to where they already live in this repository. Where an external figure is quoted it is
marked as external and unverified. The one exception is the register's own component count, which is
counted from the file rather than copied from prose.

---

## The three findings that changed since the register was written

These come first because each one affects something the repository already relies on or already
planned, and two of them affect money.

### 1. South Africa joined SNOMED International on 14 May 2026

Read from `snomed.org`'s own news announcement today. The material facts, in the announcement's words:

- South Africa joined SNOMED International on 14 May 2026, the first country from the African region
  to do so, following its 2024 announcement that it would introduce new health terminological systems
  and classifications for the national health information system.
- The Director-General of the National Department of Health **has gazetted the intention to introduce
  a set of health terminological systems for use in electronic health records and health information
  exchange, including SNOMED CT alongside complementary classifications from the WHO Family of
  International Classifications.**
- **South Africa's membership extends SNOMED CT access across all health sector entities, including
  public and private providers, academic, research, and civil society institutions.**
- The NDoH **is establishing a SNOMED CT National Release Centre and a National Terminological Mapping
  Service**; the Department's Clinical Coding Advisory Technical Working Group co-ordinates
  implementation.

**Why this matters here.** `packages/catalog/knowledge/` carries **59 hand-verified SNOMED CT
identifiers** in its 250 entries, beside 26 ICD-11 codes and 7 LOINC codes, and
`scripts/knowledge-codes.mjs` validates
every SNOMED identifier against the Verhoeff check digit its issuing authority defines, on every
build. `packages/catalog/knowledge/medications.json`'s entries carry `codes.snomed` — Paracetamol's
is `387517004`. Those codes were checked by hand against OLS4, the international browser, on
22 September 2026. **Until now there was no recorded licence position for SNOMED CT in South Africa**,
and a national health service using a terminology it has no licence to use is the kind of gap a funder
or a scheme asks about. There now is one: the country is a member, the NDoH is standing up a National
Release Centre, and the announcement says membership extends access to private providers.

**What this does not say, and must not be taken as.** The announcement is a press release, not a
licence. It does not say that access is free, that a private nurse service is a beneficiary without
registering, what the National Release Centre's terms will be, or when it will publish a South African
edition or extension. **Nobody has asked.** The contact in the announcement for the NDoH side is
`coding@health.gov.za`.

**The refusal this must carry.** A SNOMED CT code is an identifier, and an identifier is not a
clinical statement. Nothing in `knowledge/` may begin presenting SNOMED CT as authoritative clinical
content because the country joined a terminology body: `packages/catalog/knowledge/federation.json`'s
`scope.excluded` already refuses diagnosis, prescribing or dose changes, individual clinical decisions
and anything needing a licence to interpret, and joining SNOMED International changes none of that.
Nor does membership license the *mapping*: the announcement says a National Terminological Mapping
Service is being established, which is the body that would decide what a South African concept maps
to — and inventing that mapping here while it is being established nationally is how a product ends
up holding codes a national service will not recognise.

### 2. Piper is archived; its maintained successor is GPL-3.0

The founder's speech amendment of 21 September 2026 names **Piper** as the on-device TTS.
`docs/governance/VOICE-RECORDING-BRIEF.md` commissions on that basis and states, on its line 14,
"trained with Piper (MIT licence)".

Read from GitHub today:

| Repository | Licence | Last push | Archived |
|---|---|---|---|
| `rhasspy/piper` | MIT | 26 August 2025 | **yes** |
| `OHF-Voice/piper1-gpl` | **GPL-3.0** | 28 September 2026 | no |

`rhasspy/piper`'s own README now says, as its first line of substance: **"Development has moved:
https://github.com/OHF-Voice/piper1-gpl"**. Its MIT licence still exists on the archived tree, so the
brief's statement was true when it was written. **It is no longer the maintained path.**

**Why this matters here.** The voice-recording brief budgets **R 100 000 – R 175 000 and 4–6 weeks**
(its own table: studio, talent, linguists, clinical review, GPU time) to record and train two voices
each for isiZulu and isiXhosa, on the Piper pipeline, with Sesotho to follow. That spend is committed
against an engine named in a founder decision, and the engine named has moved. Its line 82 already
contemplates the right shape of the answer — "Piper's runtime joins the open-source register as a
verified module, not vendored" — and that verification has not happened.

There are three genuinely different paths and only the founder can choose among them, because they
have different consequences for the products:

1. **Pin the archived MIT tree.** The licence the brief states is the licence it gets. The cost is
   that an archived project receives no fixes: no new espeak-ng phonemisation work, no bug fixes, and
   the brief's own step 1 says to "check its zu/xh support first; where it is thin, the linguist
   supplies a lexicon" — which is exactly the work an archived project will never receive.
2. **Move to `piper1-gpl`, GPL-3.0.** Maintained, and the training pipeline is the same family. But
   GPL-3.0 is copyleft, and this repository already has a written position on copyleft: the
   register's `openemr` entry refuses that "no OpenEMR code is combined into a MyThuso service",
   because "GPL-3.0 would oblige MyThuso to publish the source of the combined work". The question is
   whether a TTS runtime linked into a native app is a combined work — that is a legal question for
   counsel, not an engineering one, and it is the same question the OpenEMR refusal already answers
   for a different component. Note the distinction: a **model trained** with a GPL tool is data, and
   the weights' own licence is a separate question from the tool's; but a **runtime linked into an
   app-store binary** is code, and that is where the obligation would bite.
3. **A different on-device TTS engine.** That is a change to a founder decision, so it is the
   founder's to make and not a tidy-up.

**The refusal this must carry.** No voice model trained on either tree may be shipped until the
licence question is answered, and no marketing may say "GilbertOne speaks isiZulu" before
`ttsAvailable` is true in `packages/catalog/assistant.json` — which the brief already refuses on its
own line 102. What is new is that the recording budget should not be signed against an unverified
licence. `docs/governance/VOICE-RECORDING-BRIEF.md` is marked "proposed, 28 September 2026. Nothing
below has been commissioned," so nothing has been spent. That is the reason this finding is timely
rather than costly.

**Related, and worth knowing.** `packages/gilbertone/src/speech-state.ts` is the state machine the
stack plugs into — Porcupine raises the wake word, Silero the endpoints, faster-whisper the text,
Piper the audio — and it holds no microphone, no network, no clock and no timers. It is pure
`(state, event) -> { state, effects[] }`. **That means the engine substitution above is contained:**
the architecture contract does not name a vendor, and swapping Piper's runtime does not touch the
safety machine. This is the payoff of the amendment having been written as a state machine rather
than as an integration.

### 3. Instant OpenHIE's original repository is archived

The register's `openhim` entry names OpenHIM but no Instant OpenHIE. Read from GitHub today:

| Repository | Licence | Last push | Archived |
|---|---|---|---|
| `openhie/instant` | Apache-2.0 | 31 October 2023 | **yes** |
| `openhie/instant-v2` | Apache-2.0 | 5 March 2026 | no |
| `openhie/openhie-specification` | MPL-2.0 | 12 May 2025 | no |

Anybody reading a 2023-era article that recommends "Instant OpenHIE" as the fastest way to stand up
an interoperability layer would clone an archived repository. The maintained one is `instant-v2`.
This matters only if the `nhie-exchange` proposed door ever opens, and it is recorded here so that
the correct repository is the one that gets reviewed.

---

## The candidate table

**How to read it.** *Attach to* names the existing seam, door, contract or route — no row invents a
new one, because `a-proposed-door-is-not-a-door` allows a proposed door only while the real one is
absent, and the three the register proposes (`hl7v2-inbound`, `model-gateway`, `nhie-exchange`) are
already proposed there. *Must refuse* is the valuable part: what the integration may never be
allowed to decide. *Verified* means a licence or fact read from the primary source on 1 October 2026,
or the register's own 14 September reading where marked. Everything has **zero of five** reviews
(licence, security, maintenance, data-flow, clinical-use) recorded.

### 1 · Open-source health platform APIs

| Name | Licence | What it would do here | Attach to | Must refuse | Verified |
|---|---|---|---|---|---|
| **HAPI FHIR** (`hapifhir/hapi-fhir`) | Apache-2.0 | A Java FHIR R4 library and JPA server; the validator §26's conformance suite needs, behind the Passport's `/fhir/*` routes | `record` engine's `POST /fhir/{resourceType}`, `GET /fhir/{resourceType}/{id}`, `GET /fhir/{resourceType}`; through `passport-gateway` | Its own REST endpoint is never reachable; only the Passport's gateway talks to it. Already in the register | **Verified** — Apache-2.0, pushed 1 Oct 2026, latest release v8.8.2 (25 Sep 2026); v8.12.1 also published 15 Sep 2026. In the register at v8.12.1 |
| **Google fhir** (`google/fhir`) | Apache-2.0 | Protocol-buffer FHIR definitions and a validator; an alternative to HAPI's Java validator for §26's conformance suite | Same three `/fhir/*` routes; validator only, no server | Same: never reachable around the gateway. Not in the register | **Verified** — Apache-2.0, pushed 1 Oct 2026, 957 stars, description "FHIR Protocol Buffers" |
| **Medplum** (`medplum/medplum`) | Apache-2.0 | A healthcare platform with a FHIR server, auth and an admin console. `docs/ROADMAP.md`'s twenty-feature gate table names it | `record`; through `passport-gateway`. Gated in the roadmap on "a signed DPIA, a registered Information Officer, a data-residency decision, KMS or HSM custody, a retention policy, and interoperability governance" | It must never *be* the record: `not-our-record` in the register already refuses that MyThuso runs OpenMRS or OpenEMR as its own record, because the Passport is the record | **Verified** — Apache-2.0, pushed 1 Oct 2026, latest release v5.2.0 (30 Sep 2026), 2 716 stars. Named in `docs/ROADMAP.md` line 423 |
| **OpenHIM core** (`jembi/openhim-core-js`) | MPL-2.0 | The interoperability mediator that would route, authenticate and log traffic between the Passport and a partner or a national exchange | `proposed:nhie-exchange`, `proposed:hl7v2-inbound`; through `passport-gateway` | `no-national-exchange-claim`: nothing says MyThuso is connected to or conformant with a national exchange | **Verified** — MPL-2.0, pushed 25 Sep 2026, latest release still **v8.5.0 of 16 Sep 2024**. In the register; the release gap the register records is still true |
| **OpenHIM console** (`jembi/openhim-console`) | MPL-2.0 | The management webapp an operator would use to configure OpenHIM clients and mediators | With OpenHIM core, if it is ever run | It is an operator console: no patient-facing surface, and no route of its own | **Verified** — MPL-2.0, pushed 15 Jul 2026. Not in the register |
| **NextGen Connect / Mirth Connect** (`nextgenhealthcare/connect`) | MPL-2.0 at 4.5.2; **proprietary from 4.6** | An integration engine for HL7 v2 and FHIR. The register records that from 4.6, on 19 March 2025, it moved to a single commercial licence and source is no longer published | `proposed:hl7v2-inbound` | `a-proprietary-release-is-not-open-source`: no release after 4.5.2 is treated as open source | **Verified as a finding, and the finding is that it is closed.** GitHub's licence detector now returns `NOASSERTION` on the repository's default branch, consistent with the register's note that 4.5.2 is the last open-source release |
| **Open Integration Engine** (`OpenIntegrationEngine/engine`) | MPL-2.0 | The community fork made after Mirth Connect closed. The maintained open path to the same capability | `proposed:hl7v2-inbound` | Same two refusals the register puts on NextGen Connect: nothing unmapped reaches the record, and no HL7 v2 library is declared by any manifest before its review | **Verified** — MPL-2.0, pushed 30 Sep 2026, 227 stars, self-described as "An open source fork of the now closed-source Mirth Connect". The register names it as an unreviewed alternative; it is still unreviewed |
| **OpenMRS** (`openmrs/openmrs-core`) | MPL-2.0 **with Healthcare Disclaimer** | A facility running it would connect to the Passport as a SMART on FHIR client. MyThuso would not run it | `record`; through `passport-gateway` | `not-our-record` | **Verified** — GitHub reports `NOASSERTION`; the LICENSE bytes read today are the full MPL 2.0 text plus the Healthcare Disclaimer, "Copyright (c) OpenMRS Inc." The register's `LicenseRef-MPL-2.0-with-Healthcare-Disclaimer` is correct and plain MPL-2.0 would understate it |
| **Bahmni** (`Bahmni/bahmni-core`) | MPL-2.0 **with Healthcare Disclaimer** | Core OpenMRS modules for Bahmni, including ERP and ELIS Atom Feed clients. A Bahmni site would reach the Passport the way an OpenMRS site would | `record`; through `passport-gateway` | `not-our-record`; and no Atom Feed client becomes a second record path | **Verified** — GitHub reports `NOASSERTION`; the LICENSE bytes read today are MPL 2.0 plus the Healthcare Disclaimer, "Copyright 2026. OpenMRS Inc.", pushed 30 Sep 2026. **Not in the register** |
| **DHIS2** (`dhis2/dhis2-core`) | BSD-3-Clause | A health-management information system for aggregate indicator reporting. Would be a *recipient* of de-identified aggregate reporting, never a source of a patient's record | Nothing today. It is the nearest existing thing to `fhirboard`'s de-identified-export position, which the register blocks on "no de-identification method, secondary-use committee or de-identified extract exists" | `de-identified-data-only` and `no-row-about-a-person`, both already refused for FHIRBoard: no governance dashboard shows or exports a row about one person | **Verified** — BSD-3-Clause, pushed 1 Oct 2026, 357 stars. **Not in the register** |
| **openIMIS** (`openimis/*`) | **AGPL-3.0** | An open health-insurance and social-protection management system: insuree, policy, product, claim, payer, medical, controls, payroll modules. Would sit against the `scheme-claims` capability | Feed #21 `claim-response` — "A medical scheme's answer to a claim" — which declares the door and refuses every payload | It must never decide a claim's outcome. The `claim-response` door already refuses that by refusing every payload, and a scheme's answer is a payer's decision, not this product's | **Verified** — GitHub's detector returns `NOASSERTION` on every module; `openimis-be-medical_py`'s root carries both `GNU AFFERO GENERAL PUBLIC LICENSE.md` and a `LICENSE.md` whose text read today opens "This program is free software: you can redistribute it and/or modify it under the terms of the GNU AGPL v3 License". Modules actively pushed (1 Oct 2026). **Not in the register.** The specific repository path `openimis/openimis-distr` the survey first tried **does not exist** — 404 |
| **Instant OpenHIE v2** (`openhie/instant-v2`) | Apache-2.0 | A Docker-based installer that stands up an OpenHIE stack — OpenHIM, a FHIR server, a client registry, a shared health record — for an interoperability pilot | `proposed:nhie-exchange`; the original `openhie/instant` is **archived** (31 Oct 2023) | `no-national-exchange-claim`. Standing up a demo stack is not conformance with anything | **Verified** — Apache-2.0, pushed 5 Mar 2026. **Not in the register** |
| **OpenHIE specification** (`openhie/openhie-specification`) | MPL-2.0 | The architecture and community specification for a health information exchange. Reading material for the `nhie-exchange` door's first switch-on condition | `proposed:nhie-exchange` | It is a specification for an exchange that South Africa has not published a profile for. The register's condition stands: "The National Department of Health publishes the integration profile the Passport would conform to, and it is named here" | **Verified** — MPL-2.0, pushed 12 May 2025. **Not in the register** |
| **mCSD (Mobile Client-Side Data) / OpenHIE mCSD IG** | not read | A FHIR implementation guide for community and facility health worker, location and service delivery reporting — the closest published pattern to a nurse roster and a household record | Nothing. `nurse-roster` (feed #4) and `household.json` exist as contracts; neither names an IG | It would describe a health worker's location. `geography.json`'s `a-nurse-is-not-tracked-between-visits` and `no-history-drawn` refuse a track, and an mCSD-derived roster must not import one | **Unverified** — the repository paths tried (`openhie/mcsd`, `openhie/mcsd-fhir-ig`, `openhie/standards-mediator`) all returned 404 and the GitHub API rate limit was exhausted before the correct one was found. The project exists as an OpenHIE initiative but no licence or URL is recorded here |
| **NHIE / South African national health information exchange** | not published | The exchange the Passport would register with as a point-of-service system, matching patients through HPRS | `proposed:nhie-exchange` | Nothing claims connection to or conformance with a national exchange | **Unverified, and it was unverified on 14 September too.** The register records that no NDoH source naming an NHIE or an OpenHIM profile could be found. **One new signal, and it is adjacent rather than direct:** the SNOMED announcement above says the Director-General "has gazetted the intention to introduce a set of health terminological systems for use in electronic health records **and health information exchange**". That is a gazette about terminology, not an integration profile, and it does not satisfy the door's condition |

**How these relate to the HL7 v2 bridge already built.** Wave 5, 15 September 2026, built §26's
`POST /hl7v2/inbound` **in the Passport P0 and nowhere else**: development only, synthetic messages
only, from one registered synthetic hospital and one registered synthetic laboratory. Every rule is
`packages/engines/src/record/domain/hl7.ts`, the contract is `packages/catalog/hl7v2-inbound.json`,
and the parser is **hand-written** — it reads MSH, PID-3, PV1-2/19/44/45, OBR-2/4/7/22/25 and
OBX-2/3/5/6/7/8/11/16, and never NTE, NK1, IN1, DG1, AL1 or PD1. `docs/FEATURE-MAP.md` is explicit
about why: "because no HL7 library has been reviewed under `open-source.json` and §15D". The
register's refusal `no-hl7-library-before-its-review` holds every manifest to it.

So the integration engines above are **not competitors to the bridge and must not be presented as
replacements for it.** They are what would sit *in front of* the `hl7v2-inbound` door when it opens —
terminating a partner's MLLP session, mapping a richer segment set, and handing the Passport a message
it can already parse. The bridge answers the door today with a hand-written parser over a deliberately
narrow segment set; an integration engine would widen what arrives at it without changing where the
rules live. The register's condition on the door is what governs: mutual TLS per partner, every ADT /
ORU / ORM mapped to FHIR with Provenance before anything is written, and an unmatched patient held
for a person rather than matched by a best guess. **And the narrow parser is a feature.** A partner's
system still reaches the path only through the door, and a message type the parser does not read is
refused rather than partly ingested.

### 2 · IoT and device APIs for vitals

The existing device model constrains all of this, and it is worth stating plainly because it is
stronger than most device platforms assume. `packages/catalog/devices.json`'s `whereValuesLive`
records that **Devices never holds a reading's value**: whoever took the reading writes it to the
Health Passport through its consent gateway, and Devices keeps where it came from, how good the
sample was, whether it may carry clinical weight, what marks it carries and where in the record it
went. Its three classes are `certified`, `consumer` and `simulator`; only `certified` may carry
clinical weight, and only while nothing else takes it away. `packages/catalog/devices/trust-model.json`
has a `hardRule`: **a consumer-tier device reading never auto-creates a Dispatch & Incident, or any
equivalent, regardless of its value, its trend, or how many consumer devices agree with each other.**
And `noSeam` in `feeds.json` is explicit that there is **no new ingestion boundary**: "the seam
already exists and it is `apps/api/src/capture/**`", where device identity, the device's claimed
time, the measured skew and a SHA-256 commitment to a reading the service does not keep are all built
and tested, with four named conflicts.

| Name | Licence | What it would do here | Attach to | Must refuse | Verified |
|---|---|---|---|---|---|
| **Momentum Open Wearables** (`the-momentum/open-wearables`) | MIT | A self-hosted platform normalising wearable data from Garmin, Oura, Whoop, Polar, Fitbit and Apple HealthKit, Samsung Health and Health Connect, behind one API | `devices` engine's `POST /v1/devices/wearable-links` and `POST /v1/devices/readings`; door `wearable-sync`; through `passport-gateway` | Two refusals already in the register: `consumer-wearable-carries-no-clinical-weight` and `not-a-medical-device-path` | **Verified** — MIT, pushed 1 Oct 2026, 2 592 stars, description now "Self-hosted platform to unify wearable health data through one AI-ready API". In the register at release 0.8.0 |
| **Google Health Connect** (`androidx/androidx`) | Apache-2.0 | Android's system-level health data store. Would be the platform behind the `health-connect` wearable link | `devices.json#wearableLinks.platforms` — `health-connect`, one of two platforms the contract already names. Door `wearable-sync` | The contract already refuses this in its own words: `notInThisBuild` — "No HealthKit or Health Connect library, entitlement or permission prompt is in this build. Adding one changes how the app is signed and what the phone asks you, and it waits for the two decisions above" (a signed DPIA and a consent scope a clinical reviewer has read) | **Verified** — Apache-2.0, pushed 1 Oct 2026, 6 100 stars; `developer.android.com`'s Health Connect guide reachable (HTTP 200). **The platform is named in the contract; the library is not in the build** |
| **Apple HealthKit** | **proprietary — not open source** | iOS's health data store; the platform behind the `apple-health` wearable link | Same as Health Connect | Same, and one more: HealthKit data may not be used for marketing, advertising or sold to a data broker under Apple's own terms. This document does not restate Apple's terms as verified — the documentation page was reachable, the terms were not read | **Verified as a fact about openness only:** Apple HealthKit is a proprietary framework documented at `developer.apple.com/documentation/healthkit` (HTTP 200 today). **It is not open source and must not appear in the open-source register as a module.** The register's `_note` scope is software MyThuso could run or a standard it would implement; HealthKit is neither |
| **IEEE 11073-PHD / Continua** | not read | The personal-health-device standard: a transport-independent model for a BP cuff, a pulse oximeter, a glucose meter or a scale to describe itself and its readings with device specialisations and nomenclature codes | `devices.json`'s `certified` class and `apps/api/src/capture/**`. It would name *what* an instrument is, not where its value goes | It must never widen the `certified` class. `pairing-paths.json`'s `just-works-forbidden-for-clinical-weight` refuses that a device whose class may carry clinical weight is paired by a transport's "just works" mode, and a standard saying an instrument is conformant is not a possession proof | **Unverified** — `standards.ieee.org/ieee/11073/5592/` returned HTTP 403 and no Continua repository was located. The standard exists and is the one the industry uses; its licence terms and current edition were not read |
| **Bluetooth SIG GATT health profiles** | not read | The BLE service and characteristic definitions a cuff or oximeter exposes — Blood Pressure, Pulse Oximeter, Health Thermometer, Glucose, Heart Rate | The `ble-gatt` transport in `pairing-paths.json`, priority 1 of five, whose `justWorksForbidden` is `true` | Same as above, and `pairing-paths.json` already records that "there is no `navigator.bluetooth` call anywhere in this repository and no native bridge to one," and neither native app declares a Bluetooth permission. This entry describes the discipline; **it authorises none of it** | **Unverified** — `developer.bluetooth.com` returned HTTP 403. Bluetooth SIG requires membership to download specifications; whether MyThuso could read them at all is an open question |
| **Nightscout / cgm-remote-monitor** (`nightscout/cgm-remote-monitor`) | **AGPL-3.0** | A community CGM web monitor. The best-known open bridge for continuous glucose data | `devices.json`'s `consumer` class, through door `device-reading` | `consumer-wearable-carries-no-clinical-weight`, and the `device-reading` door's own never-accepts list. A CGM trend arrow is the single most tempting reading in the product to act on and the one this contract most firmly refuses to act on | **Verified** — AGPL-3.0, pushed 1 Oct 2026, 2 834 stars. **Not in the register.** AGPL-3.0 is network copyleft: the obligation reaches a service offered over a network, which is a stronger position than the GPL-3.0 the register already refuses for OpenEMR |
| **LibreCGM / open Dexcom and Libre bridges** | not read | Community bridges to Abbott Libre and Dexcom CGM APIs | Door `device-reading`, `consumer` class | As Nightscout | **Unverified** — `libre-cgm/libre-cgm` returned 404 and the API budget was exhausted before a search found the right repositories. This category is known to exist as community work; no specific project, licence or URL is recorded here. **Several projects in this space have had their API access revoked by the manufacturer**, which is a maintenance fact worth knowing before any of it is reviewed |
| **openEHR — ehrbase** (`ehrbase/ehrbase`) | Apache-2.0 | An open-source openEHR server: archetype- and template-driven clinical data in a dual model, with an AQL query language | Nothing today. It would be an alternative record model beside the Passport, and the Passport is FHIR R4-shaped | `not-our-record`: the Passport is the record. Adopting a second clinical data model would be two places to get a record wrong | **Verified** — Apache-2.0, pushed 1 Oct 2026, 385 stars, description "An open source openEHR server". **Not in the register** |
| **openEHR java-libs** (`openEHR/java-libs`) | MPL-2.0 **OR** GPL-2.0 **OR** LGPL-2.1 | Standard Java libraries for openEHR implementations | With ehrbase, if ever | Same, plus a triple-licence choice where one of the three is GPL-2.0 | **Verified** — GitHub reports `NOASSERTION`; the LICENSE bytes read today open "Version: MPL 2.0/GPL 2.0/LGPL 2.1". Last pushed 3 October 2024, so **stale by more than a year**. Not in the register |
| **MQTT broker, self-hosted** | depends on the broker | The transport the plan's §3 names for a device gateway | Already a card: `packages/catalog/api-registry.json`'s `mqtt-broker`, `proposed`, `statusToday: "not-configured"`, `capabilityRef: "devices"`, `feedRef: "device-reading"` | The card's own words: "No device is on the real-device allowlist and the DPIA is not done. A device's readings would enter through the device seam in `apps/api/src/capture`, never a second door (`packages/catalog/feeds.json` noSeam)" | **Verified as already recorded.** No broker is chosen, so no licence is recorded — and choosing one is where `registering-is-not-depending` bites. **Do not add a broker before the DPIA** |

**The device allowlist is empty, and that is the actual gate.** `packages/catalog/vitals.json`'s
`deviceAllowlist.real` is `[]`, with the reason recorded beside it: "no device has been registered
against a completed DPIA, so a deviceRef that is not on this list is refused, and with the list empty
every real-device reading is." `docs/FEATURE-MAP.md` counts this as "0 real devices allowlisted, the
DPIA not done". **No IoT integration in this section can be switched on by engineering work**, because
what blocks them is `docs/governance/DPIA-DRAFT.md` being unsigned, not a missing adapter. An adapter
written ahead of that DPIA is an adapter that cannot be used and a surface that must be maintained.

**The wearable-sync door has seven switch-on conditions and none is met:** a DPIA covering third-party
health data; a reviewer having read the consent scope; a signed data processing agreement; South
African or approved hosting; every reading checked against consent on arrival; every reading arriving
as consumer-grade; and the app declaring the platform permission. Its `neverAccepts` list refuses
`patientName`, `appleId`, `workoutRoute`, `reproductiveHealth` and `sleepAnalysis` — and
`workoutRoute` is refused because it is a track, which `geography.json`'s `no-history-drawn` already
refuses on the map. A wearable platform that cannot deliver readings without a workout route is not
compatible with this contract, and that is a design fact worth checking against any vendor before a
DPA is drafted.

### 3 · Clinical knowledge and decision support that is not a diagnosis engine

The catalogue already exists and is larger than most surveys assume: **250 entries across nine files**
in `packages/catalog/knowledge/` — 64 conditions, 50 medications, 30 interactions, 22 first-aid, 20
maternal, 20 prevention, 16 chronic, 14 mental-health, 14 SA health system — each carrying a `source`
object with `authority`, `jurisdiction`, `retrievedDate`, an `evidenceGrade` drawn from
`federation.json`'s own vocabulary and an `expiresOrReviewBy`. Of the 250 entries, **71 carry a terminology code and between them carry
92 code values — 59 SNOMED CT, 26 ICD-11, 7 LOINC.** The other 149 entries in the eight clinical files
carry `codes: {}`, which `scripts/knowledge-codes.mjs` reads as *honestly unmapped* rather than as an
omission, and the 30 interactions entries carry no `codes` key at all — the script fails the build if
one ever appears there, "so that it cannot be added silently later". The medicines engine's own
formulary is separate and is **synthetic**:
`packages/catalog/medicines.json`'s `formulary.licensed` is `false`, its `listStatus` is `"synthetic"`,
its seven entries are named "Synthetic medicine A" and its notice reads "This is a synthetic
development list. No NAPPI or licensed formulary is connected, and no entry on it is a real medicine."
That distinction matters for everything below: `knowledge/medications.json` carries real medicine names
with real provenance, while `medicines.json`'s formulary carries none, deliberately.

| Name | Licence | What it would do here | Attach to | Must refuse | Verified |
|---|---|---|---|---|---|
| **openFDA drug label API** | **Public domain — CC0 1.0** | Checking the 30 recorded interaction warnings against the regulator's own label text. Already an allowlisted source | `federation.json`'s `openfda` source — **`active: false`** — and the `knowledge-sources` card in `api-registry.json`, `dark` | The source's own `notFor`, already recorded: "Presenting US label wording to a South African patient as though it were SA guidance without the SA NDoH treatment-guideline line beside it, or any dose, diagnosis or prescribing answer" | **Verified** — `open.fda.gov/license/` read today: content "is public domain and made available with a Creative Commons CC0 1.0 Universal dedication… You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission." Already in `federation.json` with its endpoint, rate limits and residency position |
| **WHO ICD-11 API** | CC BY-ND 3.0 IGO | Validating and enriching the 26 ICD-11 codes the catalogue maps to. Already an allowlisted source | `federation.json`'s `icd11-who` source — **`active: false`** | Its own `notFor`: "Clinical decision support, diagnosis lookup on behalf of a patient, or answering a person's question directly." And `federation.json`'s note: CC BY-ND means **no derivatives**, so ICD-11 content is presented unmodified and attributed, never folded into an edited derivative | **Verified from the register's 14 September reading**, which records the licence as CC BY-ND 3.0 IGO with attribution required. `who.int` was **unreachable from this network today** (HTTP 000), so nothing was re-read |
| **Europe PMC REST search** | per-record | Finding published literature by checkable identifier. Already an allowlisted source | `federation.json`'s `pubmed-europepmc` source — **`active: false`** | Its own `notFor`: "Treating a search hit as clinical evidence by itself, or carrying any conclusion beyond the paper's own title and abstract opening" | **Verified from the register and `federation.json`**, which records metadata and abstracts as served by Europe PMC with each article's full text keeping its own licence |
| **SNOMED CT** | not read; **national position changed** | The clinical terminology behind the 59 codes the catalogue already carries. See finding 1 above | `packages/catalog/knowledge/*`'s `codes.snomed`, validated by `scripts/knowledge-codes.mjs` against the Verhoeff check digit on every build | A code is an identifier, not a clinical statement. `federation.json`'s `scope.excluded` stands. And no South African *mapping* is invented here while a National Terminological Mapping Service is being established | **Partly verified.** **Verified:** South Africa joined SNOMED International on 14 May 2026; the DG has gazetted the intention to introduce terminological systems including SNOMED CT; a National Release Centre and National Terminological Mapping Service are being established; membership "extends SNOMED CT access across all health sector entities, including public and private providers" — all read from `snomed.org`'s announcement today. **Unverified:** the licence terms, whether access requires registration, whether it is free to a private nurse service, and the National Release Centre's conditions. `snomed.org/our-stakeholders/members` renders client-side and returned no membership text to a plain fetch |
| **RxNorm** | not read | The US clinical drug nomenclature. Would give a coded backbone to `knowledge/medications.json`'s 50 entries | `knowledge/medications.json`'s `codes` object, which today carries `snomed` and no `rxnorm` key | It is a **United States** nomenclature. South African medicine names, strengths and pack sizes do not map onto it one to one, and a US code beside a South African entry would read as authority it does not have. Whatever is added must not become the thing a dose answer is derived from — `assistant.json` refuses a dose in six places already, because "it is nobody's Formulary and signs for nothing" | **Unverified** — `nlm.nih.gov/research/umls/rxnorm/` loaded (HTTP 200) but returned only a navigation shell; `/docs/`, `/docs/rxnormlicense.html`, `/docs/rxnormlicense.pdf` and the NLM databases download page all returned 404 or no licence text. RxNorm's terms are normally a UMLS licence agreement requiring registration; **that is recollection, not a reading, and is not relied on here** |
| **DailyMed** | not read | The FDA's drug labelling repository — the SPL documents behind openFDA's label endpoint | With openFDA | Same as openFDA: US label wording is not SA guidance | **Unverified** — `dailymed.nlm.nih.gov` was reachable (HTTP 200) but the app-support page returned only a script shell with no licence text |
| **LOINC** | not read | The observation nomenclature. **Already in use**: `packages/catalog/vitals.json` registers a LOINC code and a UCUM unit for each vital-sign type (8867-4 heart rate, 9279-1 respiratory rate, 8480-6 / 8462-4 systolic / diastolic, 8310-5 temperature, 59408-5 SpO₂, 29463-7 weight) and `scripts/knowledge-codes.mjs` validates every one against the LOINC check digit | `vitals.json#types`; 7 LOINC codes in `knowledge/` | `vitals.json`'s own `_note` is the refusal and it is a good one: "Every number here is a plausibility bound — the outside of which a typed or transmitted value is refused as a mistake — and never a clinical threshold, a triage cut-off or a scoring input." A LOINC code names an observation; it says nothing about what the value means | **Unverified** — `loinc.org/license/` returned HTTP 403 behind a Cloudflare challenge, and no licence text was read. LOINC is normally available free of charge under a licence agreement requiring registration; **that is recollection, not a reading.** The repository already relies on LOINC codes and validates their check digits, so the licence position is a live question rather than a hypothetical one |
| **WHO IMCI** (Integrated Management of Childhood Illness) | not read | The danger-sign framework for under-fives. **Already the reasoning behind the golden sets**: `packages/catalog/assistant-golden-sets.json`'s emergency cases are annotated "Two IMCI danger signs in one sentence; infant group" in English, isiZulu, isiXhosa and Afrikaans | `gilbert-emergency-terms.json` and `assistant-golden-sets.json` | IMCI is a clinical guideline and the emergency list **has no clinical reviewer**. `CLAUDE.md` records it: "The list has no clinical reviewer yet, and needs one before real patients." An IMCI citation does not substitute for that signature | **Unverified** — every `who.int` URL tried returned HTTP 000 (network unreachable from this session) and `apps.who.int` returned 403. That IMCI exists and is a WHO/UNICEF framework is not in doubt; its current edition, its licence and its URL are not recorded here. **The repository already cites it in golden-set annotations, so this is a provenance gap worth closing** |
| **SA NDoH Essential Medicines List and Standard Treatment Guidelines** | not read | The South African authority. **Already cited as the authority** on the catalogue's own entries: `knowledge/medications.json`'s Paracetamol entry carries `source.authority: "SA Essential Medicines List / SA NDoH Standard Treatment Guidelines"`, `jurisdiction: "South Africa"`, `retrievedDate: "2026-09-21"`, `evidenceGrade: "guideline"`, `expiresOrReviewBy: "2027-09-21"`. The 30 interaction entries carry `"OpenFDA / SA NDoH Standard Treatment Guidelines"` | `knowledge/`'s `source` objects; `federation.json`'s `regulatory-label` evidence grade, which pairs the FDA label "with its South African treatment-guideline counterpart" | It is a **clinical document**. Citing it as provenance is right; presenting its dose tables through GilbertOne is refused already, in `assistant.json`'s six dose refusals. `docs/governance/CLINICAL-REVIEW-PACK.md` exists precisely so a clinician signs these | **Unverified as a retrievable source** — `health.gov.za` was reachable (HTTP 200) but three guessed URLs for the EML returned 404 and no working URL was found. **No URL is invented here.** The repository cites this authority on 250 entries; the exact document, edition and URL behind those citations should be recorded somewhere retrievable, and today it is not recorded in this survey |
| **SAHPRA** (South African Health Products Regulatory Authority) | not applicable — a regulator | The medicines regulator whose registered package inserts would be the South African counterpart to openFDA's US labels | Nothing today. Would be a fifth source in `federation.json`, which allowlists three | It is a regulator, not a knowledge API. Its output is a licence to market a product, not advice to a patient | **Verified as reachable only** — `sahpra.org.za` returned HTTP 200 with 289 KB of content. **No document, licence or API was read**, and none is claimed |
| **The South African Medicines Formulary** | not read | The formulary the specification's §9 names as the medicines knowledge engine | `medicines.json`'s `formulary`, which is `licensed: false` and synthetic, with the reason recorded: "A coded medicine list needs a **NAPPI licence** nobody holds" | `formulary.licensed` stays `false` until a licence exists. Every screen shows the notice above the list, and every answer carries `listStatus` | **Unverified** — it is a published commercial reference work, not open source, and **nothing in this survey establishes that an open edition exists**. The repository's own position is that it does not: no NAPPI licence is held. Any suggestion that an open South African formulary could replace it should be treated as unverified until a publisher is named |

**What would genuinely improve the catalogue, versus what would just duplicate it.** The question the
founder's ask implies is whether more sources would make `knowledge/` better. Mostly they would not,
and the reason is that this catalogue is not short of content — 250 entries with provenance, review
dates and validated codes is more than most products at this stage carry. It is short of three things,
none of which a new data source supplies:

1. **A clinical reviewer.** `docs/governance/CLINICAL-REVIEW-PACK.md` exists to be signed and its
   sign-off fields are blank. `docs/governance/GOLDEN-SETS.md` asks for a first-language clinician per
   language — SANC-registered nurse or HPCSA doctor — and no set is signed. Every entry in the
   catalogue was drafted by machine on 27 September 2026 and says so in its `draftedBy` field.
   **Adding a 251st entry to an unsigned catalogue adds a 251st thing nobody has reviewed.**
2. **A licence position on the terminology it already uses.** The 59 SNOMED CT, 26 ICD-11 and 7 LOINC
   code values in `packages/catalog/knowledge/` are validated on every build by
   `scripts/knowledge-codes.mjs` — Verhoeff for SNOMED CT, the LOINC check digit, the MMS format for
   ICD-11 — and the LOINC licence could not be read today. That validation proves a code is *shaped*
   like the code it claims to be; the script's own header says it "cannot prove a code means what the
   entry says it means", which was done once by hand against OLS4, WHO and loinc.org. This is a
   documentation gap, not a content gap, and finding 1 above may close the SNOMED half of it.
3. **Retrieval that can be measured.** The `knowledge-sources` card is `dark` and all three allowlisted
   sources ship `active: false` *(annotation, 6 October 2026: the allowlist grew to **14** on
   2 October, the day after this survey was written, and every one of the fourteen is still
   `active: false` — the finding is unchanged by the number; the darkness claim itself is under
   review in a separate change and was not re-verified here)*, with the reason recorded in `federation.json`: activation needs "a
   recorded decision against the source's licence and the POPIA s72 cross-border position". The TF-IDF
   keyword floor always runs; Qdrant is optional and `dark`. **What is missing is an evaluation, not a
   source** — and `docs/governance/GOLDEN-SETS.md` is the mechanism already designed for it.

What would merely duplicate it: a drug-interaction API, a symptom checker, a diagnosis library, or a
second condition catalogue. The register already refuses the last of those in principle —
`no-prototype-reaches-triage`, and Diagnostipy's `never-the-triage-engine`. And a symptom-taxonomy
project would collide with something the repository has deliberately built instead:
`packages/catalog/symptom-intake.json` is **not triage**, and `docs/FEATURE-MAP.md` says so on
28 September — "it sets no priority, no disposition, names no cause and gives no advice. It is a
structured set of notes the patient answers for the nurse." An open symptom taxonomy that scored
symptoms would be reintroducing the thing that refusal exists to keep out.

### 4 · The assistant and model tier

**The architecture is settled and is not reopened here.** `CLAUDE.md`'s founder amendment of
21 September 2026: all audio processing on-device, wake word Porcupine, VAD Silero, STT
faster-whisper, TTS Piper; no audio or transcript leaves the machine; a ring buffer overwritten
continuously; the transcript in memory only and destroyed when the conversation ends; a visible mic
indicator; a kill switch that hard-disables the pipeline; a 45-second per-utterance cap replacing the
30-second listening cap; cloud voice APIs (ElevenLabs, Resemble) prohibited for the on-device
conversation mode; Azure Speech REST routes available as the server-side fallback for en-ZA neural
voice when configured. `packages/gilbertone/src/speech-state.ts` is that architecture as a pure state
machine, and `packages/catalog/assistant.json` records the amendment note.

What follows surveys the **licence and maintenance position of the named stack**, which is an
engineering fact and is not part of the decision.

| Name | Licence | What it does here | Attach to | Must refuse | Verified |
|---|---|---|---|---|---|
| **Porcupine** (`Picovoice/porcupine`) | Apache-2.0 | The wake word, named by the amendment | `speech-state.ts`'s `wake_word_detected` event; the host executes it | The wake word opens a listening window and nothing else. `speech-state.ts` records that conversation mode never emits a wake-word effect — there is no wake word on the web. And `CLAUDE.md`'s DPIA caution stands: the mic being capable of always listening changes the privacy posture in front of regulators even if no data leaves the device | **Verified, with a caveat that matters.** Apache-2.0, pushed 1 Oct 2026, 4 944 stars. **The caveat:** the README's own instructions require an `AccessKey` "obtained from Picovoice Console (https://console.picovoice.ai/)" in every platform demo, and the Console is Picovoice's own service where custom wake words are trained. So the code is Apache-2.0 but the runtime needs an account and a key, and "additional languages… available for commercial customers on a case-by-case basis". **An Apache-2.0 licence on a runtime that will not start without a vendor key is not the same thing as a dependency-free one**, and it sits oddly beside `packages/gilbertone`'s rule that nothing under `src/` may call `fetch()`, import a network module or read an environment variable. Where the key check happens — on device, or against a vendor service — was not read and must be established before this is registered |
| **Silero VAD** (`snakers4/silero-vad`) | MIT | The voice-activity endpoints, named by the amendment | `speech-state.ts`'s `vad_endpoint` event | A VAD raises an endpoint. It decides nothing about content, and `speech-state.ts` holds no microphone, no network, no clock and no timers | **Verified, and a discrepancy resolved.** GitHub reports MIT and the LICENSE bytes read today are "MIT License, Copyright (c) 2020-present Silero Team". **The README's own badge still reads `[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-MIT-lightgrey.svg)]`** — the badge's *alt text* says CC BY-NC 4.0 while its *label* says MIT and its *link* points at the MIT LICENSE file. The README's line 137 adds: "Published under permissive license (MIT) Silero VAD has zero strings attached - no telemetry, no keys, no registration, no built-in expiration, no keys or vendor lock." **The licence file is MIT; the stale badge is a trap** and should be recorded as such if this is ever registered, because a reviewer who trusts the badge would refuse it as non-commercial — the exact error the register's `meta-mms` entry makes correctly, in the other direction |
| **faster-whisper** (`SYSTRAN/faster-whisper`) | MIT | The STT, named by the amendment | `speech-state.ts`'s `transcript_ready` event; on-device | The transcript is in memory only and destroyed when the conversation ends. `feeds.json`'s `speech-transcript` door refuses `audio`, `audioUrl`, `audioRecording`, `voiceprint`, `speakerEmbedding` and `speechDiagnosis` — and the last of those is refused because "a provider hears words. What they mean clinically is not its to say" | **Verified** — MIT, pushed 1 Oct 2026, 25 664 stars, "Faster Whisper transcription with CTranslate2". **Distinguish it from the register's `openai-whisper` card:** `api-registry.json` line 313 is explicit that "faster-whisper running on the device, which the founder's speech amendment names, is not an external API and is not this card" — the `openai-whisper` card is the *hosted* API built 28 September and configured nowhere |
| **Piper** (`rhasspy/piper`) | MIT | The TTS, named by the amendment | `speech-state.ts`'s speaking phase; `docs/governance/VOICE-RECORDING-BRIEF.md` | See finding 2 | **Verified as archived** — MIT, last pushed 26 August 2025, **`archived: true`**, 11 298 stars. README: "Development has moved: https://github.com/OHF-Voice/piper1-gpl" |
| **piper1-gpl** (`OHF-Voice/piper1-gpl`) | **GPL-3.0** | The maintained successor | Same, if the founder approves the move | The copyleft question in finding 2, and the register's existing `copyleft-stays-on-the-other-side` position on OpenEMR | **Verified** — GPL-3.0, pushed 28 September 2026, 5 738 stars, "Fast and local neural text-to-speech engine". **`/LICENSE` at the repository root returned 404 on the `master` branch** — GitHub's detector reports GPL-3.0, and the branch is `main` per its README links, so the file was not read directly. **Not in the register** |
| **OpenAI Whisper** (`openai/whisper`) | MIT | The open-weights model §45 adopted as "ADAPTED" — fine-tuned locally rather than called as a hosted API | `pulse` engine, door `speech-transcript` | `open-weights-not-a-hosted-api`, already in the register: "The open weights run where MyThuso controls them; a hosted transcription API is not what §45 adopted" | **Verified** — MIT, pushed 31 August 2026, 109 836 stars. In the register |
| **Meta MMS** (`facebookresearch/fairseq`) | **CC-BY-NC-4.0** for MMS code and weights | The 1 000-language speech model the register records as unusable here | Register: `pulse`, door `speech-transcript`, blocked | `non-commercial-means-not-here`: "MMS is not used in anything MyThuso charges for while its licence is non-commercial" | **Verified** — the repository's own licence is MIT but **`archived: true`**, last pushed 30 September 2025, 32 219 stars; the register correctly records that CC-BY-NC-4.0 overrides fairseq's MIT for MMS. **Archived and receives no fixes** |
| **Meta Seamless** (`facebookresearch/seamless_communication`) | MIT **AND** CC-BY-NC-4.0 **AND** a custom Seamless Licensing Agreement | As MMS | As MMS | `non-commercial-means-not-here` | **Verified from the register's 14 September reading**, which records all three licences. Not re-read today |
| **Masakhane MT** (`masakhane-io/masakhane-mt`) | MIT | Machine translation for African languages. Would be a translation layer, not a speech one | Nothing today. `packages/catalog/locales.json`'s `clinicalRule` already refuses clinical wording in a language no clinician has read | It must never translate a clinical sentence or an emergency term. `CLAUDE.md`'s refusal stands: clinical wording stays in English in every locale until a clinician who reads the language reviews it, and `gilbert-emergency-terms.json` is a versioned configuration whose changelog the build replays | **Verified** — MIT, but **last pushed 14 June 2022**, so stale by more than four years. The register's `local-language-measured-with-real-speakers` procurement rule would apply to anything trained from it |
| **WAXAL** (Google, African-language speech) | CC-BY-4.0 / CC-BY-SA-4.0 by data provider | §45's "open African-language speech resources from Google", which names no model | Register: `pulse`, door `speech-transcript` | Nothing until the register's own blocker is cleared: "Which Google resource §45 means has to be decided before anything about it can be reviewed" | **Unverified — and the register already says why it is unverified**: "§45 does not name a model or dataset. The most plausible open resource, the WAXAL dataset… lists no South African language". **That is the finding**: WAXAL covers none of the six launch languages |
| **Ollama + `llama3.1:8b`** | not read | The local fallback model, already built and `dark` | `api-registry.json`'s `ollama` card, `buildStatus: "dark"`; `apps/assistant-api/src/lib/llm-adapter.ts`'s `OllamaProvider` | `docs/ROADMAP.md` line 423 is the gate: "Qdrant, Ollama, PostgreSQL, Whisper, Piper, Medplum — **A new, isolated server of their own. Never `liqzar-server`** — five production sites share that box". The card's own `darkWhy` adds that `orchestrator.ts` reaches Ollama only where Azure is not configured | **Verified as already recorded.** The roadmap records `llama3.1:8b` as "a general-purpose model at the fallback tier, **not a clinical one**". **Ollama's own licence was not read today** — no licence is recorded here |
| **Qdrant** | not read | The optional vector index over the catalogue's own knowledge | `api-registry.json`'s `qdrant` card, `dark`; `apps/assistant-api/src/lib/knowledge.ts`'s `retrieveKnowledge()` | `no-key-reaches-the-browser`, `a-disabled-provider-is-never-called`, and the refusal that a keyword floor always runs so a dark Qdrant is indistinguishable to a patient | **Verified as already recorded.** `docs/FEATURE-MAP.md` 21 September: it embeds through the same `embedWithAzure()` the chat tier calls, under a shared 4-second `VECTOR_STEP_TIMEOUT_MS`, and "falls back to the keyword floor on any failure… with nothing louder than one log line". **Qdrant's own licence was not read today** |
| **MedGemma** | not read | Google's open-weights medical model | `proposed:model-gateway`, which does not exist | `docs/ROADMAP.md` line 410 is explicit and is the strongest refusal in this document: "**MedGemma is not the current default and must not be described as one.** It is a future, clinically reviewed evaluation-only model: Google's own model card says its outputs are not intended to guide clinical decisions and it is not optimised for multi-turn use… The order is evaluation on a pinned checkpoint, then a clinical and privacy review, then anything else." And `no-model-lowers-a-priority` | **Unverified** — no licence or repository was read today. The roadmap already records its position and nothing here changes it |

**Two things the register already refuses, and this survey does not reopen.** `no-single-model-is-gilbert`
— no single model or provider becomes GilbertOne; at least two are evaluated, every model and prompt
versioned, a fallback kept. And `a-consumer-assistant-is-not-gilberts-voice` — no Google Assistant,
Siri or Bixby. The `model-gateway` proposed door's four conditions are unmet, and its third is the one
that governs every hosted option in this table: "A hosted model processes in South Africa, or a
section 72 determination names where, under a data processing agreement."

**The production position today, read from the repository rather than assumed.**
`packages/catalog/model-providers.json` records that **Azure OpenAI is `built` and
`productionConfigured: true`**, running the deployment `gpt-4.1-mini` in region `southafricanorth`,
observed on 24 September 2026 — and that `residency.tier` is `null` with
`section72Determined: false`, because "Patient text — redacted of identifiers, not of anything
clinical — reaches this provider in production today. That is the gap
`docs/governance/ASSISTANT-ACTIVATION.md` records as open: no residency decision, no DPIA, no approval
on file." The registry's `no-tier-before-the-residency-decision` refusal holds it there, and the build
fails if any provider carries a tier while §7 of `DATA-RESIDENCY-OPTIONS.md` is blank. **An
open-weight local model is the one option in this table that resolves that gap rather than adding to
it** — a model on the same machine sends nothing anywhere — and the repository says as much in the
`ollama` card's `residencyWhy`, while immediately naming the obstacle: "the machine it would run on is
`liqzar-server`, which `DATA-RESIDENCY-OPTIONS.md` §2 recommends holds no health information at all."

### 5 · Load-shedding and EskomSePush

**This already exists. It is not proposed here.** Feed #22, `load-shedding-stage` — "Whether there
will be power at the visit" — landed in `packages/catalog/feeds.json` in commit `f741f87f`, "The
twenty-second door: whether there will be power at the visit". What it declares:

- **Supplier:** "EskomSePush, or Eskom's own status service, under a paid key. The free tier is
  licensed per person for non-commercial use, so a health service polling it is a breach rather than a
  bargain, and no key has been bought."
- **Route:** `POST /feeds/load-shedding-stage`, accepting `zone` (one of `geography.json`'s five —
  randburg, rosebank, parktown, melville, soweto), `stage` (integer 0 to 8), optional `slots` (ISO 8601
  intervals) and `observedAt`. **Every payload is refused**, as `feeds.json`'s `the-route-accepts-nothing`
  rule requires.
- **While absent:** "The board dispatches on roster, position and distance, and says nothing about
  power. A dispatcher who needs to know whether a zone is dark opens EskomSePush on her own phone,
  which is what she does today. Nothing here guesses a stage, and nothing here draws one."
- **Four switch-on conditions, none met:** a key licensed for a health service (with its rate limit
  recorded beside it); the zone mapping written down and owned by a named person; **a stage may not
  withdraw physical care**; and the stage shown with its age or not shown.
- **Six `neverAccepts` fields:** `patientId`, `visitId`, `address`, `deviceStatus`, `riskLevel` and
  `recommendation` — the last refused because "Physical, virtual or deferred is the decision this feed
  must never make, and refusing it at the door is what keeps the switch-on condition true."
- **Operator:** `becomesAnOperator: true`, section 72 `determined: false` — "what it is sent is a list
  of the zones a nurse service operates in. Whether it processes anything outside South Africa depends
  on where a supplier nobody has named keeps its logs."

**The third switch-on condition is the most important sentence in this section and it is worth quoting
in full**, because it is the pattern the whole survey should be read against:

> "No code derives a physical-or-virtual decision from this feed alone, and no screen presents a stage
> as a reason to defer a visit… Load-shedding does not fall evenly: the stages are worst in the areas
> with the weakest infrastructure, which are the areas this product exists to serve. An engine that
> deferred a visit on 'stage 6, no lighting' would defer it from Soweto and Alexandra and go ahead in
> Rosebank and Parktown, every day, by arithmetic — **withdrawing physical care by postcode and calling
> it a safety feature.**"

**Verification today.** `eskomsepush.gumroad.com/l/api` is reachable (HTTP 200) and carries a Gumroad
product page for "EskomSePush API Subscription", described as "used by homeowners and large businesses
across a wide range of applications, from home automation and contact-centre support to fault
reporting", with an aggregate rating of 4.6 over 136 reviews. **`api.sepush.co.za` was unreachable
from this network (HTTP 000)**, so no endpoint, no rate limit and no current pricing tier was read.
The page's own structured data reports an offer price of 0.0 USD, which is a Gumroad listing artefact
and **not** evidence of a free tier — the repository's own position, that the free tier is per person
and non-commercial, is the one to rely on, and no price is restated here.

**Adjacent, and also already built: feed #23.** `crime-statistics` landed in commit `f0bc96c7`, "The
twenty-third door, and a check on the count in prose". It is **declared and named but connected to
nothing**: `packages/catalog/apis/safety.json` lists `"doors": ["emergency-acknowledgement",
"crime-statistics"]`, and `docs/FEATURE-MAP.md` records it as "A door and not a connection… Connected
to no supplier, no endpoint and no emitter". Its supplier is "SAPS's own published crime statistics…
free to read and free to republish — or a reseller such as CrimeStatsSA", and it is **the one feed in
the file that records `becomesAnOperator: false`**, because "reading a published national statistic
engages no operator". Its nine `neverAccepts` fields refuse `riskScore`, `recommendation`,
`caseNumber`, `narrative`, `victim`, `address`, `precinct`, `patientId` and `visitId`. Two of its
switch-on conditions are worth naming because they are the governance any open-data integration here
would face: an Information Officer must have cleared a crime layer on a clinical board under a signed
DPIA, and the operator question must be re-asked of whichever supplier is actually signed.

The uncommitted work in the tree — `packages/engines/src/safety/domain/zone-overlay.ts` and its test,
`packages/catalog/field-safety.json`, `tests/zone-field-safety.spec.ts` — is a **grouping of the desk
queue by suburb, not a crime-data integration**. Its own header refuses three things: no score, no
trend, no ranking; nothing kept; no verdict. It reads no feed. **This survey does not touch it and
makes no recommendation about it.**

**No open-source load-shedding integration is surveyed here, because none is needed.** The seam exists,
its refusals are written, and what is missing is a paid key and a zone mapping owned by a named person.
An open-source Eskom scraper would be a worse answer than the door already is: it would put MyThuso
behind a licence breach and a page-layout dependency, which is the exact failure
`docs/PRIVACY-AND-SECURITY.md` line 364 refuses for credentialing authorities — "MyThuso is
deliberately **not** scraping the public forms: a confirmation resting on somebody else's page layout
goes on being asserted after it has stopped being checked."

---

## 5 · What I recommend the founder actually approve next

Ranked. Each names the smallest safe first step, and each is a **documentation or decision** step —
none is a dependency, a contract change or a deploy. The bias throughout is toward extending a door
that already exists rather than inventing one, because `a-proposed-door-is-not-a-door` allows a
proposed door only while the real one is absent and the three the register proposes are already there.

### Rank 1 — Record the SNOMED CT national position in the register, and write to the NDoH

**The smallest safe first step:** a note, not a change. Record in `packages/catalog/open-source.json`
— as a new `standard` component or as a `licenceNote` on an existing entry — that South Africa joined
SNOMED International on 14 May 2026, that the DG has gazetted the intention to introduce terminological
systems including SNOMED CT, that a National Release Centre and a National Terminological Mapping
Service are being established, and that **the licence terms, the beneficiary conditions and the Release
Centre's availability are not yet known**. Then send one email to `coding@health.gov.za` — the contact
the announcement itself gives — asking three questions: what access a private nurse-led home-care
service gets under South Africa's membership; whether registration with the National Release Centre is
required; and when a South African edition or extension will be published.

**Why this is first.** It is the highest-value, lowest-risk item in the survey. The repository already
carries 59 hand-verified SNOMED CT identifiers validated on every build by `scripts/knowledge-codes.mjs`,
and today it has **no recorded licence position for the terminology it uses**. The country joining
changes that from an open question to one with a named counterparty and a published contact. It costs
one email and one register note, and it is the kind of thing a funder, a scheme or a hospital
integrator will ask about.

**Its refusal.** Recording membership is not a licence and is not a claim of conformance. Nothing may
say MyThuso is SNOMED CT licensed, or that its codes are nationally sanctioned, until the Release
Centre answers. And `federation.json`'s `scope.excluded` is untouched: no code makes a diagnosis.

**Governance.** Satisfies `verify-do-not-invent` — the fact is read from the primary source today and
the unknowns are recorded as unknown. It does not trip `registering-is-not-depending`, because a
terminology standard is not a package manifest dependency. It answers an open item the register's own
`nhie-openhim-profile` and `hprs` entries leave unverified, without claiming either.

### Rank 2 — Resolve the Piper licence position before the voice-recording budget is signed

**The smallest safe first step:** add the two Piper repositories to `packages/catalog/open-source.json`
as one component with a `licenceNote`, exactly the way the register already handles the NextGen Connect
situation — recording `rhasspy/piper` as MIT and `archived`, `OHF-Voice/piper1-gpl` as GPL-3.0 and
maintained, and stating that the amendment names "Piper" without saying which. Then **do not sign the
R 100 000 – R 175 000 recording budget** until counsel has answered whether a GPL-3.0 TTS runtime
linked into a native app-store binary obliges MyThuso to publish source — the same question the
register's `copyleft-stays-on-the-other-side` refusal already answers for OpenEMR.

**Why this is second rather than first.** It is time-critical but not yet costly: the brief is marked
"proposed, 28 September 2026. Nothing below has been commissioned." The whole point of catching it now
is that no money has been spent. It ranks below SNOMED only because SNOMED is a question with a
counterparty who can answer it, whereas this one needs counsel, which takes longer.

**Its refusal.** No voice model is trained or shipped until the licence question is answered. And the
brief's own refusal stands unchanged: no marketing says "GilbertOne speaks isiZulu" before
`ttsAvailable` is true in the contract, and no emergency answer is read in a new voice before the
clinical listen-through is signed.

**Governance.** This is `verify-do-not-invent` in its sharpest form — a licence read from the primary
source, and a change of licence recorded rather than glossed. The register already has the precedent:
NextGen Connect's entry records a licence that *changed*, with the date and the alternative fork, and
that is "the most useful line in the file" by the register's own `_honestyNote`.

### Rank 3 — Fix three stale facts in the existing register, in one commit

**The smallest safe first step:** a maintenance pass on `packages/catalog/open-source.json`, raising
`verifiedOn` to 1 October 2026 for the entries re-read today and correcting only what changed:

- **`facebookresearch/fairseq`** is `archived: true`. The register's `meta-mms` entry records the
  CC-BY-NC-4.0 licence correctly and says "fairseq is archived and receives no fixes" in its
  `blockedBy` — but its `maintenance.lastSeen` of 30 September 2025 should carry the archived flag
  explicitly, the way a reviewer would want to see it.
- **`the-momentum/fhir-mcp-server`** last pushed 23 October 2025 — the register is right, and it is now
  a year stale. Worth re-reading before anybody reviews it.
- **`jembi/openhim-core-js`** — pushed 25 September 2026 but still no release since v8.5.0 of
  16 September 2024. The register's note is accurate and stays accurate; confirm it.
- **HAPI FHIR's release line** has moved: the register names v8.12.1 (15 September 2026); the `latest`
  release today is v8.8.2 (25 September 2026). Both are published and neither is a prerelease, so the
  version numbering is not linear — worth a note rather than a correction, and a reason not to pin.

**Why this ranks third.** It is housekeeping, and it is cheap. But the register's `_honestyNote` says
"Every source field was read from the primary source on `verifiedOn`", and a register nobody re-reads
is a register whose most useful lines go stale. It also proves the mechanism works before anything
larger is added to it.

**Its refusal.** A re-read corrects a fact; it adopts nothing. `adoption.status` stays `not-adopted`
on every one, and all five reviews stay null.

**Governance.** Directly `verify-do-not-invent`. And it must run `npm run open-source`, because
`docs/OPEN-SOURCE.md` is generated and "the build fails if this file and its source disagree".

### Rank 4 — Ask the LOINC licence question, because the repository already depends on LOINC codes

**The smallest safe first step:** one request to Regenstrief for LOINC's current licence terms, and a
`licenceNote` recording that `loinc.org/license/` could not be read from this environment on
1 October 2026 because of a Cloudflare challenge. **The question is not hypothetical:**
`packages/catalog/vitals.json` registers a LOINC code for every vital-sign type and
`scripts/knowledge-codes.mjs` validates the LOINC check digit on every build. Seven LOINC codes are in
`knowledge/`. The repository uses LOINC identifiers today and has no recorded licence position for them.

**Why fourth.** Lower urgency than SNOMED because LOINC codes have been in free public use for years
and the risk of a surprise is much lower — but that is an assumption, and the register's whole
discipline is not to make assumptions about licences.

**Its refusal.** A LOINC code names an observation. It never says what a value means: `vitals.json`'s
own `_note` refuses that every number there is a plausibility bound and never a clinical threshold.

**Governance.** `verify-do-not-invent` — recording that a licence could not be read, with the reason,
is exactly what the rule asks for rather than guessing.

### Rank 5 — Extend the two doors that already exist rather than opening any new one

**The smallest safe first step:** nothing to build. If the founder wants an integration to move, the
two doors with the shortest distance to useful are `device-reading` and `load-shedding-stage` — and
both are blocked on **procurement and paperwork, not on code**:

- `load-shedding-stage` needs a paid EskomSePush key licensed for a health service (with its rate limit
  recorded beside it) and a zone mapping owned by a named person. Four conditions, none technical
  except the mapping.
- `device-reading` needs a signed DPIA covering third-party health data, a clinical reviewer who has
  read the consent scope, a DPA, South African or approved hosting, and every device registered as
  `consumer`. **The DPIA is the same document that gates the Passport, the wearable-sync door, the
  crime-statistics overlay and Medplum.** One signature unblocks four things.

**Why this is the honest fifth.** Because it is the recommendation the founder is least likely to want
and most likely to need: **the binding constraint on this product is not the availability of
open-source software.** There are more than enough credible, permissively licensed platforms in the
table above. What every one of them is waiting on is a document with a signature on it — a DPIA, a
residency decision, an Information Officer, a clinical reviewer, a counsel opinion on copyleft.
`docs/governance/README.md` sets out the order and states plainly: "**Nothing in this folder is
reviewed, decided, registered or signed.** Every sign-off field is blank." Surveying more software
does not move that.

**Its refusal.** No door opens because a component was found. `the-route-accepts-nothing` is not a
placeholder waiting for an adapter: "A route that could accept under some condition is a route somebody
will find the condition for."

**Governance.** This is `open-source-is-not-production-approved` and `a-proposed-door-is-not-a-door`
together, and it is the reason this survey recommends a register note and an email as its top action
rather than a pilot.

### What I explicitly do not recommend

- **Not a FHIR server pilot.** HAPI FHIR, Google fhir, Medplum and ehrbase are all Apache-2.0 and all
  credible. But `apps/passport` is a zero-dependency Node service with its own SQLite file and its own
  master key, and the register already says the right thing about it: "putting a Java FHIR server
  behind it is an architecture decision for a Head of Engineering, not a registration." No Head of
  Engineering has been hired.
- **Not an integration engine.** Open Integration Engine is the maintained open path and the
  `hl7v2-inbound` door's conditions are clear, but "no hospital group or laboratory has agreed to send
  anything". An engine with no counterparty is a maintenance cost.
- **Not a wearable integration.** Momentum Open Wearables is MIT and actively maintained (pushed today,
  2 592 stars), and it is already in the register as "ADOPT / SELF-HOST where useful". It stays blocked,
  correctly, on a wearable-sync door with seven unmet conditions and a DPIA nobody has signed.
- **Not a diagnosis or symptom-scoring library of any kind.** `no-prototype-reaches-triage` and
  `owned-is-never-replaceable`. Clinical policy and triage are owned by ThusoIQ and are `replaceable:
  false`.
- **Not a new door.** The 23 in `feeds.json` cover every seam this survey found a candidate for. Where
  one was needed and absent, the register already proposes it.

---

## 6 · How each recommendation relates to the governance already set

The register's `procurementRules` and `decisions` are the founder's governance, not background. Each
recommendation is checked against them here rather than assumed compatible.

### Against `procurementRules`

| Rule | What it says | Rank 1 · SNOMED | Rank 2 · Piper | Rank 3 · Stale facts | Rank 4 · LOINC | Rank 5 · Doors |
|---|---|---|---|---|---|---|
| `no-unrestricted-passport-access` | No external component gets direct, unrestricted access to the Health Passport; all access flows through identity, consent, purpose-of-use and audit controls | **Compatible.** A terminology is a code list, not a component with access. Nothing reaches the record | **Compatible, and reinforces it.** A TTS runtime reads a sentence to speak; it has no record access at all, and `speech-state.ts` holds no network | **Compatible.** Changes no access path | **Compatible.** Same as Rank 1 | **Not engaged by this survey** — it is the rule that governs whatever attaches to a door, and every door's `through` field already names `passport-gateway` |
| `open-source-is-not-production-approved` | Licence, security, maintenance, dependency, vulnerability, data-flow and clinical-use reviews come before adoption | **Compatible.** Records a licence *question* and names a counterparty; adopts nothing. All five reviews stay null | **Compatible.** This is the rule working as intended — a licence change caught before a spend, by reading rather than by assuming | **This recommendation *is* the rule.** Re-reading primary sources is how a register stops asserting stale facts | **Compatible.** Records that a licence could not be read rather than guessing one | **This is the rule's point.** Rank 5 says the constraint is the reviews and the signatures, not the software |
| `provider-abstraction-from-day-one` | Standard request and response schemas, a model registry, feature flags, shadow evaluation and rollback; no single model becomes GilbertOne | **Not engaged** | **Engaged, favourably.** `speech-state.ts` is pure `(state, event) -> { state, effects[] }` and names no vendor, so the host owns the hardware. That abstraction is *why* an engine substitution is contained rather than a rewrite | **Not engaged** | **Not engaged** | **Engaged.** The `api-registry.json` card model — `buildStatus`, `statusToday`, `gate`, `capabilityRef`, `feedRef` — is this rule already implemented, and it is why the survey could find every external API in one place |
| `audio-and-transcripts-are-health-information` | Patient audio and transcripts get the Passport's data-minimisation, retention, encryption and consent discipline | **Not engaged** | **Directly engaged, and it strengthens the case for on-device.** The whole reason the amendment exists is that "a voice describing chest pain is special personal information under POPIA section 26 whichever vendor transcribed it". A GPL runtime on the device keeps that promise; a cloud API does not | **Not engaged** | **Not engaged** | **Engaged for `speech-transcript`.** Its five conditions include a DPA, South African processing, no audio kept, a per-language clinical comprehension test and separate consent for model improvement — and its `neverAccepts` refuses audio, audio links, voiceprints, speaker embeddings and any clinical conclusion |
| `no-search-answer-is-clinical-advice` | No internet-search answer becomes clinical advice at runtime; clinical answers are grounded in versioned, governance-approved protocols, Formulary data and patient-specific facts | **Compatible.** A terminology code is not an answer. `federation.json`'s `scope.excluded` already refuses diagnosis and prescribing | **Compatible.** A TTS engine reads an approved sentence; it composes nothing | **Compatible** | **Compatible.** `vitals.json`'s `_note` is this rule for observations: a plausibility bound, never a threshold | **Compatible.** This is why the survey recommends *against* symptom-scoring libraries, and why `symptom-intake.json` is deliberately "not triage" |
| `local-language-measured-with-real-speakers` | Local-language performance is measured with real South African speakers across age, gender, accent, code-switching, noise, low-bandwidth calls, medicine names and emergency phrases before launch | **Not engaged** | **Directly engaged.** The voice-recording brief *is* this rule being implemented — two voices per language, first-language speakers, preferably SANC-registered nurses, a linguist per language, a clinical listen-through before any emergency sentence is read. A licence change should not be allowed to shortcut it | **Not engaged** | **Not engaged** | **Engaged for `speech-transcript`**, whose fourth condition is a per-language clinical comprehension test |

### Against `decisions`

The register's twelve decisions each carry `mayServeProduction` as a boolean, and the build check fails
if one does not. Mapping this survey's candidates onto them:

- **`NAMED STANDARD` (`mayServeProduction: true`)** is where SNOMED CT, LOINC and the WHO ICD-11 API
  belong. It is the decision the register invented because "the specification makes no adopt-or-reference
  decision for a standard". **Ranks 1 and 4 are notes on entries of this kind**, and adding one changes
  nothing about what may serve production — a standard is something MyThuso implements, not software it
  runs.
- **`ADOPT / SELF-HOST where useful` (`true`)** covers Momentum Open Wearables, already registered. This
  survey recommends no new entry at this decision, because everything that would belong here is blocked
  on the DPIA.
- **`ADOPT BEHIND OUR GATEWAY` (`true`)** covers the FHIR MCP Server. HAPI FHIR, Google fhir, Medplum,
  OpenHIM and Open Integration Engine all belong at this decision if they are ever registered, and the
  gateway in each case is `passport-gateway`. **None is recommended now.**
- **`REFERENCE / ADAPT` (`false`)** is where DHIS2, Bahmni, OpenMRS, ehrbase and the OpenHIE
  specification belong: patterns to read, never a component that runs as it is. DHIS2 and Bahmni are the
  two the register does not yet carry and that this survey verified.
- **`PROTOTYPE ONLY` (`false`)** is where any symptom-scoring or diagnosis library would go — and
  `no-prototype-reaches-triage` means it never links the triage route. **The survey recommends none.**
- **`ADAPTED` (`true`)** is §45's decision for open-weights speech models, and it is the decision Piper,
  Porcupine, Silero VAD and faster-whisper would be registered under, because the amendment's whole
  premise is "open-weights speech models are fine-tuned locally in place of a licensed foreign cloud
  model". **Rank 2 is the first honest test of that decision**, and the answer is that one of the four
  named components has moved to copyleft. That is not a reason to reopen the decision — it is the
  decision's own review finding out something true.
- **`DECLINED` (`false`)** — the three declined vendors (iFlytek and Baidu, Hikvision and Dahua, Huawei
  and Zepp) are untouched by this survey and `a-declined-vendor-links-nothing` means nothing here links
  them.
- **`MODEL GATEWAY — REPLACEABLE` (`true`)** and the three speech-provider decisions are unchanged, and
  the `model-gateway` door still does not exist.

### Against `owned`

The three owned parts are `replaceable: false` and `owned-is-never-replaceable` means no component may
be registered as replacing one. Nothing in this survey does:

- **GilbertOne orchestration** — no module, framework or model replaces it. The candidates in Section 4
  are all *under* it: a wake word, a VAD, an STT, a TTS, a vector index, a fallback model.
- **Clinical policy & triage** — no module sets a triage priority, a red-flag rule or a Sentinel
  threshold. This is why Section 3 recommends *against* interaction APIs and symptom taxonomies and
  *for* licence clarity on the terminology already in use.
- **Sentinel's patient-baseline alerting** — no vendor's anomaly-detection framework replaces it. The
  device candidates in Section 2 all attach at `consumer` class, where `hardRule` already refuses that a
  reading auto-creates an incident "regardless of its value, its trend, or how many consumer devices
  agree with each other".

### Against `rules`

Two deserve naming because this document is itself an instance of them.

- **`a-proposed-door-is-not-a-door`** — and the build fails the register the day `feeds.json` declares a
  door it still proposes. This survey invents **no** door. Every row in the table attaches to one of the
  23 declared feeds, one of the three the register already proposes, an existing contract, or an
  existing route. Where nothing suitable existed, the row says so and recommends nothing.
- **`registering-is-not-depending`** — no package manifest in this repository declares a registered
  component, and the build sweeps every npm, Gradle and Xcode manifest for the `dependencyMarkers`
  names. **This survey added no dependency and installed nothing.** Every candidate here is at zero of
  five reviews, including the ones that are already registered.

---

## 7 · What could not be verified, and what would answer it

Recorded rather than smoothed over, per `verify-do-not-invent`.

### Blocked by the environment

| Item | What was tried | What came back | What would answer it |
|---|---|---|---|
| **LOINC licence terms** | `loinc.org/license/` | HTTP 403 behind a Cloudflare challenge; no text | A browser session, or an email to Regenstrief. **This is the highest-value gap**: the repository validates LOINC codes on every build |
| **WHO IMCI** — edition, licence, URL | Four `who.int` URLs and `apps.who.int/iris/rest/search` | All HTTP 000 (network unreachable) or 403 | Any network that can reach `who.int`. **The golden sets already cite IMCI danger signs**, so the provenance should be recorded |
| **RxNorm licence terms** | `nlm.nih.gov/research/umls/rxnorm/`, `/docs/`, `/docs/rxnormlicense.html`, `.pdf`, and the NLM databases download page | HTTP 200 but only a navigation shell; the three doc paths 404 | A browser session against NLM. RxNorm terms are normally a UMLS licence agreement requiring registration — **recollection, not verified** |
| **DailyMed terms** | `dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm` | HTTP 200, script shell only | A browser session |
| **SA NDoH Essential Medicines List / Standard Treatment Guidelines** | Three guessed `health.gov.za` paths | All 404; the domain itself is reachable | **The repository cites this authority on its own entries** (`knowledge/medications.json`'s Paracetamol `source.authority`, retrieved 21 September 2026) but no URL is recorded anywhere in this tree. Somebody who read it on 21 September should record where |
| **IEEE 11073-PHD / Continua** | `standards.ieee.org/ieee/11073/5592/` | HTTP 403 | IEEE Xplore access, or a purchase. Whether the standard is readable at all without membership is itself an open question |
| **Bluetooth SIG GATT health profiles** | `developer.bluetooth.com/specs/gatt/` | HTTP 403 | Bluetooth SIG membership; the SIG requires an account to download specifications |
| **`api.sepush.co.za`** | `business/2.0/status` and the docs path | HTTP 000 and 000 | Any network that can reach it. **The door already exists and its licence position is recorded**; what is missing is the current rate limit and pricing, which the door's first switch-on condition requires be recorded beside the key |
| **`instantopenhie.org`** | The project's own domain | HTTP 000 | `openhie.org` is reachable and `openhie/instant-v2` was verified on GitHub, so the project itself is not in doubt — only that domain |
| **mCSD** | Three guessed repository paths | All 404; the GitHub API rate limit (60/hour unauthenticated) was exhausted | An authenticated GitHub token, or a search. The OpenHIE organisation has 99 repositories and mCSD is an OpenHIE initiative; the correct path was not found |
| **LibreCGM and open Dexcom/Libre bridges** | One guessed path | 404; budget exhausted | A search. Several projects in this space have had manufacturer API access revoked, which is a maintenance fact worth establishing before any review |
| **Ollama, Qdrant, MedGemma licences** | Not attempted; budget spent on higher-value candidates | — | One API call each. All three are already named in `api-registry.json` or `docs/ROADMAP.md`, so their *position* here is recorded even though their licences are not |

### Gaps that a search would not answer

- **Whether South Africa's SNOMED International membership gives a private nurse service access, on what
  terms, and when the National Release Centre will publish.** Only the NDoH can answer, at
  `coding@health.gov.za`. This is the reason Rank 1 is an email.
- **Whether a GPL-3.0 TTS runtime linked into a native app-store binary obliges MyThuso to publish
  source.** Only counsel can answer, and the register's OpenEMR refusal is the closest existing
  precedent. This is the reason Rank 2 blocks a budget rather than recommending a path.
- **Whether Porcupine's `AccessKey` is validated on-device or against a Picovoice service.** The README
  requires an AccessKey from the Picovoice Console in every platform demo and the code is Apache-2.0,
  but where the check happens was not read. It matters because `packages/gilbertone`'s build fails if
  anything under `src/` calls `fetch()`, imports a network module or reads an environment variable —
  and a wake-word runtime that phones home would be a different thing from the amendment's promise.
- **Whether an open South African medicines formulary exists.** `medicines.json` says a coded medicine
  list "needs a NAPPI licence nobody holds", and nothing in this survey contradicts that. The South
  African Medicines Formulary is a published commercial reference work. **Any claim that an open
  equivalent exists should be treated as unverified until a publisher is named.**
- **Whether the gazette the SNOMED announcement refers to has been published, and what it says.** The
  announcement states the DG "has gazetted the intention". A gazette is a primary legal source and would
  answer more than a press release does. It was not located; `health.gov.za` is reachable and a search
  of its gazette notices would find it.

### What this survey did not look at

`docs/FEATURE-MAP.md` was read but **not edited** — another agent owns it. Nothing under
`docs/design-review/life-kit/` was touched. No production code, contract, lock file, generator, test or
deploy file was modified, no dependency was added, nothing was installed, and `./deploy/deploy.sh` was
not run. **The only file written is this one.**

The uncommitted work in the tree at the time of writing — `apps/web/src/features/Admin.tsx`,
`Dispatch.tsx`, `portal/Operations.tsx`, `lib/field-safety.ts`, `lib/roster.ts`, `lib/settings.ts`,
the two shells, `surface/office-identity.css`, `docs/governance/CLINICAL-REVIEW-PACK.md`,
`packages/catalog/field-safety.json`, the safety settings domain and its test,
`scripts/check-boundaries.mjs`, and the new `zone-overlay.ts`, `zone-overlay.test.ts` and
`tests/zone-field-safety.spec.ts` — belongs to another session. **This survey makes no recommendation
about it** beyond noting, in Section 4 of category 5, that the zone overlay reads no feed and draws no
crime data, so it is not an integration and is not in scope here.

---

## Counting the survey

**49 candidates surveyed**, one row per candidate across the four category tables in Sections 1 to 4.
Section 5 surveys none: the load-shedding door already exists and nothing open-source is needed for it.
By verification status, reading the table's own last column:

- **Verified — 35.** A licence, an archived flag, a last-push date or a release read from the primary
  source today (1 October 2026), or the register's own 14 September reading where the table says so.
  This includes four verified *negative* findings, which are the most useful lines here: `rhasspy/piper`
  is **archived**; `openhie/instant` is **archived**; `facebookresearch/fairseq` is **archived**; and
  NextGen Connect's licence detector returns **`NOASSERTION`**, consistent with the register's record
  that it is proprietary from 4.6. It also includes one verified finding that is a discrepancy rather
  than a fact: Silero VAD's README badge alt-text says CC BY-NC 4.0 while its LICENSE file says MIT.
- **Unverified — 13**, each with the reason in the table or in Section 7: blocked by a Cloudflare
  challenge, a 403, a network that could not reach the host, an exhausted API budget, a repository path
  that returned 404, or a fact that only a named counterparty can supply.
- **Partly verified — 1**: SNOMED CT. Its *national position* was read from `snomed.org` today and is
  verified; its *licence terms* were not, and the row says so in the same cell.

Two of the 35 verified rows verify something narrower than a licence, and their cells say what it is:
NextGen Connect is verified **as a finding** (the licence detector returns `NOASSERTION`, which is
evidence of the register's existing record, not a reading of terms), and SAHPRA is verified **as
reachable** (the site answered; the document behind it was not read). Read each row's own cell rather
than counting the label.

**Nothing unverified is presented as a fact anywhere in this document.** Where a recollection could
have been mistaken for a reading — RxNorm's UMLS terms, LOINC's free-of-charge licence — it is labelled
as recollection in the same sentence.

**Zero of the 49 has any of the five reviews recorded.** Zero is adopted. No manifest declares any of
them. That is the register's rule and this survey does not change it.
