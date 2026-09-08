# The visual language

Chosen by the founder on 8 September 2026 from the *Nura Healthcare Platform* dashboard by Kraftbase,
Gulshan Ali and Fractal Labs (Behance, August 2026), with the instruction: *"this is exactly what I
want to make this fluid and nice fresh look."*

This file is the direction, not a copy. What is taken is a **visual language** — a ground, a
neutral ramp, a way of treating cards, numerals and navigation. What is not taken is anybody's
brand: Nura's mark, its name, its wordmark, its illustrations and its copy are theirs and appear
nowhere in this product. MyThuso keeps its own logo, its own voice and its own clinical vocabulary.

## Why this direction is defensible for a clinical product

The founder called the previous design *cartoonish*. The risk in moving to a green-accented,
wellness-adjacent reference is landing back there. It does not, and the reason is worth naming: this
palette is **desaturated sage against near-black on a grey ground**, not mint against white. The
green never carries a word. Everything a person reads is charcoal. That is the opposite of the
pastel-tinted, high-chroma treatment that read as unserious.

## The palette

The four sages, the three greys and the charcoal are the reference's own published values.

| Token | Value | What it is |
|---|---|---|
| `mist` | `#F0F0F0` | The page ground. Not white — the cards are the white. |
| `surface` | `#FFFFFF` | A card that is the subject of its screen. |
| `cloud` | `#E5E5E5` | A recessed panel; a card that is context rather than subject. |
| `stone` | `#DCDDDB` | Hairlines. There are almost no shadows in this language; separation is a 1px line. |
| `charcoal` | `#1C1C1C` | **All text.** Primary actions. The active navigation pill. Status chips. |
| `paleSage` | `#C8D5BB` | The lightest fill — a highlighted card, a score panel. |
| `softSage` | `#B2C0AA` | A mid fill; the body of a chart area. |
| `mutedSage` | `#9EAC9B` | A deeper fill; a chart's darker stop. |
| `sageSlate` | `#8E9B92` | The darkest the ramp goes, and the reason it stops there. |

**Sage is a fill and never a label.** The darkest of the four measures **2.54:1** as text on `mist`,
which clears nothing. This is the same rule teal and mango are already held to, and it is why the
system works: everything a reader must actually read is charcoal, which clears

| on | ratio |
|---|---|
| `mist` | 14.95 |
| `surface` | 17.04 |
| `cloud` | 13.53 |
| `paleSage` | 11.11 |
| `softSage` | 8.94 |
| `mutedSage` | 7.16 |
| `sageSlate` | 5.89 |

Charcoal carries text on **every ground in the palette**. One step darker than `sageSlate` and it
stops, which is where the ramp ends.

**The semantic colours are unchanged and were re-measured, not assumed.** On the new `mist` ground:
`danger #B42318` 5.77, `info #175CD3` 6.5, `mangoInk #92400E` 6.22, `tealInk #0F766E` 4.80, and
`indigo #1E3A8A` 9.09. Nothing clinical loses its meaning by moving ground.

## Type

A neo-grotesque, tight tracking, and one signature move: **large numerals in a light weight**. A
metric is set big and thin — 68, 91, 8.4, 94 — with a small mid-grey label beneath and a small
status chip floating above. That contrast between a large light figure and small dense labels is
most of what makes the reference read as calm rather than busy. Headings are regular or medium
weight. Nothing is bold for emphasis; emphasis comes from size and from space.

Type scale is unchanged: 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 42, 64, nothing below 13.

## Surfaces

- **Radii are generous.** Cards ~14–18px, chips ~8px, navigation rows and buttons fully round.
- **Elevation is almost nothing.** A card is separated from the ground by being lighter than it and
  by a hairline, not by a shadow. Where a shadow exists it is a whisper. Never two stacked.
- **Space is the main tool.** The reference is not dense; it is airy, and the airiness is what makes
  a small amount of information feel considered rather than thin.

## Components

- **Navigation** is a column of pill rows: icon, label, and a small arrow at the right edge. Inactive
  rows sit on a faint chip; the active row is a filled charcoal pill with white text.
- **Top bar** is a pill search field with circular icon buttons — hairline bordered, no fill.
- **A metric** is a status chip floating above a large light numeral, with a small label below.
- **A card** carries a small circular expand affordance at its top-right.
- **Charts** are soft sage area fills fading to transparent, thin dotted trend lines, and a small
  floating chip marking a value on the curve. No gridlines shouting, no axis furniture.
- **Progress** is a row of rounded segments rather than a continuous bar.

## What does not change

Everything in `.claude/agents/ui-ux.md` still binds: the type floor, 44×44 targets, the two-ring
focus indicator, no horizontal overflow at 320px or 200% zoom, reduced-motion, no `localStorage`,
no WebViews, every price and refusal sentence derived from `packages/catalog/`, and no capability
described as connected that `packages/catalog/capabilities.json` says is not.

An animation that runs forever may still only touch composited properties. The reference is full of
soft gradients; a gradient that drifts must not change a box.
