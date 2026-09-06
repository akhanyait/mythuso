"""Prepare the hero banner artwork.

Two things come out of Documentation/app banners/:

* the cut-outs (RGBA) become `<slide>-cutout.png` — trimmed to the subject so the head sits at the
  very top of the frame, which is what lets the person rise above the banner's top edge;
* the flat banner compositions (RGB) become `<slide>.jpg`, cropped to just their photograph. The
  headline, call to action and trust marks are baked into those pixels and the app renders its own,
  translated and interactive, so only the picture is taken. This is the fallback the web uses if a
  cut-out is ever missing.

Run this, then `node scripts/render-illustrations.mjs` to copy the results into the three apps.
"""
from PIL import Image
import glob, os

BANNERS = sorted(glob.glob('Documentation/app banners/*.png'))
FLAT = [f for f in BANNERS if Image.open(f).mode == 'RGB']
CUTOUT = [f for f in BANNERS if Image.open(f).mode == 'RGBA']

# The flat banners are in slide order; the cut-outs are not, so they are matched by subject.
FLAT_CROPS = [
    ('care-that-comes-to-you', (980, 18, 1790, 648)),
    ('one-safe-place', (1075, 18, 1780, 620)),
    ('feel-better', (1045, 18, 1790, 648)),
]
# The hero puts the person beside a column of copy, so a wide crop either shrinks them out of the
# design or covers the text. Each cut-out is narrowed to a portrait aspect after trimming; the
# anchor says which part of the width to keep when both people matter (0 = left, 1 = right).
CUTOUT_ORDER = [
    ('feel-better', 0.50),
    ('care-that-comes-to-you', 0.56),
    ('one-safe-place', 0.52),
]
TARGET_ASPECT = 0.62

os.makedirs('packages/banners', exist_ok=True)

for path, (name, box) in zip(FLAT, FLAT_CROPS):
    image = Image.open(path).convert('RGB').crop(box)
    image = image.resize((int(image.width * 0.92), int(image.height * 0.92)), Image.LANCZOS)
    image.save(f'packages/banners/{name}.jpg', quality=86, optimize=True, progressive=True)
    print(f'{name}.jpg: {image.size[0]}x{image.size[1]}')

for path, (name, anchor) in zip(CUTOUT, CUTOUT_ORDER):
    image = Image.open(path).convert('RGBA')
    image = image.crop(image.getchannel('A').getbbox())   # trim the empty margin around the subject
    wanted = round(image.height * TARGET_ASPECT)
    if image.width > wanted:
        left = round((image.width - wanted) * anchor)
        image = image.crop((left, 0, left + wanted, image.height))
    scale = 1100 / image.height
    image = image.resize((round(image.width * scale), 1100), Image.LANCZOS)
    image.save(f'packages/banners/{name}-cutout.png', optimize=True)
    print(f'{name}-cutout.png: {image.size[0]}x{image.size[1]}')
