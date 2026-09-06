# Hero banner photography

These files are generated. The originals are the full banner artwork in `Documentation/app banners/`;
`scripts/prepare-banners.py` crops each one down to just its photograph — the headline, call to
action and trust marks are baked into that artwork and the app renders its own, translated and
interactive, so only the picture is taken. The crops also cut out the banners' own caption chips so
they do not appear twice. Re-crop and redistribute with:

```sh
python3 scripts/prepare-banners.py && node scripts/render-illustrations.mjs
```

The landing carousel looks for a photograph at each of these paths. If a file is missing the slide
falls back to the shared illustration in `packages/illustrations`, so the app never shows a broken
image — drop the files in and they appear on the next reload, with no code change.

Each slide tries three sources in order and uses the first that loads:

| Order | File | Treatment |
|---|---|---|
| 1 | `<slide>-cutout.png` | A person on transparency — **rises above the banner's top edge** |
| 2 | `<slide>.jpg` | A photograph with its own scene — sits inside the banner, faded into the tint |
| 3 | — | The shared illustration, which also rises above the top edge |

| Slide | Files | Headline |
|---|---|---|
| 1 | `care-that-comes-to-you` | Care that comes to you. |
| 2 | `one-safe-place` | Your health. One safe place. |
| 3 | `feel-better` | Feel better. Right at home. |

The supplied photographs are currently used at level 2, because they carry their own room
backgrounds. To get the person breaking out over the banner's top edge with real photography rather
than illustration, add a cut-out at level 1:

- **Cut the person out onto transparency** and save as `<slide>-cutout.png`. A rectangular photo
  will read as a pasted-in box once it crosses the banner's edge.
- **Anchor the subject bottom-right**, roughly 1:1.2 portrait, at least 900px tall.
- The left ~55% of the banner is text. Keep the subject clear of it.

Before any of these ship: written model releases for everyone pictured, and no implication that a
person shown is a real MyThuso nurse or patient unless they are, and have agreed to be shown as one.
`docs/PRIVACY-AND-SECURITY.md` treats that as a release gate, not a nicety.

For iOS and Android the same photographs go through `scripts/render-illustrations.mjs`'s output
paths — see `docs/ARCHITECTURE.md` under **Design choices**.
