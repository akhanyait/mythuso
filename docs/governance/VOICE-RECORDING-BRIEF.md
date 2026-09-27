# GilbertOne voices for isiZulu and isiXhosa — recording brief

**Status:** proposed, 28 September 2026. Nothing below has been commissioned. **Decided by:** the founder,
when the budget line is signed. **Why this exists:** no vendor and no open-source project ships a
commercially usable isiZulu or isiXhosa voice (Azure has none; Meta MMS-TTS and Coqui XTTS are
non-commercial licences; Piper has no community voice for either). The only route to a South African
voice that reads a health answer in a person's own language is to record one and train it ourselves —
which is also the route §07's V03 asks for: a voice **chosen by review, never by a locale setting**.

## What is being made

Two on-device voices per language — one female, one male, matching the pair every other language in
`packages/catalog/assistant.json#voice.languages[].ttsVoices` carries — for **isiZulu (zu)** and
**isiXhosa (xh)**, trained with [Piper](https://github.com/rhasspy/piper) (MIT licence), the text-to-speech
engine the founder's speech amendment of 21 September 2026 names for the on-device conversation mode.
Sesotho (st) follows the same brief when these two are done. Afrikaans stays with Azure's Adri and Willem.

A Piper voice runs on the phone and in the browser with **no audio and no text leaving the device**,
which is what keeps CLAUDE.md's amendment true for a language the cloud cannot speak.

## Who records

| Role | Who | Why |
|---|---|---|
| Voice talent, 2 per language | First-language speakers; preferably SANC-registered nurses or people who have worked at a clinic front desk | A voice that sounds like the person who would actually come to the house. A nurse's cadence on "you need to be seen today" is not an actor's |
| Linguist / script lead, 1 per language | A first-language linguist (UCT, Wits, UKZN, UFH departments of African languages all have them) | Writes and checks the script: register, tone marks where they matter, and the loan-word conventions patients use ("i-blood pressure") |
| Clinical reviewer | The clinician who signs the golden sets (`docs/governance/GOLDEN-SETS.md`) | Listens to every emergency, refusal and escalation sentence before the voice may read one |

Consent: each talent signs a performer release naming the use (a health assistant's voice, on device
and on our servers), the term, the fee, and the right to withdraw before training starts. The recording
is personal information under POPIA; the raw audio is kept off the product's data stores, on the
Information Officer's register (`INFORMATION-OFFICER.md`), and deleted when the model is accepted or the
release lapses.

## The script — about 1,500 sentences per voice, three parts

1. **Phonetic coverage (about 900):** sentences chosen so every phoneme and the common clusters appear
   often enough to train on — the linguist builds these from a public corpus (NCHLT text for zu/xh is
   the obvious source) and checks pronunciation variants (clicks in isiXhosa: c, q, x with their
   nasal and aspirated forms, all well represented).
2. **Product sentences (about 450):** every sentence GilbertOne already says, translated by the
   linguist from the contract, never paraphrased: the greetings, the catalogue answers (what a visit
   costs, what a nurse does), the booking and navigation lines, and every refusal in
   `packages/catalog/assistant.json`. The reviewer signs the translations before recording.
3. **The clinical-delivery register (about 150):** the emergency answers with the ambulance numbers, and
   the escalation and refusal sentences, spoken in the neutral, clear register
   `packages/catalog/voice.json#clinicalDeliveryRegister` describes — "the words at the pace the
   listener set, without warmth added or urgency removed". Every emergency term group in
   `packages/catalog/gilbert-emergency-terms.json` (chest pain, breathing, bleeding, unresponsive,
   stroke, seizure, infant, obstetric, crisis, general) appears in at least five sentences, because a
   voice must be able to say "call 10177 now" without ever having said those words at training time.

No patient's words, no case notes, no real names or numbers in the script — the same rule the
preview panel enforces with `packages/gilbertone/src/phi.ts`.

## Studio and hours

- **Where:** a treated room — a broadcast studio or a university phonetics lab; not an office.
- **How much:** 1,500 sentences is about **2 hours of finished speech**, which is **3 sessions of 3 hours**
  per voice with breaks (voices tire; the third hour of a single sitting is audibly different).
- **Format:** 48 kHz / 24-bit mono WAV, one file per sentence, named by sentence id; the same
  microphone and distance for every session; a slate sentence at the start of each to catch drift.
- **Direction:** one person directs every session with the script on screen, so a re-take is asked
  for the moment a sentence is misread. A re-take rate above 10 % on day one means the script needs
  work, not the talent.

## Training and acceptance

1. **Alignment and training:** Piper's own pipeline (espeak-ng phonemisation — check its zu/xh support
   first; where it is thin, the linguist supplies a lexicon), a medium-quality model per voice
   (about 60 MB on device), trained from the Piper base checkpoint. Two to three days of GPU time per
   voice; no audio leaves the machine that trains it.
2. **Objective floor:** every product sentence re-synthesised and checked by the linguist for
   mispronunciation; anything wrong goes back as a lexicon fix or a re-take.
3. **Clinical listen-through:** the reviewer listens to all clinical-delivery sentences in the finished
   voice and signs, in the review queue (`packages/catalog/clinical-review-queue.json`), that the
   register holds. **Until that signature exists the voice reads presentation answers only, and the
   emergency route stays text plus the platform's existing behaviour.** This is the same door the
   emergency terms move through.
4. **Contract:** the voice lands as `ttsVoices` on the language in `assistant.json`, `ttsAvailable`
   flips to true, `voiceUnavailableNotice` stops showing for that language, and the build's existing
   checks (no voice name typed outside the contract, V03's id unchanged) hold it there. Piper's runtime
   joins the open-source register as a verified module, not vendored.

## Budget and time — estimates, not quotes

| Item | Estimate |
|---|---|
| Studio, 3 × 3 h × 4 voices | R 25 000 – R 40 000 |
| Talent, 4 × 3 sessions | R 30 000 – R 60 000 |
| Linguists, 2 languages × ~8 days | R 40 000 – R 70 000 |
| Clinical review, ~2 days | in the reviewer's existing engagement |
| GPU time | under R 5 000 |
| **Total** | **R 100 000 – R 175 000**, 4 – 6 weeks from signature to the first listen-through |

## What this brief refuses

- No cloned voice of a real nurse without her signed release, and no "voice of a doctor" implied.
- No cloud voice API for these languages in the on-device mode, whatever appears on the market
  (CLAUDE.md, 21 September amendment).
- No emergency answer read in the new voice before the clinical listen-through is signed.
- No marketing that says "GilbertOne speaks isiZulu" before `ttsAvailable` is true in the contract.
