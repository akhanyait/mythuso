#!/usr/bin/env node
/* The patient entry's weight, held to a number somebody decided.
 *
 * WHY THIS IS ITS OWN SCRIPT AND NOT A CHECK IN check-boundaries.mjs
 * ----------------------------------------------------------------
 * The boundary checks read the source tree and need no build. This one measures bytes that only
 * exist after `npm run build -w @mythuso/web`, so folding it in would make `npm run check` depend
 * on a build having happened — and a check that fails because nobody built yet is a check people
 * learn to ignore. It runs after a build, in CI and by hand.
 *
 * WHAT IT MEASURES, AND WHY THAT DEFINITION
 * -----------------------------------------
 * Every script, module preload and stylesheet that apps/web/dist/index.html references, each
 * gzipped at level 9. That is the patient's first view on mythuso.co.za: what her phone downloads
 * to draw the app before she has done anything. It is deliberately not the whole dist — the
 * staff shell, the dispatch board, the tile map and the settings bundle are all in there too, and
 * counting them would hide the only figure that matters behind numbers a patient never pays.
 *
 * The ceiling is 282.16 kB. It is the figure in CLAUDE.md and AGENTS.md, measured on 16 September
 * 2026 at 8bf3e48 the same way, and it was chosen rather than observed: it is what eleven engines
 * of product across two waves cost a patient on metered data when every one of them sits behind a
 * dynamic import. Raising it is a founder decision. This script makes it a number in one place
 * that a build enforces, because an invariant nobody checks is a hope.
 *
 * COMPARE ONLY LIKE WITH LIKE. A figure taken a different way — uncompressed, whole-dist, or
 * against the landing page — means nothing against this ceiling. If the definition below changes,
 * the ceiling has to be re-derived, not carried over.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = new URL('../apps/web/dist/', import.meta.url).pathname;
const ENTRY = 'index.html';

/* The ceiling in bytes, from CLAUDE.md. Not kB-times-1000 and not kB-times-1024 by guesswork:
   the documented figure was measured in binary kB, so 1024 it is. */
const CEILING_KB = 282.16;
const CEILING = Math.round(CEILING_KB * 1024);

/* How much of the ceiling a single new file may take before this says so. Half a kilobyte: the
   wallet shortcuts that landed on 16 September cost 0.47 kB and were acceptable, so the warning
   sits below that rather than above it. */
const NOTICE_KB = 0.5;

const html = readFileSync(join(DIST, ENTRY), 'utf8');

/* src= and href= only, and only the extensions a browser fetches on first paint. A <link rel=icon>
   or a manifest is not part of the first view's critical bytes and counting it would make the
   figure drift from what the ceiling was derived from. */
const referenced = new Set();
for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|mjs|css))"/g)) {
  referenced.add(match[1]);
}
if (referenced.size === 0) {
  /* A build that references nothing is not a small build, it is a broken one. Failing loudly here
     is the difference between "0 kB, well under budget" and a build that serves a blank page. */
  console.error(`${ENTRY} references no script or stylesheet — is apps/web/dist a real build?`);
  process.exit(1);
}

const rows = [];
let total = 0;
for (const ref of [...referenced].sort()) {
  /* Root-absolute (/assets/x.js) and relative both appear, because Vite's base is '/'. */
  const file = ref.startsWith('/') ? join(DIST, ref) : join(DIST, ref);
  if (!existsSync(file)) {
    /* A missing asset is a broken deploy long before it is a budget problem: the browser would
       404 it and the patient would get a page that does not run. Say which it is. */
    console.error(`${ENTRY} references ${ref}, which is not in apps/web/dist.`);
    console.error('That is a broken build, not a budget question. Run: npm run build -w @mythuso/web');
    process.exit(1);
  }
  const gz = gzipSync(readFileSync(file), { level: 9 }).length;
  total += gz;
  rows.push({ ref, gz });
}

rows.sort((a, b) => b.gz - a.gz);

const kb = (n) => (n / 1024).toFixed(2);
const over = total - CEILING;

console.log(`The patient entry, ${rows.length} files, gzipped at level 9:`);
for (const { ref, gz } of rows) console.log(`  ${kb(gz).padStart(8)} kB  ${ref}`);
console.log(`\n  ${kb(total).padStart(8)} kB  total`);
/* The same bytes, said in both units. On 2 October 2026 a sweep went looking for "~6 kB" the patient's
   first load had gained since 255.80, and found 0.31: figures of 261.50 and 262.25 had been taken by
   dividing bytes by 1,000 and quoted beside figures divided by 1,024, and at this size the two differ by
   about six. A figure quoted from this script is the first one; the second is printed so nobody has to
   derive it, and so it is never compared with the first. */
console.log(`  ${String(total).padStart(8)} bytes — kB above is 1,024 bytes, as the ceiling was measured; the same bytes are ${(total / 1000).toFixed(2)} kB of 1,000, which is not comparable with it`);
console.log(`  ${kb(CEILING).padStart(8)} kB  ceiling (CLAUDE.md)`);
console.log(`  ${kb(Math.abs(over)).padStart(8)} kB  ${over <= 0 ? 'headroom' : 'OVER'}`);

if (over > 0) {
  console.error(`
The patient's first view is ${kb(over)} kB over the ceiling.

Every one of those bytes is downloaded by a patient on a mid-range phone on metered data before
she has asked for anything. The screens added since the ceiling was set are all behind a dynamic
import, which is how eleven engines of product cost the first view nothing — so the fix is almost
certainly to move whatever landed on the entry behind one:

  const Screen = lazy(() => import('./features/Screen'));

Find it by comparing the list above with the previous measurement. The largest files are the usual
cause, and a static import of a shell or a feature module from anything this entry already reaches
is the usual mechanism: it pulls the whole workspace back into the first load, silently.

If the growth is genuinely owed to the patient — a screen she opens first, every time — then the
ceiling itself is the question, and raising it is a founder decision rather than an edit here.
CLAUDE.md says so: "that is a decision to bring to the founder rather than to make."`);
  process.exit(1);
}

/* Under budget, but something specific grew. Naming it is what stops the ceiling being reached by
   a hundred acceptable-looking changes, each of which passed. */
for (const { ref, gz } of rows) {
  if (gz / 1024 >= NOTICE_KB && gz > 0 && ref.includes('patient')) {
    console.log(`\n  note: ${ref} is ${kb(gz)} kB on the patient entry.`);
  }
}

console.log('\nWithin budget.');
