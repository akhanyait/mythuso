"""Crop the supplied banner artwork down to just its photograph.

The banners in Documentation/app banners/ are complete compositions — logo, headline, call to
action and trust marks are baked into the pixels. The app renders all of that itself, translated
and interactive, so only the photograph is taken. The crop boxes below are per banner because the
subject sits in a different place in each, and they deliberately exclude the banners' own caption
chips so they do not appear twice.
"""
from PIL import Image
import glob, os

SOURCE = sorted(glob.glob('Documentation/app banners/*.png'))
TARGETS = [
    ('care-that-comes-to-you', (980, 18, 1790, 648)),
    ('one-safe-place', (1075, 18, 1780, 620)),
    ('feel-better', (1045, 18, 1790, 648)),
]
os.makedirs('packages/banners', exist_ok=True)
for path, (name, box) in zip(SOURCE, TARGETS):
    image = Image.open(path).convert('RGB').crop(box)
    image = image.resize((int(image.width * 0.92), int(image.height * 0.92)), Image.LANCZOS)
    image.save(f'packages/banners/{name}.jpg', quality=86, optimize=True, progressive=True)
    print(f'{name}: {image.size[0]}x{image.size[1]}')
