/* Cleaning a drawing Qwen wrote before anyone sees it.

   SVG is a document format that can carry scripts, links, external images, embedded HTML and CSS
   that fetches. The model is asked for none of that (gilbertone-media.json's drawingRules), but a
   model asked is not a model that obeys, so the drawing is rebuilt from an allowlist: each tag and
   each attribute is kept only if it is on the list below, every reference must point inside the same
   drawing, and anything that cannot be read as plain, well-nested markup is refused whole rather
   than repaired. What leaves this file is markup this file wrote, from parts it checked.

   The studio also shows the result through an <img>, which never runs a script in an SVG, and the
   service sends it with a Content-Security-Policy of default-src 'none'. Three layers, because the
   drawing comes from a model. */

const ELEMENTS = new Set([
  "svg", "g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan",
  "defs", "linearGradient", "radialGradient", "stop", "title", "desc", "clipPath",
]);

const ATTRIBUTES = new Set([
  "id", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "width", "height",
  "d", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule", "opacity",
  "transform", "viewBox", "font-family", "font-size", "font-weight", "font-style", "text-anchor",
  "dominant-baseline", "letter-spacing", "dx", "dy", "offset", "stop-color", "stop-opacity",
  "gradientUnits", "gradientTransform", "spreadMethod", "clip-path", "preserveAspectRatio",
]);

const MAX_BYTES = 200_000;
const MAX_ELEMENTS = 2_500;
const MIN_SHAPES = 3;
const SHAPES = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text"]);

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/gy;
const ATTRIBUTE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g;

export type Cleaned = { ok: true; svg: string; viewBox: [number, number, number, number]; inner: string } | { ok: false; why: string };

function cleanValue(name: string, value: string): string | null {
  const v = value.trim();
  if (/[<>]/.test(v) || /javascript:|data:|expression\s*\(|@import/i.test(v)) return null;
  /* The one reference allowed: url(#an-id-in-this-drawing), for a gradient or a clip. */
  const urls = v.match(/url\s*\(([^)]*)\)/gi) ?? [];
  if (urls.some((u) => !/^url\(\s*#[\w-]+\s*\)$/i.test(u))) return null;
  if (name === "font-family" && !/^[\w\s,'"-]+$/.test(v)) return null;
  return v.replace(ENTITY, "&amp;").replace(/"/g, "&quot;");
}

/* Pulls the first <svg>…</svg> out of whatever the model answered (it sometimes wraps the drawing in a
   Markdown fence or a sentence) and rebuilds it from the allowlist. */
export function cleanSvg(answer: string): Cleaned {
  const start = answer.search(/<svg[\s>]/i);
  const end = answer.lastIndexOf("</svg>");
  if (start < 0 || end < start) return { ok: false, why: "no <svg> element in the answer" };
  const source = answer.slice(start, end + "</svg>".length);
  if (source.length > MAX_BYTES) return { ok: false, why: "the drawing is too large" };

  const out: string[] = [];
  const stack: string[] = [];
  let skipping = 0;
  let elements = 0;
  let shapes = 0;
  let viewBox: [number, number, number, number] = [0, 0, 800, 600];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(source);
    if (!m || m.index !== at) return { ok: false, why: `unreadable markup at character ${at}` };
    const [whole, closing, rawName, attrs, selfClosing, text] = m;
    if (text !== undefined) {
      if (skipping || stack.length === 0) continue;
      const parent = stack[stack.length - 1];
      if (parent === "text" || parent === "tspan" || parent === "title" || parent === "desc") out.push(text.replace(ENTITY, "&amp;"));
      continue;
    }
    if (whole.startsWith("<!--") || whole.startsWith("<?")) continue;
    /* One drawing: anything after the first <svg> closes is not part of it. */
    if (stack.length === 0 && out.length > 0) break;
    const name = rawName.replace(/^svg:/, "");
    if (closing) {
      if (stack.pop() !== name) return { ok: false, why: `</${name}> does not close what is open` };
      if (skipping) { skipping -= 1; continue; }
      out.push(`</${name}>`);
      continue;
    }
    const allowed = ELEMENTS.has(name) && !(name === "svg" && stack.length > 0);
    if (skipping || !allowed) {
      /* A refused element goes with everything inside it: a <script> with its text, a
         <foreignObject> with the HTML it carries, an <image> with its href. */
      if (!selfClosing) { stack.push(name); skipping += 1; }
      continue;
    }
    if (++elements > MAX_ELEMENTS) return { ok: false, why: "too many shapes" };
    if (SHAPES.has(name)) shapes += 1;
    const kept: string[] = [];
    for (const a of attrs.matchAll(ATTRIBUTE)) {
      const attrName = a[1];
      const value = a[2] ?? a[3];
      if (value === undefined || !ATTRIBUTES.has(attrName)) continue;
      if (stack.length === 0 && (attrName === "width" || attrName === "height")) continue;
      const v = cleanValue(attrName, value);
      if (v === null) continue;
      if (stack.length === 0 && attrName === "viewBox") {
        const n = v.split(/[\s,]+/).map(Number);
        if (n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0) viewBox = n as typeof viewBox;
        continue;
      }
      kept.push(`${attrName}="${v}"`);
    }
    if (stack.length === 0) {
      if (name !== "svg") return { ok: false, why: "the drawing does not start with <svg>" };
      kept.unshift(`xmlns="http://www.w3.org/2000/svg"`, `viewBox="${viewBox.join(" ")}"`);
    }
    out.push(`<${name}${kept.length ? " " + kept.join(" ") : ""}${selfClosing ? "/" : ""}>`);
    if (!selfClosing) stack.push(name);
  }
  if (stack.length) return { ok: false, why: `<${stack[stack.length - 1]}> is never closed` };
  if (shapes < MIN_SHAPES) return { ok: false, why: "the drawing has almost nothing in it" };
  const svg = out.join("");
  const inner = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  return { ok: true, svg, viewBox, inner };
}

export function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* The cleaned drawing with its label burned in along the bottom, so a drawing saved and forwarded
   still says what it is. Written from parts this file already checked. */
export function labelled(c: Extract<Cleaned, { ok: true }>, label: string, title: string): string {
  const [x, y, w, h] = c.viewBox;
  const band = Math.max(28, Math.round(h * 0.06));
  const size = Math.round(band * 0.5);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h + band}" role="img">` +
    `<title>${escapeText(title)}</title>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h + band}" fill="#ffffff"/>` +
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${c.viewBox.join(" ")}">${c.inner}</svg>` +
    `<rect x="${x}" y="${y + h}" width="${w}" height="${band}" fill="#083848"/>` +
    `<text x="${x + w / 2}" y="${y + h + band * 0.66}" fill="#ffffff" font-family="sans-serif" font-size="${size}" text-anchor="middle">${escapeText(label)}</text>` +
    `</svg>`
  );
}
