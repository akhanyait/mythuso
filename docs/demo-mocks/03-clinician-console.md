# 03 — Clinician console (simulated video consult)

Funder demo, Wednesday. Desktop landscape, about 1440px. The dark sidebar is the existing doctor
workspace chrome. This screen is the content: a simulated consult on the left and a nurse-led
toolkit on the right.

Designer arrows ("fade-in 300ms", "chart draw 800ms") are motion notes, not labels on the screen.

## Call

- Title **Video consult**, a green dot and **Live**, subtitle **Simulated consult · mm:ss elapsed**
  (the clock starts at 08:20 and counts).
- **Secure connection (simulated)**, with the accessible description "Simulated, no live connection".
  The mock's lock line said "Secure connection"; the visible copy says it is simulated so the demo
  does not claim a live secure call. **Live** stays the mock's word; the subtitle already says the
  consult is simulated.
- Patient tile: **Ms. Dlamini · 54 yrs**, **Stable**, with a **Demo data** badge on the card.
- Nurse tile: **Nurse**, **Nurse Zinhle**, **On call**. Camera off replaces her portrait with
  **Camera off**.
- Controls: **Mute**, **Camera**, **Leave**. Leave is the only red. It ends on **Consult ended
  (simulated)**, the duration, **Back to Teleconsultation** and **Start again**.
- No camera, no microphone, no network media.

## Toolkit

- **Consultation toolkit · nurse-led**, outlined **Demo data** badge.
- **Nurse-led triage board**: Priority Low, Priority Medium, Priority High. None selected until the
  nurse presses one. Helper: **Priority is set by the nurse. Suggestions here are notes, not a
  diagnosis.**
- **Vitals (live)** · **Simulated stream**. Three charts — blood pressure 128/82 Trending, pulse 88
  Stable, SpO₂ 97 Stable — with the mock's axis labels. Caption: **Demo data is auto-generated for
  training · Resets every 60s.**
- **Notes (nurse-led)**. Placeholder **Add observations, concerns or next steps here...** Memory
  only. **Saving…** while typing, then **Saved**.

## Motion

Demo data badge fades in over 200ms. An active priority chip fades in over 300ms and pulses once
over 1.2s. Sparkline paths draw left to right over 800ms. Vital numbers count up once over 600ms
when the consult opens. Control press scales to 0.96 over 100ms. All of that is still when the
reader has asked for reduced motion.

## How to open it

`/app/?role=doctor`, then **Video consult** in Clinical work (on a phone: More, then Video consult).
The address stays `/app/?role=doctor`; sections are not in the query string.
