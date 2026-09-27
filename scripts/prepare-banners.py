"""Prepare the hero banner artwork.

Three kinds of thing come out of `Documentation/app banners/`:

* the **flat compositions** (RGB) become `<slide>.jpg`, cropped to their photograph alone. Headline,
  call to action and trust marks are baked into those pixels; the app draws its own, translated and
  interactive, so only the picture is taken. `packages/catalog/hero.json` explains at length why.
* the **cut-outs** (RGBA) become `<slide>-cutout.png`, trimmed to the subject so the head sits at the
  very top of the frame, which is what lets the person rise above the card further down the page.
* the **hero figures** become `hero-<slide>.png`, one per slide of `packages/catalog/hero.json`, at
  the resolution they were supplied at. See HERO below for why these are separate from the cut-outs
  above, which the patient app and both phones already draw under the same slide names.

Run this, then `node scripts/render-illustrations.mjs` to copy the results into the three apps.

── Why every source is named ──────────────────────────────────────────────────────────────────────

This script used to glob the directory, sort it and `zip` the result against a list of crop boxes.
That worked for exactly as long as the directory held three of each. The founder then added four more
compositions, and a re-run would have silently paired `banner-1.png` with the crop box belonging to
somebody else's photograph and written the result over a good file under a name that still looked
right. Nothing would have failed; the wrong faces would simply have appeared on the landing page.

So a source is named, its crop is beside it, and a missing one stops the run. Files in that directory
that are not named here are left alone rather than guessed at: it is the founder's working folder and
new art lands in it all the time.
"""
from PIL import Image
import io
import os
import sys

# The founder's folder. It was `Documentation/Backup/app banners` in this script until 28 September
# 2026, a directory that does not exist — so the script stopped at its missing-source guard, which is
# the guard doing its job, and every crop in packages/banners was a crop nobody could re-make.
BANNERS = 'Documentation/app banners'
OUT = 'packages/banners'

# ── The flat compositions ─────────────────────────────────────────────────────────────────────────
# box is (left, top, right, bottom) in the source's own pixels; scale is applied afterwards.
#
# The four `banner-N.png` are the 13 September set and are cropped to the part of each frame the two
# floating cards never covered — which is why they are portraits of the same height rather than the
# full landscape. hero.json's `_aboutThePhotographs` is the argument for the honest crop over the
# clever one. They are taken at 1:1: the source is 1774×887 and the page never shows one wider.
FLAT = {
    'banner-1.png': ('care-that-comes-to-you', (760, 120, 1345, 800), 1.0),
    'banner-2.png': ('for-your-family',        (760, 120, 1350, 800), 1.0),
    'banner-3.png': ('everyday-wellbeing',     (770, 120, 1330, 800), 1.0),
    'banner-4.png': ('for-the-nurses',         (790, 120, 1350, 800), 1.0),
    # The 6 September set. These two are still the photo fallback behind the cut-outs in
    # components/HeroCarousel.tsx, so they are prepared even though the hero above no longer uses
    # them. The third of that set was `care-that-comes-to-you` and banner-1 has replaced it.
    '9e6d70ca-b5de-4b27-993f-46bc2c1863e4.png': ('one-safe-place', (1075, 18, 1780, 620), 0.92),
    'cb57bf81-3bc0-436f-a075-199cc7c6e3b2.png': ('feel-better',    (1045, 18, 1790, 648), 0.92),
}

# ── The cut-outs ──────────────────────────────────────────────────────────────────────────────────
# Used exactly as supplied. The only processing is trimming the fully transparent margin so the
# subject's head sits at the top of the frame. Nothing is cropped into the subject; the layout is
# sized around them instead.
CUTOUTS = {
    '2a2098ee-cf58-4e4c-9dd6-3ee4f6f81757.png': 'feel-better',
    '4d9a6b92-b4a8-44dd-aab6-dee63270298c.png': 'care-that-comes-to-you',
    '8d485233-8478-4b88-9771-92be88c1befe.png': 'one-safe-place',
}

# ── The hero figures ──────────────────────────────────────────────────────────────────────────────
# The landing hero's pictures since 28 September 2026. The founder called the crops above "cut and
# low quality", and they were: the right third of each 1774×887 composition is under two baked
# cards, so the honest crop was a 585×680 sliver, which the page then cropped again with
# object-fit and upscaled on a desktop. The same people exist as transparent 1122×1402 cut-outs, so
# the hero draws those on its own ground instead of a photograph of somebody else's.
#
# They are named `hero-<slide>` rather than `<slide>-cutout` because that name is taken: the patient
# app's carousel and both phones draw `care-that-comes-to-you-cutout`, which is the mother and child,
# and renaming it would change a picture on three platforms to fix one page.
#
# box is None for a cut-out: it is kept exactly as supplied, canvas and all, so that all three share
# one 1122×1402 frame and the page can size one figure for any of them. The fourth slide has no
# cut-out. Its figure is the walking couple from the Live well composition, taken at native size
# from the part of the frame nothing is baked over: x from 775, where the headline's wash has faded
# out behind the woman's elbow, to 1495, where the "Nourish your everyday" card begins, full height.
# That loses the back of the man's head by about twenty pixels, which is the honest price of not
# painting over a card. It is a photograph, so it stays one: RGB, a rectangle, framed by the page.
HERO = {
    '8d485233-8478-4b88-9771-92be88c1befe.png': ('care-that-comes-to-you', None),
    '4d9a6b92-b4a8-44dd-aab6-dee63270298c.png': ('for-your-family',        None),
    'fc6a42c9-90f4-4023-b441-67f295cbf6e5.png': ('everyday-wellbeing',     (775, 0, 1495, 830)),
    '2a2098ee-cf58-4e4c-9dd6-3ee4f6f81757.png': ('for-the-nurses',         None),
}

missing = [f for f in list(FLAT) + list(CUTOUTS) + list(HERO) if not os.path.exists(os.path.join(BANNERS, f))]
if missing:
    print(f'{BANNERS} is missing {len(missing)} named source(s):', file=sys.stderr)
    for f in missing:
        print(f'  {f}', file=sys.stderr)
    print('Nothing was written. Name the replacement above rather than letting the run guess.', file=sys.stderr)
    raise SystemExit(1)

os.makedirs(OUT, exist_ok=True)

# A re-run that changes nothing touches nothing. scripts/check-boundaries.mjs holds every published
# copy to being newer than its source here, so rewriting an identical crop would mark the phones'
# cut-outs stale and send whoever ran this into re-encoding three platforms' assets for no change.
def save(image, path, **options):
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG' if path.endswith('.jpg') else 'PNG', **options)
    data = buffer.getvalue()
    if os.path.exists(path) and open(path, 'rb').read() == data:
        return 'unchanged'
    with open(path, 'wb') as out:
        out.write(data)
    return 'written'

for source, (name, box, scale) in FLAT.items():
    image = Image.open(os.path.join(BANNERS, source)).convert('RGB').crop(box)
    if scale != 1.0:
        image = image.resize((int(image.width * scale), int(image.height * scale)), Image.LANCZOS)
    done = save(image, f'{OUT}/{name}.jpg', quality=86, optimize=True, progressive=True)
    print(f'{name}.jpg: {image.size[0]}x{image.size[1]}  <- {source} ({done})')

for source, name in CUTOUTS.items():
    image = Image.open(os.path.join(BANNERS, source)).convert('RGBA')
    image = image.crop(image.getchannel('A').getbbox())   # trim the empty margin, nothing else
    scale = 1100 / image.height
    image = image.resize((round(image.width * scale), 1100), Image.LANCZOS)
    done = save(image, f'{OUT}/{name}-cutout.png', optimize=True)
    print(f'{name}-cutout.png: {image.size[0]}x{image.size[1]}  <- {source} ({done})')

for source, (name, box) in HERO.items():
    image = Image.open(os.path.join(BANNERS, source))
    image = image.convert('RGBA') if box is None else image.convert('RGB').crop(box)
    done = save(image, f'{OUT}/hero-{name}.png', optimize=True)
    print(f'hero-{name}.png: {image.size[0]}x{image.size[1]} {image.mode}  <- {source} ({done})')
