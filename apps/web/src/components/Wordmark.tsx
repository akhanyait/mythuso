/* The official MyThuso wordmark, which we hold as SVG, and its reversed lockup when the page is dark — the
   logo's own answer to a dark ground (public/brand/mythuso-logo-reversed.svg draws "my" in white and
   "thuso" in the brand's mint), never a recolouring of the ink one. Used wherever the lockup stands on a
   surface that follows the theme: the public page's bar and footer, and every shell's sidebar.

   It follows the page's theme, not the operating system's. It used to choose with a <picture> media query
   on prefers-color-scheme, which the page stopped obeying on 29 September (lib/theme.ts): a dark phone
   drew the pale lockup on the light bar and lost the "my", and the app's dark theme on a light phone drew
   the ink lockup on the dark bar. A media query cannot read an attribute, so both lockups are here and
   core.css shows the one [data-theme] asks for — no script, no state, on the entries a patient loads first.
   The reversed one is lazy, and a hidden image is never in view, so a page that stays light never fetches
   it. The width and height are the files' own, so nothing moves when either lands. */
export function Wordmark() {
 return <span className="wordmark">
  <img className="wordmark-ink" src="/brand/mythuso-logo.svg" alt="MyThuso" width="366" height="98"/>
  <img className="wordmark-reversed" src="/brand/mythuso-logo-reversed.svg" alt="MyThuso" width="366" height="98" loading="lazy"/>
 </span>;
}
