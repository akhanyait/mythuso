/* The official MyThuso wordmark, which we hold as SVG, and its reversed lockup when the reader's system
   is dark — the logo's own answer to a dark ground (public/brand/mythuso-logo-reversed.svg draws "thuso"
   in the brand's mint), never a recolouring of the ink one. Used wherever the lockup stands on a surface
   that follows the scheme: the public page's bar and footer, and every shell's sidebar. The width and
   height are the file's own, so nothing moves when it lands. */
export function Wordmark() {
 return <picture>
  <source srcSet="/brand/mythuso-logo-reversed.svg" media="(prefers-color-scheme: dark)"/>
  <img src="/brand/mythuso-logo.svg" alt="MyThuso" width="366" height="98"/>
 </picture>;
}
