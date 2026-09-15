/* The locks beside packages/catalog/apis.lock, and the rule that no lock line is ever edited.

   WHY THREE MORE. apis.lock fingerprints a route's method, path, version and the top level of its request
   and response, and nothing else — and its arithmetic is history, because every line in it was written by
   it. A settings migration changed a live, pushed route's inner rows and refusal sentences under an
   unchanged fingerprint, and only a person reading the diff noticed. Changing apis.lock's arithmetic would
   rewrite all of its lines, so what it never covered is frozen beside it instead:

   - apis.refusals.lock: a route's refusals — each id, its status and its sentence, and every engine refusal
     whose answeredBy names the route — and one line for every shared refusal, by scope and id.
   - apis.callers.lock: who may call a route, for which purposes and on which engine justifications, written
     out rather than hashed, because narrowing is allowed and widening is not, and a hash cannot tell which.
   - apis.shapes.lock: the inside of every object a route carries, for a route that declares it; and, sealed,
     the routes whose objects were described only in prose on the day the rule began.

   WHAT A REFUSAL HASH LEAVES OUT. The why. A caller is sent the id, the status and the sentence and never the
   reasoning, which is written for the next person to read the contract. A lock that fired on a clearer reason
   would teach people to stop writing clearer reasons, and nothing a client receives would be safer for it.

   SHARED REFUSALS. A refusal no single route owns cannot be versioned with a route. The ones every route
   inherits (apis.json's sharedRefusals and the runtime's own) and the ones any route of an engine may answer
   are frozen by id: while one is declared, its status and sentence do not change, and different words are a
   different id. A version on those lists would change the sentence under every live route at once, with no
   caller able to opt out, which is the silent edit this file exists to refuse. The settings refusals are the
   exception that has a version to hang on: each is part of the shared settings route shape in
   packages/catalog/settings.json, whose route kinds carry one, so its line is keyed by that version, and new
   words come with a new version of the shape — which every live settings route then has to follow with a
   version of its own, because it declares the sentence word for word. And an engine refusal is answered only
   by the routes its answeredBy names: the runtime refuses the rest, and the names are in each route's hash,
   so a refusal cannot be added to a frozen route by declaring it one level up.

   CALLERS. Adding a caller, a purpose or a justification widens who reaches a frozen route, and is a new
   version. Removing one narrows it, and is allowed without one — but not silently: the narrowing is a line of
   its own, appended by `npm run apis -- --record-narrowing`, and the narrowest line is the one in force. So a
   caller removed for a reason cannot drift back in, because the line it would need is wider than the one in
   force.

   APPEND-ONLY. Every lock file is compared with its own history in git from lockHistory.from onwards: a line
   in any earlier commit on that path, or in HEAD, that is missing from the next is refused. Lines may be
   added anywhere, so two branches that each append merge without a conflict nobody can resolve honestly.
   Without git there is no history to compare, and the build says so rather than pretending.

   Zero dependencies, read by scripts/check-boundaries.mjs and run by `npm run apis -- --seed-new`, which
   appends a line for every route version and shared refusal that has none and never touches one that
   exists. */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadApis, routeKey, routeFingerprint } from './emit-apis.mjs';
import { collectEvents } from './emit-events.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const byFirst = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
const readJson = (root, file) => JSON.parse(readFileSync(root + file, 'utf8'));

/* ---- Reading a lock ---------------------------------------------------------------------------------- */
export function lockLines(path) {
 if (!existsSync(path)) return null;
 return readFileSync(path, 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}
const keyOf = line => line.slice(0, line.lastIndexOf(' '));
const printOf = line => line.slice(line.lastIndexOf(' ') + 1);

/* ---- Refusals ---------------------------------------------------------------------------------------- */
const said = refusal => [refusal.id, refusal.status, refusal.statement];
export const answeredEngineRefusals = (doc, route) => (doc.refusals ?? []).filter(refusal => (refusal.answeredBy ?? []).includes(routeKey(route)));
export const refusalsPrint = (route, doc) => digest({
 route: routeKey(route),
 own: route.refusals.map(said).sort(byFirst),
 engine: answeredEngineRefusals(doc, route).map(said).sort(byFirst)
});

/* Every shared refusal, with the scope its line is keyed by. A settings refusal's scope carries the version
   of the route kind it belongs to, so a new version of the shared shape is a new set of lines. */
export function sharedRefusalEntries(root = '') {
 const { contract, engines } = loadApis(root);
 const settings = readJson(root, 'packages/catalog/settings.json');
 const scoped = [
  ...contract.sharedRefusals.map(refusal => ({ scope: 'apis.json#sharedRefusals', refusal })),
  ...contract.engineRuntime.refusals.map(refusal => ({ scope: 'apis.json#engineRuntime.refusals', refusal })),
  ...engines.flatMap(({ file, doc }) => (doc.refusals ?? []).map(refusal => ({ scope: `${file.replace('packages/catalog/', '')}#refusals`, refusal }))),
  ...settings.refusals.map(refusal => ({ scope: `settings.json#refusals ${refusal.route}@${settings.routes[refusal.route].version}`, refusal, kind: refusal.route, version: settings.routes[refusal.route].version }))
 ];
 return scoped.map(({ scope, refusal, kind, version }) => ({
  key: `shared ${scope} ${refusal.id}`, print: digest([scope, refusal.id, refusal.status, refusal.statement]), scope, id: refusal.id, kind, version
 }));
}

/* ---- Callers ----------------------------------------------------------------------------------------- */
const sortedSet = list => [...new Set(list ?? [])].sort();
export const callersOf = route => ({
 callers: sortedSet(route.callers),
 purpose: sortedSet(route.purpose),
 because: sortedSet(Object.entries(route.callerJustifications ?? {}).map(([caller, event]) => `${caller}=${event}`))
});
const written = list => (list.length ? list.join(',') : '-');
export const callersLine = route => {
 const c = callersOf(route);
 return `${routeKey(route)} callers=${written(c.callers)} purpose=${written(c.purpose)} because=${written(c.because)}`;
};
export function parseCallersLine(line) {
 const m = line.match(/^(\S+ \S+@\d+) callers=(\S+) purpose=(\S+) because=(\S+)$/);
 if (!m) return null;
 const items = text => (text === '-' ? [] : text.split(','));
 return { key: m[1], line, callers: items(m[2]), purpose: items(m[3]), because: items(m[4]) };
}
const DIMENSIONS = ['callers', 'purpose', 'because'];
const within = (inner, outer) => DIMENSIONS.every(d => inner[d].every(x => outer[d].includes(x)));
const same = (a, b) => within(a, b) && within(b, a);

/* Every withdrawn event version, mapped to the live version its corrections lead to. A justification must
   name a live event, so when Access withdrew version one of booking.requested, two frozen Core routes had to
   move their engine:access justification to version two. That is not a new reason to call: it is the same event
   followed through its own correction, which the event contract already holds to the same type or a rename
   by the same owner. So a justification is compared by where its chain lands, and the line that named the
   withdrawn version is left exactly as it was written. A move to any other event is still a widening. */
export function eventSuccessors(root = '') {
 const { events } = collectEvents(root);
 const byKey = new Map(events.map(e => [`${e.type}@${e.version}`, e]));
 const successors = new Map();
 for (const [key, event] of byKey) {
  if (!event.withdrawn) continue;
  let at = event;
  for (let steps = 0; at?.withdrawn && steps < byKey.size; steps++) at = byKey.get(at.withdrawn.supersededBy);
  if (at && !at.withdrawn) successors.set(key, `${at.type}@${at.version}`);
 }
 return successors;
}
let cachedSuccessors = null;
const followed = (standing, successors) => ({
 ...standing,
 because: sortedSet(standing.because.map(pair => {
  const cut = pair.indexOf('=');
  return `${pair.slice(0, cut)}=${successors.get(pair.slice(cut + 1)) ?? pair.slice(cut + 1)}`;
 }))
});

/* Where a route stands against its lines: unlocked, one of several lines that do not narrow each other,
   the same as the narrowest, narrower than it, or wider — with what it adds. Justifications on both sides are
   compared by the live event their corrections lead to. */
export function callerStanding(route, parsedLines, successors = (cachedSuccessors ??= eventSuccessors())) {
 const now = followed(callersOf(route), successors);
 const parsed = parsedLines.map(p => followed(p, successors));
 const lines = parsed.filter(p => p.key === routeKey(route));
 if (!lines.length) return { verdict: 'unlocked', now };
 for (const a of lines) for (const b of lines) if (!within(a, b) && !within(b, a)) return { verdict: 'incomparable', now, lines };
 const inForce = lines.find(candidate => lines.every(other => within(candidate, other)));
 if (same(now, inForce)) return { verdict: 'same', now, inForce };
 if (within(now, inForce)) return { verdict: 'narrowed', now, inForce };
 const added = Object.fromEntries(DIMENSIONS.map(d => [d, now[d].filter(x => !inForce[d].includes(x))]));
 return { verdict: 'widened', now, inForce, added };
}

/* ---- Inner shapes ------------------------------------------------------------------------------------ */
const stripCommentary = value => (Array.isArray(value) ? value.map(stripCommentary)
 : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'why' && !k.startsWith('_')).map(([k, v]) => [k, stripCommentary(v)]))
 : value);

/* A shapeFrom pointer is a catalogue file and a dotted path inside it. Only the catalogue: a shape is decided
   by a contract, never by code or by a document outside the repository. */
export function sectionAt(pointer, root = '') {
 const [file, path] = String(pointer).split('#');
 if (!file.startsWith('packages/catalog/') || !file.endsWith('.json') || !path || !existsSync(root + file)) return undefined;
 return path.split('.').reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), readJson(root, file));
}

export const shapeOf = (fields, root = '') => (fields ?? []).map(f => [
 f.field, f.type, f.required === true, f.object === true, f.nullable === true,
 f.shapeFrom ?? null, f.shapeFrom ? digest(stripCommentary(sectionAt(f.shapeFrom, root) ?? null)) : null,
 f.fields ? shapeOf(f.fields, root) : null
]);
export const shapesPrint = (route, root = '') => digest({ route: routeKey(route), request: shapeOf(route.request, root), response: shapeOf(route.response, root) });

/* Every object field, at any depth, whose inside is neither declared as fields nor taken from a contract section. */
export function proseOnlyPaths(route) {
 const walk = (fields, at) => (fields ?? []).flatMap(f => {
  const here = `${at}.${f.field}`;
  if (!f.object) return [];
  if (!f.fields && !f.shapeFrom) return [here];
  return walk(f.fields, here);
 });
 return [...walk(route.request, 'request'), ...walk(route.response, 'response')];
}
export const carriesObjects = route => [...(route.request ?? []), ...(route.response ?? [])].some(f => f.object === true);

export const PROSE_ONLY = 'prose-only';
export const SEALED = 'prose-only sealed';
export const sealOf = keys => digest([...keys].sort());
export function parseShapesLock(lines) {
 const prints = new Map(), proseOnly = [], seals = [], malformed = [];
 for (const line of lines) {
  if (line.startsWith(`${SEALED} `)) {
   const [count, print] = line.slice(SEALED.length + 1).split(' ');
   if (!/^\d+$/.test(count ?? '') || !/^[0-9a-f]{16}$/.test(print ?? '')) malformed.push(line);
   else seals.push({ count: Number(count), print, line });
  } else if (line.startsWith(`${PROSE_ONLY} `)) proseOnly.push(line.slice(PROSE_ONLY.length + 1));
  else if (/^\S+ \S+@\d+ [0-9a-f]{16}$/.test(line)) prints.set(keyOf(line), printOf(line));
  else malformed.push(line);
 }
 return { prints, proseOnly, seals, malformed };
}

/* ---- Append-only, from git ----------------------------------------------------------------------------- */
export function lockFiles(root = '') {
 const { contract } = loadApis(root);
 return [contract.lock, contract.refusalsLock, contract.callersLock, contract.shapesLock, readJson(root, 'packages/catalog/events.json').lock];
}

/* Every line any version of a lock has held, in the anchor, in HEAD or in any commit descended from the
   anchor on the way to HEAD, must still be in the lock as it is now. Held to the tree as it is now rather
   than commit by commit, so that putting a removed line back mends the build: a rule that failed for ever
   on one bad commit in history would be switched off within the week. A merge from a branch that does not
   descend from the anchor brings no protected lines with it, because nothing before the anchor was written
   under this rule. */
export function appendOnlyFindings(files, from, cwd = process.cwd()) {
 const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
 try {
  if (git('rev-parse', '--is-inside-work-tree').trim() !== 'true') return { compared: false };
 } catch {
  return { compared: false };
 }
 let anchor;
 try {
  anchor = git('rev-parse', '--verify', '--quiet', `${from}^{commit}`).trim();
 } catch {
  return { compared: true, missingAnchor: true, commits: 0, findings: [] };
 }
 const versions = new Set();
 const listed = commit => {
  for (const row of git('ls-tree', commit, '--', ...files).split('\n').filter(Boolean)) {
   const [meta, file] = row.split('\t');
   versions.add(`${file}\t${meta.split(' ')[2]}`);
  }
 };
 listed(anchor);
 listed('HEAD');
 /* The version each descended commit wrote, for every lock it touched, merges included. The blob on the
    other side of a diff is left alone: it is either a version collected here already or one from before
    the anchor. */
 const log = git('log', '--ancestry-path', '--full-history', '-m', '--raw', '--no-abbrev', '--format=commit %H', `${anchor}..HEAD`, '--', ...files);
 for (const row of log.split('\n')) {
  const m = row.match(/^:\d+ \d+ [0-9a-f]{40} ([0-9a-f]{40}) [A-Z]\d*\t(.+)$/);
  if (m && !/^0+$/.test(m[1])) versions.add(`${m[2]}\t${m[1]}`);
 }
 const commits = git('rev-list', '--ancestry-path', `${anchor}..HEAD`).split('\n').filter(Boolean).length;
 const lockLinesIn = text => text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
 const now = new Map(files.map(file => [file, new Set(existsSync(`${cwd}/${file}`) ? lockLinesIn(readFileSync(`${cwd}/${file}`, 'utf8')) : [])]));
 const findings = new Map();
 for (const version of versions) {
  const [file, blob] = version.split('\t');
  if (!now.has(file)) continue;
  for (const line of lockLinesIn(git('cat-file', 'blob', blob))) if (!now.get(file).has(line)) findings.set(`${file}\t${line}`, { file, line });
 }
 return { compared: true, commits, findings: [...findings.values()] };
}

/* ---- Writing: only ever appending ---------------------------------------------------------------------- */
const HEADERS = {
 refusals: [
  '# packages/catalog/apis.refusals.lock — what every frozen route refuses, and every refusal routes share.',
  '#',
  '# A route line hashes the route\'s own refusals — each id, its status and its sentence — and every engine refusal whose',
  '# answeredBy names the route. A shared line hashes one shared refusal\'s status and sentence, by its scope and id. The why',
  '# is left out, because no caller is ever sent it. scripts/check-boundaries.mjs fails the build when a route or a shared',
  '# refusal no longer matches its line: the fix is a new route version, or a new refusal id, and never an edit here.',
  '# Seeded on 15 September 2026 from the tree as it stood. New lines are appended by `npm run apis -- --seed-new`.',
  '#',
  '# METHOD path@version hash',
  '# shared <scope> <id> hash'
 ],
 callers: [
  '# packages/catalog/apis.callers.lock — who may call every frozen route, for what, and on which engine\'s justification.',
  '#',
  '# Written out rather than hashed, so the build can tell a narrowing from a widening. A route may have more than one line:',
  '# each later one is a narrowing appended by `npm run apis -- --record-narrowing`, and the narrowest is in force. A route',
  '# naming a caller, a purpose or a justification its narrowest line does not is refused, and is a new version instead.',
  '# Seeded on 15 September 2026 from the tree as it stood. New routes are appended by `npm run apis -- --seed-new`.',
  '#',
  '# METHOD path@version callers=<ids or -> purpose=<ids or -> because=<engine:id=event@version or ->'
 ],
 shapes: [
  '# packages/catalog/apis.shapes.lock — the inside of every object a frozen route carries.',
  '#',
  '# A route line hashes every request and response field at every depth: its name, type, requiredness, object and null',
  '# flags, the fields inside it, and the content, without commentary, of any contract section it takes its shape from.',
  '# A prose-only line names a route whose objects were described only in prose on 15 September 2026, when the rule began,',
  '# and the sealed line closes that list: no prose-only line is added after it. New route lines are appended by',
  '# `npm run apis -- --seed-new`.',
  '#',
  '# METHOD path@version hash',
  '# prose-only METHOD path@version',
  '# prose-only sealed <count> <hash>'
 ]
};

function appender(root, report) {
 return (file, header, lines) => {
  if (!lines.length) return;
  const path = root + file;
  const body = `${lines.join('\n')}\n`;
  if (!existsSync(path)) writeFileSync(path, `${(header ?? []).join('\n')}\n${body}`);
  else {
   const existing = readFileSync(path, 'utf8');
   appendFileSync(path, `${existing === '' || existing.endsWith('\n') ? '' : '\n'}${body}`);
  }
  for (const line of lines) report.push(`${file}  ${line}`);
 };
}

/* Appends a line for every route version and shared refusal that has none, in every API lock, and never
   touches a line that exists. A route whose line no longer matches is left for the build to refuse. */
export function seedNew(root = '') {
 const { contract, engines, routes } = loadApis(root);
 const docs = new Map(engines.map(({ doc }) => [doc.engine, doc]));
 const report = [];
 const append = appender(root, report);

 const routeLines = lockLines(root + contract.lock) ?? [];
 const routeKeys = new Set(routeLines.map(keyOf));
 append(contract.lock, null, routes.filter(r => !routeKeys.has(routeKey(r))).map(r => `${routeKey(r)} ${routeFingerprint(r)}`));

 const refusalKeys = new Set((lockLines(root + contract.refusalsLock) ?? []).map(keyOf));
 append(contract.refusalsLock, HEADERS.refusals, [
  ...routes.filter(r => !refusalKeys.has(routeKey(r))).map(r => `${routeKey(r)} ${refusalsPrint(r, docs.get(r.engine))}`),
  ...sharedRefusalEntries(root).filter(s => !refusalKeys.has(s.key)).map(s => `${s.key} ${s.print}`)
 ]);

 const callerKeys = new Set((lockLines(root + contract.callersLock) ?? []).map(parseCallersLine).filter(Boolean).map(p => p.key));
 append(contract.callersLock, HEADERS.callers, routes.filter(r => !callerKeys.has(routeKey(r))).map(callersLine));

 const shapes = parseShapesLock(lockLines(root + contract.shapesLock) ?? []);
 const fresh = [];
 if (!shapes.seals.length) {
  const proseOnly = [...new Set([...shapes.proseOnly, ...routes.filter(r => proseOnlyPaths(r).length).map(routeKey)])];
  fresh.push(...proseOnly.filter(k => !shapes.proseOnly.includes(k)).map(k => `${PROSE_ONLY} ${k}`), `${SEALED} ${proseOnly.length} ${sealOf(proseOnly)}`);
 }
 fresh.push(...routes.filter(r => carriesObjects(r) && !proseOnlyPaths(r).length && !shapes.prints.has(routeKey(r))).map(r => `${routeKey(r)} ${shapesPrint(r, root)}`));
 append(contract.shapesLock, HEADERS.shapes, fresh);

 console.log(report.length ? `Appended ${report.length} ${report.length === 1 ? 'line' : 'lines'}:\n${report.join('\n')}` : 'Every route version and shared refusal already has its lines. Nothing was appended.');
 return 0;
}

/* Appends a line for every route whose callers, purposes and justifications are a strict narrowing of the
   line in force. A widening is never written: it is listed, and the command fails. */
export function recordNarrowing(root = '') {
 const { contract, routes } = loadApis(root);
 const parsed = (lockLines(root + contract.callersLock) ?? []).map(parseCallersLine).filter(Boolean);
 const narrowed = [], widened = [];
 for (const route of routes) {
  const standing = callerStanding(route, parsed);
  if (standing.verdict === 'narrowed') narrowed.push(callersLine(route));
  if (standing.verdict === 'widened' || standing.verdict === 'incomparable') widened.push(routeKey(route));
 }
 const report = [];
 appender(root, report)(contract.callersLock, HEADERS.callers, narrowed);
 console.log(report.length ? `Recorded ${report.length} ${report.length === 1 ? 'narrowing' : 'narrowings'}:\n${report.join('\n')}` : 'No route is narrower than its line in force. Nothing was appended.');
 if (widened.length) {
  console.error(`Not recorded, because ${widened.length === 1 ? 'it widens' : 'they widen'} who may call a frozen route — declare a new version instead:\n${widened.join('\n')}`);
  return 1;
 }
 return 0;
}
