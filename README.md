# MyThuso

**Help. Health. Home.** — a nurse at your door, a doctor on the screen, your record in your pocket.

*Thuso* means *help* in Setswana and Sesotho.

MyThuso is an on-demand primary-healthcare platform for South Africa. A SANC-registered
nurse arrives at the patient's home in under an hour carrying a connected diagnostic kit.
Vitals, ECG, blood glucose, wound and eye images and rapid tests are captured digitally,
screened by AI, then reviewed and signed off by a doctor on a telehealth panel — clinic-grade
care in the living room, from R249.

It is a marketplace, not a clinic. Nurses are independent partners who keep 75% of visit
fees; doctors review cases remotely; pharmacies and laboratories fulfil orders through the
platform.

> The nurse is the hands, the AI is the filter, the doctor is the decision.

## Status

Pre-code. This repository currently holds the brand assets and the funding proposal that
define what gets built. The application scaffold lands next.

## Repository layout

| Path             | Contents                                                          |
| ---------------- | ----------------------------------------------------------------- |
| `Documentation/` | Logo and app icon (SVG + PNG), the Pod / Band / Home / Lab concept renders, and the funding proposal |
| `.devcontainer/` | Codespaces definition — Node 22 on Debian bookworm                |

## Platform modules

The proposal defines the build in phases. Phase 1 is the minimum that makes a visit
possible end to end:

- **Thuso Nurse** — on-demand visits: injections, family planning, vitals and chronic
  checks, wound care, blood draws, post-op, mother and baby, elderly care
- **Thuso Doctor** — telehealth GP panel: reviews AI-flagged results, diagnoses,
  prescribes, issues certificates
- **Thuso Kit** — connected Bluetooth diagnostics carried by every nurse, syncing
  straight into the patient record
- **Thuso AI** — screening across vitals, ECG, images, audio and rapid tests; every
  output reviewed by a doctor
- **Control Tower** — live operations map, dispatch, vetting pipeline, incident queue,
  doctor review queue

Later phases add the patient-owned **Thuso Pass** health passport, subscriptions,
pharmacy and lab fulfilment, wearables, employer contracts and own 5G-connected hardware.

## Development

Open in a Codespace, or clone and work locally. The devcontainer pins Node 22 so a
Codespace does not quietly build on a different runtime than a laptop does.

## Confidential

The funding proposal in `Documentation/` is confidential and unpublished. This repository
is private and should stay that way.

---

Akhanya IT Innovations (Pty) Ltd · Johannesburg
