# The BidZA "GilbertOne experience scope" — read against this repository

> **A scope response for the founder's decision, written 4 October 2026.** Asked for as: *"please
> check this scope and see how do you incorporate it to gilbertone"*, with the supplied document
> *BIDZA / GILBERTONE / EXPERIENCE SCOPE* — three quiet screens, thirteen acceptance tests, three
> delivery phases and four open decisions.
>
> **This is a scope for a different site, written for a different product line.** `bidza.co.za`
> appears in this repository in exactly four places, and every one of them is a list of *other
> people's production sites sharing the box* — `AGENTS.md:49`, `deploy/README.md:22`,
> `deploy/README.md:529`, `docs/DATA-PROTECTION.md:670`. There is no BidZA code, no BidZA contract
> and no BidZA tenant here. So this document does not incorporate anything. It does four things
> instead: it establishes whose scope this is, it names the one requirement that reverses a settled
> founder amendment, it proves which of the three screens already exists in this tree and to what
> measure, and it maps all thirteen acceptance tests against what the build actually enforces today.
>
> **Nothing in this document is built by the writing of it.** No contract, lock, generator, screen,
> style or test was touched by the writing of it. Every claim below was verified by running a command
> in this tree at `b86d3176` on 4 October 2026 and reading the output; where something was not
> verified it says so.
>
> **A warning the document did not expect to need, added as it was written.** Another agent session
> began implementing this same scope in this shared checkout while §1–§7 were being verified, so the
> tree is no longer the tree the measurements below were taken on. §8 says exactly what that means and
> which statements are now time-stamped rather than current. Read §8 before acting on anything here.

---

## 1. Whose scope this is, and why that decides everything

The supplied document is a vendor-style experience scope for **BidZA**, a tender platform, wanting to
embed GilbertOne as its assistant. It is a legitimate reading of the commercialisation track, which
this repository already scopes: `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md:53` describes GilbertOne
as *"a standalone, licensable clinical-assistant API that hospitals deploy themselves"*, with
multi-tenancy as new engine module 1.

But that same file bounds it at `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md:335`:

> **GilbertOne commercialization is a separate product line.** It **must not bloat the patient web
> app** or the **282.16 kB patient-entry bundle budget**. … The engine work lives server-side in
> `apps/assistant-api` and in the lazy assistant chunk; it does not reach the patient entry.

So the scope cannot be "incorporated into GilbertOne" in the sense of editing the patient app. Three
of its screens are the *widget* — `apps/web/src/features/GilbertWidget.tsx`, whose own header
comment already says it is *"§08's GilbertWidget.tsx, and nothing behind it"* and that its five modes
are drawn while *"the shell is real and the answers are absent"*. That shell is the right home for
this scope's screens 1 and 2, and it is the surface the scope's own §02 table describes.

**The consequence for the founder:** this is Phase-2-and-later work on the commercialisation track,
not a change to the patient product. Building it into `apps/web`'s patient entry would breach the
budget rule above, and the budget is not a style preference — `AGENTS.md:16` says a rise in it
*"is a decision to bring to the founder rather than to make."*

---

## 2. The one requirement that reverses a founder amendment

The scope's **Test 05 — Natural AI call** says:

> The chosen provider passes simultaneous listening and speaking, ordinary pauses and interruption
> scenarios. **Speech-to-text alone does not pass.** Measure timing against agreed thresholds.

And its Technical references are all OpenAI Realtime documentation — *"Realtime overview and the
distinction from GPT Live"*, *"Browser WebRTC and session credentials"*, *"GPT Live and delegated
backend"*. Its Context-privacy section says the disclosure must explain *"that microphone audio will
be sent to the selected provider"*, and that one must *"not promise that audio is never stored."*

That is a **cloud duplex voice provider**. It is the opposite of the amendment in `CLAUDE.md`, which
is a founder decision of 21 September 2026:

> ALL audio processing is on-device: wake word (Porcupine), VAD (Silero), STT (faster-whisper),
> TTS (Piper). **No audio or transcript ever leaves the machine.** … **Cloud voice APIs (ElevenLabs,
> Resemble) remain prohibited for the on-device conversation mode.**

`packages/catalog/conversation-mode.json` carries it as data, and `whatItIsNot` refuses the cloud
path in its own words: *"It is not a recording. No audio is captured, buffered or kept, and no cloud
speech service hears the person for the on-device conversation."*

**This is the single decision the whole scope turns on, and it is not mine to make.** Two honest
readings:

1. **BidZA is not MyThuso's patient product**, so the amendment may not bind it. The amendment's own
   DPIA caution is written about *GilbertOne's* posture in front of regulators — but BidZA is a
   tender platform, not a health service, and its users are not patients. A cloud duplex provider on
   BidZA might be entirely defensible.
2. **But it is the same engine.** The scope says GilbertOne, and `apps/assistant-api` is one service
   with one origin policy and one `/assistant/health`. Letting a second tenant route audio to a cloud
   provider through the same engine is a change to the engine's privacy posture, not a per-tenant
   setting — unless a tenant boundary exists first, and §3 says it does not.

If the founder wants BidZA's voice to be cloud duplex, the amendment needs a dated carve-out naming
BidZA, and `packages/gilbertone` must stay on-device for MyThuso regardless — because
`packages/gilbertone` is what answers *"when the engine above is dark or unreachable."*

**What is already true, and what Test 05 would actually reject.** `packages/catalog/assistant.json`
already declares `"bargeIn": true`, `"wakeWord": true`, `"echoCancellation": true`,
`"perUtteranceCapSeconds": 45`, `"recognition": "on-device"` (with `"webRecognition": "browser"`),
and its `amendmentNote` reads *"Full duplex conversation with on-device Porcupine wake word, Silero
VAD, faster-whisper STT, Piper TTS."* So the *behaviour* Test 05 asks for — simultaneous listening
and speaking, ordinary pauses, interruption — is built and passing. What Test 05 rejects is the
*implementation*: it is browser speech recognition plus synthesis, which the scope calls
"speech-to-text alone."

---

## 3. What cannot be built yet, whatever is decided

Three hard gates, each verified rather than assumed.

### 3.1 There is no tenant registry — so Test 09 is unbuildable

The scope's **Test 09 — Context isolation** requires *"two tenants, two roles, logout, tender
switching and reset"* with *"denied records never enter prompts, captions, source previews or logs."*

`packages/catalog/gilbertone-inference-isolation.json` was written for exactly this and says plainly
that it cannot be done:

> *"there is no tenant registry anywhere in this repository. `packages/catalog/clinical-review-queue.json`'s
> tenantRef is the only tenant concept in the whole catalog, and it names one Tier 2 clinical-protocol
> addition, not a data boundary, a cache boundary or an embedding-index boundary."*

Its fifth refusal is the gate: **`no-inference-isolation-without-a-tenant-contract`** — *"Nothing
above may be built, and nothing may claim inference isolation exists, until a tenancy contract is
authored elsewhere in this catalog naming what a tenant is and how a tenantRef is minted and
checked."*

`scripts/check-boundaries.mjs` enforces the floor of this today: the retrieval cache in
`apps/assistant-api/src/lib/knowledge.ts` keys on query text and `topK` alone, and the build fails if
any file in `apps/assistant-api/src` names a tenant while `cacheKey` is not tenant-aware. Verified:
the check reads `cacheKey` by name and fails the build if it moves, so it cannot silently pass over
nothing.

**So the scope's own Phase 3 and its entire multi-tenant privacy model are gated on a tenancy
contract that does not exist.** That is new-engine-module 1 of the commercialisation plan, and it is
not a small piece of work.

### 3.2 The origin policy refuses BidZA outright

A widget on `bidza.co.za` calling `apps/assistant-api` would be refused.
`apps/assistant-api/src/lib/origin-policy.ts` carries the whole production allow-list, written out:

```
const PRODUCTION_ORIGINS = [
  "https://mythuso.co.za",
  "https://www.mythuso.co.za",
];
```

and `originAllowed` returns exactly that list when `NODE_ENV === "production"`. The development
variable `MYTHUSO_ASSISTANT_DEV_ORIGINS` is read **only outside production**, which the file's own
comment explains is deliberate: *"it cannot widen a real deployment even if it is left set on the
box."* The refusal is in the contract at `packages/catalog/apis/assistant.json`, on every route:

> `origin-not-allowed` (403) — *"This service answers its own site only."* … *"A browser origin this
> deployment does not answer is refused before any route reads the URL, and a health check is no
> exception."*

The file also records why the previous wildcard was wrong, and the reasoning applies unchanged to
adding BidZA:

> *"the wildcard therefore bought nothing a patient uses and gave the paid Azure endpoint, at
> somebody else's page, a free proxy into it."*

**So serving BidZA needs a deliberate widening of a security control that was narrowed on purpose on
21 September 2026** — plus, since the routes authenticate nobody (*"nothing in this service
authenticates a caller"*), a per-tenant key. `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md` flags that
artifact as not existing: *"There is no scoped-API-key or per-tenant-key artifact yet."*

### 3.3 No Jitsi, and the scope agrees with me about where it belongs

The scope places Jitsi correctly — on the **human** call, never the bot:

> *"Talk to BidZA opens the human Jitsi call path. It has a distinct button, description, connection
> state and readiness gate. **It must never appear to be an AI call** or automatically transfer a
> person into a human room."*

That is the same conclusion recorded in `docs/ROADMAP.md` earlier today (*"Founder-requested — Jitsi
for a two-way call with GilbertOne, assessed 4 October 2026"*), reached from the other direction.
Nothing here changes it: Jitsi still cannot go in the MyThuso web build, because `script-src` is
`'self'` alone and `camera=()` is sent in production. For BidZA it would be a *different* deployment
with its own origin, CSP and Permissions-Policy — which the scope correctly defers to Phase 3 and
correctly says *"requires separate verification."*

---

## 4. What already exists, measured against the scope's own numbers

The scope's three screens are not a blank sheet. `GilbertWidget.tsx` draws all five modes it names,
and the live assistant panel in `Assistant.tsx` has the conversation. Verified specifics:

### Screen 1 — Collapsed launcher: **substantially met already**

| Scope requires | In this tree | Verdict |
|---|---|---|
| 56–64 px circular target | `.go-launcher { width: 60px; height: 60px; border-radius: var(--r-pill); }` (`gilbertone.css:96`) | **met** — 60 px, dead centre of the range |
| Accessible name *"Open GilbertOne"* | `aria-label="Open GilbertOne"` (`GilbertWidget.tsx:172`) | **met — exact string** |
| Min 16 px viewport inset | `right: var(--space-20); bottom: var(--space-20)`, and `--space-20:20px` (`tokens.generated.css:98`) | **met** — 20 px |
| Plus the device safe area | `env(safe-area-inset-*)` appears on `.go-panel` only (`gilbertone.css:149`), **not** on `.go-widget` (`:95`) | **gap** |
| Does not auto-open | `onClick={() => setOpen(true)}`; no timer, no effect opening it | **met** |
| No repeated pulse | **0** `@keyframes` and **0** `animation:` declarations in `gilbertone.css` | **met** |
| No invented unread badge | no `badge`, `unread` or `autoOpen` anywhere in `GilbertWidget.tsx` | **met** |
| Short tooltip on hover/focus | not found | **gap** (minor) |

### Screen 2 — Compact chat: **met in structure, off on the numbers**

| Scope requires | In this tree | Verdict |
|---|---|---|
| 380 px panel, adjustable 360–420 | `.go-panel { width: 340px; … }` (`gilbertone.css:99`) | **gap** — 340 px, below the stated floor |
| Max height 640 px | `max-height: min(700px, calc(100vh - var(--space-40)))` | **gap** — 700 px |
| Header with name, close, discreet menu | `.go-panel-head` with `aria-label="Close GilbertOne"`, Minimise, Pause motion | **met** |
| *New conversation* in that menu | **"Start again"** exists and does it — `GilbertOneServices.tsx:175`: *"Start again gives the panel a new conversation id"* | **met, differently named** |
| One opening prompt | `assistant-chat-ui.json`'s `welcome` / `hello` keys, read rather than typed | **met** |
| At most three chips, removed on start | `CHIPS.map(...)`, commented *"§02's three dashboard chips"* (`GilbertWidget.tsx:31, 215`) | **met** |
| Single transcript, plain composer, Send | present in both surfaces | **met** |
| Clearly labelled *Talk to GilbertOne* | `assistant-chat-ui.json#talkLabel`, rendered by `AssistantVoiceButton.tsx` | **met** |
| Source links beside claims | observed live today: *"Sources: MyThuso's approved answers, reviewed and written in advance"* | **met** |
| Longer text behind *Show details* | no `Show details` / `showDetails` anywhere in `apps/web/src` or `packages/catalog` | **gap** |
| *Talk to BidZA* as separate secondary | not built | **gap** (BidZA-specific) |

### Screen 3 — Minimal voice view: **not built, and blocked by §2**

The scope is explicit: *"Replace the chat body with a dedicated voice surface rather than adding
panels around it"*, showing *Start call* before capture and *Mute, End call, Use text* during.

- **No dedicated voice surface.** No `voiceView`, `voice-view`, `Start call` or `End call` in
  `apps/web/src`. Voice today lives *inside* the chat panel, which is precisely the arrangement the
  scope rejects.
- **No Mute.** `mute` appears nowhere in `Assistant.tsx`, `lib/voice.ts` or
  `conversation-mode.json`.
- **The two controls that do exist** are *"Tap to talk to GilbertOne"* and *"Talk hands-free with
  GilbertOne"*, plus *"Stop the voice"* and *"Type instead"* while a reply is read. *Type instead* is
  functionally the scope's *Use text*.
- The surface itself is the cheap part. What is expensive is the provider behind it — §2.

### Accessibility: **stronger than the scope assumes**

- **Focus returns on close**, twice over: `Escape` → `launcher.current?.focus()`
  (`GilbertWidget.tsx:112`) and the close button → `launcher.current?.focus()` (`:188`). That is the
  scope's *"closing returns focus to the launcher"*, already true.
- **Focus moves into the surface on open**: `field.current?.focus()` (`:122`).
- **Mobile sheet below 600 px** with safe-area padding: `gilbertone.css:149`.
- **Reduced motion**: `prefers-reduced-motion` is handled in `GilbertAvatar.tsx` (and four other
  components).
- **Captions are already the reply.** Observed live today: *"GilbertOne is reading the answer aloud.
  The same words are written on the screen for as long as the voice speaks, and tapping the
  microphone stops the voice and opens it for you."* The scope's optional caption toggle is therefore
  a toggle over something that already exists by default.
- **Not verified:** 44 px control targets, and the scope's required matrix of 320/375/768/1440 px
  plus landscape and 200 % zoom. `playwright.config.ts` runs two projects — desktop **1440×1100** and
  mobile **390×844** — so 320 px and 200 % zoom are untested. That is a real gap in *evidence*, not
  necessarily in behaviour.

### One thing the scope asks for that MyThuso does and should stop doing

Scope Phase 1: *"Keep technical health diagnostics out of the normal conversation."* The panel
currently shows **"Demo connectors on (12)"** inside the conversation, from
`packages/catalog/gilbertone-connectors.json#demoSummary`. On a demonstrator that is honest and
useful; on a tenant's production site it is the scope's complaint exactly. Worth noting because it is
a *small* change with a *large* honesty implication, and because removing it from the MyThuso
demonstrator would be wrong — the demonstrator is labelled as a demonstrator.

---

## 5. All thirteen acceptance tests, mapped

Legend: **met** = enforced or observed in this tree · **partial** = some of it exists · **gap** = not
built, buildable · **blocked** = gated on something that does not exist or on a founder decision.

| # | Test | Status | What was verified |
|---|---|---|---|
| 01 | Launcher | **partial** | 60 px, exact `aria-label`, 20 px inset, no animation, no badge, no auto-open — all met. **Gap:** no safe-area on `.go-widget`. |
| 02 | Responsive layout | **partial** | Mobile sheet + safe-area below 600 px; focus return on Escape and close. **Gap:** only 1440 and 390 are in `playwright.config.ts`; 320/768/landscape/200 % zoom untested. |
| 03 | Quiet conversation | **partial** | One prompt, ≤3 chips, one transcript, one composer, sources beside claims. **Gap:** no `Show details`; no output-length contract (`turnTextMaxCharacters: 4000` caps *input*, not reply length). |
| 04 | First use & denial | **met** | Disclosure shown before the first tap; observed live today — *"GilbertOne did not catch that. Nothing was kept. Tap to talk again, or type it instead."* That is the text fallback with no repeated prompt. |
| 05 | Natural AI call | **blocked** | Behaviour is built (`bargeIn`, `wakeWord`, `echoCancellation`, 45 s cap, 24 passing journeys). The *provider class* the test demands reverses the 21 September amendment — §2. **Founder decision.** |
| 06 | Interrupt & cancel | **met** | Passing today: *"starting to talk while GilbertOne reads stops the voice, and the words become the next turn"*; *"a single stray word while GilbertOne reads does not stop it"*; *"Stop ends everything at once, and the words caught go nowhere."* 24 passed, both viewports. |
| 07 | Mute & end | **partial** | End/Stop/close/panel-close all stop capture and release (tests 7, 8, 11). **Gap: no Mute control at all.** |
| 08 | Recovery | **gap** | No Retry affordance and no disconnect states in the voice surface. Nothing tested. |
| 09 | Context isolation | **blocked** | *"there is no tenant registry anywhere in this repository"*; refusal `no-inference-isolation-without-a-tenant-contract`; `cacheKey` is not tenant-aware and the build holds that. — §3.1 |
| 10 | Grounded answers | **met** | Deterministic matcher over approved sentences: *"I answer only from a short list of approved sentences, and what you said is not one I can match."* The LLM tier answers only where the matcher found nothing, never for an emergency, always under a heading saying a model wrote it and it can be wrong. |
| 11 | Accessible operation | **partial** | Focus in and back out, Escape, labelled buttons, reduced motion, captions-as-reply. **Gap:** 44 px targets unverified; keyboard/screen-reader path through *mute* and *end* cannot be tested until they exist. |
| 12 | Human handoff | **partial — and correctly refused** | `assistant-chat-ui.json#nurseOfferBody`: *"You can prepare a summary of this conversation for a nurse instead. **Nothing reaches a clinician until the identity, roster and destination contracts exist — the panel will say so plainly if you try to send it.**"* That is the scope's own rule verbatim in spirit: *"If no receiving route exists, provide the summary for the person to copy rather than imply that a handoff was sent."* **Gap:** no Jitsi, no distinct AI/human labels, no editable preview. |
| 13 | Confirmed actions | **met** | There are no CRM writes to confirm. The identity service is deliberately off, so nothing sends and no timeout can be reported as success. |

**Four met, five partial, one gap, three blocked.** Of the three blocked, two are gated on a tenancy
contract and a per-tenant key, and one — the most important — is a founder decision about the
amendment.

---

## 6. How it would actually be incorporated, in this repository's shape

Re-cut the scope's three phases against what the build enforces. Note that Phase 1 as the scope
writes it is *mostly already done*, which changes the order.

### Phase 0 — decisions, no code (the founder's, and only his)

1. **Is BidZA a tenant of `apps/assistant-api`, or its own deployment?** Everything in §3 follows
   from this. One engine with a widened origin allow-list and a per-tenant key, or a second
   deployment with its own origin policy, is a materially different build — and the second leaves
   MyThuso's patients untouched, which the budget rule at
   `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md:335` is there to protect.
2. **Does the 21 September amendment bind BidZA?** If cloud duplex is wanted, it needs a dated
   carve-out naming BidZA, and `packages/gilbertone` stays on-device for MyThuso either way.
3. **Which voice provider, and what is the spending cap and latency threshold?** Test 05 says
   *"measure timing against agreed thresholds"* — there are no agreed thresholds anywhere in this
   tree.
4. **Who owns Jitsi readiness and which BidZA team receives a handoff?** Phase 3 cannot start
   without a named owner.

### Phase 1 — the cheap, unblocked, genuinely useful work

None of this touches a gate. All of it improves MyThuso's demonstrator *and* is what BidZA would
inherit:

- Launcher safe-area (`env(safe-area-inset-right/bottom)` on `.go-widget`) and a hover/focus tooltip.
- Panel geometry to the scope's numbers, **as contract data rather than CSS literals** —
  `packages/catalog/assistant-chat-ui.json` already holds this surface's words, so its dimensions
  belong beside them, with `scripts/emit-*.mjs` writing them out. A number lives in one place.
- `Show details` progressive disclosure, and a reply-length contract (one to three sentences, longer
  behind the toggle). This is the scope's *"short-answer contract"* and it is the one item that would
  change what patients read, so it needs its own care.
- A **Mute** control, with the state machine change in `packages/gilbertone/src/speech-state.ts`
  rather than in the widget — mute is a conversation state, not a button.
- The dedicated voice surface (screen 3), *with the on-device provider it already has*. This is
  buildable today and is what makes Test 05's behaviour visible as a distinct screen.
- Recovery states and a Retry that creates exactly one session.
- Widen the Playwright projects to 320 and 768 px, landscape and 200 % zoom, so Test 02 and Test 11
  have evidence rather than assertion.

### Phase 2 — gated on the tenancy contract

- Author the tenancy contract in `packages/catalog` naming what a tenant is and how a `tenantRef` is
  minted and checked — the thing refusal `no-inference-isolation-without-a-tenant-contract` waits on.
- Make `knowledge.ts`'s `cacheKey` tenant-aware **in the same change**, which the boundary check
  already demands the moment any file names a tenant.
- Author the per-tenant scoped API key artifact the commercialisation plan flags as missing.
- Then, and only then, widen `origin-policy.ts` — as a new version of the refusal, not an edit.
- Test 09's two-tenant, two-role, logout and reset matrix.

### Phase 3 — gated on the provider decision and on Jitsi verification

- The cloud duplex adapter, if Phase 0 permits one, behind its own contract and its own gate.
- Jitsi for the **human** call only, on BidZA's own deployment, with the distinct button, connection
  state and readiness gate the scope requires.
- The editable approved-summary handoff — noting MyThuso already refuses to imply one was sent.

---

## 7. One inconsistency found while checking, unrelated to this scope

Three documents still state the patient-entry budget as **282.16 kB**:
`CLAUDE.md:28`, `AGENTS.md:16` and `docs/COMMERCIAL-AND-CONTROL-TOWER-SCOPE.md:336`.
`docs/ROADMAP.md:1163` records a measurement of **256.10 kB** on 2 October 2026, against a
same-tree 256.12 kB baseline, taken the documented way.

This matters here because the budget is the reason the BidZA scope must not be built into the patient
entry — and a rule quoted from a stale number is a weaker rule. It was **not** corrected in this
change: `CLAUDE.md` and `AGENTS.md` are the brief itself, and `AGENTS.md` says the figure *"is a
decision to bring to the founder rather than to make."* Flagged for his decision, not edited.

---

## 8. What was not done — and what another session is doing right now

**By this document:** no contract, lock, generator, screen, style, test or deploy was changed. Jitsi
was not added to anything, no voice provider was selected, no origin was widened, no tenant was
invented, and the patient-entry bundle was not touched. Nothing was deployed, and `liqzar-server` was
not contacted. The only file this work wrote is this one.

Two services were left running for the founder to try the existing conversation mode, both on
loopback: `apps/assistant-api` on `127.0.0.1:8791` (`/assistant/health` →
`{"ok":true, …, "activated":true}`) and the web dev server on `:5173`, serving
`/app/?open=assistant`. Neither is a deployment; both are local processes.

### 8.1 A second session is implementing this scope concurrently

`AGENTS.md` warns that *"this checkout is shared by several agent sessions."* That is live, and it
matters here. The tree was **clean at `b86d3176`** when §1–§7 were verified. By the time this section
was written, `git status` showed work that is plainly this same BidZA scope being built:

```
 M apps/android/app/src/main/java/za/co/mythuso/model/AssistantData.kt
 M apps/ios/MyThuso/Models/AssistantData.swift
 M apps/web/src/components/AssistantLauncher.tsx
 M apps/web/src/features/Assistant.tsx
 M apps/web/src/features/PublicAssistant.tsx
 M apps/web/src/surface/care-journey.css
 M packages/catalog/assistant.json
?? apps/web/src/features/gilbert-quiet.tsx
?? apps/web/src/features/gilbertone-experience.css
?? docs/governance/BIDZA-GILBERTONE-EXPERIENCE-SCOPE.md   <- this document
```

`apps/web/src/features/gilbert-quiet.tsx` opens: *"The BidZA / GilbertOne experience scope: three
quiet screens on the assistant that already exists. This module draws the chrome. It does not invent
a conversation, a voice provider or a human room."* It carries `TENDER_CHIPS` — *Explain this tender*,
*What do I need*, *Help me get started* — and a `pageCue()` that turns the opening prompt into
*"What would you like to know about this tender?"* on a tender page. That is the supplied scope's
screen 2, near-verbatim. `gilbertone-experience.css` sets `width: min(380px, …)` with
`env(safe-area-inset-*)` — the 380 px and the safe-area gap from §4.

**`npm run check` currently fails, and the failure is that session's, not this document's:**

```
Error: apps/ios/MyThuso/Models/AssistantData.swift is older than packages/catalog/assistant.json.
Run: npm run assistant
```

The cause is visible in the diff. `packages/catalog/assistant.json` was edited at **18:18:13**,
changing `callToAction` from `"Ask GilbertOne"` to `"Open GilbertOne"` — the accessible name this
scope's screen 1 requires — and `AssistantData.swift` was generated at **18:18:03**, ten seconds
earlier. `scripts/check-boundaries.mjs:3211` compares mtimes and refuses, correctly. The fix is the
one the message names: `npm run assistant` (also part of `npm run generate`), then re-check.

**This document did not run that command, deliberately.** It would regenerate files another session
owns mid-edit, and `AGENTS.md` says not to half-migrate a surface someone else is working on. Leaving
a red build for its author to finish is the smaller harm.

### 8.2 Which statements above are now time-stamped

Everything in §1, §2, §3 and §6 describes **contracts and rules**, which the concurrent edits do not
change — there is still no tenant registry, `origin-policy.ts` still allows exactly two production
origins, and the amendment still prohibits cloud voice. Those hold.

The **measurements in §4 and the test mapping in §5 are stated as of `b86d3176`** and are already
partly overtaken: `.go-panel`'s 340 px width, the missing launcher safe-area, and the absent
`Show details` are all things the new `gilbertone-experience.css` appears to address. Re-verify
against the current tree before quoting a number from §4 to anybody.

The §5 verdicts that **cannot** be overtaken by a stylesheet, because they are gated rather than
unbuilt, are unchanged: **Test 05** needs the founder's amendment decision (§2), and **Test 09**
needs a tenancy contract that does not exist (§3.1). No amount of concurrent UI work makes either
passable.

