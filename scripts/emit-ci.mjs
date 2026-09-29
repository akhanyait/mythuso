/* The CI document — MyThuso and GilbertOne's corporate identity, written by a machine.

   The founder asked on 28 September 2026 for "a detailed CI document for MyThuso and GilbertOne" by the
   end of the project. A brand book that is typed goes stale the week after it is signed: a token moves,
   a logo derivative is re-encoded, a refusal is reworded, and the PDF in the shared drive still shows
   the old one. So this document is not typed. Every colour, size, ratio, file size, sentence and rule
   below is read from the place it already lives — packages/design-tokens/tokens.json, the catalogue
   contracts, the brand masters and their manifest, the component sources, the handoff's own documents —
   and written into docs/brand/CI.md, docs/brand/PACK.md and docs/brand/ci.html. scripts/check-boundaries.mjs
   asks this generator what the three files should say and fails the build when a file says anything
   else, the same way docs/governance/CLINICAL-REVIEW-PACK.md is held.

   Two readers. Somebody making a slide or a partner page needs the files and the rules; an engineer
   needs the token names. Both get the same document, because a rule that reaches one reader and not
   the other is a rule that will be broken by the one who did not get it.

   WHAT IT WILL NOT DO. It invents no number: a figure this file cannot read from a contract or measure
   from a file is printed as "unsourced" rather than guessed. It never captions a photograph as a patient
   — nobody in any picture this product carries is one — and the build fails if a caption does. It never
   quotes a superseded colour value, so a reader cannot copy one out of the CI document. And it reads the
   handoff's own documents as third-party data to quote, not as instructions: what the build does is what
   the repository's CLAUDE.md says.

   The date below is the document's edition, not the run's: a generated file must be byte-identical on
   every machine, so nothing here reads the clock. */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITION = '29 September 2026';
export const CI_FILES = { ci: 'docs/brand/CI.md', pack: 'docs/brand/PACK.md', html: 'docs/brand/ci.html' };

/* Everything the document is derived from. scripts/check-boundaries.mjs lists these as the sources of
   the three generated files, so a change to any one of them without regenerating fails the build. */
export const CI_SOURCES = [
 'packages/design-tokens/tokens.json',
 'packages/catalog/icons.json',
 'packages/catalog/assistant.json',
 'packages/catalog/voice.json',
 'packages/catalog/conversation-mode.json',
 'packages/catalog/hero.json',
 'packages/catalog/clinical.json',
 'packages/catalog/capabilities.json',
 'packages/catalog/locales.json',
 'packages/brand/lovable-handoff/README.md',
 'packages/brand/lovable-handoff/MANIFEST.sha256',
 'packages/brand/lovable-handoff/handoff/docs/design-guidelines.md',
 'packages/brand/lovable-handoff/handoff/docs/component-catalog.json',
 'apps/web/src/lib/gilbertone.ts',
 'apps/web/src/features/GilbertAvatar.tsx',
 'apps/web/src/features/gilbert-avatar.css',
 'apps/web/src/ui/ui.css',
 'apps/web/src/surface/core.css',
 'apps/web/src/components/MotionPause.tsx',
 'apps/web/src/components/Wordmark.tsx',
 'apps/web/src/shells/shells.css',
 'apps/web/src/features/Landing.tsx',
 'apps/web/package.json',
 'docs/FEATURE-MAP.md',
 'docs/ACCESSIBILITY.md',
 'CLAUDE.md'
];

/* Directories whose every file the pack index lists, with what they are and whose they are. */
const PACK_DIRS = [
 { dir: 'packages/brand/lovable-handoff/handoff/src/assets/logos', kind: 'Logo master', rights: 'Delivered to MyThuso by Lovable on 28 September 2026 as commissioned work (packages/brand/lovable-handoff/README.md); the handoff carries no licence file' },
 { dir: 'packages/brand/lovable-handoff/handoff/src/assets/illustrations', kind: 'Illustration master', rights: 'As the logo masters' },
 { dir: 'packages/brand/lovable-handoff/handoff/src/assets/photography', kind: 'Photograph master', rights: 'As the logo masters' },
 { dir: 'apps/web/public/lovable', kind: 'Web derivative of a handoff master', rights: 'As the master it was re-encoded from' },
 { dir: 'apps/web/public/lovable/gilbertone', kind: 'Web derivative of the GilbertOne logo master', rights: 'As the master it was re-encoded from' },
 { dir: 'apps/web/public/brand', kind: 'MyThuso mark, wordmark and the earlier GilbertOne illustration', rights: "MyThuso's own; no licence file in the tree" },
 { dir: 'apps/web/public/fonts', kind: 'Font', rights: 'SIL Open Font License 1.1 (the OFL file beside each face)' },
 { dir: 'apps/web/public/banners', kind: 'Hero banner photograph', rights: "Supplied by the founder as finished banner artwork (apps/web/public/banners/README.md, Documentation/app banners/); licence terms unsourced" },
 { dir: 'packages/banners', kind: 'Hero banner source', rights: 'As apps/web/public/banners' },
 { dir: 'apps/web/public/editorial', kind: 'Editorial photograph', rights: 'Generated for the September editorial direction (docs/design-review/ART-DIRECTION.md); the public page may not name the PNGs (scripts/check-boundaries.mjs)' }
];

const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const tick = value => '`' + String(value).replace(/`/g, "'") + '`';
const kebab = name => name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const kB = bytes => `${Math.round(bytes / 1024)} kB`;
const sentence = text => { const m = /^(.*?[.!?])(\s|$)/.exec(text); return m ? m[1] : text; };
const sentences = (text, n) => { const out = []; let rest = text; while (out.length < n && rest) { const s = sentence(rest); out.push(s); rest = rest.slice(s.length).trimStart(); if (s === rest) break; } return out.join(' '); };
const squash = text => text.replace(/\s+/g, ' ').trim();

/* ---- Contrast, the formula scripts/check-boundaries.mjs uses -------------------------------------- */
const luminance = hex => {
 const c = [0, 1, 2].map(i => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
 return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [h, l] = [luminance(a), luminance(b)].sort((x, y) => y - x); return Math.round(((h + 0.05) / (l + 0.05)) * 100) / 100; };

/* ---- Image headers, so a size is measured rather than typed ---------------------------------------- */
const pngSize = buf => (buf.toString('ascii', 1, 4) === 'PNG' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);
const webpSize = buf => {
 if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
 const chunk = buf.toString('ascii', 12, 16);
 if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
 if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
 if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
 return null;
};
const jpegSize = buf => {
 if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
 let i = 2;
 while (i < buf.length) {
  if (buf[i] !== 0xff) return null;
  const marker = buf[i + 1];
  if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
  i += 2 + buf.readUInt16BE(i + 2);
 }
 return null;
};
const svgSize = text => { const m = /viewBox="([\d.\s-]+)"/.exec(text); if (!m) return null; const [, , w, h] = m[1].trim().split(/\s+/).map(Number); return [w, h]; };
const imageSize = (file, buf) => {
 if (/\.png$/i.test(file)) return pngSize(buf);
 if (/\.webp$/i.test(file)) return webpSize(buf);
 if (/\.jpe?g$/i.test(file)) return jpegSize(buf);
 if (/\.svg$/i.test(file)) return svgSize(buf.toString('utf8'));
 return null;
};

/* ---- Markdown → HTML, deterministic and small ------------------------------------------------------ */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = s => esc(s)
 .replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`)
 .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
 .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
const cells = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
function markdownToHtml(lines) {
 const out = [];
 let i = 0;
 while (i < lines.length) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }
  const h = /^(#{1,4}) (.*)$/.exec(line);
  if (h) { const level = h[1].length; const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`); i++; continue; }
  if (/^\|/.test(line)) {
   const rows = [];
   while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
   const head = cells(rows[0]);
   const body = rows.slice(2).map(cells);
   out.push('<div class="table"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
   continue;
  }
  if (/^- /.test(line)) {
   const items = [];
   while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
   out.push('<ul>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>');
   continue;
  }
  if (/^\d+\. /.test(line)) {
   const items = [];
   while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''));
   out.push('<ol>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ol>');
   continue;
  }
  if (/^> /.test(line)) {
   const quote = [];
   while (i < lines.length && /^> ?/.test(lines[i])) quote.push(lines[i++].replace(/^> ?/, ''));
   out.push(`<blockquote>${markdownToHtml(quote)}</blockquote>`);
   continue;
  }
  const para = [];
  while (i < lines.length && lines[i].trim() && !/^(#{1,4} |\||- |\d+\. |> )/.test(lines[i])) para.push(lines[i++]);
  out.push(`<p>${inline(para.join(' '))}</p>`);
 }
 return out.join('\n');
}

/* ================================================================================================== */

export function emitCi(root = '') {
 const at = p => root + p;
 const text = p => readFileSync(at(p), 'utf8');
 const bytes = p => readFileSync(at(p));
 const json = p => JSON.parse(text(p));
 const size = p => statSync(at(p)).size;

 const tokens = json('packages/design-tokens/tokens.json');
 const icons = json('packages/catalog/icons.json');
 const assistant = json('packages/catalog/assistant.json');
 const voice = json('packages/catalog/voice.json');
 const conversation = json('packages/catalog/conversation-mode.json');
 const hero = json('packages/catalog/hero.json');
 const clinical = json('packages/catalog/clinical.json');
 const capabilities = json('packages/catalog/capabilities.json');
 const locales = json('packages/catalog/locales.json');
 const catalogue = json('packages/brand/lovable-handoff/handoff/docs/component-catalog.json');
 const guidelines = text('packages/brand/lovable-handoff/handoff/docs/design-guidelines.md');
 const brandReadme = text('packages/brand/lovable-handoff/README.md');
 const manifest = text('packages/brand/lovable-handoff/MANIFEST.sha256').trim().split('\n').map(l => l.split(/\s{2}/));
 const featureMap = text('docs/FEATURE-MAP.md');
 const accessibility = text('docs/ACCESSIBILITY.md');
 const claude = text('CLAUDE.md');
 const rigSource = text('apps/web/src/lib/gilbertone.ts');
 const avatarSource = text('apps/web/src/features/GilbertAvatar.tsx');
 const rigCss = text('apps/web/src/features/gilbert-avatar.css');
 const uiCss = text('apps/web/src/ui/ui.css');
 const coreCss = text('apps/web/src/surface/core.css');
 const landing = text('apps/web/src/features/Landing.tsx');
 const webPackage = json('apps/web/package.json');

 const semantic = tokens.semantic;
 const roles = semantic.names;
 const hexOf = name => { const m = /^(light|dark)\.(\w+)$/.exec(name); return m ? semantic[m[1]][m[2]].hex : tokens.color[name]; };
 const identity = assistant.identity;

 /* ---- Section helpers ---------------------------------------------------------------------------- */
 const chapters = [];
 let current = null;
 const chapter = (id, title, rule) => { current = { id, title, rule, lines: [] }; chapters.push(current); current.lines.push(`## ${title}`, '', `**The rule.** ${rule}`, ''); };
 const line = (...ls) => { current.lines.push(...(ls.length ? ls : [''])); };
 const para = t => line(squash(t), '');
 const h3 = t => line(`### ${t}`, '');
 const table = (head, rows) => { line(`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`); for (const r of rows) line(`| ${r.map(cell).join(' | ')} |`); line(); };
 const list = items => { for (const it of items) line(`- ${squash(it)}`); line(); };
 const quote = (t, who) => { line(`> ${squash(t)}`); if (who) line(`> — ${who}`); line(); };

 /* ---- Files measured once ------------------------------------------------------------------------ */
 const walk = dir => (existsSync(at(dir)) ? readdirSync(at(dir), { withFileTypes: true }).filter(e => e.isFile() && !e.name.startsWith('.')).map(e => join(dir, e.name)).sort() : []);
 const measure = file => { const buf = bytes(file); const dims = imageSize(file, buf); return { file, bytes: buf.length, dims }; };
 const dimsText = d => (d ? `${d[0]}×${d[1]}` : '—');

 const logoMaster = measure('packages/brand/lovable-handoff/handoff/src/assets/logos/mythuso-logo.png');
 const gilbertMaster = measure('packages/brand/lovable-handoff/handoff/src/assets/logos/gilbert-one-logo.png');
 const gilbertDerivatives = walk('apps/web/public/lovable/gilbertone').map(measure);
 const landingGilbert = walk('apps/web/public/lovable').filter(f => /gilbertone-logo/.test(f)).map(measure);
 const brandFiles = walk('apps/web/public/brand').map(measure);
 const wordmarkCuts = brandFiles.filter(f => /\.svg$/.test(f.file));
 const fontFiles = walk('apps/web/public/fonts');
 const ofl = Object.fromEntries(fontFiles.filter(f => /OFL-/.test(f)).map(f => { const t = text(f); return [f.match(/OFL-(\w+)\.txt/)[1], { copyright: t.split('\n')[0].trim(), licence: /SIL Open Font License, Version 1\.1/.test(t) ? 'SIL Open Font License, Version 1.1' : 'unsourced' }]; }));

 /* ---- Sentences read from the sources ---------------------------------------------------------- */
 const notice = squash((/<strong>MyThuso is in development\.<\/strong>([\s\S]*?)<\/p>/.exec(landing) ?? ['', ''])[1]);
 const honestyLine = `MyThuso is in development. ${notice}`;
 const previewBadge = locales.strings?.['en-ZA']?.['shell.previewBadge'] ?? (/"shell\.previewBadge":\s*"([^"]+)"/.exec(JSON.stringify(locales)) ?? [])[1] ?? 'unsourced';
 const mythusoSentences = sentences(squash(claude.split('\n\n')[1] ?? ''), 3);
 const gilbertSentences = `${identity.whatItIs} ${sentence(identity.whatItIsNot)}`;
 const deviceCapability = capabilities.capabilities.find(c => c.id === 'devices');
 const pauseLabel = (/'(Pause motion)'/.exec(text('apps/web/src/components/MotionPause.tsx')) ?? [])[1] ?? 'unsourced';
 const lucideVersion = webPackage.dependencies?.['lucide-react'] ?? 'unsourced';
 const logoComment = squash((/\/\*([^*]*Two WebP derivatives of packages\/brand[\s\S]*?)\*\//.exec(avatarSource) ?? ['', ''])[1]);
 const logoWidths = [...avatarSource.matchAll(/<GilbertOneLogo[^>]*width=\{(\d+)\}/g), ...text('apps/web/src/features/Assistant.tsx').matchAll(/<GilbertOneLogo[\s\S]*?width=\{(\d+)\}/g), ...text('apps/web/src/features/PublicAssistant.tsx').matchAll(/<GilbertOneLogo[^>]*width=\{(\d+)\}/g), ...text('apps/web/src/features/GilbertOneServices.tsx').matchAll(/<GilbertOneLogo[^>]*width=\{(\d+)\}/g)].map(m => Number(m[1]));
 const landingLogoSize = (/gilbertone-logo-360\.webp[\s\S]*?sizes="(\d+)px"/.exec(landing) ?? [])[1];
 const wordmarkRule = squash((/\/\*([\s\S]*?)\*\//.exec(text('apps/web/src/components/Wordmark.tsx')) ?? ['', ''])[1]);
 const shellLogoNote = squash((/The logo is public\/brand\/mythuso-logo\.svg:([\s\S]*?)\. The studio palette/.exec(text('apps/web/src/shells/shells.css')) ?? ['', ''])[1]);
 const uiFocusNote = squash((/\/\* ---- Focus: one outline for every component -+\n([\s\S]*?)\*\//.exec(uiCss) ?? ['', ''])[1]);
 const coreFocusNote = squash((/\/\* (Two rings, not one\.[\s\S]*?)\*\//.exec(coreCss) ?? ['', ''])[1]);
 const screenReaderLine = (/\*\*Screen-reader testing is still not done anywhere\*\*[^.]*\./.exec(featureMap) ?? ['unsourced'])[0].replace(/\*\*/g, '');
 const webTested = (() => { const block = accessibility.slice(accessibility.indexOf('### Web — tested')); return block.split('\n').filter(l => /^- /.test(l)).slice(0, 4).map(l => squash(l.slice(2))); })();
 const nextIncrementsLead = squash((/## Next UI increments\n\n([\s\S]*?)\n\n/.exec(featureMap) ?? ['', ''])[1]);
 const webOnlyWaves = [...featureMap.matchAll(/^## Delivered — (.*?)\s*\((design handoff, Wave [^;)]+); web only\)$/gm)].map(m => ({ what: m[1].replace(/,\s*28 September 2026$/, ''), wave: m[2] }));

 /* The rig's manifest, read from its source so the cue table cannot drift from the code. */
 const cues = [...rigSource.matchAll(/\{\s*id: "(A\w+)",\s*name: "([^"]+)",\s*track: "(\w+)",\s*trigger:\s*(?:\/\*[\s\S]*?\*\/\s*)?"((?:[^"\\]|\\.)*)",\s*(?:\/\*[\s\S]*?\*\/\s*)?motion:\s*(?:\/\*[\s\S]*?\*\/\s*)?"((?:[^"\\]|\\.)*)"[\s\S]*?says: "((?:[^"\\]|\\.)*)"(?:,\s*holds: true)?/g)].map(m => ({ id: m[1], name: m[2], track: m[3], trigger: m[4], motion: m[5], says: m[6], holds: /says: "(?:[^"\\]|\\.)*",\s*holds: true/.test(m[0]) }));
 const trackWords = Object.fromEntries([...rigSource.matchAll(/^\s+(\w+): "([^"]+)",?$/gm)].filter(m => ['safety', 'error', 'interrupt', 'activity', 'gesture', 'idle'].includes(m[1])).map(m => [m[1], m[2]]));
 const voiceStates = [...rigSource.matchAll(/\{\s*id: "(\w+)",\s*name: "([^"]+)",\s*onThePhone:/g)].map(m => ({ id: m[1], name: m[2] }));
 const rigParts = [...rigCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].flatMap(([, sel, body]) => { const fill = /fill:\s*var\((--[\w-]+)\)/.exec(body); return fill ? sel.split(',').map(s => s.trim()).filter(s => /^\.go-[\w-]+$/.test(s)).map(s => [s.slice(1), fill[1]]) : []; });

 /* The shared components, read from their sources: unions for variants and sizes, the header for why. */
 const uiFiles = walk('apps/web/src/ui').filter(f => /\.tsx$/.test(f));
 const components = uiFiles.map(f => {
  const src = text(f);
  const name = f.split('/').pop().replace(/\.tsx$/, '');
  const header = squash((/^\/\*([\s\S]*?)\*\//m.exec(src) ?? ['', ''])[1]);
  const unions = [...src.matchAll(/export type (\w+) = ((?:'[\w-]+'\s*\|?\s*)+);/g)].map(m => [m[1], [...m[2].matchAll(/'([\w-]+)'/g)].map(x => x[1])]);
  const inlineProps = [...src.matchAll(/\b(size|orientation|variant)\?: ((?:'[\w-]+'\s*\|?\s*)+)/g)].map(m => [m[1], [...m[2].matchAll(/'([\w-]+)'/g)].map(x => x[1])]);
  const iconKeys = /const icons = \{([^}]*)\}/.exec(src);
  const alertVariants = iconKeys ? [...iconKeys[1].matchAll(/(\w+):/g)].map(m => m[1]) : null;
  const exportsList = [...src.matchAll(/export (?:const|function) (\w+)/g)].map(m => m[1]).filter(n => !/^(buttonVariants|badgeVariants)$/.test(n));
  return { name, header, unions, inlineProps, alertVariants, exportsList, handoff: catalogue.components.find(c => c.name === name) };
 });
 const catalogueOnly = catalogue.components.filter(c => !components.some(k => k.name === c.name));

 /* Contrast, computed for every semantic foreground against every semantic surface, in both schemes. */
 const surfaces = ['background', 'surface', 'surfaceRaised', 'muted'];
 const foregrounds = roles.filter(r => !surfaces.includes(r) && !/Foreground$/.test(r));
 const declared = new Map(tokens.contrast.pairs.map(p => [`${p.foreground}/${p.background}`, p]));
 const parked = new Map(tokens.contrast.knownFailures.map(p => [`${p.foreground}/${p.background}`, p]));
 const contrastRows = [];
 for (const scheme of ['light', 'dark']) for (const fg of foregrounds) for (const bg of surfaces) {
  const key = `${scheme}.${fg}/${scheme}.${bg}`;
  const r = ratio(hexOf(`${scheme}.${fg}`), hexOf(`${scheme}.${bg}`));
  const pair = declared.get(key); const fail = parked.get(key);
  const standing = pair ? `declared at ${pair.minimum}:1 — ${r >= pair.minimum ? 'clears' : 'FAILS'}` : fail ? `parked at ${fail.minimum}:1 — replace with ${fail.proposedFix} (${ratio(fail.proposedFix, hexOf(`${scheme}.${bg}`))}:1)` : 'not a pair the design uses; undeclared, so unmeasured by the build';
  contrastRows.push({ scheme, fg, bg, ratio: r, standing, use: pair?.use ?? fail?.note ?? '' });
 }
 const fillPairs = tokens.contrast.pairs.filter(p => /^(light|dark)\./.test(p.foreground) && !surfaces.includes(p.background.split('.')[1]));

 /* ==== The chapters ============================================================================= */

 chapter('who-we-are', '1. Who we are', 'Every surface says what MyThuso is, what GilbertOne is, and that neither is a live service yet — in the same words, because a product that describes itself three different ways has not decided what it is.');
 h3('MyThuso');
 para(mythusoSentences);
 h3('GilbertOne');
 para(gilbertSentences);
 para(`${tick(identity.name)} is the product's name; ${tick(identity.descriptor)} is its descriptor, and the descriptor is never read without its disclosure: ${tick(identity.descriptorLine)}. ${identity.poweredBy}: ${identity.poweredByMeans}`);
 h3('The honesty line every surface carries');
 para(`The public page's notice bar, word for word from ${tick('apps/web/src/features/Landing.tsx')}: **${honestyLine}**`);
 para(`Inside the product the shell's badge reads ${tick(previewBadge)} (${tick('packages/catalog/locales.json')}, ${tick('shell.previewBadge')}), and every screen that depends on something not yet connected renders that capability's own notice from ${tick('packages/catalog/capabilities.json')} — for the connected kit: ${tick(deviceCapability.notice)}`);
 list(capabilities.rules.slice(0, 3).map(r => `**${r.id}.** ${r.statement}`));
 para(`From CLAUDE.md, the rule under all of these: "Nothing here is a real service. No visit is booked, no payment taken, no clinical decision issued, no device contacted. Every screen that could be mistaken for the real thing says so."`);

 /* ---- 2. Logos ---------------------------------------------------------------------------------- */
 chapter('logos', '2. Logos', 'The two official logos are the handoff\'s masters and are used whole: resized, never redrawn, recoloured, cropped, rotated, regenerated or separated into their parts.');
 h3('The MyThuso wordmark');
 para(`The official master is ${tick('packages/brand/lovable-handoff/handoff/src/assets/logos/mythuso-logo.png')}, ${dimsText(logoMaster.dims)} pixels, ${kB(logoMaster.bytes)}, held byte for byte under ${tick('MANIFEST.sha256')}. The product draws it from the vector cuts under ${tick('apps/web/public/brand')}, which share the master's ${dimsText(logoMaster.dims)} frame; its colours are the brand tokens — ${shellLogoNote}.`);
 table(['File', 'Frame (viewBox)', 'Size', 'Use'], wordmarkCuts.map(f => [tick(f.file), dimsText(f.dims), kB(f.bytes), ({ 'mythuso-logo.svg': 'The lockup on a light surface — the public page\'s bar and footer, every shell\'s sidebar, the founder\'s door', 'mythuso-logo-reversed.svg': 'The lockup on a dark surface: "thuso" in brandMint, the logo\'s own answer to a dark ground, served under prefers-color-scheme: dark by components/Wordmark.tsx', 'mythuso-logo-mono.svg': 'One-colour print and embossing', 'mythuso-mark.svg': 'The house mark alone — the patient shell\'s brand control and the sign-in door, where the lockup would be too small to read', 'mythuso-mark-reversed.svg': 'The house mark on a dark surface', 'mythuso-wordmark.svg': 'The lockup with the tagline', 'mythuso-wordmark-reversed.svg': 'The tagline lockup on a dark surface', 'mythuso-wordmark-reversed-plate.svg': 'The tagline lockup on its own plate', 'mythuso-wordmark-mono.svg': 'The tagline lockup in one colour' })[f.file.split('/').pop()] ?? '—']));
 para(`**Reversed use.** ${wordmarkRule}`);
 para(`**Minimum size.** Unsourced: no contract states a minimum width for the wordmark. What is measured is the reason the mark exists as a separate file — ${tick('apps/web/src/features/Onboarding.tsx')} records that the full lockup with its tagline at 158 px wide drew the tagline about four pixels tall, "not a small logo, an illegible one", and the mark is used there instead. Below the width at which the tagline reads, use the mark.`);
 para(`**Clear space.** Unsourced for the wordmark: the SVG cuts carry no clear-space rule. For the GilbertOne logo the master's own transparent margin is the clear space and is part of the file (below).`);
 h3('The official GilbertOne logo');
 para(`The master is ${tick('packages/brand/lovable-handoff/handoff/src/assets/logos/gilbert-one-logo.png')}, ${dimsText(gilbertMaster.dims)} pixels, ${kB(gilbertMaster.bytes)}: the complete seated character above the GilbertOne name. It is never served. What a screen loads is a WebP derivative resized whole, at the master's own ${gilbertMaster.dims[0]}:${gilbertMaster.dims[1]}, each under 150 kB — the build measures the ratio from the file's header and refuses a crop.`);
 table(['File', 'Pixels', 'Size', 'Where'], [...gilbertDerivatives.map(f => [tick(f.file), dimsText(f.dims), kB(f.bytes), `${tick('GilbertOneLogo')} in the product: the consent card, the welcome, the signed-out sheet, the services region — drawn at ${[...new Set(logoWidths)].sort((a, b) => a - b).join(', ')} px wide`]), ...landingGilbert.map(f => [tick(f.file), dimsText(f.dims), kB(f.bytes), `The public page, beside the questions, at ${landingLogoSize ?? 'unsourced'} px`])]);
 para(`From ${tick('apps/web/src/features/GilbertAvatar.tsx')}: ${logoComment}`);
 h3('What is never done to either');
 quote(guidelines.split('\n').find(l => /official GilbertOne logo/.test(l)), 'the handoff\'s design-guidelines.md');
 quote(brandReadme.split('\n\n')[1].replace(/\n/g, ' ').replace(/\*\*/g, ''), 'packages/brand/lovable-handoff/README.md');
 h3('The descriptor rule, word for word');
 quote(identity.descriptorRule, `packages/catalog/assistant.json#identity.descriptorRule`);
 para(`Decided by the ${identity.descriptorDecision.decidedBy} on ${identity.descriptorDecision.on}: ${identity.descriptorDecision.why} On the web the build fails if a file draws the GilbertOne logo without ${tick('identity.descriptorLine')} beside it.`);

 /* ---- 3. Colour --------------------------------------------------------------------------------- */
 chapter('colour', '3. Colour', 'A colour is a token with a role, measured against every surface it sits on before it carries a word; nothing on any platform types a hex.');
 h3('The brand values');
 para(`The four literals the handoff delivered, decided by the Founder on 28 September 2026, plus the two the product already carried. They are ${tick('--brand-<name>')} on the web and ${tick('ThusoTheme.<name>')} on the phones.`);
 table(['Token', 'Hex', 'What it is'], [['brandInk', tokens.color.brandInk, 'The ink: "my" in the wordmark, the visor of the GilbertOne rig, the primary role in the light scheme'], ['brandGreen', tokens.color.brandGreen, 'The green: "thuso", the accent, success, info and the focus ring in the light scheme'], ['brandOrange', tokens.color.brandOrange, 'The roof of the house mark; danger and coral as fills — never words on a light ground'], ['brandLime', tokens.color.brandLime, 'The dot on the mark and the signal point on every MyThuso icon; warning and highlight as fills — never words on a light ground'], ['brandMint', tokens.color.brandMint, '"thuso" in the reversed lockup; not in the handoff, kept because the clinical deck reads it'], ['brandCyan', tokens.color.brandCyan, `The GilbertOne character's eyes and smile, sampled from the logo master; it fills a shape on the visor and nothing else, and never carries text`]]);
 h3('The nineteen semantic roles, light and dark');
 para(`Generation four, ${tick('packages/design-tokens/tokens.json#semantic')}: each role has a light and a dark value, stored as the sRGB hex the handoff's oklch converts to exactly, with the oklch beside it where the handoff wrote one. On the web they are ${tick('--color-<role>')}; natively ${tick('ThusoSemantic.Light.<role>')} and ${tick('ThusoSemantic.Dark.<role>')}.`);
 table(['Role', 'Light hex', 'Light oklch', 'Dark hex', 'Dark oklch', 'Role in the design'], roles.map(r => [tick(`--color-${kebab(r)}`), semantic.light[r].hex, semantic.light[r].oklch ?? 'a hex literal in the handoff', semantic.dark[r].hex, semantic.dark[r].oklch ?? 'a hex literal in the handoff', ({ background: 'The page ground', foreground: 'Headings, figures and body text', surface: 'A card', surfaceRaised: 'A raised panel', primary: 'The primary action', primaryForeground: 'The label on a primary action', accent: 'Actions, selected states and positive progress', accentForeground: 'The label on an accent fill', muted: 'A muted panel', mutedForeground: 'Secondary text, captions and helper text', success: 'A success mark', warning: 'A warning fill', danger: 'A danger fill', info: 'An information mark', highlight: 'A highlight fill', coral: 'A coral fill', border: 'A hairline', input: 'The resting boundary of a field', ring: 'The focus ring' })[r]]));
 para(`Dark values: ${semantic._darkNote}`);
 h3('Every foreground on every surface, measured');
 para(`${tokens.contrast.standard}`);
 para(`The table below is computed here with the same formula ${tick('scripts/check-boundaries.mjs')} uses, for every semantic foreground against the four semantic surfaces in both schemes. "Declared" means the pair is in ${tick('tokens.json#contrast.pairs')} and the build holds it on every run; "parked" means it is in ${tick('knownFailures')} with a measured replacement; a pair marked undeclared is one the design does not put together, and no screen may until a row is added.`);
 for (const scheme of ['light', 'dark']) {
  line(`#### ${scheme === 'light' ? 'Light scheme' : 'Dark scheme'}`, '');
  table(['Foreground', ...surfaces.map(s => `on ${s}`)], foregrounds.map(fg => [tick(`${scheme}.${fg}`), ...surfaces.map(bg => { const row = contrastRows.find(r => r.scheme === scheme && r.fg === fg && r.bg === bg); return `${row.ratio}:1 — ${row.standing}`; })]));
 }
 para('The fills that carry words, declared and measured:');
 table(['Words', 'On the fill', 'Floor', 'Measured', 'Use'], fillPairs.map(p => [tick(p.foreground), tick(p.background), `${p.minimum}:1`, `${ratio(hexOf(p.foreground), hexOf(p.background))}:1`, p.use]));
 h3('The known failures and their proposed fixes');
 para(`${tokens.contrast.lovableNote}`);
 table(['Foreground', 'Background', 'Floor', 'Measured', 'Proposed fix', 'Fix measures'], tokens.contrast.knownFailures.map(f => [tick(f.foreground), tick(f.background), `${f.minimum}:1`, `${ratio(hexOf(f.foreground), hexOf(f.background))}:1`, f.proposedFix, `${ratio(f.proposedFix, hexOf(f.background))}:1`]));
 h3('Superseded generations — do not reach for these');
 para(`${tokens.colorGenerations.generationFourNote}`);
 table(['Superseded token', 'Use instead'], Object.entries(tokens.colorGenerations.supersededBy).map(([old, now]) => [tick(old), tick(now)]));
 para(`Still current beside the semantic roles, because a screen not yet restyled reads them and because some carry a meaning the handoff's fills cannot carry as text: ${tokens.colorGenerations.current.map(tick).join(', ')}.`);
 h3('Colours that are never measured, and why');
 table(['Token', 'Why'], tokens.contrast.notMeasured.map(n => [tick(n.token), n.why]));

 /* ---- 4. Type ----------------------------------------------------------------------------------- */
 chapter('type', '4. Type', 'Outfit sets what a page is called and Figtree sets everything a person has to read carefully; both are self-hosted, licensed under the SIL Open Font License, and every size is a step of the scale.');
 table(['Face', 'Role', 'Weights self-hosted', 'Files', 'Licence'], [['Outfit', 'Display: page titles and compact feature headings (`--font-display`)', (/weights ([\d–]+)/.exec(tokens.typography.families.display) ?? ['', 'unsourced'])[1], fontFiles.filter(f => /outfit.*woff2/.test(f)).map(f => `${tick(f)} (${kB(size(f))})`).join(', '), `${ofl.Outfit?.licence ?? 'unsourced'} — ${ofl.Outfit?.copyright ?? ''}`], ['Figtree', 'Text: everything else (`--font-text`)', (/weights ([\d–]+)/.exec(tokens.typography.families.text) ?? ['', 'unsourced'])[1], fontFiles.filter(f => /figtree.*woff2/.test(f)).map(f => `${tick(f)} (${kB(size(f))})`).join(', '), `${ofl.Figtree?.licence ?? 'unsourced'} — ${ofl.Figtree?.copyright ?? ''}`]]);
 para(`Stacks: ${tick(tokens.typography.stacks.display)} and ${tick(tokens.typography.stacks.text)}. On iOS and Android this wave: system-ui (${tick('tokens.json#typography.families')}). Nothing on the web reaches a font CDN; the build fails if it does.`);
 h3('The scale, by role');
 table(['Step', 'Pixels', 'Where it is read'], Object.entries(tokens.typography.scale).map(([k, v]) => [tick(k), `${v}`, ({ screenTitle: 'The title of a screen', sectionTitle: 'A section heading', heading: 'A card that leads a screen', cardTitle: 'A card title', body: 'Body text', caption: 'Captions, helper text, metadata — the smallest size rendered', metric: 'A figure in a row of figures', metricLarge: 'The one figure a screen leads with (the web takes it above 900 px)' })[k]]));
 para(`Minimum body size ${tokens.typography.minimumBody} px; nothing renders below ${tokens.typography.minimumRendered} px, and ${tick('tests/accessibility.spec.ts')} measures rendered text against that floor. ${tokens.typography.minimumRenderedNote}`);
 para(`${tokens.typography.families.note} ${tokens.typography.scaleNote}`);
 para(`${tokens.typography.metricNote}`);
 quote(guidelines.split('\n').find(l => /^Use `font-display`/.test(l)), 'the handoff\'s design-guidelines.md, "Typography and voice"');

 /* ---- 5. Icons ---------------------------------------------------------------------------------- */
 chapter('icons', '5. Icons', icons.rules.map(r => r.sentence).join(' '));
 para(`${icons.family.meaning} Every icon is a ${icons.family.viewBox} canvas at ${icons.family.size} px, stroked round (${tick('strokeLinecap')} and ${tick('strokeLinejoin')} ${icons.family.strokeLinecap}), and the geometry lives in ${tick('packages/catalog/icons.json')} alone: ${tick('scripts/emit-icons.mjs')} writes it into React, Android vector drawables and SwiftUI paths, and the build fails if a path appears anywhere else.`);
 table(['Icon', 'Web component', 'Meaning', 'Never beside (Lucide)'], icons.icons.map(i => [i.name, tick(i.component), i.meaning, i.neverBeside.join(', ')]));
 h3('The colour roles');
 table(['Role', 'Web', 'Native token', 'Paints'], Object.entries(icons.roles).filter(([k]) => !k.startsWith('_')).map(([k, r]) => [tick(k), tick(r.css), r.nativeToken ? tick(r.nativeToken) : '—', r.paints ?? 'the stroke of wherever the icon sits']));
 h3('The signal dot');
 para(`${icons.signal._why} A circle at (${icons.signal.cx}, ${icons.signal.cy}) with radius ${icons.signal.r}, filled ${icons.signal.fill} and stroked ${icons.signal.stroke} at ${icons.signal.strokeWidth}. When it pulses it scales from ${icons.signal.pulse.from} to ${icons.signal.pulse.to} over ${icons.signal.pulse.durationMs} ms — ${icons.signal.pulse.durationFromToken.token} × ${icons.signal.pulse.durationFromToken.times} on the web — on the ${icons.signal.pulse.curve} curve, behind ${tick(icons.signal.pulse.gate)}, and is ${icons.signal.pulse.reducedMotion} under reduced motion.`);
 h3('Lucide for utilities');
 para(`Universal utility actions — search, close, download, arrows, overflow — are Lucide (${tick('lucide-react')} ${lucideVersion} on the web, ISC licence per the package's own LICENSE), at the system stroke weight. A concept never has both: each MyThuso icon lists the Lucide names that would say the same thing, and the build fails a file that imports one of them beside the family icon. A gear inside a screen that is merely a utility control stays Lucide; the patient's settings destination is the family's.`);

 /* ---- 6. Components ----------------------------------------------------------------------------- */
 chapter('components', '6. Components', 'Compose a screen from the shared components by their named variants and sizes; where the build departs from the handoff, the component\'s own file says which rule of this build required it.');
 para(`The library is ${tick('apps/web/src/ui')}: the handoff's component library rebuilt on plain CSS classes that read only the token variables, with the handoff's names, props, variants and sizes. ${catalogue.components.length} components are in the handoff's catalogue; ${components.length} files are in the barrel, and ${catalogueOnly.map(c => c.name).join(' and ')} are not rebuilt as components because the first is the rig and the logo of chapter 10 and the second is the icon family of chapter 5.`);
 for (const c of components) {
  h3(c.name);
  const props = [...c.unions.map(([t, vs]) => [t.replace(c.name, '').toLowerCase() || t, vs]), ...c.inlineProps].filter(([, vs]) => vs.length);
  if (c.alertVariants) props.unshift(['variant', c.alertVariants]);
  const seen = new Set();
  const propLines = props.filter(([p]) => !seen.has(p) && seen.add(p)).map(([p, vs]) => `**${p}:** ${vs.map(tick).join(', ')}`);
  if (propLines.length) list(propLines);
  if (c.exportsList.length > 1) para(`Exports: ${c.exportsList.map(tick).join(', ')}.`);
  if (c.handoff) { para(`**The handoff says:** ${c.handoff.usage} Example: ${tick(c.handoff.examples[0].code)}. **Do not:** ${c.handoff.antipatterns.join(' ')}`); }
  if (c.header) para(`**This build:** ${c.header}`);
 }
 h3('The states every screen shows');
 para(`The handoff asks that every changed screen be verified for "keyboard focus, overflow, contrast, loading, empty, warning, and error states" (its README, item 8). This build adds the notice state: a screen that depends on a capability that is not connected renders that capability's sentence from ${tick('packages/catalog/capabilities.json')}, once, and never a sentence of its own. A wait is a Spinner that turns once and rests; an empty section says what is empty in words; a refusal is the danger Alert with the contract's sentence.`);

 /* ---- 7. Layout and motion ---------------------------------------------------------------------- */
 chapter('layout-and-motion', '7. Layout and motion', 'An 8-point rhythm with compact density, three radii, two shadows, three durations on one curve — and nothing moves for ever.');
 quote(guidelines.split('\n').find(l => /^Use an 8-point rhythm/.test(l)), 'the handoff\'s design-guidelines.md, "Layout and composition"');
 table(['Token', 'Value', 'Web', 'Native'], [['spacing', tokens.spacing.join(', '), tokens.spacing.map(v => tick(`--space-${v}`)).join(' '), 'ThusoSpacing'], ...Object.entries(tokens.radius).map(([k, v]) => [`radius.${k}`, `${v} px`, tick(`--r-${kebab(k)}`), `ThusoRadius.${k}`]), ...Object.entries(tokens.elevation).map(([k, v]) => [`elevation.${k}`, v, tick(k === 'card' ? '--shadow' : '--shadow-raised'), `ThusoElevation.${k}`]), ['motion.quickMs', `${tokens.motion.quickMs} ms`, tick('--t-quick'), 'ThusoMotion.quick'], ['motion.settleMs', `${tokens.motion.settleMs} ms`, tick('--t-settle'), 'ThusoMotion.settle'], ['motion.enterMs', `${tokens.motion.enterMs} ms`, tick('--t-enter'), 'ThusoMotion.enter'], ['motion.easeSoft', `cubic-bezier(${tokens.motion.easeSoft.join(', ')})`, tick('--ease-soft'), 'ThusoMotion.easeSoft'], ['motion.durationMs', `${tokens.motion.durationMs} ms`, tick('--motion-duration'), 'the older single duration the native theme layers spend']]);
 para(`Radii: ${tokens.radius_note}`);
 para(`Elevation: ${tokens.elevation_note}`);
 para(`Motion: ${tokens.motion._note}`);
 h3('Endless motion, the pause control and reduced motion');
 para(`Nothing on a screen runs for ever except what is explicitly ambient and gated: the signal dot on a live icon, the public page's two loops (its particles and the badge's pulse). Every such animation sits behind ${tick('[data-decor="on"]')} on the document element, so one control — the button labelled ${tick(pauseLabel)} in ${tick('apps/web/src/components/MotionPause.tsx')} — stops all of it, which is what WCAG 2.2.2 asks for. A spinner that spins for as long as a wait lasts is refused outright: the loading arc turns once as it arrives and rests.`);
 para(`${tokens.motion._reducedMotionNote}`);
 para(`Glass: ${tokens.glass.neverOnText} ${tokens.glass.fallbackNote}`);

 /* ---- 8. Imagery -------------------------------------------------------------------------------- */
 chapter('imagery', '8. Imagery', 'A photograph is illustrative and says so where it stands; no person shown is presented as a patient or as a MyThuso nurse, no quotation is presented as a testimonial, and nothing on the public page weighs more than the page can afford.');
 para(`**Direction.** The handoff's photographs are natural, warm and domestic: people at home, a clinician at work, the instruments a nurse carries, photographed as objects on a plain ground. The handoff's guidelines forbid "gradients, decorative orbs, glass effects, oversized empty marketing layouts, or purple-dominant palettes", and the build keeps to that: a picture is a real element with a real caption, never a headline baked into pixels.`);
 para(`**The caption beside every person.** ${tick(hero.standing.photographNote)} — ${hero.standing.photographNoteWhy}`);
 para(`**No testimonial.** No quotation on any surface is presented as a patient's, a nurse's or a doctor's endorsement. The founder's brief for this document, 28 September 2026; the contracts do not yet carry the sentence, so it is recorded here first.`);
 para(`**The photographs, honestly cropped.** ${hero._aboutThePhotographs}`);
 para(`**The map.** ${hero.stage.impact.mapNote} ${hero.stage.impact.why}`);
 para(`**The kit.** ${hero.stage.kit.devicesWhy}`);
 h3('Formats and the ceilings');
 list([
  `A picture under ${tick('apps/web/public/lovable')} is a WebP of 150 kB or less at two widths, and the page's ${tick('<picture>')} sends a phone the smaller one (${tick('scripts/check-boundaries.mjs')}, Wave 3a).`,
  `A logo derivative is at most 150 kB and at the master's own ratio (Wave 3b).`,
  `A hero figure is a WebP of 240 kB or less at its native width and 640 wide for a phone, with a PNG or JPEG fallback; the ceiling is the heaviest figure the page is built to ask for, and a figure that needs more has been cut too large (${tick('apps/web/public/banners/README.md')}).`,
  `A handoff master is never served: the PNGs weigh up to ${kB(Math.max(...manifest.filter(([, p]) => /\.png$/.test(p)).map(([, p]) => size(`packages/brand/lovable-handoff/handoff/${p}`))))}, and the build refuses a copy of any of them under ${tick('apps/web/public')}.`,
  `The editorial PNGs under ${tick('apps/web/public/editorial')} may not be named by the public page at all.`
 ]);
 para(`Every file, with its size and rights, is in ${tick('docs/brand/PACK.md')}.`);

 /* ---- 9. Voice and words ------------------------------------------------------------------------ */
 chapter('voice-and-words', '9. Voice and words', 'British spelling, real sentences, no hype; a refusal says what is refused and why, in the contract\'s own words, and GilbertOne never says what it is not allowed to say.');
 para(`From CLAUDE.md: "British spelling. Real sentences in user copy: 'Your bank sent it back. It is still owed to you', not 'Payment failed'." And: "Say what is refused, and why. … Write those sentences into the contract JSON so all three platforms render them word for word."`);
 quote(guidelines.split('\n').find(l => /^Use `font-display`/.test(l)).replace(/^Use `font-display`[^.]*\. /, ''), 'the handoff\'s design-guidelines.md');
 h3('Wording a patient may never read');
 para(`${clinical.wording.patientDiagnosis.rule} ${clinical.wording.patientDiagnosis.why} The build refuses these phrases in any patient-facing sentence: ${clinical.wording.patientDiagnosis.phrases.map(p => `"${p}"`).join(', ')}.`);
 h3('What GilbertOne never says');
 table(['Refusal', 'Statement'], assistant.refusals.map(r => [tick(r.id), r.statement]));
 h3('GilbertOne\'s registers');
 para(`${voice.zones.map(z => `**${z.label}** (${z.configurable}): ${z.sentence}`).join(' ')}`);
 para(`The clinical-delivery register, version ${voice.clinicalDeliveryRegister.version}: ${tick(voice.clinicalDeliveryRegister.sentence)} Reviewed by: ${voice.clinicalDeliveryRegister.reviewedBy ?? 'nobody yet'} — ${voice.clinicalDeliveryRegister._reviewedByWhy}`);
 table(['Kind of answer', 'Register'], Object.entries(assistant.spokenRegister.answers).map(([k, v]) => [tick(k), v]));
 para(`Affect never softens a refusal: ${assistant.affect.neverSoften}`);
 h3('The languages');
 para(`${locales.locales.length} locales carry the interface (${locales.locales.map(l => l.id ?? l.code ?? l).join(', ')}); clinical wording stays in English on every one of them, and ${tick('docs/ACCESSIBILITY.md')} says which languages nobody has yet read.`);

 /* ---- 10. GilbertOne's two forms ---------------------------------------------------------------- */
 chapter('gilbertones-two-forms', "10. GilbertOne's two forms", 'The official logo is the brand form and the in-product rig is the assistant form; both are reserved for AI guidance, conversation and support, and neither is decoration.');
 quote(guidelines.split('\n').find(l => /official GilbertOne logo/.test(l)), 'the handoff\'s design-guidelines.md');
 para(`**The catalogue's entry:** ${catalogue.components.find(c => c.name === 'GilbertOne').usage} **Do not:** ${catalogue.components.find(c => c.name === 'GilbertOne').antipatterns.join(' ')}`);
 h3('When each appears');
 list([
  `**The logo** wherever GilbertOne is named as a product: the consent card, the welcome, the signed-out sheet's heading, the head of the services region, the public page beside the questions — always with ${tick(identity.descriptorLine)} beside it, always on a light ground, never reversed.`,
  `**The rig** wherever GilbertOne is doing something: the launcher, the panel's head, the demonstrator. It carries no lettering — the name belongs to the logo beside it — and it is the official character by token: ${rigParts.map(([part, token]) => `${tick(part)} ${tick(token)}`).join(', ')}.`,
  `The handoff's animated PNG component (drifting eyes) is adopted nowhere: the rig is the in-product form.`
 ]);
 h3('The rig\'s six states');
 table(['State', 'Visual', 'Meaning', 'Cue word', 'Platforms'], assistant.states.map(s => [s.name, s.visual, s.meaning, s.cue, s.platforms.join(', ')]));
 para(`${assistant.statesWhy}`);
 h3('The rig\'s poses and cues');
 para(`The motion manifest in ${tick('apps/web/src/lib/gilbertone.ts')}: ${cues.length} cues on six tracks, resolved in this order — ${['safety', 'error', 'interrupt', 'activity', 'gesture', 'idle'].map(t => trackWords[t]).join(' → ')} — so a gesture never covers an urgent face and idle never covers anything. Transitions blend over ${(/BLEND_MS = (\d+)/.exec(rigSource) ?? [])[1]} ms; safety and stop do not wait.`);
 table(['Cue', 'Name', 'Track', 'Trigger', 'Motion', 'Holds'], cues.map(c => [c.id, c.name, c.track, c.trigger, c.motion, c.holds ? 'yes' : '']));
 para(`Which face each kind of answer wears is deterministic from the answer kind alone (${tick('packages/catalog/assistant.json#affect')}, decided by the ${assistant.affect.decidedBy} on ${assistant.affect.on}):`);
 table(['Answer', 'Cue', 'Posture'], Object.entries(assistant.affect.answers).map(([k, v]) => [tick(k), v.cue, v.posture]));
 para(`Not wired on the live panel, each for a reason: ${assistant.affect.notWired.map(n => `${n.cue} (${sentence(n.why)})`).join('; ')}.`);
 h3('The microphone indicator');
 para(`${conversation.indicator.rule} ${conversation.indicator.why} The words beside the ring are ${tick(conversation.sentences.micHot)}; the microphone's face is ${assistant.affect.voiceMoments.capture.cue}, played from the recogniser's own open state and never from the button. The four input states, named in the rig's source: ${voiceStates.map(v => v.name).join(', ')}.`);
 const noAudio = assistant.refusals.find(r => r.id === 'no-audio-kept');
 para(`Retention: ${conversation.retention.rule} The contract's own refusal, ${tick(noAudio.id)}: ${noAudio.statement} ${noAudio.why} (${tick('assistant.json#voice.audioStored')} is ${assistant.voice.audioStored}.) One utterance may run ${conversation.utteranceCapSeconds} seconds before GilbertOne prompts the person to continue, and the web's ${assistant.voice.maxListeningSeconds}-second listening cap stands in front of it — ${tick('assistant.json#voice.listeningDecision')}, decided by the ${assistant.voice.listeningDecision.decidedBy} on ${assistant.voice.listeningDecision.on}: ${assistant.voice.listeningDecision.why}`);
 list(conversation.whatItIsNot);
 h3('The emergency face');
 para(`${assistant.affect.answers.emergency.why}`);
 para(`${cues.find(c => c.id === 'A16')?.motion ?? ''}`);
 para(`In hands-free conversation the microphone closes after an emergency answer: ${conversation.endsOn.find(e => e.id === 'emergency-answer').why}`);

 /* ---- 11. Accessibility ------------------------------------------------------------------------- */
 chapter('accessibility', '11. Accessibility', 'A control is 44 pixels, a word clears 4.5:1, focus is visible on every ground, everything works from the keyboard, every spoken word is also written, and motion is removed — not shortened — for a reader who asked for stillness.');
 para(`**Targets.** ${tokens.targets.why}`);
 table(['Exempted control', 'Measured', 'Why'], tokens.targets.knownUndersized.map(k => [tick(k.selector), `${k.measured} px`, k.note]));
 para(`${tokens.targets.exemptions}`);
 para(`**Contrast.** ${tokens.contrast.why}`);
 para(`**Focus.** On the shared components: ${uiFocusNote} On every screen that has not adopted them: ${coreFocusNote}`);
 para(`**Keyboard.** Every action uses its native element — a Button is a ${tick('<button>')}, a Select a ${tick('<select>')}, a Checkbox an ${tick('<input>')}, a Divider an ${tick('<hr>')} — so Space, Enter, the arrows and the platform's own picker are the browser's. A tab list is one Tab stop with the arrow keys, Home and End moving between tabs. A card that looks pressable is still a ${tick('<div>')}; what a person presses inside it is a Button or a link.`);
 para(`**Captions.** A spoken reply is a second reading of words already on the screen: the caption is the reply itself, written in full before the voice starts and for as long as it speaks, and no setting anywhere turns the written words off (${tick('packages/catalog/assistant.json#voice.webSpeech')}). The rig carries ${tick('aria-hidden')} and no text; what GilbertOne is doing is said in words beside it, because §10 of its scope forbids saying anything by motion or colour alone.`);
 para(`**Motion.** ${tokens.motion._reducedMotionNote}`);
 para(`**What is measured on the web**, by ${tick('tests/accessibility.spec.ts')} on both viewports: ${webTested.join(' ')}`);
 para(`**What is not yet done.** ${screenReaderLine}`);

 /* ---- 12. Platforms ----------------------------------------------------------------------------- */
 chapter('platforms', '12. Platforms', 'One token reaches three platforms through a generator, never through a copy; and a phone does not yet do everything the web does, which this chapter says plainly.');
 para(`${tick('scripts/emit-tokens.mjs')} writes ${tick('packages/design-tokens/tokens.json')} into ${tick('apps/web/src/tokens.generated.css')} (${tick('--<colour>')}, ${tick('--color-<role>')}, ${tick('--r-<radius>')}, ${tick('--space-<n>')}, ${tick('--shadow')} / ${tick('--shadow-raised')}, ${tick('--font-display')} / ${tick('--font-text')}, ${tick('--t-quick')} / ${tick('--t-settle')} / ${tick('--t-enter')}, ${tick('--ease-soft')}), into ${tick('apps/ios/MyThuso/DesignSystem/Tokens.swift')} (${tick('ThusoTheme')}, ${tick('ThusoSemantic.Light')} / ${tick('.Dark')}, ${tick('ThusoRadius')}) and into ${tick('apps/android/app/src/main/java/za/co/mythuso/ui/Tokens.kt')} (the same names as Kotlin objects). The dark roles reach the web only under ${tick(':root[data-theme="dark"]')}: light is the default whatever the reader's system says, and dark is a switch a person turns on (the founder's decision of 29 September 2026). ${tick('scripts/emit-icons.mjs')} writes the icon family the same way: ${tick('apps/web/src/ui/icons/MyThusoIcons.generated.tsx')}, one vector drawable per icon under ${tick('apps/android/app/src/main/res/drawable')}, and ${tick('apps/ios/MyThuso/Models/MyThusoIconsData.swift')}. The build compares every generated file with what its generator returns, so a stale file and a hand-edited one fail the same way.`);
 h3('What a phone does not yet do that the web does');
 list([
  `The Lovable identity is on the web only. ${webOnlyWaves.length} waves landed on 28 September 2026 as "web only": ${webOnlyWaves.map(w => `${w.what} (${w.wave})`).join('; ')}. Both phones still draw the screens that preceded it; the tokens they compile carry the new roles so a restyle is a matter of reaching for one.`,
  `Type: ${tokens.typography.families.display.split('. ')[0]}; ${tokens.typography.families.text}.`,
  `Dark scheme: ${semantic._darkNote}`,
  `The rig's affect: ${sentence(assistant.affect.why.slice(assistant.affect.why.indexOf('The phones carry')))}`,
  `Hands-free conversation: ${conversation.whatItIsNot[0]} The wake-word engine the amendment of 21 September 2026 names is native only, and ${tick('conversation-mode.json')} is web-driven today.`,
  `Speech: the web reads every reply aloud with no way to turn it off; each phone carries a speaker button beside the composer, because a phone is more often overheard (${tick('assistant.json#voice.nativeSpeech')}). Listening and Thinking are states only the phones show; the web's microphone is the browser's.`,
  `${nextIncrementsLead}`
 ]);

 /* ==== CI.md ==================================================================================== */
 const head = [
  '# MyThuso and GilbertOne — the CI document',
  '',
  `> **Edition ${EDITION}.** Generated by ${tick('scripts/emit-ci.mjs')} from the design tokens, the catalogue contracts, the brand`,
  `> masters and the component sources. Do not edit by hand — run ${tick('npm run ci')}. ${tick('npm run check')} fails if this file`,
  `> and its sources disagree, so a value here is always the value the product holds today.`,
  '',
  'Two readers. If you are making a slide, a partner page or a poster, the files are in chapters 2, 4, 5 and 8 and',
  `every one is listed with its size and rights in ${tick('docs/brand/PACK.md')}. If you are writing a screen, the token`,
  'names are in chapters 3, 4, 7 and 12. Every figure below is read from a contract or measured from a file; a figure',
  'the sources do not hold is printed as "unsourced" rather than invented.',
  '',
  ...chapters.map((c, i) => `${i + 1}. [${c.title.replace(/^\d+\. /, '')}](#${c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')})`),
  ''
 ];
 const ciMarkdown = [...head, ...chapters.flatMap(c => c.lines)].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

 /* ==== PACK.md ================================================================================= */
 const packRows = [];
 const caption = file => {
  const name = file.split('/').pop();
  if (/gilbert-one-logo/.test(name)) return 'The official GilbertOne logo: the seated character above the name';
  if (/mythuso-logo\.png/.test(name)) return 'The official MyThuso wordmark';
  if (/gilbert-one\.png/.test(name)) return "The handoff's animated-character illustration; adopted nowhere (the rig is the in-product form)";
  if (/south-africa/.test(name)) return 'The network illustration of South Africa; the lines are not routes and the points are not clinics';
  if (/^device-/.test(name)) return `An instrument from the connected kit, photographed as an object; no device is paired`;
  if (/cape-town-care/.test(name)) return 'Illustrative photograph of care at home; nobody shown is receiving care from MyThuso';
  if (/careline-doctor/.test(name)) return 'Illustrative photograph of a clinician at work; not a MyThuso doctor';
  if (/^patient-/.test(name)) return 'Illustrative portrait supplied with the handoff; nobody shown is receiving care from MyThuso, and the file name is the handoff\'s, not a caption';
  if (/gilbertone-logo/.test(name)) return 'The official GilbertOne logo, resized whole';
  if (/mythuso-logo-reversed/.test(name)) return 'The wordmark for a dark surface';
  if (/mythuso-logo-mono/.test(name)) return 'The wordmark in one colour';
  if (/mythuso-logo/.test(name)) return 'The wordmark';
  if (/mythuso-mark/.test(name)) return 'The house mark';
  if (/mythuso-wordmark/.test(name)) return 'The lockup with the tagline';
  if (/gilbert-(hero|icon|robot)/.test(name)) return 'The earlier GilbertOne sphere illustration; the launcher still reads gilbert-icon.webp';
  if (/OFL-/.test(name)) return 'The licence text for the face beside it';
  if (/woff2$/.test(name)) return 'A self-hosted subset of the face';
  if (/hero-/.test(name)) return "A hero figure for the public page's stage — illustrative; nobody shown is a MyThuso nurse or receiving care from MyThuso";
  if (/cutout/.test(name)) return 'A cut-out figure for the carousel — illustrative';
  if (/README/.test(name)) return 'How the banner files are produced';
  if (/step-/.test(name)) return 'A portrait for the how-it-works steps — illustrative, decorative to assistive technology';
  if (/^(care-at-home|everyday-wellbeing|family-care|nursing-care)\.png$/.test(name)) return 'A generated editorial cover; not named by the public page';
  return 'A banner photograph crop — illustrative';
 };
 for (const { dir, kind, rights } of PACK_DIRS) for (const file of walk(dir)) {
  const m = measure(file);
  packRows.push([tick(file), kind, dimsText(m.dims), `${m.bytes}`, caption(file), rights]);
 }
 const iconRows = [
  [tick('packages/catalog/icons.json'), 'Icon family, source', '—', `${size('packages/catalog/icons.json')}`, `The ${icons.icons.length} MyThuso icons as data`, "MyThuso's own; drawn by the handoff, adopted exactly"],
  [tick('apps/web/src/ui/icons/MyThusoIcons.generated.tsx'), 'Icon family, web', '—', `${existsSync(at('apps/web/src/ui/icons/MyThusoIcons.generated.tsx')) ? size('apps/web/src/ui/icons/MyThusoIcons.generated.tsx') : 'missing'}`, 'Generated React components', 'As the source'],
  [tick('apps/ios/MyThuso/Models/MyThusoIconsData.swift'), 'Icon family, iOS', '—', `${existsSync(at('apps/ios/MyThuso/Models/MyThusoIconsData.swift')) ? size('apps/ios/MyThuso/Models/MyThusoIconsData.swift') : 'missing'}`, 'Generated SwiftUI paths', 'As the source'],
  [tick('apps/android/app/src/main/java/za/co/mythuso/model/MyThusoIcons.kt'), 'Icon family, Android', '—', `${existsSync(at('apps/android/app/src/main/java/za/co/mythuso/model/MyThusoIcons.kt')) ? size('apps/android/app/src/main/java/za/co/mythuso/model/MyThusoIcons.kt') : 'missing'}`, 'Generated listing beside one vector drawable per icon', 'As the source']
 ];
 const packMarkdown = [
  '# The brand pack — every file, its size and its rights',
  '',
  `> **Edition ${EDITION}.** Generated by ${tick('scripts/emit-ci.mjs')}; do not edit by hand — run ${tick('npm run ci')}. ${tick('npm run check')} fails if a`,
  '> file named here is missing or is not the size stated, so a size in this index is the size on disk today.',
  '',
  `Sizes are bytes. "Rights" is what the tree records; where it records nothing the cell says so rather than guessing. No caption`,
  'below calls a person a patient, and the build fails if one does: the people photographed are illustrative.',
  '',
  '## Logos, illustrations, photographs and fonts',
  '',
  `| File | Kind | Pixels | Bytes | What it shows | Rights |`,
  `| --- | --- | --- | --- | --- | --- |`,
  ...packRows.map(r => `| ${r.map(cell).join(' | ')} |`),
  '',
  '## The icon family',
  '',
  `| File | Kind | Pixels | Bytes | What it is | Rights |`,
  `| --- | --- | --- | --- | --- | --- |`,
  ...iconRows.map(r => `| ${r.map(cell).join(' | ')} |`),
  '',
  `Lucide, for utility glyphs: ${tick('lucide-react')} ${lucideVersion} in ${tick('apps/web/package.json')}, ISC licence per the package's own LICENSE file; not vendored, so it has no row.`,
  '',
  '## The handoff manifest',
  '',
  `The ${manifest.length} masters under ${tick('packages/brand/lovable-handoff/handoff')} and their SHA-256, as ${tick('MANIFEST.sha256')} holds them; the build fails if any byte changes or a file appears beside them unrecorded.`,
  '',
  '| Path | SHA-256 |',
  '| --- | --- |',
  ...manifest.map(([sum, p]) => `| ${tick(p)} | ${tick(sum)} |`),
  ''
 ].join('\n');

 /* ==== ci.html ================================================================================= */
 const b64 = p => bytes(p).toString('base64');
 const fontFace = (family, file, weightRange) => `@font-face{font-family:"${family}";font-style:normal;font-weight:${weightRange};font-display:swap;src:url(data:font/woff2;base64,${b64(file)}) format("woff2")}`;
 const svgInline = p => text(p).replace(/<\?xml[^>]*>/, '').trim();
 const iconSvg = icon => {
  const roleFill = r => (r === 'currentColor' ? 'currentColor' : icons.roles[r]?.css ?? 'currentColor');
  const el = e => {
   const common = `stroke="${roleFill(e.stroke ?? 'none')}" stroke-width="${e.strokeWidth ?? 0}" fill="${e.fill ? roleFill(e.fill) : 'none'}"`;
   if (e.kind === 'path') return `<path d="${e.d}" ${common}/>`;
   if (e.kind === 'circle') return `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" ${common}/>`;
   if (e.kind === 'rect') return `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}"${e.rx != null ? ` rx="${e.rx}"` : ''} ${common}/>`;
   return '';
  };
  const s = icons.signal;
  return `<svg viewBox="${icons.family.viewBox}" width="40" height="40" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.elements.map(el).join('')}<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${roleFill(s.fill)}" stroke="${roleFill(s.stroke)}" stroke-width="${s.strokeWidth}"/></svg>`;
 };
 const swatch = (label, hex, sub) => `<div class="swatch"><div class="chip" style="background:${hex}"></div><div class="swatch-l"><code>${esc(label)}</code><span>${esc(hex)}${sub ? ` · ${esc(sub)}` : ''}</span></div></div>`;
 const visuals = {
  'logos': `<div class="plate light"><div class="logo-box">${svgInline('apps/web/public/brand/mythuso-logo.svg')}</div><img alt="GilbertOne" src="data:image/webp;base64,${b64('apps/web/public/lovable/gilbertone/gilbertone-logo-320.webp')}" width="240" height="180"><p class="descriptor">${esc(identity.descriptorLine)}</p></div><div class="plate dark"><div class="logo-box">${svgInline('apps/web/public/brand/mythuso-logo-reversed.svg')}</div><p class="caption">The reversed lockup on the dark scheme's ground. The GilbertOne logo has no reversed form and stays on a light plate.</p></div>`,
  'colour': `<h4>Brand</h4><div class="swatches">${['brandInk', 'brandGreen', 'brandOrange', 'brandLime', 'brandMint', 'brandCyan'].map(n => swatch(`--${kebab(n)}`, tokens.color[n])).join('')}</div><h4>Light scheme</h4><div class="swatches">${roles.map(r => swatch(`--color-${kebab(r)}`, semantic.light[r].hex, semantic.light[r].oklch)).join('')}</div><h4>Dark scheme</h4><div class="swatches">${roles.map(r => swatch(`--color-${kebab(r)}`, semantic.dark[r].hex, semantic.dark[r].oklch)).join('')}</div>`,
  'type': `<div class="type-samples">${Object.entries(tokens.typography.scale).map(([k, v]) => `<p class="${/Title|heading|metric/i.test(k) ? 'display' : 'text'}" style="font-size:${v}px;font-weight:${/metric/.test(k) ? 500 : /Title|heading/.test(k) ? 600 : 400}"><span class="step">${esc(k)} · ${v}px</span>Care that comes to you. A nurse at the door, a doctor who reviews.</p>`).join('')}</div>`,
  'icons': `<div class="icon-grid">${icons.icons.map(i => `<figure>${iconSvg(i)}<figcaption>${esc(i.name)}</figcaption></figure>`).join('')}</div>`,
  'components': `<div class="samples"><button class="b primary">Primary</button><button class="b accent">Accent</button><button class="b secondary">Secondary</button><button class="b ghost">Ghost</button><button class="b destructive">Destructive</button><span class="badge">Neutral</span><span class="badge accent">Accent</span><span class="badge danger">Danger</span><span class="status"><i></i>Available</span></div><p class="caption">Drawn here in the tokens' own values for illustration; the product's components are apps/web/src/ui and this page is not them.</p>`,
  'layout-and-motion': `<div class="samples">${Object.entries(tokens.radius).filter(([k]) => ['sm', 'md', 'lg'].includes(k)).map(([k, v]) => `<div class="tile" style="border-radius:${v}px"><code>--r-${k}</code> ${v}px</div>`).join('')}<div class="tile card"><code>--shadow</code></div><div class="tile raised"><code>--shadow-raised</code></div></div>`,
  'imagery': `<div class="samples pics"><img alt="" src="data:image/webp;base64,${b64('apps/web/public/lovable/device-bp-monitor-400.webp')}" width="160" height="160"><img alt="" src="data:image/webp;base64,${b64('apps/web/public/lovable/device-pulse-oximeter-400.webp')}" width="160" height="160"><img alt="" src="data:image/webp;base64,${b64('apps/web/public/lovable/south-africa-network-640.webp')}" width="320" height="240"></div><p class="caption">${esc(hero.stage.kit.title)} — ${esc(deviceCapability.notice)} ${esc(hero.stage.impact.mapNote)}</p>`
 };
 const cssVars = mode => roles.map(r => `--color-${kebab(r)}:${semantic[mode][r].hex};`).join('');
 const html = `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyThuso CI document</title>
<meta name="description" content="The corporate identity of MyThuso and GilbertOne — edition ${EDITION}, generated from the design tokens, the contracts and the brand masters.">
<style>
${fontFace('Outfit', 'apps/web/public/fonts/outfit-latin.woff2', '500 700')}
${fontFace('Outfit', 'apps/web/public/fonts/outfit-latin-ext.woff2', '500 700')}
${fontFace('Figtree', 'apps/web/public/fonts/figtree-latin.woff2', '400 800')}
${fontFace('Figtree', 'apps/web/public/fonts/figtree-latin-ext.woff2', '400 800')}
:root{${cssVars('light')}${['brandInk', 'brandGreen', 'brandOrange', 'brandLime', 'brandMint', 'brandCyan', 'mist', 'mangoInk', 'danger'].map(n => `--${kebab(n)}:${tokens.color[n]};`).join('')}--r-sm:${tokens.radius.sm}px;--r-md:${tokens.radius.md}px;--r-lg:${tokens.radius.lg}px;--shadow:${tokens.elevation.card};--shadow-raised:${tokens.elevation.raised};--t-quick:${tokens.motion.quickMs}ms;--ease-soft:cubic-bezier(${tokens.motion.easeSoft.join(',')});--font-display:${tokens.typography.stacks.display};--font-text:${tokens.typography.stacks.text};color-scheme:light dark}
:root[data-theme="dark"]{${cssVars('dark')}}
*{box-sizing:border-box}
body{margin:0;background:var(--color-background);color:var(--color-foreground);font-family:var(--font-text);font-size:15px;line-height:1.6}
main{max-width:1040px;margin:0 auto;padding:32px 16px 96px}
h1,h2,h3,h4{font-family:var(--font-display);letter-spacing:-.01em;line-height:1.2;margin:1.6em 0 .5em}
h1{font-size:${tokens.typography.scale.screenTitle}px;margin-top:0}h2{font-size:${tokens.typography.scale.heading}px;padding-top:24px;border-top:1px solid var(--color-border)}h3{font-size:${tokens.typography.scale.sectionTitle}px}h4{font-size:${tokens.typography.scale.cardTitle}px}
p,li{max-width:76ch}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:var(--color-muted);padding:1px 5px;border-radius:var(--r-sm)}
blockquote{margin:0 0 16px;padding:12px 16px;border-left:3px solid var(--color-accent);background:var(--color-surface-raised);border-radius:0 var(--r-md) var(--r-md) 0}blockquote p{margin:0 0 6px}
.table{overflow-x:auto;margin:0 0 20px;border:1px solid var(--color-border);border-radius:var(--r-lg);background:var(--color-surface)}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--color-border)}th{font-family:var(--font-display);font-weight:600;background:var(--color-surface-raised)}tr:last-child td{border-bottom:0}
nav.toc ol{columns:2;gap:24px;padding-left:20px}nav.toc a{color:var(--color-primary)}a{color:var(--color-primary)}
.plate{border:1px solid var(--color-border);border-radius:var(--r-lg);padding:24px;margin:0 0 16px;display:flex;flex-wrap:wrap;gap:24px;align-items:center}.plate.light{background:${semantic.light.surface.hex};color:${semantic.light.foreground.hex}}.plate.dark{background:${semantic.dark.background.hex};color:${semantic.dark.foreground.hex}}.logo-box svg{width:220px;height:auto;display:block}.plate img{border-radius:var(--r-md)}
.descriptor{font-size:13px;margin:0;flex-basis:100%}.caption{font-size:13px;color:var(--color-muted-foreground);margin:0 0 16px}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:0 0 16px}.swatch{border:1px solid var(--color-border);border-radius:var(--r-md);overflow:hidden;background:var(--color-surface)}.chip{height:44px}.swatch-l{padding:6px 8px;font-size:12px;display:flex;flex-direction:column;gap:2px}.swatch-l span{color:var(--color-muted-foreground);word-break:break-all}
.type-samples p{margin:0 0 12px;max-width:none}.type-samples .display{font-family:var(--font-display)}.type-samples .step{display:block;font:500 12px var(--font-text);color:var(--color-muted-foreground);margin-bottom:2px}
.icon-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:12px;margin:0 0 16px}.icon-grid figure{margin:0;padding:12px;border:1px solid var(--color-border);border-radius:var(--r-md);background:var(--color-surface);text-align:center;font-size:12px;color:var(--color-foreground)}.icon-grid svg{display:block;margin:0 auto 6px}
.samples{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:0 0 8px}.b{font:600 15px var(--font-text);height:44px;padding:0 16px;border-radius:var(--r-md);border:1px solid transparent;cursor:default}.b.primary{background:var(--color-primary);color:var(--color-primary-foreground)}.b.accent{background:var(--color-accent);color:var(--color-accent-foreground)}.b.secondary{background:var(--color-surface);color:var(--color-foreground);border-color:var(--color-border)}.b.ghost{background:transparent;color:var(--color-primary)}.b.destructive{background:var(--danger);color:${semantic.light.surface.hex}}
.badge{font-size:13px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--color-muted);color:var(--color-foreground)}.badge.accent{background:var(--color-accent);color:var(--color-accent-foreground)}.badge.danger{background:var(--danger);color:${semantic.light.surface.hex}}
.status{font-size:13px;display:inline-flex;gap:6px;align-items:center}.status i{width:8px;height:8px;border-radius:50%;background:var(--color-accent)}
.tile{padding:16px;border:1px solid var(--color-border);background:var(--color-surface);min-width:140px;font-size:13px}.tile.card{box-shadow:var(--shadow);border-radius:var(--r-lg)}.tile.raised{box-shadow:var(--shadow-raised);border-radius:var(--r-lg)}
.pics img{border-radius:var(--r-md);max-width:100%;height:auto}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
@media (max-width:600px){nav.toc ol{columns:1}h1{font-size:24px}}
</style>
</head>
<body>
<main>
<h1>MyThuso and GilbertOne — the CI document</h1>
<p class="caption">Edition ${esc(EDITION)}. Generated by <code>scripts/emit-ci.mjs</code> from the design tokens, the catalogue contracts, the brand masters and the component sources; the Markdown edition is <code>docs/brand/CI.md</code> and every file is indexed in <code>docs/brand/PACK.md</code>. Every figure is read from a contract or measured from a file; a figure the sources do not hold says "unsourced".</p>
<nav class="toc" aria-label="Chapters"><ol>${chapters.map(c => `<li><a href="#${c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}">${esc(c.title.replace(/^\d+\. /, ''))}</a></li>`).join('')}</ol></nav>
${chapters.map(c => { const rendered = markdownToHtml(c.lines); const cut = rendered.indexOf('</h2>') + 5; return rendered.slice(0, cut) + (visuals[c.id] ? `\n<section class="visual">${visuals[c.id]}</section>` : '') + rendered.slice(cut); }).join('\n')}
</main>
</body>
</html>
`;

 /* A field read from the wrong file prints "undefined" and reads as a value. The generator refuses to
    write it, and scripts/check-boundaries.mjs refuses the files if one gets through. */
 for (const [name, content] of [['CI.md', ciMarkdown], ['PACK.md', packMarkdown], ['ci.html', html]])
  if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(content)) throw new Error(`emit-ci: ${name} would print "undefined" — a field was read from a file that does not hold it.`);

 return [
  { path: CI_FILES.ci, content: ciMarkdown },
  { path: CI_FILES.pack, content: packMarkdown },
  { path: CI_FILES.html, content: html }
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitCi()) {
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, file.content);
  console.log(`ci → ${file.path} (${kB(Buffer.byteLength(file.content))})`);
 }
}
