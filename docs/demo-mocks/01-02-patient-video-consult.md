# Patient video consult (simulated) — mocks 01 and 02

Steps and copy came from the design mocks `01-patient-consent.jpg` and `02-patient-call.jpg`.

The call is simulated. There is no camera, no microphone and no network media. Booklet 10 has to be ticked before Join enables. Sample readings carry a visible **Demo data** label. Danger red is only the Leave control.

## Screen A — Before you join (`01-patient-consent.jpg`)

Phone portrait, about 390px. White surface.

1. Header: back chevron, centred title **Video consult**, pill with a shield and **Demo simulation**. A thin divider under the header. Back returns to Online consultation.
2. Consent card. Enters with a fade and an 8px rise, 280ms ease-out.
   - Shield in a mint circle, heading **Before you join**, line **Booklet 10 consent checklist**, line **Please review before entering the video call.** Decorative two-people icon at the right.
   - Pale mint checklist:
     1. **Who is on the call** — You, a healthcare provider, and possibly a nurse.
     2. **No recording in this preview** — This call is not recorded or stored.
     3. **Nurse may be present** — A nurse may join to support your care.
   - Checkbox **I understand** with a teal required asterisk (hidden from the name) and the line **Check this box to continue.** The whole label is the hit target.
   - **Join call**, full width. Locked: pale teal, teal text, padlock, disabled. Unlocked after the tick: padlock fades and slides out, fill becomes teal, white text, 200ms. Unticking locks it again.
3. Footer: shield and **Your privacy and comfort matter.**

The tick is held in memory for this visit to the screen only. Leaving and coming back shows the gate again.

## Screen B — Simulated call (`02-patient-call.jpg`)

Desktop landscape, and a stacked layout at 390px. The stage fades in over 300ms.

1. Top bar: MyThuso wordmark, pill **Demo simulation · not a live call**.
2. Stage: mint gradient, faint lighter blobs (still unless decorative motion is on).
   - Placeholder remote picture, **Dr. Naidoo · simulated**, pill **simulated**.
   - Vitals, bottom-left on a wide screen and full width under the name on a phone: **Demo data** (fades in over 200ms and stays), heart **72** bpm, respiration **16** rpm, blood pressure **118/76** mmHg.
   - Self-view, an illustration. About 210×145, overlapping the stage's lower edge; about 110×80 at the top-right on a phone. Camera off replaces it with a video-off icon and **Camera off**.
3. Timer, centred, from **00:00**, `role="timer"`.
4. Three controls only — Mute, Camera, Leave — each a circle with a label. Mute and Camera toggle `aria-pressed` (slashed icon when off). Press scales to 0.96 over 100ms. **Leave** is the red control, with a white phone-off icon and a red label.
5. Leave ends the simulation: **Call ended**, **This was a simulated call. Nothing was recorded or stored.**, the final duration, and **Back to MyThuso**, which returns to Online consultation.

## How to open it

- Patient app → Online consultation → **Start video consult**
- Direct address: `/app/?open=video-consult`
