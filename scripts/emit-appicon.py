"""Render the iOS app icon from the one drawing everything else derives from.

── Why this exists ────────────────────────────────────────────────────────────────────────────────

`apps/ios` had no `AppIcon.appiconset` and no `ASSETCATALOG_COMPILER_APPICON_NAME`, so the build
produced an app with a blank white tile on the home screen. Android has had an icon since the first
week — an adaptive vector whose two drawables restate, by hand, the paths in
`packages/illustrations/app-icon.svg`.

A second hand-typed copy on iOS would have been the third statement of the same heart. So this reads
the geometry out of the SVG and draws it, and `scripts/check-boundaries.mjs` holds the Android
drawables to the same source. Change the SVG and both platforms follow.

── Why PIL rather than a real rasteriser ─────────────────────────────────────────────────────────

Nothing in the toolchain rasterises SVG — no rsvg, no Inkscape, no cairo — and adding one to build a
single square is a dependency for a build step that runs when the brand changes. The drawing is a
gradient, one circle of highlight, one closed path of six cubics and one seven-point polyline. Those
are sampled here and drawn at 4× and reduced, which is what an antialiasing rasteriser would do.

── What is deliberately different from the SVG ───────────────────────────────────────────────────

The corner radius. The SVG rounds itself at rx=118 because it is also used as a standalone picture;
iOS masks the icon itself and a pre-rounded one shows the seam of two different curves. The square
is drawn full-bleed and opaque, which is what the platform asks for.
"""
from PIL import Image, ImageDraw
import os
import re
import sys

SVG = 'packages/illustrations/app-icon.svg'
SET = 'apps/ios/MyThuso/Assets.xcassets/AppIcon.appiconset'
SIDE = 1024
SS = 4                      # supersample, reduced back down at the end
GRID = 512                  # the SVG's own viewBox

source = open(SVG, encoding='utf-8').read()

def only(pattern, what):
    """One match or a loud failure. A silent second copy is how the brand drifts."""
    found = re.findall(pattern, source)
    if len(found) != 1:
        print(f'{SVG}: expected exactly one {what}, found {len(found)}.', file=sys.stderr)
        raise SystemExit(1)
    return found[0]

# ── Read the drawing ──────────────────────────────────────────────────────────────────────────────
grad = only(r'<linearGradient id="bg".*?</linearGradient>', 'background gradient')
stops = re.findall(r'stop-color="(#[0-9A-Fa-f]{6})"', grad)
highlight = only(r'<circle cx="(\d+)" cy="(\d+)" r="(\d+)" fill="url\(#hl\)"', 'highlight circle')
heart = only(r'<path d="(M[^"]*)" fill="none" stroke="(#[0-9A-Fa-f]{6})" stroke-width="(\d+)"', 'heart path')
pulse = only(r'<polyline points="([^"]+)" fill="none" stroke="(#[0-9A-Fa-f]{6})" stroke-width="(\d+)"', 'pulse polyline')

rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
start, end = rgb(stops[0]), rgb(stops[1])

# ── The background: the SVG's gradient runs corner to corner, so the ramp is along x+y ────────────
size = SIDE * SS
icon = Image.new('RGB', (size, size))
px = icon.load()
row = [[0] * size for _ in range(3)]
for i in range(size):
    for c in range(3):
        row[c][i] = start[c] + (end[c] - start[c]) * i / (size - 1)
for y in range(size):
    for x in range(size):
        t = (x + y) / 2
        lo, hi = int(t), min(int(t) + 1, size - 1)
        f = t - lo
        px[x, y] = tuple(round(row[c][lo] + (row[c][hi] - row[c][lo]) * f) for c in range(3))

# ── The highlight: white at 18% fading to nothing across the circle's own box ─────────────────────
hx, hy, hr = (int(v) * size / GRID for v in highlight)
glow = Image.new('L', (size, size), 0)
gpx = glow.load()
left, top = hx - hr, hy - hr
for y in range(max(0, int(top)), min(size, int(hy + hr) + 1)):
    for x in range(max(0, int(left)), min(size, int(hx + hr) + 1)):
        if (x - hx) ** 2 + (y - hy) ** 2 > hr * hr:
            continue
        t = ((x - left) / (2 * hr) + (y - top) / (2 * hr)) / 2
        gpx[x, y] = round(255 * 0.18 * max(0.0, 1.0 - t))
icon = Image.composite(Image.new('RGB', (size, size), (255, 255, 255)), icon, glow)

draw = ImageDraw.Draw(icon)
scale = size / GRID

def bezier(p0, p1, p2, p3, steps=90):
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        yield (u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
               u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1])

def path_points(d):
    """Enough of SVG path syntax for this drawing: absolute M, C and Z."""
    tokens = re.findall(r'[MCZmcz]|-?[\d.]+', d)
    points, here, i = [], (0.0, 0.0), 0
    while i < len(tokens):
        op = tokens[i]; i += 1
        if op in 'Mm':
            here = (float(tokens[i]), float(tokens[i + 1])); i += 2
            points.append(here)
        elif op in 'Cc':
            while i < len(tokens) and tokens[i] not in 'MCZmcz':
                c1 = (float(tokens[i]), float(tokens[i + 1]))
                c2 = (float(tokens[i + 2]), float(tokens[i + 3]))
                to = (float(tokens[i + 4]), float(tokens[i + 5])); i += 6
                points.extend(bezier(here, c1, c2, to)); here = to
        elif op in 'Zz':
            points.append(points[0])
    return points

def stroke(points, colour, width):
    """Stamp a round brush along the path.

    Not ImageDraw.line(joint='curve'). At this stroke width — 26 units of a 512 grid, so 208px once
    supersampled — its joins overshoot, and a bezier sampled densely enough to look like a curve has
    a join every few pixels. The result was a heart with a comb along both shoulders. A disc stamped
    at each sample is what a round linejoin and a round linecap actually mean, and the sampling is
    dense enough that consecutive discs overlap by more than ninety per cent."""
    r = width * scale / 2
    flat = [(x * scale, y * scale) for x, y in points]
    for i, (x, y) in enumerate(flat):
        if i:                                           # fill the gap between consecutive stamps
            draw.line([flat[i - 1], (x, y)], fill=colour, width=round(width * scale))
        draw.ellipse([x - r, y - r, x + r, y + r], fill=colour)

stroke(path_points(heart[0]), rgb(heart[1]), int(heart[2]))
stroke([tuple(float(v) for v in p.split(',')) for p in pulse[0].split()], rgb(pulse[1]), int(pulse[2]))

os.makedirs(SET, exist_ok=True)
icon.resize((SIDE, SIDE), Image.LANCZOS).save(f'{SET}/AppIcon-1024.png', optimize=True)

# A single 1024 square. iOS 17 asks for nothing else; the system derives every other size, and a
# catalogue full of hand-resized copies is nine more things that can disagree with the drawing.
open(f'{SET}/Contents.json', 'w', encoding='utf-8').write(
    '{\n'
    '  "images" : [\n'
    '    {\n'
    '      "filename" : "AppIcon-1024.png",\n'
    '      "idiom" : "universal",\n'
    '      "platform" : "ios",\n'
    '      "size" : "1024x1024"\n'
    '    }\n'
    '  ],\n'
    '  "info" : {\n'
    '    "author" : "xcode",\n'
    '    "version" : 1\n'
    '  }\n'
    '}\n')
print(f'AppIcon-1024.png: {SIDE}x{SIDE}  <- {SVG}')
