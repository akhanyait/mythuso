/* One illustration source, three platforms.
   packages/illustrations/*.svg is the original; the web imports the SVG directly and this script
   rasterises the same files into iOS and Android drawables so the apps cannot drift apart.
   Run: node scripts/render-illustrations.mjs   (needs the repo's Playwright chromium) */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const targets = [
 { name: 'nurse', width: 188, height: 224 },
 { name: 'patient', width: 240, height: 240 },
 { name: 'family', width: 176, height: 220 },
 { name: 'elder', width: 208, height: 234 }
];

/* THE MARK, AND WHY IT IS NOT IN THE LIST ABOVE.
 *
 * `logo` used to be the fifth illustration: packages/illustrations/logo.svg, rasterised into the
 * Brand imageset and mythuso_logo.png, and copied out to the web as a sixth file. That artwork was
 * the indigo-and-teal mark, and it is not the brand any more — the founder supplied the real files
 * and they live in apps/web/public/brand as outlined paths, which is where the web reads them from.
 *
 * So the native apps read the same files rather than a second copy of them. One source, three
 * platforms, which is the rule everything else in this script exists to keep; the only difference is
 * that the source directory is the web's public folder rather than packages/illustrations, because
 * that is where the brand actually landed and moving it would mean editing a tree somebody else is
 * working in.
 *
 * EACH CUT IS RENDERED AT ITS OWN ASPECT, NOT AT A BOX SOMEBODY LIKED. The wordmark's viewBox is
 * 366×98 and the square mark's is 200×200; rendering either into the other's frame is how a logo
 * arrives letterboxed inside its own padding. The sizes below are the viewBoxes, so a 3x raster is
 * about three times the artwork and every native frame scales it down rather than up.
 *
 * There is no font here and there must not be one. The supplied SVGs set the wordmark as live text
 * in Poppins; every glyph is outlined now, and a rasteriser that had to resolve a font family would
 * have produced a different logo on every machine that ran it. */
const brand = [
 { file: 'mythuso-logo', width: 366, height: 98, ios: 'Brand', android: 'mythuso_logo' },
 { file: 'mythuso-mark', width: 200, height: 200, ios: 'BrandMark', android: 'mythuso_mark' },
 { file: 'mythuso-mark-reversed', width: 200, height: 200, ios: 'BrandMarkReversed', android: 'mythuso_mark_reversed' },
 { file: 'mythuso-logo-reversed', width: 366, height: 98, ios: 'BrandReversed', android: 'mythuso_logo_reversed' }
];
const iosScales = [['', 1], ['@2x', 2], ['@3x', 3]];
mkdirSync('apps/android/app/src/main/res/drawable-xxhdpi', { recursive: true });
const browser = await chromium.launch();
for (const { name, width, height, ios, android, web } of targets) {
 const svg = readFileSync(`packages/illustrations/${name}.svg`, 'utf8');
 const dir = `apps/ios/MyThuso/Assets.xcassets/${ios ?? name[0].toUpperCase() + name.slice(1)}.imageset`;
 mkdirSync(dir, { recursive: true });
 for (const [suffix, scale] of iosScales) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`);
  const shot = await page.screenshot({ omitBackground: true });
  writeFileSync(`${dir}/${name}${suffix}.png`, shot);
  if (scale === 3) writeFileSync(`apps/android/app/src/main/res/drawable-xxhdpi/${android ?? `mythuso_${name}`}.png`, shot);
  await page.close();
 }
 writeFileSync(`${dir}/Contents.json`, JSON.stringify({
  images: iosScales.map(([suffix, scale]) => ({ filename: `${name}${suffix}.png`, idiom: 'universal', scale: `${scale}x` })),
  info: { author: 'xcode', version: 1 }
 }, null, 1));
 console.log(`rendered ${name}`);
}

for (const { file, width, height, ios, android } of brand) {
 const svg = readFileSync(`apps/web/public/brand/${file}.svg`, 'utf8');
 const dir = `apps/ios/MyThuso/Assets.xcassets/${ios}.imageset`;
 mkdirSync(dir, { recursive: true });
 for (const [suffix, scale] of iosScales) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`);
  const shot = await page.screenshot({ omitBackground: true });
  writeFileSync(`${dir}/${file}${suffix}.png`, shot);
  if (scale === 3) writeFileSync(`apps/android/app/src/main/res/drawable-xxhdpi/${android}.png`, shot);
  await page.close();
 }
 writeFileSync(`${dir}/Contents.json`, JSON.stringify({
  images: iosScales.map(([suffix, scale]) => ({ filename: `${file}${suffix}.png`, idiom: 'universal', scale: `${scale}x` })),
  info: { author: 'xcode', version: 1 }
 }, null, 1));
 console.log(`rendered ${file}`);
}
/* Hero photography follows the same one-source rule: packages/banners is the original and every
   app bundle is derived from it. The cut-outs are what the design actually wants — a person on
   transparency, free to rise above the banner's top edge — so those are the ones the native apps
   carry. The flat .jpg crops stay for the web's fallback chain only.

   They are *encoded*, not copied. A photograph with an alpha channel stored as PNG-24 is the worst
   case that format has: three of these were 1.1 to 1.5 MB each, and four images were 77% of the
   whole Android release APK and most of the compiled iOS asset catalogue. Both platforms have a
   native format that does this properly — WebP on Android, HEIC on Apple — and each cuts them by
   about ninety per cent with the alpha channel intact, which is the part that matters: the edge of
   a cut-out is the one thing that must not be touched.

   sips is macOS-only, which is not a new constraint — the iOS app cannot be built anywhere else
   either. Where it is missing the PNG is copied through and the message says so, rather than the
   build silently shipping something different from what it claims. */
mkdirSync('apps/web/public/banners', { recursive: true });
mkdirSync('apps/android/app/src/main/res/drawable-nodpi', { recursive: true });
const encodeWebp = (from, to) => {
 const result = spawnSync('python3', ['-c',
  'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGBA").save(sys.argv[2], "WEBP", quality=82, method=6)',
  from, to], { encoding: 'utf8' });
 if (result.status !== 0) throw new Error(`Could not encode ${to}: ${result.stderr || result.error}`);
};
const encodeHeic = (from, to) => {
 const result = spawnSync('sips', ['-s', 'format', 'heic', from, '--out', to], { encoding: 'utf8' });
 return result.status === 0;
};
/* The landing hero's figures, since 28 September 2026: `hero-<slide>.png` in packages/banners, at
   the resolution the founder supplied. Each becomes three files and nothing on a phone.

   Two WebP widths for one srcset. 640 is what a phone asks for — the figure stands about 200 CSS
   pixels wide there, and 640 still covers a three-times screen — and the native width is what a
   desktop asks for, where the figure is 500-odd CSS pixels wide on a two-times screen. Colour at
   quality 85; the alpha plane at 80, which on the cut-outs' hair measured indistinguishable from
   lossless and took 17 kB off the phone's figure (124 kB to 107). Quality 82 was this script's
   figure for everything else and is kept there.

   And a fallback at 640 for a browser that cannot decode WebP: a PNG for a cut-out, because a JPEG
   has no transparency and the figure would arrive in a white box, quantised to 256 colours so the
   fallback is not six times the file it stands in for; a JPEG for the one slide that is a
   photograph. The phones do not take these — the cut-outs they draw are the ones below. */
const encodeHero = (from, stem) => {
 const result = spawnSync('python3', ['-c', `
import sys
from PIL import Image
source, out, stem = sys.argv[1], sys.argv[2], sys.argv[3]
image = Image.open(source)
cutout = image.mode == 'RGBA'
def at(width):
    return image if width == image.width else image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
for width in sorted({640, image.width}):
    at(width).save(f'{out}/hero-{stem}-{width}.webp', 'WEBP', quality=85, alpha_quality=80, method=6)
if cutout:
    at(640).quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(f'{out}/hero-{stem}.png', optimize=True)
else:
    at(640).convert('RGB').save(f'{out}/hero-{stem}.jpg', quality=84, optimize=True, progressive=True)
print(f'{stem}: {image.width}x{image.height} {"cut-out" if cutout else "photograph"}')
`, from, 'apps/web/public/banners', stem], { encoding: 'utf8' });
 if (result.status !== 0) throw new Error(`Could not encode the hero figure ${stem}: ${result.stderr || result.error}`);
 process.stdout.write(`encoded hero figure ${result.stdout}`);
};
if (existsSync('packages/banners')) {
 for (const file of readdirSync('packages/banners').filter(f => /\.(jpg|png)$/.test(f))) {
  if (/^hero-.+\.png$/.test(file)) { encodeHero(`packages/banners/${file}`, file.replace(/^hero-|\.png$/g, '')); continue; }
  /* The flat crops go to the web as WebP with the .jpg behind them. The landing hero is four
     photographs now rather than three, and it is read on mid-range Android handsets on metered
     data: about 290 kB of JPEG against about 140 kB of WebP, for pictures a stranger sees before
     they have asked for anything. The .jpg stays published — it is the fallback the page falls to
     when the other will not decode, and it is what the native apps take. */
  if (!file.endsWith('-cutout.png')) {
   copyFileSync(`packages/banners/${file}`, `apps/web/public/banners/${file}`);
   if (file.endsWith('.jpg')) encodeWebp(`packages/banners/${file}`, `apps/web/public/banners/${file.replace(/\.jpg$/, '.webp')}`);
   continue;
  }
  const source = `packages/banners/${file}`;
  const name = file.replace('-cutout.png', '');
  /* The web gets WebP too: the same 1.4 MB was going down a South African mobile connection on
     every first visit to the landing page. The .jpg fallback below it is unchanged. */
  encodeWebp(source, `apps/web/public/banners/${name}-cutout.webp`);
  encodeWebp(source, `apps/android/app/src/main/res/drawable-nodpi/banner_${name.replace(/-/g, '_')}.webp`);
  const set = `apps/ios/MyThuso/Assets.xcassets/Banner${name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('')}.imageset`;
  mkdirSync(set, { recursive: true });
  const heic = `${name}-cutout.heic`;
  const encoded = encodeHeic(source, `${set}/${heic}`);
  const filename = encoded ? heic : file;
  if (!encoded) { copyFileSync(source, `${set}/${file}`); console.log(`  sips is unavailable, so ${name} stays a PNG on iOS`); }
  writeFileSync(`${set}/Contents.json`, JSON.stringify({ images: [{ idiom: 'universal', scale: '1x' }, { idiom: 'universal', scale: '2x' }, { filename, idiom: 'universal', scale: '3x' }], info: { author: 'xcode', version: 1 } }, null, 1));
  console.log(`encoded banner cut-out ${name}`);
 }
}
await browser.close();
