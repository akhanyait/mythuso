<!--
Provenance: the scope Claude sent the founder on 28 September 2026 in answer to "include ElevenLabs as
another module for GilbertOne settings, and add all Azure and ElevenLabs extra settings on the GilbertOne
settings", approved the same day with one amendment: the own-voice feature is in scope and only an
administrator may change it, which today means the founder alone. Written for the two appointees the
founder intends to name — a clinical reviewer and an Information Officer — as much as for the builder,
because the one decision this scope could not make is theirs. What is decided is in the contracts; every
default below is a proposal until the founder has listened at the edges, except the own-voice default.
-->

# GilbertOne speech settings: ElevenLabs beside Azure, every knob an administrator's setting

## What is not a setting, and stays that way

- **Keys.** Azure's key and ElevenLabs' key are lines in the service's environment, read per call, never
  shown, never in a contract.
- **Region and endpoint.** Azure stays pinned to South Africa North. ElevenLabs serves from the United
  States by default and offers European Union, India and Singapore environments to enterprise customers
  only, each with its own account and key; the vendor says processing may still happen outside the
  chosen location. Nowhere in South Africa. So in production the existing refusal applies to ElevenLabs
  exactly as to Whisper and Qwen: refused while `docs/governance/DATA-RESIDENCY-OPTIONS.md` §7 is blank,
  the platform default reads instead, and the refusal is printed at start-up. In development it is
  honoured, which is how it is benchmarked.
- **The clinical registers.** Emergency, refusal and escalation are pinned by hash. No provider, speed,
  pitch, style or voice setting reaches them; the service applies tuning only where a request names a
  presentation register, and a request that names none gets the platform default with no tuning.
- **The 45-second capture cap, push-to-talk, captions.** Founder decisions, drawn locked.
- **Voice names.** No voice identifier is typed on a screen. ElevenLabs has no public list a contract
  could name, so its identifiers are environment lines on the box, one per label and one for the
  administrator's own voice; the door still admits only the contract's own voice names.
- **Speech-to-text provider.** A patient's capture is health information going out; which provider hears
  it stays a hand-written line on the box. ElevenLabs' transcription product is out of scope.

## The settings, on the assistant engine's one block, changed by an admin with a reason

| Group | Setting | Type | Default | Reaches |
| --- | --- | --- | --- | --- |
| Provider | Provider per presentation register (four) | enum of built speaking cards | Azure Speech | the next answer of that register; never a clinical one |
| Provider | Fall back to the platform default when the chosen provider does not answer | on/off | on | the next answer |
| Provider | Spoken answers a month | characters | 2,000,000 | every provider; when reached the answer stays written |
| Provider | Preview per administrator session | characters | 20,000 | the Voice screen's Play |
| Azure | Speaking speed, percent of normal | 70–130 | 100 | presentation registers only |
| Azure | Pitch, percent of normal | 80–120 | 100 | presentation registers only |
| Azure | Audio quality | three encodings | the contract's decided encoding | every register; changes data, not sound |
| Azure | Recognition of strong language | raw, masked, removed | raw | the next capture |
| Both | Time allowed to voice one stretch | 5–60 s | 15 | calls started after |
| Both | Time allowed to hear one capture | 10–60 s | 30 | calls started after |
| ElevenLabs | Model | Multilingual v2, Flash v2.5, v3 | Multilingual v2 | the next reading |
| ElevenLabs | Stability, similarity, style exaggeration | 0–100 | 50, 75, 0 | presentation registers only |
| ElevenLabs | Speaker boost | on/off | off | presentation registers only |
| ElevenLabs | Speaking speed, percent of normal | 70–120 | 100 | presentation registers only |
| ElevenLabs | Audio quality | three MP3 encodings | the lightest | every register |
| ElevenLabs | Latency mode | 0–4 | 0 | every register |
| Own voice | The administrator's own voice | off, admin register, every presentation register | off (founder's decision) | never a clinical register, never a patient's choice |

**Languages.** Multilingual v2 and Flash v2.5 list no South African language; Eleven v3 lists Afrikaans.
None lists isiZulu, isiXhosa or Sesotho. A language the chosen model lacks is answered as having no
voice, and the written words stand.

**The own voice.** Decided by the founder on 28 September 2026: an administrator's setting and nobody
else's, and today the only administrator is the founder. The voice is recorded in the provider's own
console by the administrator, with their own consent, which the setting's history stands as; a voice
that is not the administrator's own is refused, because it needs that person's consent and an
ownership decision this setting cannot hold.

## What was built

1. **Contract.** The settings above in `packages/catalog/voice.json`'s block with a changelog entry; the
   `ownVoice` record; four locked items; six refusals. ElevenLabs' registry card raised to built with its
   environment lines, hosts, the languages each model lists, a price copied from the pricing page with
   its date, and the founder's prohibition kept. `POST /v1/speak@4` adds the optional `register` and the
   ceiling's refusal; version three is withdrawn.
2. **Service.** `providers/elevenlabs.ts` on the shared seam, written from the published reference and
   not exercised live. Azure's adapter applies speed, pitch, encoding, profanity and the timeouts. The
   selection decides the speaking provider per request from the register; the monthly ceiling is asked
   before any provider and counted after one answered. **The service reads the contract's defaults**:
   it keeps no settings history yet, so a change on the Control Tower reaches the web preview and not the
   box. That is the next change, and the screen says so in the contract's sentence.
3. **Control Tower.** The eighth GilbertOne sub-screen, Speech settings: what is in force per register,
   each provider's card with its settings, what is not a setting, the own-voice record, and the
   Configuration tab's own editor embedded fixed to the assistant engine. The same settings appear on
   the Configuration tab under "GilbertOne voice and speech settings". The Voice screen's preview reads
   through the provider in force for the chosen register, says that provider's cost, and refuses Play
   past the session ceiling.
4. **Ops.** The credential script takes ElevenLabs' five lines with the identifiers hidden; the RUNBOOK
   says what chooses ElevenLabs and what refuses it.
5. **Build checks.** One reader for every key; defaults held to the encoding and the timeouts they
   restate; provider choices held to the built cards; no setting names a clinical register; the own
   voice's record, guardrail and adapter; ElevenLabs named on no phone; the eighth screen embeds the
   editor and draws nothing of its own. Each proved by breaking it.

## For the appointees

The Information Officer signs the residency decision that lets ElevenLabs read a patient's answer in
production, and weighs what the vendor keeps: requests are logged by default, and the adapter asks for
logging off on every one. The clinical reviewer has nothing to sign here, on purpose: no setting on this
screen can touch how an emergency, a refusal or an escalation sounds, and the build holds that.
