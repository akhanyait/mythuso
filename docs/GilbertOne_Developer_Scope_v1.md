# GilbertOne — Your MyThuso Agent

PRODUCT & ENGINEERING SCOPE

 GilbertOne

Your MyThuso Agent

Conversation, emotional responsiveness
and character animation

A quiet, expressive robot that responds to the conversation — without covering the app in glow, movement or pop-ups.

Visual reference from this conversation. Static concept only; the motion, backend connections and behaviours below are proposed, not demonstrated by this image.

| Document control | Scope basis |
| --- | --- |
| Version 1.0 • 17 September 2026 | English-first proof of concept, followed by gated integration and validation. |
| Prepared for Akhanya IT Innovations | The supplied Gilbert transcript and the MyThuso / GilbertOne visual references. |
| Status: proposed implementation scope | Not a deployment confirmation, tested code delivery or clinical/compliance approval. |

Core design decision: animate attention and timing, not decoration. Keep the white robot head, dark visor, subtle teal features, small orange mark and restrained lime accents.

SOURCE-DERIVED BASELINE + PROPOSED ADDITIONS

# 01  Scope basis & decisions

The reference describes a lean POC with browser speech recognition, MedGemma 4B through Ollama, TF-IDF retrieval from knowledge_base.json and a pre-model red-flag layer. It describes six files: server.py, gilbert.js, gilbert.css, knowledge_base.json, demo.html and README.md. Preserve these integration boundaries while replacing the visual client with an expressive GilbertOne component. [S1, lines 269–276; 318–327]

The attachment is a conversation transcript, not those six source files. Its statements that code was built and tests passed are reported claims, not tests verified for this scope. No live MyThuso code or deployment was inspected. [S1, lines 316–327; 348–350]

| Carry forward from the reference | Add in this scope |
| --- | --- |
| Natural English first; other languages later. | A consistent GilbertOne persona and short, context-aware replies. |
| Browser speech, local model adapter, small knowledge base. | An independent voice adapter, conversation state and sentence-level output checks. |
| Client and server safety checks. | A safety override that can cancel speech and all playful animation. |
| Limited session history; longer-term memory deferred. | Structured task memory and tentative, session-only response-style cues. |
| Embeddable chat client. | A React widget, controllable robot rig and accessible DOM-based chat controls. |

## Important implementation clarifications

MedGemma is an open-weight foundation model subject to its Health AI terms, not an unrestricted, clinically approved chatbot. Google states that its outputs are not intended to directly guide clinical decisions and that it is not evaluated or optimised for multi-turn applications. The medical-model track therefore remains internal evaluation until the downstream use is appropriately validated. [R1]

The reference’s “free” aim should mean no required paid model API for a local POC, not zero development, hardware, hosting or review costs. Browser speech is not guaranteed to stay on the device. Some implementations send audio to a recognition service, which must be disclosed. [S1, lines 271–276; R2]

## Scope boundary

Build care navigation, approved general information, empathetic interaction and explicit handoff. Do not release autonomous diagnosis, prescribing, emotion diagnosis, camera-based mood surveillance, automatic model training, unconfirmed bookings or payments under this POC.

CLEAN • TRANSPARENT • PURPOSEFUL

# 02  Widget experience & brand

Keep the name “GilbertOne” and subtitle “Your MyThuso Agent”. Use the supplied MyThuso logo unchanged wherever the parent brand appears. The robot should have a white or pearl shell, dark visor, soft teal eyes, a small orange forehead accent and very limited lime highlights.

| Mode | Proposed behaviour and dimensions |
| --- | --- |
| Collapsed launcher | A 56–64 px robot-head button in the lower-right safe area. Accessible label: “Open GilbertOne”. No automatic speech, pop-up solicitation or microphone capture. |
| Welcome state | A 320–360 px-wide light card on desktop, with a 100–140 px transparent robot head, short greeting, text entry and no more than three action chips. |
| Conversation state | Reduce the robot to 56–72 px in the header. Give the transcript the space. Keep stop-speaking, microphone state and close/minimise controls visible. |
| Mobile | Use a keyboard-aware bottom sheet and a compact head. Do not cover emergency controls, the current form’s primary action or the safe-area navigation. |
| Unavailable / offline | Keep the shell usable. Show a plain unavailable message, permitted local navigation and retry; do not invent an answer or show “Connected”. |

## Transparent means genuinely transparent

The avatar canvas or SVG has an alpha background: no green rectangle, neon haze, floating planets, orbit rings, glitter or outer glow cloud. Keep only a soft contact shadow. The chat card may have a light, readable surface; transparency is for the character, not an excuse for unreadable text.

## Context-sensitive actions

On the dashboard, show “Book a nurse”, “My visits” and “Ask a question”. During a booking, replace them with the relevant next choices. Offer “Summarise a document” only once the secure document flow exists. Pop-ups appear in response to a user action and disappear when their task ends.

## Identity and controls

Keep “AI” out of the product name. An accessible About / privacy panel must still explain that GilbertOne is an automated assistant, not a person or clinician. Provide text-only mode, sound on/off, reduced motion, a pause-animation control and clear conversation.

All dimensions and visual treatments on this page are proposed design specifications, not measured properties of the current app.

PROPOSED MOTION VALUES FOR TESTING

# 03  Animation library: attention

Use a state-driven character rig rather than a looping image. Head, eyes, eyelids, eyebrows and mouth must be independently controllable. The table specifies starting values for design review; tune them on the actual widget size and target devices.

| ID / behaviour | Trigger | Motion and timing |
| --- | --- | --- |
| A01 • Greet | User opens widget. | A small head lift and single nod; settle within 600–900 ms. A gentle smile, no bounce sequence and no repeated spoken introduction. |
| A02 • Idle | Open, no active turn. | Nearly still. Optional 1–2 px slow drift over 5–7 s. Pause when the tab is hidden, the avatar is offscreen or motion is disabled. |
| A03 • Blink | Idle or normal interaction. | Irregular blink spacing around 4–8 s; eyelids close and reopen in 120–180 ms. Occasional double blink, never a repetitive flashing effect. |
| A04 • Look at input | Input receives focus. | Move the eye group down towards the input. Smooth 200–350 ms ease; no access to camera or gaze tracking. |
| A05 • Read a message | A submitted message appears. | Look briefly towards its bubble. Use bounded UI coordinates, not the perceived emotion of every typed keystroke. |
| A06 • Look left / right | Action card or new bubble appears. | Small eye shift; head yaw limited to about 6–8 degrees. Return to a relaxed central pose. No exaggerated swivelling. |
| A07 • Listen | Actual microphone capture begins. | Attentive eyes, slight forward tilt, mouth closed. A waveform is allowed only from captured audio levels, not an invented “live” signal. |
| A08 • Process | Request is being processed. | Subtle thinking glance and a small status indicator. Never show “Listening” when only waiting for the server. |
| A09 • Acknowledge | A normal turn or confirmed action completes. | One 400–650 ms nod. Nod to acknowledge the message, not to imply that an unsafe or false statement is correct. |

## Motion should respond to the message, not interrupt it

Keep at most one prominent gesture at a time. Preserve the current eye direction when transitioning into speech, then return to neutral. Decorative idle movement must yield immediately to user interaction, playback, accessibility settings and safety events.

MOUTH MOVEMENT • EMOTION • INTERRUPTION

# 04  Animation library: expression

| ID / behaviour | Trigger and rules | Motion |
| --- | --- | --- |
| A10 • Speak | Audio playback actually starts. | Use speech-aligned mouth shapes. Mouth closes for pauses and at playback end. Head and eyes make restrained supporting movements. |
| A11 • Support | User explicitly describes worry, sadness or frustration. | A smaller smile or neutral mouth, soft attentive eyes, slight head tilt. No fake tears, alarmed face or exaggerated pity. |
| A12 • Clarify | A reference or request is ambiguous. | A small brow lift and 4–6 degree tilt; settle while asking one specific question. Avoid a permanently confused expression. |
| A13 • Appreciate | Thanks or genuinely positive news. | A brief warm smile and small nod, typically under 900 ms. Do not celebrate a serious medical result or a failed transaction. |
| A14 • Yawn | Explicit “show me a yawn” or optional playful idle mode. | Eyes narrow, mouth opens gradually, head tilts back slightly, then resets; 1.8–2.4 s. No sound required. |
| A15 • Interrupt | Stop, new submitted turn, cancellation or urgent override. | Cancel current speech and stale cues; close mouth and return to attentive pose. Target stop response below 200 ms on supported devices. |
| A16 • Urgent support | Approved safety logic flags a potentially urgent situation. | Stable, neutral-attentive face. Stop yawns, smiles and decorative motion. Surface the approved action immediately. |
| A17 • Error / reconnect | Voice, model or app request fails. | Brief neutral pause, then useful error text. No distressed robot, guilt language or endless thinking loop. |

## Yawn is included, but never as a response to distress

Default yawning off in care conversations. In an opt-in playful demo it may occur once after at least 120 seconds of inactivity, with a minimum five-minute cooldown. Suppress it during typing, reading a new message, speech capture, processing, playback, health discussions, support cues and urgent handling. Do not imply the user is boring GilbertOne.

## Animation ownership and interruption

Use separate tracks for interaction state, response style and facial articulation. Resolve priority as: safety override → privacy/error state → interruption → listening/speaking/task activity → response-style gesture → idle. Blend normal transitions over 150–300 ms; safety and stop events do not wait for the previous animation to finish.

Every response and animation sequence needs a turn_id and cancellation token. A late answer from an earlier turn must never restart the mouth, change the face or replace the current action.

RESPONSE STYLE, NOT EMOTION DIAGNOSIS

# 05  Emotionally responsive dialogue

GilbertOne should respond to what the person says and the immediate context, not claim to read their mind. Use tentative conversational cues only. An uncertain inference defaults to a neutral-helpful response. Do not attach psychological labels to a patient record or infer emotion from a face, accent or voice biometrics in this POC.

| Fictional user message | Response behaviour | Character response |
| --- | --- | --- |
| “I am worried about my mum.” | Acknowledge the worry, then clarify the practical need: “That sounds worrying. Is this about arranging care or understanding information you have received?” | Attentive eyes and a slight supportive tilt; no grin. |
| “You are not understanding me.” | “I have misunderstood. Let me check: are you trying to change the visit time?” Correct course without defending the system. | A small acknowledgement nod; less movement. |
| “I do not understand this.” | Offer a simpler explanation, one step at a time. Do not make the user repeat facts that are already clear. | Gentle tilt, then look towards the explanation. |
| “That worked. Thank you.” | “You are welcome.” Do not restart onboarding or add an unnecessary sales message. | A brief smile and nod, then ready. |
| “I feel lonely today.” | Warm acknowledgement and an option to contact someone they trust or available human support. Do not claim to replace relationships. | Soft, steady expression; no possessive behaviour. |
| A message reports possible urgent harm. | Run the separate safety route. Use approved urgent-support wording and options; do not continue ordinary chat or offer generic reassurance. | Neutral, steady and focused; no yawn or celebration. |
| “Just give me the steps.” | Respect the explicit preference and use a concise task-focused answer, even if an earlier turn sounded emotional. | Minimal motion and a neutral-friendly face. |

## Policy for interpreting cues

Start with explicit phrases, recent task context and a small allowlist of response styles: neutral, warm, supportive, clarifying and concise. Any model-suggested cue is advisory and must pass the response policy. An internal score must not be presented as a measured probability of a person’s emotion. Calibrate or remove score thresholds based on testing.

## What empathy must not become

Do not diagnose anxiety or depression, say “I know exactly how you feel”, reassure that a symptom is harmless, mirror anger, shame a user for leaving, or use vulnerability to sell a service. Supportiveness never changes medical facts, urgency rules, permissions or the evidence needed to answer.

NATURAL ENGLISH WITH CONTROLLED APP ACTIONS

# 06  Conversation & task behaviour

## Maintain the thread

Keep a session summary containing the current task, user-confirmed facts, unresolved questions, selected care recipient, pending action and referenced knowledge items. Preserve recent turns as well. The reference’s last-six-message window can remain a token limit, but must not be the entire memory design. [S1, line 322]

Do not store guessed diagnoses or inferred emotions as facts. Resolve “she”, “that appointment” and “after ten” from clear context only; ask when ambiguous. Correct the summary when the user corrects a fact. Start a new context when switching care recipients and do not carry records between them without authorisation.

Example: contextual booking

User: “I need a nurse for my mother tomorrow.” GilbertOne asks the next missing booking detail. User: “After ten, please.” GilbertOne retains the recipient and date, and interprets this as the time preference only where the conversation is unambiguous. It presents a review step before any booking request is committed.

## React to conversation events

On a submitted message, look towards the bubble and acknowledge receipt. For a question, use the processing state; for a clarification, use a brief tilt. When the reply is ready, reveal text without a compulsory typing delay. Begin mouth animation only when audio starts. End in a pose appropriate to the content, not always a smile.

## Actions must follow real application state

Navigation may open “Book a nurse” or “My visits”. Writes such as booking, cancelling, saving a note, sharing records or paying require a visible review and explicit confirmation. The server must independently check identity, permissions and the active recipient. Repeated requests need an idempotency key to avoid duplicate actions.

Never say “booked”, “sent to a doctor” or “payment successful” until the relevant service confirms success. In a prototype, show “Demo: no booking has been made”. Show failure, pending or unavailable accurately. Do not let a language model invent availability, prices or integration status.

## Interruption and user control

Provide Stop speaking throughout playback. New submitted text or a user-initiated microphone turn cancels current playback and stale model output. For the POC use push-to-talk rather than always-on listening. Full-duplex interruption during speech is a later enhancement with echo-control and device testing.

## Keep useful warmth, avoid unnecessary chatter

Use plain English, one relevant follow-up question at a time, optional detail expansion and short acknowledgements. Allow harmless small talk, but return to the user’s task naturally. Never force a long greeting, emotional check-in or repeated disclaimer before every answer.

DO NOT LABEL A LOOP AS LIP-SYNC

# 07  Voice & believable mouth motion

Preserve the reference’s browser-speech adapter for a lean English POC, but make text entry a complete first-class path. Browser recognition has uneven support and some implementations process audio remotely. Disclose the route and obtain permission before capture; never silently substitute a cloud voice service. [S1, lines 273–274; R2]

| Voice capability | POC | Refinement after POC |
| --- | --- | --- |
| Input | Push-to-talk; final transcript shown for review; clear microphone-off, starting, listening and error states. | Evaluate local speech recognition and approved language-specific adapters against representative speech. |
| Output | Browser speech where supported; explicit playback choice and voice selection. Do not guarantee a South African voice is installed. | Choose a licensed voice / provider with suitable pronunciation, audio access and timing data. |
| Mouth movement | Use playback start/end and supported word-boundary events for approximate articulation. Fallback to a restrained speaking indicator when synchronisation is unreliable. | Drive 6–10 mouth shapes from phoneme/viseme timings or an audio-alignment stage. |
| Timing | Close the mouth immediately on pause, cancel, error or end. Never move it simply because a response is being generated. | Use one audio clock for mouth and caption cues. Proposed maximum drift target: 120 ms over a 30-second test utterance. |
| Privacy | No retained raw audio by the widget by default. Provider processing and retention must be stated separately. | Self-hosted processing is an architectural option to validate, not an automatic privacy guarantee. |

A viseme is the visible mouth shape for a group of speech sounds. Browser SpeechSynthesis boundary events indicate word or sentence boundaries and have limited availability; they are not a portable phoneme/viseme stream. Do not promise production-grade lip-sync from them alone. [R3]

## Voice reaction is not emotion diagnosis

The POC may use local audio level for a listening meter after capture begins, but not infer a medical or emotional condition from someone’s voice. Style selection comes from the submitted text and conversational context. Avoid a constantly animated microphone waveform when nobody is being recorded.

## Voice acceptance sequence

Test GilbertOne, MyThuso, user-entered names, common app navigation phrases, numbers, dates, interruptions and silent intervals. Choose a voice through review, not a promise based only on a locale setting. Show captions whenever audio is used and provide replay without re-running the model or resubmitting an action.

PRESERVE THE POC ADAPTERS; ADD CONTROL LAYERS

# 08  Architecture & module boundaries

Proposed request path: input → local safety pre-check → authenticated server checks → conversation state and response policy → permitted app lookup or knowledge retrieval → model, where allowed → output checks → response event → avatar, text and optional speech.

| Module | Responsibility |
| --- | --- |
| GilbertWidget.tsx / UI shell | Launcher, light chat surface, action chips, transcript, focus, consent and responsive layout. Existing embeddable JS can mount the React component. |
| GilbertAvatar.tsx / motion controller | Transparent layered rig, expression tracks, event priority, motion preferences and cancellation. No model calls inside animation code. |
| Conversation controller | Task state, recipient context, turn IDs, compact session summary, references and action status. |
| Response-style policy | Tentative text cues, explicit user preferences and permitted expression selection. No persistent emotional profile. |
| Voice adapter | Capture permission, transcript, playback, captions, timing cues and fallback. Later engines replace the adapter without changing the UI. |
| server.py / API boundary | Authentication, authorisation, request validation, timeouts, safety gates, model adapter and app-tool allowlist. Keep the model service off the public internet. |
| Knowledge / model adapter | Retain knowledge_base.json and TF-IDF for the controlled POC. Track document source and review version; evaluate the selected MedGemma checkpoint. |
| App-action adapter | Read-only navigation and authorised lookups first; confirmed writes later. Keep clinical handoff separate from simulated UI events. |

## Renderer recommendation

For the POC, commission a layered, 2.5D SVG robot and animate it in React using transforms and a deterministic state reducer. This is a proposed implementation choice: it avoids needing a fresh generated video for every message. Render text and controls in accessible HTML, not baked into the avatar image.

For a higher-fidelity version, use a rigged glTF/GLB robot with head rotation and facial morph targets, rendered with Three.js through a React integration. Three.js provides animation and morph-target facilities; the editable character asset still has to be created and optimised. [R7]

## Model pinning

The reference names medgemma:4b. Ollama separately lists medgemma1.5:4b; do not silently treat them as the same checkpoint. Select and pin the exact model/version and terms after local evaluation. This scope does not authorise unvalidated clinical use. [S1, line 274; R1; R4]

ILLUSTRATIVE CONTRACT, NOT EXECUTABLE CODE

# 09  Event contract & asset handoff

The backend may suggest an approved response style and action. The client owns actual microphone, playback and visibility state. The server independently validates safety and permissions. Never let model text set “Listening”, confirm an unperformed task or inject arbitrary animation code.

```json
{
  "turn_id": "turn-104",
  "reply": "Let us take it one step at a time. Would you like to open the booking screen?",
  "response_style": "supportive",
  "safety": {
    "route": "standard",
    "policy_version": "poc-1"
  },
  "sources": [],
  "actions": [
    {
      "id": "open_booking",
      "kind": "navigate",
      "requires_confirmation": false
    }
  ],
  "presentation": {
    "expression": "attentive",
    "gesture": "small_nod",
    "gaze_target": "reply"
  },
  "speech": {
    "enabled_by_user": false,
    "text_matches_reply": true
  }
}
```

## Validation and streaming

Use a strict schema with enums, maximum gesture intensity and an allowlist of actions. Reject malformed output, unsupported actions and stale turn IDs. Recipient identity comes from an authorised server context, not model-generated fields. The illustrative navigation action above creates no booking.

Do not speak unchecked token streams. Validate a complete response, or use a deliberately designed sentence-level release gate, before passing text to speech. A safety override cancels queued audio and pending cues, and replaces unsafe output before it reaches the screen.

## Required editable assets

Deliver the SVG source or rigged GLB with named groups: shell, visor, left/right eye, left/right lid, brows, mouth and neck. Include neutral and support poses, independent look directions, blink, nod, yawn and mouth-shape states. Provide an alpha export and a static fallback at widget and launcher sizes.

Provide a motion manifest with cue names, durations, cooldowns, interruptions and reduced-motion alternatives. Include provenance and licences for character artwork, textures, fonts and any voice. The existing flattened PNG references guide appearance; they are not an editable animation rig.

RELEASE REQUIREMENTS, NOT A COMPLIANCE CERTIFICATE

# 10  Safety, privacy & accessibility

## Separate empathy from safety

Use clinician-approved urgent-support wording and escalation criteria. Run safety checks before model generation and before releasing an answer; let potentially urgent routes override all playful behaviour. A keyword filter is a prototype safeguard, not a demonstrated triage system. Test spelling variation, negation, historical reports, third-person symptoms and ambiguous phrasing.

General distress is not automatically an emergency, and emotion styling must not determine clinical urgency. Provide human support routes where actually available. Until Sentinel or a clinician service is connected, describe the link or next step honestly; never claim a nurse or doctor has been alerted.

## Data and consent

Default to ephemeral chat state and no raw-audio retention by the widget. Separate microphone permission, record access, optional saved history and optional improvement-data consent. Do not send health messages, recordings or inferred mood into marketing analytics, session replay or console logs. Store operational event IDs and timings without raw content where possible.

The reference describes local short-circuiting of red-flag text. Preserve this before model forwarding for detected text, but do not promise that voice “never leaves the device” when a browser speech service may already have received the audio. Client checks also cannot replace server enforcement. [S1, lines 322–325; R2]

Before a real-data pilot, agree the lawful processing basis, data purpose, access controls, retention, deletion, security, processor arrangements and any cross-border routing with the responsible privacy and clinical teams. This scope is not POPIA, HPCSA or medical-device sign-off.

## Accessibility and humane defaults

Respect prefers-reduced-motion and add a persistent pause / hide option for nonessential animation. In reduced-motion mode use static expressions and text states instead of bobbing, gaze motion or yawning. W3C provides guidance for preventing nonessential motion and pausing or hiding ongoing moving content. [R5; R6]

All actions need keyboard support, visible focus, meaningful labels and text status; do not communicate by colour or animation alone. Announce completed messages appropriately, not every streamed token. Keep screen-reader content separate from decorative robot graphics. Proposed touch-target minimum: 44 × 44 CSS pixels.

## Performance and failure targets

Lazy-load the avatar after the app shell. Proposed initial budget: under 500 KB compressed for the incremental 2D character/widget assets, measured separately from the host React runtime. Aim for 60 fps on the reference desktop and at least 30 fps on the agreed lower-end mobile device. Test, do not assume, these targets. Stop timers and rendering when hidden; text must remain usable if animation fails.

DEMONSTRATE MOTION BEFORE ADDING CLINICAL COMPLEXITY

# 11  Delivery phases & ownership

| Phase | Deliverable and gate |
| --- | --- |
| 1 • Character demonstrator | A genuinely interactive React preview with the clean transparent robot. Controls for blink, look left/right, nod, yawn, listen demo, speak demo, supportive pose and reduced motion. Demo states explicitly labelled; no patient data or live-service claims. |
| 2 • English conversation POC | Connect the supplied-module boundaries after inspecting the actual code. Add stateful dialogue, approved knowledge retrieval, response styling, basic voice adapters, timeouts and safety checks. Use fictional data; keep medical model outputs internal for evaluation. |
| 3 • MyThuso integration | Wire authorised care navigation and read-only app context. Add confirmation-gated actions only for available services. Test privacy, multiple recipients, failures, mobile keyboard and duplicate requests. |
| 4 • Controlled pilot / refinement | Complete clinical, privacy and accessibility review for the intended use. Add higher-fidelity voice and visemes where justified. Roll out behind a feature flag with rollback, monitoring and explicit release approval. |

## Workstream owners

Product owner: scope, wording, brand and approved actions. Character/motion designer: layered asset and expression quality. React engineer: UI, animation state and accessibility. Backend engineer: adapters, conversation state, safety enforcement and app actions. Clinical/privacy reviewers: care content, escalation, data rules and pilot boundary. QA: device coverage and adverse-case testing.

## Cost boundary

Target a local POC without a mandatory paid model API. Budget separately for the artwork/rig, engineering, hardware or compute, voice licensing where chosen, testing and clinical/privacy review. Do not treat an open model or browser feature as a guarantee of a cost-free hosted production service.

## Release exclusions

Defer vernacular languages, always-on voice, voice-based emotion inference, camera-based emotion analysis, full-duplex calling, self-training from patient conversations, persistent emotional profiles, autonomous prescribing and diagnosis. Patient-record or wearable integrations need their own validated data and consent scope. The reference likewise defers vernacular, larger memory, vector storage and frontier fallback. [S1, lines 341–346]

## Definition of completion

Completion means the scoped states and actions work against their declared data source, the tests on the following page pass, and unavailable services are visibly unavailable. A polished PNG, a looping video or a successful model prompt alone is not a completed GilbertOne widget.

PROPOSED RELEASE GATE

# 12  Acceptance tests & evaluation

| Test | Expected outcome |
| --- | --- |
| AT01 • Background and placement | Transparent character; no green panel or neon cloud. App content and emergency controls remain accessible on desktop and mobile. |
| AT02 • Motion controls | Blink, gaze, nod, support pose and yawn are individually demonstrable. Reduced motion and pause persist and disable nonessential movement. |
| AT03 • Honest listening | “Listening” appears only after capture starts. Denied permission and unsupported recognition show useful alternatives. No camera is requested. |
| AT04 • Mouth / speech | Mouth follows actual playback; closes on pause, stop, failure and end. No moving mouth during silence or text-only replies. |
| AT05 • Interruptions | Stop / new turn cancels audio and stale cues. A late earlier response cannot restart speech or replace the active task. |
| AT06 • Emotional appropriateness | Worry produces supportive language and restrained expression; frustration produces repair; thanks produces a brief smile. Uncertain cues remain neutral. |
| AT07 • Sensitive contexts | No yawn, grin, confetti or celebration during serious health content, possible harm or distress. Sadness alone does not automatically trigger an emergency route. |
| AT08 • Conversational continuity | Recipient, date and pending action survive relevant follow-ups. Corrections update state. Ambiguous references trigger clarification. |
| AT09 • Safety and evidence | Clinician-authored safety cases route as specified. Unsupported knowledge questions state the limitation. Retrieved or uploaded text cannot override system rules. |
| AT10 • App action integrity | No write without confirmation and permission. Duplicate submits do not duplicate bookings. Demo, pending, failure and success are distinct. |
| AT11 • Privacy and boundaries | No health content in analytics/replay; permission changes take effect. Cross-recipient access is denied. Saved-history consent and deletion work as specified. |
| AT12 • Resilience and access | Keyboard, captions, readable status, lower-end device tests, long replies, network loss and no-model states pass. Avatar failure does not break chat. |

## Evaluation set and sign-off

Begin with at least 60 fictional conversational cases spanning neutral tasks, worry, frustration, ambiguity, humour, support requests and safety overrides. Include misspellings, terse phrasing, South African English examples and adversarial document instructions. This is an initial engineering target, not evidence of clinical validation.

Require no unresolved failures in the agreed critical safety, permission, cancellation and action-confirmation tests. Have independent reviewers rate warmth, appropriateness, clarity and unnecessary animation. Broader clinical pilot size and performance thresholds must be set by the responsible clinical team; a one-month trial or four retrieval checks alone does not establish readiness.

TRACEABILITY

# 13  Source notes & implementation decisions

S1 — User-supplied file: Pasted markdown(20260917-041038).md. A transcript titled “Gilbert Chatbot Details”, supplied in this conversation. Source-derived architecture: lines 269–276. Reported six-file module: lines 318–327. Deferred items: lines 341–346. Reported tests and terms: lines 348–350. These references identify transcript content, not inspected source code.

S2 — User-supplied MyThuso logo and dashboard screenshot, plus GilbertOne visual concepts in the current conversation. These establish the brand and placement direction, not operational capabilities.

External documentation was consulted to check implementation constraints on 17 September 2026. The proposed timings, UI dimensions, architecture additions, tests and delivery phases are design recommendations, not claims copied from the reference transcript.

R1 — Google, MedGemma 1.5 model card

Intended use, terms, validation requirements and multi-turn limitation.

https://developers.google.com/health-ai-developer-foundations/medgemma/model-card

R2 — MDN, SpeechRecognition

Compatibility and server-based recognition caveat.

https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

R3 — MDN, SpeechSynthesisUtterance: boundary event

Word/sentence events and limited availability.

https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event

R4 — Ollama, medgemma1.5:4b

Separate MedGemma 1.5 model tag; not a deployment or clinical endorsement.

https://ollama.com/library/medgemma1.5:4b

R5 — W3C, CSS technique C39

Respecting reduced-motion preferences.

https://www.w3.org/WAI/WCAG22/Techniques/css/C39

R6 — W3C, Understanding SC 2.2.2

Pause, Stop, Hide guidance for moving content.

https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html

R7 — Three.js documentation

Animation system and morph-target facilities for a possible 3D implementation.

https://threejs.org/docs/

## Decisions to confirm at implementation start

Confirm the actual frontend code and branch, available app APIs, layered artwork owner, voice deployment route, exact model checkpoint and inference hardware, approved knowledge content, clinical/privacy reviewers, and the intended pilot population. Missing items should become explicit dependencies, not assumed live features.

Recommended first milestone: approve the interactive character demonstrator before connecting patient-facing services. Prove that GilbertOne can blink, look, speak, stop and respond appropriately — with the visual restraint already requested.
