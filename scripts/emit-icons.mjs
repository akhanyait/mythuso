/* The MyThuso icon family, written out for three platforms, by a machine.

   The icons live in packages/catalog/icons.json: every path, rect and circle exactly as the design
   handoff of 28 September 2026 drew it, the signal dot, the colour roles and the family's rules.
   The web gets one React component per icon; Android gets one vector drawable per icon and a
   listing; iOS gets each icon as SwiftUI Path builders and a view that strokes them. A path typed
   into a screen is a path that drifts from the other two platforms the day somebody nudges a
   coordinate, so none is typed anywhere — the build fails if one appears outside these files.

   Three renderers, one geometry. The web renders the handoff's elements as drawn (a <rect> stays
   a <rect>, a <circle> a <circle>). A vector drawable has only paths, so a rect and a circle are
   written as arcs, in normalised absolute path data with every command spelt out — Android's
   parser reads the compact SVG spelling, but a path nobody has to squint at is a path a reviewer
   can check. SwiftUI's Path has no SVG arc, so the parser below expands H, V, S, T and the
   relative forms, and turns each arc into the cubic Béziers that approximate it to well under a
   hundredth of a unit on a 24-unit canvas (the endpoint-to-centre conversion in the SVG
   implementation notes, F.6.5, one cubic per quarter turn).

   Colours are roles, never hex: the web spends the token variables, the phones the generated token
   colours by the same names, resolved here against packages/design-tokens/tokens.json so a role
   naming a colour the token file does not have stops the generator. currentColor has no native
   equivalent in a drawable, so on the phones it is the ink token.

   Escaping: Swift needs its quotes escaped; Kotlin needs backslash, quote and dollar. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'packages/catalog/icons.json';
const TOKENS = 'packages/design-tokens/tokens.json';

const swift = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const kotlin = value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
const xml = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const kebab = name => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const snake = name => name.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
const pascal = name => name[0].toUpperCase() + name.slice(1);
/* Four decimals is finer than any coordinate the handoff wrote and finer than a pixel at 96 px. */
const num = n => {
 const s = (Math.round(n * 10000) / 10000).toString();
 return s === '-0' ? '0' : s;
};

/* ---- SVG path data ---------------------------------------------------------------------------- */

/** Tokenise path data into commands and numbers. Arc flags are single characters and may be run
    together with the number after them ("0 0 1-2 2"), so they are read one character at a time
    when an arc asks for them rather than as numbers. */
function tokenise(d) {
 const out = [];
 const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)|[\s,]+/gy;
 let i = 0;
 while (i < d.length) {
  re.lastIndex = i;
  const m = re.exec(d);
  if (!m) throw new Error(`${SOURCE}: cannot read path data at "${d.slice(i, i + 12)}" in "${d}".`);
  if (m[1]) out.push({ cmd: m[1] });
  else if (m[2]) out.push({ num: Number(m[2]), at: m.index });
  i = re.lastIndex;
 }
 return out;
}

/** Parse SVG path data into absolute commands: M, L, C, Q, A, Z — H/V become L, S/T become C/Q with
    the reflected control point, and every relative form is resolved. Arcs are kept as arcs here so
    Android can keep them exact; `arcsToCubics` below is what iOS reads. */
export function parsePath(d) {
 const tokens = tokenise(d);
 const commands = [];
 let x = 0, y = 0, startX = 0, startY = 0;
 let lastCmd = '';
 let lastC = null; // second control point of the previous C/S, for S
 let lastQ = null; // control point of the previous Q/T, for T
 let i = 0;
 const number = () => {
  const t = tokens[i++];
  if (!t || t.num === undefined) throw new Error(`${SOURCE}: expected a number in "${d}".`);
  return t.num;
 };
 /* A flag is one character; "1-2" is the flag 1 followed by the number -2, and "01" is two flags.
    The tokeniser cannot know that, so a flag token is re-read here from the source text. */
 const flag = () => {
  const t = tokens[i];
  if (!t || t.num === undefined) throw new Error(`${SOURCE}: expected an arc flag in "${d}".`);
  const text = d.slice(t.at).match(/^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/)[0];
  const first = text[0];
  if (first !== '0' && first !== '1') throw new Error(`${SOURCE}: an arc flag must be 0 or 1 in "${d}".`);
  const rest = text.slice(1);
  if (rest.length) tokens[i] = { num: Number(rest), at: t.at + 1 };
  else i++;
  return first === '1';
 };
 while (i < tokens.length) {
  let cmd;
  if (tokens[i].cmd) cmd = tokens[i++].cmd;
  else if (lastCmd === 'M') cmd = 'L';
  else if (lastCmd === 'm') cmd = 'l';
  else if (lastCmd === 'Z' || lastCmd === 'z') throw new Error(`${SOURCE}: a number follows Z without a command in "${d}".`);
  else cmd = lastCmd;
  const rel = cmd === cmd.toLowerCase() && cmd !== 'z';
  const upper = cmd.toUpperCase();
  const ax = v => rel ? x + v : v;
  const ay = v => rel ? y + v : v;
  switch (upper) {
   case 'M': { const nx = ax(number()), ny = ay(number()); x = startX = nx; y = startY = ny; commands.push({ c: 'M', x, y }); lastC = lastQ = null; break; }
   case 'L': { const nx = ax(number()), ny = ay(number()); x = nx; y = ny; commands.push({ c: 'L', x, y }); lastC = lastQ = null; break; }
   case 'H': { x = ax(number()); commands.push({ c: 'L', x, y }); lastC = lastQ = null; break; }
   case 'V': { y = ay(number()); commands.push({ c: 'L', x, y }); lastC = lastQ = null; break; }
   case 'C': {
    const x1 = ax(number()), y1 = ay(number()), x2 = ax(number()), y2 = ay(number()), nx = ax(number()), ny = ay(number());
    commands.push({ c: 'C', x1, y1, x2, y2, x: nx, y: ny }); x = nx; y = ny; lastC = { x: x2, y: y2 }; lastQ = null; break;
   }
   case 'S': {
    const x1 = lastC ? 2 * x - lastC.x : x, y1 = lastC ? 2 * y - lastC.y : y;
    const x2 = ax(number()), y2 = ay(number()), nx = ax(number()), ny = ay(number());
    commands.push({ c: 'C', x1, y1, x2, y2, x: nx, y: ny }); x = nx; y = ny; lastC = { x: x2, y: y2 }; lastQ = null; break;
   }
   case 'Q': {
    const x1 = ax(number()), y1 = ay(number()), nx = ax(number()), ny = ay(number());
    commands.push({ c: 'Q', x1, y1, x: nx, y: ny }); x = nx; y = ny; lastQ = { x: x1, y: y1 }; lastC = null; break;
   }
   case 'T': {
    const x1 = lastQ ? 2 * x - lastQ.x : x, y1 = lastQ ? 2 * y - lastQ.y : y;
    const nx = ax(number()), ny = ay(number());
    commands.push({ c: 'Q', x1, y1, x: nx, y: ny }); x = nx; y = ny; lastQ = { x: x1, y: y1 }; lastC = null; break;
   }
   case 'A': {
    const rx = number(), ry = number(), rotation = number();
    const large = flag(), sweep = flag();
    const nx = ax(number()), ny = ay(number());
    commands.push({ c: 'A', rx, ry, rotation, large, sweep, x0: x, y0: y, x: nx, y: ny }); x = nx; y = ny; lastC = lastQ = null; break;
   }
   case 'Z': { commands.push({ c: 'Z' }); x = startX; y = startY; lastC = lastQ = null; break; }
   default: throw new Error(`${SOURCE}: unknown path command "${cmd}" in "${d}".`);
  }
  lastCmd = cmd;
 }
 return commands;
}

/** One elliptical arc as cubic Béziers — SVG implementation notes F.6.5 for the centre, then one
    cubic per span of at most a quarter turn, with the usual 4/3·tan(θ/4) handle length. */
function arcToCubics(a) {
 const { x0, y0, x, y, large, sweep } = a;
 let { rx, ry } = a;
 if (x0 === x && y0 === y) return [];
 if (rx === 0 || ry === 0) return [{ c: 'L', x, y }];
 const phi = a.rotation * Math.PI / 180, cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
 rx = Math.abs(rx); ry = Math.abs(ry);
 const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
 const x1p = cosPhi * dx + sinPhi * dy, y1p = -sinPhi * dx + cosPhi * dy;
 const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
 if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }
 const rx2 = rx * rx, ry2 = ry * ry;
 let sq = (rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p) / (rx2 * y1p * y1p + ry2 * x1p * x1p);
 sq = Math.sqrt(Math.max(0, sq)) * (large === sweep ? -1 : 1);
 const cxp = sq * (rx * y1p / ry), cyp = sq * -(ry * x1p / rx);
 const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2, cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;
 const angle = (ux, uy, vx, vy) => {
  const dot = ux * vx + uy * vy, len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  let ang = Math.acos(Math.min(1, Math.max(-1, dot / len)));
  if (ux * vy - uy * vx < 0) ang = -ang;
  return ang;
 };
 const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
 let dtheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
 if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
 else if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
 const segments = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2) - 1e-9));
 const step = dtheta / segments;
 const t = 4 / 3 * Math.tan(step / 4);
 const point = th => ({ x: cx + rx * Math.cos(th) * cosPhi - ry * Math.sin(th) * sinPhi, y: cy + rx * Math.cos(th) * sinPhi + ry * Math.sin(th) * cosPhi });
 const derivative = th => ({ x: -rx * Math.sin(th) * cosPhi - ry * Math.cos(th) * sinPhi, y: -rx * Math.sin(th) * sinPhi + ry * Math.cos(th) * cosPhi });
 const out = [];
 for (let s = 0; s < segments; s++) {
  const from = theta1 + s * step, to = from + step;
  const p0 = point(from), p3 = s === segments - 1 ? { x, y } : point(to), d0 = derivative(from), d3 = derivative(to);
  out.push({ c: 'C', x1: p0.x + t * d0.x, y1: p0.y + t * d0.y, x2: p3.x - t * d3.x, y2: p3.y - t * d3.y, x: p3.x, y: p3.y });
 }
 return out;
}

/** The same commands with every arc replaced by cubics — what SwiftUI draws. */
export function arcsToCubics(commands) {
 return commands.flatMap(cmd => cmd.c === 'A' ? arcToCubics(cmd) : [cmd]);
}

/** Absolute path data, every command spelt out, from parsed commands. Arcs stay arcs. */
export function toPathData(commands) {
 return commands.map(cmd => {
  switch (cmd.c) {
   case 'M': case 'L': return `${cmd.c}${num(cmd.x)},${num(cmd.y)}`;
   case 'C': return `C${num(cmd.x1)},${num(cmd.y1)} ${num(cmd.x2)},${num(cmd.y2)} ${num(cmd.x)},${num(cmd.y)}`;
   case 'Q': return `Q${num(cmd.x1)},${num(cmd.y1)} ${num(cmd.x)},${num(cmd.y)}`;
   case 'A': return `A${num(cmd.rx)},${num(cmd.ry)} ${num(cmd.rotation)} ${cmd.large ? 1 : 0} ${cmd.sweep ? 1 : 0} ${num(cmd.x)},${num(cmd.y)}`;
   case 'Z': return 'Z';
  }
 }).join(' ');
}

/** A rect or circle as the path data that draws it: the two shapes a vector drawable does not have. */
export function elementPathData(el) {
 if (el.kind === 'path') return el.d;
 if (el.kind === 'circle') {
  const { cx, cy, r } = el;
  return `M${num(cx - r)} ${num(cy)}A${r} ${r} 0 1 0 ${num(cx + r)} ${num(cy)}A${r} ${r} 0 1 0 ${num(cx - r)} ${num(cy)}Z`;
 }
 if (el.kind === 'rect') {
  const { x, y, width: w, height: h } = el, rx = el.rx ?? 0;
  if (!rx) return `M${num(x)} ${num(y)}H${num(x + w)}V${num(y + h)}H${num(x)}Z`;
  return `M${num(x + rx)} ${num(y)}H${num(x + w - rx)}A${rx} ${rx} 0 0 1 ${num(x + w)} ${num(y + rx)}V${num(y + h - rx)}A${rx} ${rx} 0 0 1 ${num(x + w - rx)} ${num(y + h)}H${num(x + rx)}A${rx} ${rx} 0 0 1 ${num(x)} ${num(y + h - rx)}V${num(y + rx)}A${rx} ${rx} 0 0 1 ${num(x + rx)} ${num(y)}Z`;
 }
 throw new Error(`${SOURCE}: an element of kind "${el.kind}" has no path.`);
}

/* ---- The emitter ------------------------------------------------------------------------------ */

const bannerLines = [
 `Generated by scripts/emit-icons.mjs from ${SOURCE}.`,
 'Do not edit by hand — run `npm run icons`. The build fails if this file and the source disagree,',
 'so an edit here is lost rather than merely wrong.',
 '',
 'The MyThuso icon family, drawn by the design handoff of 28 September 2026 and adopted exactly.',
 'Primary patient destinations and healthcare actions; Lucide stays for universal utility actions;',
 'never both for one concept; the signal dot pulses only for something live or time-sensitive.'
];
const banner = comment => bannerLines.map(line => (line ? `${comment} ${line}` : comment)).join('\n');

export function emitIcons(root = '') {
 const contract = JSON.parse(readFileSync(root + SOURCE, 'utf8'));
 const tokens = JSON.parse(readFileSync(root + TOKENS, 'utf8'));
 const { family, roles, signal, icons, rules } = contract;
 const pulse = signal.pulse;

 /* Every role names a colour the token file has, and the web's variable is the one the token
    emitter derives from that name — so the day the token changes, the icons change with it. */
 for (const [name, role] of Object.entries(roles)) {
  if (name.startsWith('_')) continue;
  for (const key of ['token', 'nativeToken']) {
   if (role[key] === null || role[key] === undefined) continue;
   if (!(role[key] in tokens.color)) throw new Error(`${SOURCE} role "${name}" names the colour "${role[key]}", which ${TOKENS} does not have.`);
  }
  if (role.token && role.css !== `var(--${kebab(role.token)})`) throw new Error(`${SOURCE} role "${name}" spends ${role.css}, but its token ${role.token} arrives as var(--${kebab(role.token)}).`);
 }
 if (!(pulse.durationFromToken.token in tokens.motion)) throw new Error(`${SOURCE}: the pulse derives from tokens.motion.${pulse.durationFromToken.token}, which ${TOKENS} does not have.`);
 if (tokens.motion[pulse.durationFromToken.token] * pulse.durationFromToken.times !== pulse.durationMs)
  throw new Error(`${SOURCE}: ${pulse.durationFromToken.token} × ${pulse.durationFromToken.times} is not ${pulse.durationMs} ms.`);
 const seen = new Set();
 for (const icon of icons) {
  if (seen.has(icon.id)) throw new Error(`${SOURCE}: two icons called "${icon.id}".`);
  seen.add(icon.id);
  if (icon.component !== `MyThuso${pascal(icon.id)}Icon`) throw new Error(`${SOURCE}: "${icon.id}" is exported as ${icon.component}; the family names its components MyThuso<Id>Icon.`);
  for (const el of icon.elements) {
   if (!(el.stroke in roles) && el.stroke !== 'currentColor') throw new Error(`${SOURCE}: "${icon.id}" strokes with "${el.stroke}", which is not a role.`);
   parsePath(elementPathData(el)); // a path that will not parse stops the generator here, not on a phone
  }
 }
 const roleOf = name => roles[name];
 const hex = name => tokens.color[name].toUpperCase();
 const hexOf = roleName => hex(roleOf(roleName).nativeToken);
 const nativeColour = roleName => roleName === 'currentColor' ? 'current' : roleName;
 const kebabId = id => id.replace(/[^a-z0-9]+/g, '-');
 const snakeId = id => id.replace(/[^a-z0-9]+/g, '_');
 const signalElement = { kind: 'circle', cx: signal.cx, cy: signal.cy, r: signal.r, stroke: signal.stroke, fill: signal.fill, strokeWidth: signal.strokeWidth };

 /* ---- Web: one component per icon, the handoff's API ------------------------------------------ */
 const strokeAttr = el => el.stroke === 'currentColor' ? ' stroke="currentColor"' : '';
 const classAttr = (el, extra = []) => {
  const classes = [...extra];
  if (el.stroke !== 'currentColor') classes.push(roleOf(el.stroke).className);
  if (el.fill) classes.push(roleOf(el.fill).className);
  return classes.length ? ` className="${classes.join(' ')}"` : '';
 };
 const common = el => `${strokeAttr(el)} strokeWidth={${el.strokeWidth}}${el.strokeLinecap ? ` strokeLinecap="${el.strokeLinecap}"` : ''}${el.strokeLinejoin ? ` strokeLinejoin="${el.strokeLinejoin}"` : ''}`;
 const jsxElement = el => {
  if (el.kind === 'path') return `<path${classAttr(el)} d="${el.d}"${common(el)}/>`;
  if (el.kind === 'circle') return `<circle${classAttr(el)} cx={${el.cx}} cy={${el.cy}} r={${el.r}}${common(el)}/>`;
  if (el.kind === 'rect') return `<rect${classAttr(el)} x={${el.x}} y={${el.y}} width={${el.width}} height={${el.height}}${el.rx !== undefined ? ` rx={${el.rx}}` : ''}${common(el)}/>`;
  throw new Error(`${SOURCE}: an element of kind "${el.kind}" cannot be drawn.`);
 };
 const signalJsx = `<circle${classAttr(signalElement, [signal.className])} cx={${signal.cx}} cy={${signal.cy}} r={${signal.r}} strokeWidth={${signal.strokeWidth}}/>`;

 const webFile = `${banner('//')}
//
// The API is the handoff's: \`animated\` adds the signal pulse, className passes through, and the svg is
// aria-hidden unless an aria-label names it. Colours are classes that icons.css maps to the token
// variables, so nothing here is a colour.

import { forwardRef, type ReactNode, type SVGProps } from 'react';
import './icons.css';

export interface MyThusoIconProps extends SVGProps<SVGSVGElement> {
 /** Adds the signal pulse. ${rules.find(r => r.id === 'signal-is-live').sentence} */
 animated?: boolean;
}

export type MyThusoIconComponent = ReturnType<typeof createMyThusoIcon>;

function createMyThusoIcon(displayName: string, id: string, drawing: () => ReactNode) {
 const Icon = forwardRef<SVGSVGElement, MyThusoIconProps>(({ animated = false, className, ...props }, ref) => (
  <svg ref={ref} viewBox="${family.viewBox}" width={${family.size}} height={${family.size}} fill="${family.fill}" xmlns="http://www.w3.org/2000/svg" data-icon={id}
   className={['mythuso-icon', animated ? 'mythuso-icon--animated' : '', className ?? ''].filter(Boolean).join(' ')}
   aria-hidden={props['aria-label'] ? undefined : true} {...props}>
   {drawing()}
  </svg>
 ));
 Icon.displayName = displayName;
 return Icon;
}

const signal = ${signalJsx};

${icons.map(icon => `/** ${icon.meaning} */
export const ${icon.component} = createMyThusoIcon('${icon.component}', '${icon.id}', () => <>${icon.elements.map(jsxElement).join('')}{signal}</>);`).join('\n')}

/** The family in the contract's order, for a gallery or a lookup by id. */
export const myThusoIcons: readonly { id: string; name: string; meaning: string; Icon: MyThusoIconComponent }[] = [
${icons.map(icon => ` { id: '${icon.id}', name: ${JSON.stringify(icon.name)}, meaning: ${JSON.stringify(icon.meaning)}, Icon: ${icon.component} }`).join(',\n')}
];
`;

 /* ---- Android: a vector drawable per icon, the colours as resources, and a listing ------------- */
 const xmlBanner = `<?xml version="1.0" encoding="utf-8"?>
<!--
${bannerLines.map(line => (line ? `  ${line}` : '')).join('\n')}
-->`;
 const coloursFile = `${xmlBanner}
<resources>
    <!-- currentColor has no native equivalent in a drawable: the ink token stands in for it. -->
    <color name="mythuso_icon_current">#FF${hex(roles.currentColor.nativeToken).slice(1)}</color>
${['accent', 'primary', 'highlight'].map(r => `    <color name="mythuso_icon_${r}">#FF${hexOf(r).slice(1)}</color>`).join('\n')}
</resources>
`;
 const drawableElement = el => {
  const data = toPathData(parsePath(elementPathData(el)));
  const fill = el.fill ? `@color/mythuso_icon_${nativeColour(el.fill)}` : '#00000000';
  return `    <path
        android:pathData="${xml(data)}"
        android:fillColor="${fill}"
        android:strokeColor="@color/mythuso_icon_${nativeColour(el.stroke)}"
        android:strokeWidth="${el.strokeWidth}"
        android:strokeLineCap="${family.strokeLinecap}"
        android:strokeLineJoin="${family.strokeLinejoin}"/>`;
 };
 const drawables = icons.map(icon => ({
  path: `apps/android/app/src/main/res/drawable/ic_mythuso_${snakeId(icon.id)}.xml`,
  content: `${xmlBanner}
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${family.size}dp"
    android:height="${family.size}dp"
    android:viewportWidth="${family.size}"
    android:viewportHeight="${family.size}">
${[...icon.elements, signalElement].map(drawableElement).join('\n')}
</vector>
`
 }));
 const kotlinFile = `${banner('//')}

package za.co.mythuso.model

import za.co.mythuso.R

/** One icon of the family: its drawable, and the sentence that says when it is used. */
data class MyThusoIcon(val id: String, val name: String, val meaning: String, val drawable: Int)

object MyThusoIconsData {
    const val version = ${contract.version}
    const val size = ${family.size}

    /** The family's rules, word for word. */
    val rules = listOf(
${rules.map(r => `        ${kotlin(r.sentence)}`).join(',\n')}
    )

    /** The signal dot every icon carries, and its pulse: scale only, on the shared curve, and only for
        something live. Under a zero animator scale it does not run at all. */
    object Signal {
        const val cx = ${signal.cx}f
        const val cy = ${signal.cy}f
        const val radius = ${signal.r}f
        const val scaleFrom = ${pulse.from}f
        const val scaleTo = ${pulse.to}f
        const val durationMs = ${pulse.durationMs}
    }

    val icons = listOf(
${icons.map(icon => `        MyThusoIcon(${kotlin(icon.id)}, ${kotlin(icon.name)}, ${kotlin(icon.meaning)}, R.drawable.ic_mythuso_${snakeId(icon.id)})`).join(',\n')}
    )

    fun icon(id: String): MyThusoIcon? = icons.firstOrNull { it.id == id }
}
`;

 /* ---- iOS: Path builders and the view that strokes them ---------------------------------------- */
 const point = (x, y) => `CGPoint(x: ${num(x)}, y: ${num(y)})`;
 const swiftPath = el => {
  const lines = arcsToCubics(parsePath(elementPathData(el))).map(cmd => {
   switch (cmd.c) {
    case 'M': return `p.move(to: ${point(cmd.x, cmd.y)})`;
    case 'L': return `p.addLine(to: ${point(cmd.x, cmd.y)})`;
    case 'C': return `p.addCurve(to: ${point(cmd.x, cmd.y)}, control1: ${point(cmd.x1, cmd.y1)}, control2: ${point(cmd.x2, cmd.y2)})`;
    case 'Q': return `p.addQuadCurve(to: ${point(cmd.x, cmd.y)}, control: ${point(cmd.x1, cmd.y1)})`;
    case 'Z': return 'p.closeSubpath()';
   }
  });
  return `Path { p in\n${lines.map(l => `                ${l}`).join('\n')}\n            }`;
 };
 const swiftRole = name => name === 'currentColor' ? '.current' : `.${name}`;
 const swiftFile = `${banner('//')}
//
// Each icon is its elements as SwiftUI Path builders in the family's ${family.size}-unit space, with H, V, S and T
// spelt out and every SVG arc as cubic Béziers; the view scales them to the size it is given and
// strokes with round caps and joins. Colours are roles resolved against ThusoTheme, so the family
// recolours when the tokens do.

import SwiftUI

enum MyThusoIconsData {
    static let version = ${contract.version}
    static let size: CGFloat = ${family.size}

    /// The family's rules, word for word.
    static let rules: [String] = [
${rules.map(r => `        ${swift(r.sentence)}`).join(',\n')}
    ]

    /// What a stroke or fill is painted with. \`current\` is the text colour where the icon sits.
    enum Role {
        case current, accent, primary, highlight
        var color: Color {
            switch self {
            case .current: return Color.primary
            case .accent: return ThusoTheme.${roles.accent.nativeToken}
            case .primary: return ThusoTheme.${roles.primary.nativeToken}
            case .highlight: return ThusoTheme.${roles.highlight.nativeToken}
            }
        }
    }

    struct Element {
        let path: Path
        let stroke: Role
        let strokeWidth: CGFloat
    }

    struct Icon: Identifiable {
        let id: String
        let name: String
        let meaning: String
        let elements: [Element]
    }

    /// The signal dot every icon carries, and its pulse: scale only, on the shared curve, and only
    /// for something live. Reduced motion removes it.
    enum Signal {
        static let center = ${point(signal.cx, signal.cy)}
        static let radius: CGFloat = ${signal.r}
        static let fill: Role = ${swiftRole(signal.fill)}
        static let stroke: Role = ${swiftRole(signal.stroke)}
        static let strokeWidth: CGFloat = ${signal.strokeWidth}
        static let scaleFrom: CGFloat = ${pulse.from}
        static let scaleTo: CGFloat = ${pulse.to}
        static let duration: TimeInterval = ${num(pulse.durationMs / 1000)}
    }

${icons.map(icon => `    /// ${icon.meaning}
    static let ${icon.id} = Icon(id: ${swift(icon.id)}, name: ${swift(icon.name)}, meaning: ${swift(icon.meaning)}, elements: [
${icon.elements.map(el => `        Element(path: ${swiftPath(el)}, stroke: ${swiftRole(el.stroke)}, strokeWidth: ${el.strokeWidth})`).join(',\n')}
    ])`).join('\n\n')}

    static let all: [Icon] = [${icons.map(i => i.id).join(', ')}]

    static func icon(_ id: String) -> Icon? { all.first { $0.id == id } }
}

/// One icon of the family, at a size, stroked with round caps and joins, its signal dot pulsing only
/// when \`animated\` and only for a reader who has not asked for reduced motion.
struct MyThusoIcon: View {
    let icon: MyThusoIconsData.Icon
    var size: CGFloat = MyThusoIconsData.size
    var animated = false
    @Environment(\\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulsing = false

    private var scale: CGFloat { size / MyThusoIconsData.size }

    var body: some View {
        ZStack {
            ForEach(Array(icon.elements.enumerated()), id: \\.offset) { _, element in
                element.path
                    .applying(CGAffineTransform(scaleX: scale, y: scale))
                    .stroke(element.stroke.color, style: StrokeStyle(lineWidth: element.strokeWidth * scale, lineCap: .round, lineJoin: .round))
            }
            signal
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var signal: some View {
        let r = MyThusoIconsData.Signal.radius * scale
        let rect = CGRect(x: MyThusoIconsData.Signal.center.x * scale - r, y: MyThusoIconsData.Signal.center.y * scale - r, width: r * 2, height: r * 2)
        let live = animated && !reduceMotion
        return ZStack {
            Path(ellipseIn: rect).fill(MyThusoIconsData.Signal.fill.color)
            Path(ellipseIn: rect).stroke(MyThusoIconsData.Signal.stroke.color, lineWidth: MyThusoIconsData.Signal.strokeWidth * scale)
        }
        .scaleEffect(live && pulsing ? MyThusoIconsData.Signal.scaleTo : MyThusoIconsData.Signal.scaleFrom, anchor: UnitPoint(x: MyThusoIconsData.Signal.center.x / MyThusoIconsData.size, y: MyThusoIconsData.Signal.center.y / MyThusoIconsData.size))
        .onAppear {
            guard live else { return }
            withAnimation(ThusoMotion.soft(MyThusoIconsData.Signal.duration / 2).repeatForever(autoreverses: true)) { pulsing = true }
        }
        .onChange(of: live) { _, isLive in
            if isLive { withAnimation(ThusoMotion.soft(MyThusoIconsData.Signal.duration / 2).repeatForever(autoreverses: true)) { pulsing = true } }
            else { withAnimation(nil) { pulsing = false } }
        }
    }
}
`;

 return [
  { path: 'apps/web/src/ui/icons/MyThusoIcons.generated.tsx', content: webFile },
  { path: 'apps/android/app/src/main/res/values/mythuso_icons.xml', content: coloursFile },
  ...drawables,
  { path: 'apps/android/app/src/main/java/za/co/mythuso/model/MyThusoIcons.kt', content: kotlinFile },
  { path: 'apps/ios/MyThuso/Models/MyThusoIconsData.swift', content: swiftFile }
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitIcons()) {
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, file.content);
  console.log(`icons → ${file.path}`);
 }
}
