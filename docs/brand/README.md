# The brand folder

Three generated files and this note.

| File | What it is | Edit it? |
| --- | --- | --- |
| `CI.md` | The CI document for MyThuso and GilbertOne: twelve chapters, each opening with the rule in one sentence and then the values | **No.** Generated |
| `PACK.md` | The brand pack index: every logo, illustration, photograph, font and icon file with its path, pixel size, byte size, caption and rights, plus the handoff manifest | **No.** Generated |
| `ci.html` | The CI document as one self-contained page — swatches drawn, logos shown, type set in the self-hosted faces (embedded), light and dark from the tokens, no scripts — for sharing outside the repository | **No.** Generated |
| `README.md` | This note | Yes |

## How to regenerate

```sh
npm run ci          # writes the three files from their sources
npm run generate    # every generator, including this one
npm run check       # fails if any of the three differs from what the generator returns
```

`scripts/emit-ci.mjs` is the generator. `scripts/check-boundaries.mjs` imports it, compares each file byte for byte with
what it returns, and refuses a file older than any of its sources — so editing a source and forgetting to regenerate fails
the build in the same way as editing the output by hand. The section `/* The CI document — 29 September 2026 */` at the end of
the check also holds that every hex in `CI.md` is a value in `tokens.json`, that every file `PACK.md` names exists at the size
it states, that no photograph is captioned as a patient, and that `ci.html` loads no external script.

## Where the masters are

- **The design handoff's masters** — the two official logos, two illustrations, twelve photographs and the theme the tokens
  were taken from — are under `packages/brand/lovable-handoff/handoff/`, byte-identical to what Lovable delivered on
  28 September 2026, held to `packages/brand/lovable-handoff/MANIFEST.sha256`. Nothing on any screen loads a master; a screen
  loads a re-encoded derivative under `apps/web/public/lovable/`.
- **The design tokens** — every colour, radius, shadow, size, duration and contrast floor — are in
  `packages/design-tokens/tokens.json`, and reach the web, iOS and Android through `scripts/emit-tokens.mjs`.
- **The icon family** is `packages/catalog/icons.json`, generated to three platforms by `scripts/emit-icons.mjs`.
- **The MyThuso wordmark's vector cuts** are under `apps/web/public/brand/`; **the fonts** and their OFL licences under
  `apps/web/public/fonts/`; **the hero photographs** under `apps/web/public/banners/` (sources in `packages/banners/`).
- **GilbertOne's words** — its name, descriptor, disclosure, refusals and affect — are in `packages/catalog/assistant.json`;
  its registers in `packages/catalog/voice.json`; its hands-free conversation in `packages/catalog/conversation-mode.json`.

## What may not be edited by hand

- The three generated files above. An edit is lost on the next `npm run ci` and fails `npm run check` until then.
- Anything under `packages/brand/lovable-handoff/handoff/`. The official logos are never redrawn, recoloured, cropped, rotated
  or regenerated; the manifest fails the build on a changed byte or an unrecorded file.
- A generated platform file (`tokens.generated.css`, `Tokens.swift`, `Tokens.kt`, the icon files). Change the source and run
  the generator.

To change what the CI document says, change the source it reads — a token, a contract sentence, a component's header comment —
and regenerate. If the document needs a fact no source holds, the generator prints "unsourced" rather than a guess; the fix is
to give the fact a home in a contract, not to type it into the document.
