# Book care — mocks 04 and 05

Wednesday demo. Six steps, one question per screen. Steps 1 and 2 follow the mocks; steps 3–6 use the same screen.

## Shared screen

- Header: back arrow, **MyThuso**, **Step N of 6**, then a thin divider. Back on step 1 leaves the flow. Back on later steps returns to the previous question and keeps the answer.
- Progress: six nodes on a line. Completed nodes are filled teal, the current node is a teal ring with a teal centre, upcoming nodes are light grey. The line fills teal up to the current step (width, 250ms). Under it, centred: **Step N of 6**. Accessible name: `Step N of 6: <question>`.
- Question, about 32px, bold, dark navy. Left-aligned on a phone, centred from 1000px. The column is centred and at most 560px wide.
- Option cards: white, light border, about 14px radius, subtle shadow, about 88px tall. Solid teal circle, white icon (mock 05). Selected: mint fill, teal border, a 28px teal check at the top right (border and check, 180ms). One choice. Radios.
- **Next**, full width, about 56px. Disabled until there is an answer (muted grey-teal, white label). Enabled in teal. Chevron at the right. The notes step is optional, so Next is always enabled there. The last step’s button is **Confirm booking**.
- Footer, centred: info icon and **One question per step**. Step 1 also shows **One question per step.** under the title, with a short teal underline.

## Steps

1. **Who is this care for?** — Myself. Someone I care for. Choosing the second opens the sample household (Sipho, Lebo, Amahle), each marked **Demo data**.
2. **What do you need?** — Home visit / A nurse comes to you. Online consult / Talk with a professional online. Follow-up / Schedule a check-in. Nothing starts selected.
3. **When suits you?** — The next four offered days from `lib/scheduling`, each at the first offered slot, in Africa/Johannesburg. The first card is **Tomorrow** when that day is tomorrow.
4. **Where should care happen?** — Home visit and follow-up: **At home** (sample address using `HOME_SUBURB`, marked **Demo data**) or **Somewhere else** / Tell your nurse in the next step. Online consult: one preselected card, **Online** / A secure video link (simulated in this preview). Changing what clears a where-answer that no longer fits.
5. **Anything your nurse should know?** — Optional textarea. Placeholder: For example: symptoms, allergies or how to find your home. Helper: Optional. Your nurse reads this before the visit. The text stays in memory only.
6. **Check and confirm** — Who, What, When, Where, Notes, each with **Change**. Notice: This is a simulated booking. Nothing is booked and no payment is taken. **Confirm booking** then shows **Visit confirmed (simulated)** and a way back to the home.

Nothing is booked and no payment is taken. The screen does not say “POPIA compliant”.

## How to open it

Home → **Care you can book today** → **Book care**. Directly: `/app/?open=book-care`.
