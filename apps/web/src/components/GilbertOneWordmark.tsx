import { identity } from "../lib/assistant";

/* The GilbertOne wordmark, drawn rather than set.
 *
 * Brand board option 01 (founder-approved 23 September 2026): "Gilbert" in the deep teal, "One" in
 * the green-teal, and the dot of the i in the orange accent. It is hand-drawn geometry on a fixed
 * grid rather than an SVG <text> node on purpose — a logo that leans on whatever sans happens to be
 * installed renders a different width, a different i-dot and a different colour boundary on every
 * machine, and the two-tone split cannot be trusted to land on the right glyph. Drawn paths are the
 * same pixels everywhere and carry no font into the bundle.
 *
 * It is decorative: the svg is aria-hidden and the accessible name is carried by the visually-hidden
 * text beside it (the panel's own <h2> in the header), so a screen reader hears "GilbertOne" once
 * and never a list of path coordinates. */

const TEAL = "#0E3F3F";
const GREEN = "#1CA588";
const ORANGE = "#F4633A";

/* One glyph set on a shared grid: baseline y=44, x-height top y=18, cap top y=6, round caps and
   joins at a 7-unit stroke. Each letter is placed by the transform on its group. */
export function GilbertOneWordmark({
  className,
  title = identity.name,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span className={className}>
      <svg
        viewBox="0 0 300 52"
        role="img"
        aria-label={title}
        fill="none"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {/* G — deep teal */}
        <g transform="translate(2 0)">
          <path d="M34,17 A18,18 0 1,0 34,33" stroke={TEAL} />
          <path d="M34,33 L34,25 L22,25" stroke={TEAL} />
        </g>
        {/* i — teal stem, orange dot */}
        <g transform="translate(44 0)">
          <path d="M3,20 L3,44" stroke={TEAL} />
          <circle cx="3" cy="9" r="4" fill={ORANGE} stroke="none" />
        </g>
        {/* l */}
        <g transform="translate(58 0)">
          <path d="M3,7 L3,44" stroke={TEAL} />
        </g>
        {/* b */}
        <g transform="translate(72 0)">
          <path d="M3,7 L3,44" stroke={TEAL} />
          <path d="M3,21 A13,13 0 1,1 3,41" stroke={TEAL} />
        </g>
        {/* e */}
        <g transform="translate(104 0)">
          <path d="M3,31 L26,31" stroke={TEAL} />
          <path d="M26,31 A13,13 0 1,0 8,42" stroke={TEAL} />
        </g>
        {/* r */}
        <g transform="translate(136 0)">
          <path d="M3,19 L3,44" stroke={TEAL} />
          <path d="M3,28 C3,22 8,18 15,18" stroke={TEAL} />
        </g>
        {/* t */}
        <g transform="translate(158 0)">
          <path d="M9,8 L9,40 Q9,44 14,44" stroke={TEAL} />
          <path d="M2,21 L17,21" stroke={TEAL} />
        </g>
        {/* O — green-teal */}
        <g transform="translate(192 0)">
          <ellipse cx="18" cy="25" rx="17" ry="18" stroke={GREEN} />
        </g>
        {/* n */}
        <g transform="translate(232 0)">
          <path d="M3,44 L3,20" stroke={GREEN} />
          <path d="M3,28 A11,11 0 0,1 25,28 L25,44" stroke={GREEN} />
        </g>
        {/* e */}
        <g transform="translate(264 0)">
          <path d="M3,31 L26,31" stroke={GREEN} />
          <path d="M26,31 A13,13 0 1,0 8,42" stroke={GREEN} />
        </g>
      </svg>
      <span className="as-sr">{title}</span>
    </span>
  );
}
