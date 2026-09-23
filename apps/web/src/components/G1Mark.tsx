/* The G1 shorthand, drawn to sit where the full wordmark will not.
 *
 * Brand board option 01 (founder-approved 23 September 2026) pairs the full wordmark with a compact
 * "G1" mark for tight spaces — the launcher orb, a small sheet header, a favicon-sized slot. Same
 * three brand colours as the wordmark and the same drawn-geometry rule: a teal "G", a green "1" and
 * the orange accent dot, on a fixed grid so it is the same pixels on every machine and carries no
 * font into the bundle.
 *
 * It is decorative by default (aria-hidden) because it always sits beside text that already names
 * GilbertOne; pass a `title` when it stands alone and the accessible name is put on the svg instead. */

const TEAL = "#0E3F3F";
const GREEN = "#1CA588";
const ORANGE = "#F4633A";

export function G1Mark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 72 64"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      fill="none"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {/* G — deep teal */}
      <path d="M40,20 A18,18 0 1,0 40,44" stroke={TEAL} />
      <path d="M40,44 L40,32 L28,32" stroke={TEAL} />
      {/* 1 — green-teal */}
      <path d="M52,26 L58,20 L58,48" stroke={GREEN} />
      {/* orange accent dot */}
      <circle cx="60" cy="10" r="4.5" fill={ORANGE} stroke="none" />
    </svg>
  );
}
