# Clinical change checklist

**For:** anybody changing what GilbertOne or any screen says or does about somebody's health — an
emergency term, an escalation rule, a crisis line, a threshold, a clinical sentence, the clinical-delivery
voice. Written 24 September 2026, Phase 2 of `docs/PROMPT-CONTROL-TOWER-UI.md`, from the change that
set the pattern: the crisis lines added to the emergency answer that day.

A clinical change is not done when one platform shows it. It is done when all three show it the same
way, the build fails if any of them stops, a journey proves it on both viewports, the feature map says
what landed and what it refuses — and a clinician has reviewed it, or the change says plainly that none
has.

## The eight steps, and the review

The plan's Appendix B names eight steps: contract, generator, web, iOS, Android, boundary rule, journey
test, feature map. (Its §10 calls this a seven-step pattern; the eight are what the crisis-line change
actually did, so the eight are used here.) Clinical review is not a ninth step at the end. It is the
gate the whole change sits behind before real patients rely on it.

| # | Step | Done when | The crisis lines, 24 September 2026 |
| --- | --- | --- | --- |
| 0 | **Clinical review** | A ratified entry in the Clinician Review Queue names this change (`docs/governance/CLINICAL-REVIEW-PROCESS.md`), or — while no board exists — the contract records `reviewedBy: null` and says why the change went ahead unreviewed | **Not reviewed.** `crisis-lines.json` carries `clinicalReview.reviewedBy: null`, "required before real patients". A founder request, recorded as such |
| 1 | **Contract** | The words, numbers and rules live in one file in `packages/catalog/`, with a `_note`, a `why` on every rule, a `refusals` array, and where they came from. Nothing is copied from another contract; it is referenced | `packages/catalog/crisis-lines.json`: two lines with their authority, `showsWhen` naming the `crisis` group of the emergency terms, four refusals |
| 2 | **Generator** | `scripts/emit-<name>.mjs` writes the contract into Swift and Kotlin; it is registered in `package.json` (its own script and `generate`) and in the `generated` list in `scripts/check-boundaries.mjs`. Swift escapes quotes; Kotlin escapes backslash, quote and `$` | `scripts/emit-crisis-lines.mjs` → `CrisisLinesData.swift`, `CrisisLinesData.kt`; `npm run crisis-lines` |
| 3 | **Web** | `apps/web/src/lib/<name>.ts` reads the contract; every screen and every spoken reading that shows the thing uses it; nothing types it | `lib/crisis-lines.ts`; `lib/assistant.ts`, `features/Assistant.tsx`, `features/PublicAssistant.tsx` and the spoken reading |
| 4 | **iOS** | The generated file is registered in `project.pbxproj` (file reference, build file, group, sources phase); the screen and VoiceOver reading use it | `Models/CrisisLinesData.swift`; `Features/AssistantView.swift` |
| 5 | **Android** | The generated file is used by the screen and the TalkBack and voice reading | `model/CrisisLinesData.kt`; `ui/GilbertScreens.kt` |
| 6 | **Boundary rule** | `scripts/check-boundaries.mjs` fails the build on each invariant, and each check has been proved to fire by breaking its source and restoring it | Five checks: numbers agree with `knowledge/mental-health.json`; `showsWhen` names a real group; the emergency answer still begins ambulance, then mobile; no hand-written file types a crisis number; every surface puts the lines after the ambulance numbers |
| 7 | **Journey test** | A Playwright journey on both viewports (desktop 1440×1100, mobile 390×844) proves what a person sees, and what they do not | `tests/assistant.spec.ts`, `tests/public-assistant.spec.ts`: the self-harm words show both lines after the ambulance numbers; a chest pain does not |
| 8 | **Feature map** | A delivered section in `docs/FEATURE-MAP.md`: what landed, what it refuses, what did not move, and what still needs a clinician | "Delivered — crisis lines on the emergency answer" |

## Before you start

- [ ] Is it clinical? If it changes what counts as an emergency, what somebody is told to do about
      their health, a threshold, or how a clinical answer sounds — yes. If in doubt, yes.
- [ ] Is it Tier 1 (`packages/catalog/gilbert-clinical-core.json`)? Then it goes through the queue, and
      `escalation.ts`'s code hash or the emergency terms' `termsHash` moves with it — the build fails
      otherwise.
- [ ] Does it only ever raise? A change to the emergency terms may add, never silence a match
      (`gilbert-emergency-terms.json`); a known false positive is recorded, not tuned out.
- [ ] Where does the number or sentence already live? Reference it. A second copy is the defect this
      checklist exists to prevent.

## While you work

- [ ] Contract first, then `npm run <generator>`, then the three platforms — never a platform first.
- [ ] Every sentence a person reads comes from the contract, word for word, on all three platforms.
- [ ] Emergency numbers are read from `sos.json`, never typed.
- [ ] Nothing is removed or reordered from the emergency answer to make room.
- [ ] Each new boundary check is broken on purpose, seen to fail with a full sentence, and restored —
      `git diff` shows the source exactly as it was.
- [ ] No check is weakened to make the build pass.

## Before you call it done

- [ ] `npm run check` exits 0.
- [ ] `npm test` passes: every unit suite and Playwright on both viewports.
- [ ] Both native builds pass (`CLAUDE.md`, _Native builds_). If you could not run one, say so in the
      commit and the feature map; do not imply it.
- [ ] The feature map says who, if anybody, reviewed it clinically.
- [ ] The Clinical review pack (`npm run review-pack`) lists it, if it waits on a clinician.

## What this checklist does not do

It does not make a change clinically safe. It makes a change consistent, enforced and honest about its
review. Whether a crisis line, an emergency word or a threshold is right is a clinician's judgement, and
until a clinical governance board and a Medical Director exist (`packages/catalog/protocols.json#governance`),
every clinical change in this repository — the emergency terms, the escalation ruleset, the crisis lines,
the one-hour freshness window — is live and unreviewed, and says so.
