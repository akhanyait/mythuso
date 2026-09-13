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
if (existsSync('packages/banners')) {
 for (const file of readdirSync('packages/banners').filter(f => /\.(jpg|png)$/.test(f))) {
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
