/* One illustration source, three platforms.
   packages/illustrations/*.svg is the original; the web imports the SVG directly and this script
   rasterises the same files into iOS and Android drawables so the apps cannot drift apart.
   Run: node scripts/render-illustrations.mjs   (needs the repo's Playwright chromium) */
import { chromium } from '@playwright/test';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const targets = [
 { name: 'nurse', width: 188, height: 224 },
 { name: 'patient', width: 240, height: 240 },
 { name: 'family', width: 176, height: 220 },
 { name: 'elder', width: 208, height: 234 }
];
const iosScales = [['', 1], ['@2x', 2], ['@3x', 3]];
mkdirSync('apps/android/app/src/main/res/drawable-xxhdpi', { recursive: true });
const browser = await chromium.launch();
for (const { name, width, height } of targets) {
 const svg = readFileSync(`packages/illustrations/${name}.svg`, 'utf8');
 const dir = `apps/ios/MyThuso/Assets.xcassets/${name[0].toUpperCase() + name.slice(1)}.imageset`;
 mkdirSync(dir, { recursive: true });
 for (const [suffix, scale] of iosScales) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`);
  const shot = await page.screenshot({ omitBackground: true });
  writeFileSync(`${dir}/${name}${suffix}.png`, shot);
  if (scale === 3) writeFileSync(`apps/android/app/src/main/res/drawable-xxhdpi/mythuso_${name}.png`, shot);
  await page.close();
 }
 writeFileSync(`${dir}/Contents.json`, JSON.stringify({
  images: iosScales.map(([suffix, scale]) => ({ filename: `${name}${suffix}.png`, idiom: 'universal', scale: `${scale}x` })),
  info: { author: 'xcode', version: 1 }
 }, null, 1));
 console.log(`rendered ${name}`);
}
/* Hero photography follows the same one-source rule: packages/banners is the original and every
   app bundle is copied from it. The cut-outs are what the design actually wants — a person on
   transparency, free to rise above the banner's top edge — so those are the ones the native apps
   carry. The flat .jpg crops stay for the web's fallback chain only. */
mkdirSync('apps/web/public/banners', { recursive: true });
mkdirSync('apps/android/app/src/main/res/drawable-nodpi', { recursive: true });
if (existsSync('packages/banners')) {
 for (const file of readdirSync('packages/banners').filter(f => /\.(jpg|png)$/.test(f))) {
  copyFileSync(`packages/banners/${file}`, `apps/web/public/banners/${file}`);
  if (!file.endsWith('-cutout.png')) continue;             // native ships only the cut-outs
  const name = file.replace('-cutout.png', '');
  copyFileSync(`packages/banners/${file}`, `apps/android/app/src/main/res/drawable-nodpi/banner_${name.replace(/-/g, '_')}.png`);
  const set = `apps/ios/MyThuso/Assets.xcassets/Banner${name.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('')}.imageset`;
  mkdirSync(set, { recursive: true });
  copyFileSync(`packages/banners/${file}`, `${set}/${file}`);
  writeFileSync(`${set}/Contents.json`, JSON.stringify({ images: [{ idiom: 'universal', scale: '1x' }, { idiom: 'universal', scale: '2x' }, { filename: file, idiom: 'universal', scale: '3x' }], info: { author: 'xcode', version: 1 } }, null, 1));
  console.log(`copied banner cut-out ${name}`);
 }
}
await browser.close();
